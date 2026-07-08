"""Pydantic models mirroring packages/shared/schema/*.

The JSON Schemas are the source of truth (ADR contract discipline). These models
mirror them; tests/test_contract_schema.py validates that produced Trace Reports
conform to the schema so the client and server cannot silently drift.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---- enums -----------------------------------------------------------------


class ClaimStatus(StrEnum):
    supported = "supported"
    weak = "weak"
    unsupported = "unsupported"


class SourceStatus(StrEnum):
    live = "live"
    dead = "dead"
    unknown = "unknown"


class Relevance(StrEnum):
    high = "high"
    medium = "medium"
    low = "low"
    unknown = "unknown"


class TraceFlag(StrEnum):
    no_visible_sources = "no_visible_sources"
    single_source = "single_source"
    dead_link = "dead_link"
    low_citation_density = "low_citation_density"


class AnalyzeMode(StrEnum):
    full = "full"
    heuristics_only = "heuristics_only"


class SourceSite(StrEnum):
    chatgpt = "chatgpt"
    perplexity = "perplexity"
    gemini = "gemini"
    claude = "claude"


# ---- request ---------------------------------------------------------------


class Link(_Model):
    url: str
    anchorText: str


class Citation(_Model):
    """A positional in-answer citation (e.g. a Perplexity chip). ``pos`` is a char
    offset into the answer text; ``url`` is optional because some chips only expose
    their link on interaction. Presence alone marks a claim as visibly sourced (I1)."""

    pos: int = Field(ge=0)
    url: str | None = None


class Answer(_Model):
    text: str = Field(max_length=100_000)
    links: list[Link] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)


class RequestContext(_Model):
    sourceSite: SourceSite
    locale: str
    clientVersion: str


class AnalyzeOptions(_Model):
    mode: AnalyzeMode = AnalyzeMode.full
    maxClaims: int = Field(default=20, ge=1, le=100)


class AnalyzeRequest(_Model):
    answer: Answer
    context: RequestContext
    options: AnalyzeOptions = Field(default_factory=AnalyzeOptions)


# ---- response (Trace Report) ----------------------------------------------


class Span(_Model):
    start: int = Field(ge=0)
    end: int = Field(ge=0)


class Claim(_Model):
    id: str
    text: str
    status: ClaimStatus
    matchedSourceIndexes: list[int] = Field(default_factory=list)
    reason: str
    traceTip: str
    span: Span


class Source(_Model):
    index: int = Field(ge=0)
    url: str
    status: SourceStatus
    relevance: Relevance
    domain: str


class EngineInfo(_Model):
    heuristics: str
    llm: str | None
    cached: bool


class TraceReport(_Model):
    traceReportId: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    traceScore: float = Field(ge=0.0, le=1.0)
    generatedAt: str
    engine: EngineInfo
    flags: list[TraceFlag] = Field(default_factory=list)
    claims: list[Claim] = Field(default_factory=list)
    sources: list[Source] = Field(default_factory=list)


# ---- deep trace (POST /v1/trace) -------------------------------------------
# An on-demand, opt-in action: for ONE flagged claim, search the web for independent
# sources and describe neutrally what each says — never a truth verdict (I1). Full mode
# only (it sends the claim + context to the LLM under zero-retention, ADR-1); when no LLM
# key is configured the endpoint returns ``available=false`` so the client keeps its
# instant Google-search fallback.


class TraceQuery(_Model):
    claim: str = Field(min_length=1, max_length=2_000)
    # Surrounding answer/thread text so the search is grounded in what the user is reading.
    context: str = Field(default="", max_length=20_000)
    locale: str = "en"


class DeepSource(_Model):
    url: str
    title: str
    # A short, attributed description of what THIS source says about the topic — never an
    # assertion that the claim is true or false (I1).
    note: str


class DeepTraceResult(_Model):
    traceId: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    # False when the LLM/web-search backend isn't configured — the client falls back to
    # its instant reverse-search link rather than showing an empty result.
    available: bool
    # A neutral overview of whether the independent sources found appear to converge or
    # diverge on the point — still never a verdict on the claim.
    summary: str
    sources: list[DeepSource] = Field(default_factory=list)
    disclaimer: str
