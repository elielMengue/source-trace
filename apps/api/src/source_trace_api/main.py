"""FastAPI app: POST /v1/analyze + /healthz.

Stateless, no content DB. Only content *hashes* are cached (§8). Logging is
content-free — we log the report id (a hash) and timings, never answer text.
"""

from __future__ import annotations

import time

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .cache import InMemoryCache, content_hash
from .config import settings
from .contracts import AnalyzeRequest, TraceReport
from .llm import build_extractor
from .pipeline import analyze

log = structlog.get_logger()

app = FastAPI(
    title="st-api",
    version=__version__,
    summary="Source-Trace analysis backend — returns a normalized Trace Report.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^chrome-extension://.*$",
    allow_methods=["POST", "GET"],
    allow_headers=["content-type"],
)

# In-memory cache for dev; swap for a Redis-backed ReportCache in production (§4.5).
_cache = InMemoryCache()

# Built once (constructing the SDK client per request would be wasteful). None when no
# LLM key is configured, in which case full mode degrades to heuristics-only (ADR-1).
_extractor = build_extractor()


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


@app.post("/v1/analyze", response_model=TraceReport)
async def analyze_endpoint(request: AnalyzeRequest) -> TraceReport:
    started = time.perf_counter()
    key = content_hash(
        request.answer.text,
        request.answer.links,
        request.context.locale,
        request.options.mode,
        request.answer.citations,
    )

    cached = await _cache.get(key)
    if cached is not None:
        report = TraceReport.model_validate(cached)
        report.engine.cached = True
        log.info(
            "analyze.cache_hit",
            report_id=report.traceReportId,
            mode=request.options.mode.value,
            ms=round((time.perf_counter() - started) * 1000, 1),
        )
        return report

    report = await analyze(request, extractor=_extractor)
    await _cache.set(key, report.model_dump(mode="json"), settings.cache_ttl_seconds)
    log.info(
        "analyze.computed",
        report_id=report.traceReportId,
        mode=request.options.mode.value,
        claims=len(report.claims),
        flags=[f.value for f in report.flags],
        ms=round((time.perf_counter() - started) * 1000, 1),
    )
    return report
