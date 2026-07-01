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


class Answer(_Model):
    text: str = Field(max_length=100_000)
    links: list[Link] = Field(default_factory=list)


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
