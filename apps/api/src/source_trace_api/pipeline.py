"""Orchestrates the analyze pipeline and assembles the Trace Report (§4.5, §5).

Stateless and idempotent per content hash. In ``full`` mode an injected LLM extractor
does batched claim extraction + citation relevance and sources are network-verified; any
LLM failure falls back to the deterministic path (I3). ``heuristics_only`` never leaves
the browser's trust boundary, so it never calls the LLM or the network (ADR-1).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime

import structlog

from . import HEURISTICS_VERSION
from .cache import content_hash
from .citations import match_claim_to_links
from .claims import extract_claims
from .coach import trace_tip
from .config import settings
from .contracts import (
    AnalyzeMode,
    AnalyzeRequest,
    Claim,
    EngineInfo,
    Relevance,
    Source,
    Span,
    TraceReport,
)
from .heuristics import classify_claim, compute_flags, compute_trace_score
from .llm import ClaimExtractor
from .verifier import verify_links

log = structlog.get_logger()


@dataclass
class _Candidate:
    """A claim before status/tip assignment — the common shape both paths produce."""

    text: str
    start: int
    end: int
    matched_indexes: list[int] = field(default_factory=list)
    relevance: Relevance = Relevance.unknown


def _deterministic_candidates(text: str, links, max_claims: int) -> list[_Candidate]:
    out: list[_Candidate] = []
    for s in extract_claims(text, max_claims):
        matched = match_claim_to_links(s.text, links)
        out.append(_Candidate(text=s.text, start=s.start, end=s.end, matched_indexes=matched))
    return out


async def analyze(request: AnalyzeRequest, extractor: ClaimExtractor | None = None) -> TraceReport:
    answer = request.answer
    opts = request.options
    locale = request.context.locale

    # full mode may use the LLM + network; heuristics_only never leaves the browser (ADR-1).
    use_llm = opts.mode == AnalyzeMode.full and extractor is not None
    network = opts.mode == AnalyzeMode.full and settings.llm_api_key is not None

    sources = await verify_links(answer.links, network=network)

    candidates: list[_Candidate] = []
    llm_model: str | None = None
    if use_llm:
        try:
            llm_claims, llm_model = await extractor.extract(
                answer.text, answer.links, opts.maxClaims, locale
            )
            candidates = [
                _Candidate(
                    text=c.text,
                    start=c.start,
                    end=c.end,
                    matched_indexes=c.matched_indexes,
                    relevance=c.relevance,
                )
                for c in llm_claims
            ]
        except Exception as exc:  # graceful degradation (I3) — never fail the request
            log.warning("analyze.llm_failed", error=str(exc))
            llm_model = None
            candidates = []

    if not candidates:  # deterministic path (heuristics_only, no extractor, or LLM failure)
        candidates = _deterministic_candidates(answer.text, answer.links, opts.maxClaims)

    # LLM-provided relevance enriches the matched sources (take the strongest per source).
    _apply_relevance(sources, candidates)

    claims: list[Claim] = []
    statuses = []
    for i, cand in enumerate(candidates):
        status, reason = classify_claim(cand.matched_indexes, sources)
        statuses.append(status)
        claims.append(
            Claim(
                id=f"c{i + 1}",
                text=cand.text,
                status=status,
                matchedSourceIndexes=cand.matched_indexes,
                reason=reason,
                traceTip=trace_tip(cand.text, status, locale),
                span=Span(start=cand.start, end=cand.end),
            )
        )

    flags = compute_flags(
        num_claims=len(claims),
        matched_per_claim=[c.matched_indexes for c in candidates],
        sources=sources,
        num_links=len(answer.links),
    )

    key = content_hash(answer.text, answer.links, locale, opts.mode)
    return TraceReport(
        traceReportId=f"sha256:{key}",
        traceScore=compute_trace_score(statuses),
        generatedAt=datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        engine=EngineInfo(heuristics=HEURISTICS_VERSION, llm=llm_model, cached=False),
        flags=flags,
        claims=claims,
        sources=sources,
    )


_RELEVANCE_RANK = {
    Relevance.unknown: 0,
    Relevance.low: 1,
    Relevance.medium: 2,
    Relevance.high: 3,
}


def _apply_relevance(sources: list[Source], candidates: list[_Candidate]) -> None:
    """Set each source's relevance to the strongest relevance any claim assigned it."""
    best: dict[int, Relevance] = {}
    for cand in candidates:
        for idx in cand.matched_indexes:
            if _RELEVANCE_RANK[cand.relevance] > _RELEVANCE_RANK.get(best.get(idx, Relevance.unknown), 0):
                best[idx] = cand.relevance
    for src in sources:
        if src.index in best:
            src.relevance = best[src.index]
