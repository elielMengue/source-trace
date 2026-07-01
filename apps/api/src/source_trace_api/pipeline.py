"""Orchestrates the analyze pipeline and assembles the Trace Report (§4.5, §5).

Stateless and idempotent per content hash. The LLM claim extractor is not wired yet;
the deterministic extractor stands in and the pipeline is written so that swapping it in
for `full` mode is a localized change (engine.llm flips from null to the model id).
"""

from __future__ import annotations

from datetime import UTC, datetime

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
    Span,
    TraceReport,
)
from .heuristics import classify_claim, compute_flags, compute_trace_score
from .verifier import verify_links


async def analyze(request: AnalyzeRequest) -> TraceReport:
    answer = request.answer
    opts = request.options
    locale = request.context.locale

    # Full mode would additionally call the LLM extractor and set engine.llm; until that
    # is wired, both modes run the deterministic path. Network verification only runs in
    # full mode (heuristics-only never leaves the browser's trust boundary — ADR-1).
    network = opts.mode == AnalyzeMode.full and settings.llm_api_key is not None
    llm_model = settings.llm_model if network else None

    extracted = extract_claims(answer.text, opts.maxClaims)
    sources = await verify_links(answer.links, network=network)

    matched_per_claim: list[list[int]] = [
        match_claim_to_links(c.text, answer.links) for c in extracted
    ]

    claims: list[Claim] = []
    statuses = []
    for i, (sentence, matched) in enumerate(zip(extracted, matched_per_claim, strict=True)):
        status, reason = classify_claim(matched, sources)
        statuses.append(status)
        claims.append(
            Claim(
                id=f"c{i + 1}",
                text=sentence.text,
                status=status,
                matchedSourceIndexes=matched,
                reason=reason,
                traceTip=trace_tip(sentence.text, status, locale),
                span=Span(start=sentence.start, end=sentence.end),
            )
        )

    flags = compute_flags(
        num_claims=len(claims),
        matched_per_claim=matched_per_claim,
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
