"""Deep trace: for ONE flagged claim, search the web for independent sources (ADR-1).

The "Deep trace" action delegates the tracing work the user would otherwise do by hand
(open a tab, run a search, skim results) to Claude with the server-side web-search tool.
It returns a set of independent sources plus a NEUTRAL description of what each says — so
the user can read them and judge for themselves.

Invariant I1 is load-bearing here: this is NOT a fact-checker. The tracer never states or
implies whether the claim is true or false; it reports which independent sources discuss
the topic and attributes what each says. The system prompt enforces that, and the parser
never invents a verdict.

Privacy (ADR-1 / I2): the claim + surrounding context are sent to the LLM in full mode
only, under zero-retention. ``heuristics_only`` never reaches this module — the client
doesn't offer the action in privacy mode. When no key is configured, ``build_tracer``
returns None and the endpoint reports ``available=false`` (the client keeps its instant
Google-search fallback — I3).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Protocol

# The web-search tool version that pairs with claude-opus-4-8 (dynamic filtering). Older
# models would need the basic web_search_20250305 variant instead.
_WEB_SEARCH_TOOL = {"type": "web_search_20260209", "name": "web_search", "max_uses": 5}

_SYSTEM = (
    "You help a user TRACE a claim taken from an AI-generated answer back to independent "
    "sources. You are NOT a fact-checker: never state or imply whether the claim is true, "
    "false, accurate, or misleading, and never rate its correctness. Your only job is to "
    "search the web for independent, reputable sources that discuss the same topic and to "
    "describe NEUTRALLY what each says, so the user can read them and judge for themselves.\n"
    "Search the web before answering. Prefer primary and independent sources; avoid the "
    "AI platform the claim came from. For each source, write one short, ATTRIBUTED note "
    "('According to X, ...') describing what that source says about the topic — never "
    "assert it as fact in your own voice. In the summary, describe whether the sources you "
    "found appear to converge or diverge on the point, still without declaring the claim "
    "true or false. If you cannot find relevant independent sources, say so plainly.\n"
    "After searching, respond with ONLY a JSON object and no other text, of the form: "
    '{"summary": string, "sources": [{"url": string, "title": string, "note": string}]}. '
    "Write summary and notes in the answer's language."
)

# Continues the server-side tool loop a bounded number of times (pause_turn) so a run
# that needs several searches finishes, without risking an unbounded loop.
_MAX_CONTINUATIONS = 4

_JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)


@dataclass
class DeepSourceData:
    url: str
    title: str
    note: str


@dataclass
class TraceData:
    summary: str
    sources: list[DeepSourceData] = field(default_factory=list)
    model: str = ""


class Tracer(Protocol):
    """Returns the traced sources for a single claim. Raises on failure; the endpoint
    degrades to ``available=false`` so the client falls back to its reverse-search link."""

    async def trace(self, claim: str, context: str, locale: str) -> TraceData: ...


def build_prompt(claim: str, context: str, locale: str = "en") -> str:
    parts = [f"CLAIM TO TRACE:\n{claim}"]
    if context.strip():
        parts.append(f"\nSURROUNDING CONTEXT (for grounding only):\n{context}")
    parts.append(
        "\nSearch for independent sources on this topic and return the JSON object."
    )
    # The summary/notes follow the answer's language; the UI locale is only a fallback for
    # short, language-ambiguous claims — so an English or Spanish reader still gets a
    # summary in their language when the claim alone doesn't reveal one.
    if locale:
        parts.append(
            f"Write the summary and notes in the answer's language; "
            f"if it is ambiguous, use '{locale}'."
        )
    return "\n".join(parts)


def parse_trace(text: str) -> TraceData:
    """Parse the model's final JSON into neutral, validated sources.

    Defensive: unparseable output raises so the endpoint degrades gracefully (I3);
    malformed source entries are dropped rather than guessed at.
    """
    match = _JSON_OBJECT.search(text)
    if match is None:
        raise ValueError("no JSON object in trace response")
    data = json.loads(match.group(0))
    sources: list[DeepSourceData] = []
    for item in data.get("sources", []):
        url = str(item.get("url", "")).strip()
        if not url.startswith(("http://", "https://")):
            continue  # only real, openable links
        sources.append(
            DeepSourceData(
                url=url,
                title=str(item.get("title", "")).strip() or url,
                note=str(item.get("note", "")).strip(),
            )
        )
    summary = str(data.get("summary", "")).strip()
    return TraceData(summary=summary, sources=sources)


class GeminiTracer:
    """Tracer backed by the Google Gen AI SDK + Google Search grounding (demo provider).

    Same contract and same I1-safe system prompt as the Anthropic tracer; only the search
    backend differs. Production uses Claude (see ``AnthropicTracer``)."""

    def __init__(self, api_key: str, model: str) -> None:
        from google import genai

        self._client = genai.Client(api_key=api_key)
        self._model = model

    async def trace(self, claim: str, context: str, locale: str) -> TraceData:
        from google.genai import types

        resp = await self._client.aio.models.generate_content(
            model=self._model,
            contents=build_prompt(claim, context, locale),
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM,
                tools=[types.Tool(google_search=types.GoogleSearch())],
            ),
        )
        data = parse_trace(resp.text or "")
        data.model = self._model
        return data


class AnthropicTracer:
    """Tracer backed by the official Anthropic SDK + the server-side web-search tool."""

    def __init__(self, api_key: str, model: str) -> None:
        from anthropic import AsyncAnthropic

        self._client = AsyncAnthropic(api_key=api_key)
        self._model = model

    async def trace(self, claim: str, context: str, locale: str) -> TraceData:
        messages = [{"role": "user", "content": build_prompt(claim, context, locale)}]
        resp = await self._client.messages.create(
            model=self._model,
            max_tokens=4096,
            system=_SYSTEM,
            tools=[_WEB_SEARCH_TOOL],
            messages=messages,
        )
        # The server runs the web-search loop; if it pauses (its own 10-iteration cap),
        # re-send the accumulated turn to resume until it finishes (bounded).
        continuations = 0
        while resp.stop_reason == "pause_turn" and continuations < _MAX_CONTINUATIONS:
            messages.append({"role": "assistant", "content": resp.content})
            resp = await self._client.messages.create(
                model=self._model,
                max_tokens=4096,
                system=_SYSTEM,
                tools=[_WEB_SEARCH_TOOL],
                messages=messages,
            )
            continuations += 1

        raw = "".join(getattr(b, "text", "") for b in resp.content)
        data = parse_trace(raw)
        data.model = self._model
        return data


def build_tracer() -> Tracer | None:
    """Construct the configured tracer, or None when no provider key is set (the deep-trace
    endpoint then reports ``available=false`` — I3).

    Provider selection (``ST_TRACE_PROVIDER``): ``gemini`` for the demo (Google Search
    grounding), ``anthropic`` for production (web search under zero-retention, ADR-1), or
    ``auto`` (default) which prefers Gemini when its key is present and otherwise Anthropic.
    """
    from .config import settings

    provider = settings.trace_provider.lower()
    if provider == "anthropic":
        if settings.llm_api_key:
            return AnthropicTracer(settings.llm_api_key, settings.llm_model)
        return None
    if provider == "gemini":
        if settings.gemini_api_key:
            return GeminiTracer(settings.gemini_api_key, settings.gemini_model)
        return None
    # auto: Gemini first (demo), fall back to Anthropic if only that key is configured.
    if settings.gemini_api_key:
        return GeminiTracer(settings.gemini_api_key, settings.gemini_model)
    if settings.llm_api_key:
        return AnthropicTracer(settings.llm_api_key, settings.llm_model)
    return None
