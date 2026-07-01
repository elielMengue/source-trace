"""LLM-as-checker: batched claim extraction + citation relevance (ADR-1).

One call per analyze request extracts every claim-like statement AND, for each, which
of the provided links plausibly support it and how relevant they are — capping cost per
§4.5 ("all claims in one call"). The provider is behind the ``ClaimExtractor`` protocol
so it can be swapped or faked in tests without touching the pipeline.

Privacy (ADR-1 / §8): in ``full`` mode the answer text is sent to the LLM. Zero-retention
(no logging, no training) is a provider/account configuration, documented in the privacy
notice — nothing is persisted here. ``heuristics_only`` mode never reaches this module.

The extractor still describes SOURCING, never truth (I1): it reports which claims have a
matching visible source, not whether the claim is correct.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Protocol

from .contracts import Link, Relevance

# Structured-output schema (Opus 4.8 supports output_config.format). Kept to the
# JSON-Schema subset structured outputs allows (no min/max, additionalProperties=false).
_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["claims"],
    "properties": {
        "claims": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["text", "matched_source_indexes", "relevance"],
                "properties": {
                    # A VERBATIM substring of the answer, so we can locate its span.
                    "text": {"type": "string"},
                    "matched_source_indexes": {"type": "array", "items": {"type": "integer"}},
                    "relevance": {
                        "type": "string",
                        "enum": ["high", "medium", "low", "none"],
                    },
                },
            },
        }
    },
}

_SYSTEM = (
    "You analyze an AI-generated answer for VISIBLE SOURCING — never truth. "
    "Extract each substantive, checkable factual claim as a VERBATIM substring of the "
    "answer (copy it exactly, do not paraphrase or fix typos). For each claim, list the "
    "indexes of the provided links that plausibly support it, and rate how relevant the "
    "best matching link is. If no link supports it, use an empty list and relevance "
    "'none'. Do not judge whether claims are true. Respond in the answer's language."
)

_RELEVANCE_MAP = {
    "high": Relevance.high,
    "medium": Relevance.medium,
    "low": Relevance.low,
    "none": Relevance.unknown,
}

_WS = re.compile(r"\s+")


@dataclass
class LlmClaim:
    text: str
    start: int
    end: int
    matched_indexes: list[int] = field(default_factory=list)
    relevance: Relevance = Relevance.unknown


class ClaimExtractor(Protocol):
    """Returns (claims, model_id). Raises on failure; the pipeline falls back."""

    async def extract(
        self, text: str, links: list[Link], max_claims: int, locale: str
    ) -> tuple[list[LlmClaim], str]: ...


def build_prompt(text: str, links: list[Link], max_claims: int) -> str:
    link_lines = (
        "\n".join(f"[{i}] {link.anchorText} — {link.url}" for i, link in enumerate(links))
        or "(no links provided)"
    )
    return (
        f"Extract at most {max_claims} claims.\n\n"
        f"LINKS:\n{link_lines}\n\n"
        f"ANSWER:\n{text}"
    )


def _locate(answer: str, claim: str) -> tuple[int, int] | None:
    """Find the claim's char span in the answer. Exact match first, then a
    whitespace-normalized fallback (models sometimes collapse spacing)."""
    idx = answer.find(claim)
    if idx != -1:
        return idx, idx + len(claim)
    # Fallback: match ignoring whitespace differences.
    pattern = re.compile(_WS.sub(r"\\s+", re.escape(claim.strip())))
    m = pattern.search(answer)
    return (m.start(), m.end()) if m else None


def parse_extraction(
    raw_json: str, answer: str, num_links: int, max_claims: int
) -> list[LlmClaim]:
    """Parse the model's JSON into located, validated claims.

    Defensive by design: unlocatable claims are dropped, out-of-range source indexes are
    discarded. Anything malformed raises, and the pipeline falls back to heuristics (I3).
    """
    data = json.loads(raw_json)
    claims: list[LlmClaim] = []
    for item in data.get("claims", [])[:max_claims]:
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        span = _locate(answer, text)
        if span is None:
            continue  # can't highlight it safely — skip rather than guess
        matched = sorted(
            {i for i in item.get("matched_source_indexes", []) if isinstance(i, int) and 0 <= i < num_links}
        )
        relevance = _RELEVANCE_MAP.get(str(item.get("relevance", "none")), Relevance.unknown)
        claims.append(
            LlmClaim(text=answer[span[0] : span[1]], start=span[0], end=span[1],
                     matched_indexes=matched, relevance=relevance)
        )
    return claims


class AnthropicClaimExtractor:
    """ClaimExtractor backed by the official Anthropic SDK."""

    def __init__(self, api_key: str, model: str) -> None:
        # Imported lazily so the package imports without the SDK installed.
        from anthropic import AsyncAnthropic

        self._client = AsyncAnthropic(api_key=api_key)
        self._model = model

    async def extract(
        self, text: str, links: list[Link], max_claims: int, locale: str
    ) -> tuple[list[LlmClaim], str]:
        resp = await self._client.messages.create(
            model=self._model,
            max_tokens=4096,
            system=_SYSTEM,
            output_config={"format": {"type": "json_schema", "schema": _SCHEMA}},
            messages=[{"role": "user", "content": build_prompt(text, links, max_claims)}],
        )
        raw = "".join(getattr(b, "text", "") for b in resp.content)
        return parse_extraction(raw, text, len(links), max_claims), self._model


def build_extractor() -> ClaimExtractor | None:
    """Construct the configured extractor, or None when no LLM key is set
    (full mode then degrades to heuristics-only — ADR-1)."""
    from .config import settings

    if not settings.llm_api_key:
        return None
    return AnthropicClaimExtractor(settings.llm_api_key, settings.llm_model)
