"""FastAPI app: POST /v1/analyze + /healthz.

Stateless, no content DB. Only content *hashes* are cached (§8). Logging is
content-free — we log the report id (a hash) and timings, never answer text.
"""

from __future__ import annotations

import hashlib
import time

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from . import __version__
from .cache import InMemoryCache, content_hash
from .config import settings
from .contracts import (
    AnalyzeRequest,
    DeepSource,
    DeepTraceResult,
    TraceQuery,
    TraceReport,
)
from .llm import build_extractor
from .pipeline import analyze
from .trace import build_tracer

log = structlog.get_logger()


def _client_key(request: Request) -> str:
    """Rate-limit key = real client IP. Behind Railway's proxy the socket peer is the
    proxy, so prefer the first hop of X-Forwarded-For when present."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(
    key_func=_client_key,
    default_limits=[settings.rate_limit],
    enabled=settings.rate_limit_enabled,
)

app = FastAPI(
    title="st-api",
    version=__version__,
    summary="Source-Trace analysis backend — returns a normalized Trace Report.",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Pin to configured extension IDs in production; otherwise accept only well-formed
# unpacked-extension origins (32 chars a–p) — never a blanket `chrome-extension://.*`.
_cors_origin = (
    {"allow_origins": [f"chrome-extension://{i}" for i in settings.allowed_extension_ids]}
    if settings.allowed_extension_ids
    else {"allow_origin_regex": r"^chrome-extension://[a-p]{32}$"}
)
app.add_middleware(
    CORSMiddleware,
    **_cors_origin,
    allow_methods=["POST", "GET"],
    allow_headers=["content-type"],
)

# In-memory cache for dev; swap for a Redis-backed ReportCache in production (§4.5).
_cache = InMemoryCache()

# Built once (constructing the SDK client per request would be wasteful). None when no
# LLM key is configured, in which case full mode degrades to heuristics-only (ADR-1).
_extractor = build_extractor()

# Deep-trace tracer (web search). None when no LLM key is set — /v1/trace then reports
# available=false and the client keeps its instant reverse-search fallback (I3).
_tracer = build_tracer()

_TRACE_DISCLAIMER = (
    "These independent sources describe the topic; they do not confirm or refute the "
    "claim. Read them and judge for yourself."
)


@app.get("/healthz")
@limiter.exempt
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


def _trace_key(query: TraceQuery) -> str:
    """Stable cache/trace key from the claim + context only (no plaintext stored)."""
    h = hashlib.sha256()
    h.update(query.claim.encode("utf-8"))
    h.update(b"\x00")
    h.update(query.context.encode("utf-8"))
    h.update(b"\x00")
    h.update(query.locale.encode("utf-8"))
    return h.hexdigest()


@app.post("/v1/trace", response_model=DeepTraceResult)
@limiter.limit(settings.trace_rate_limit)
async def trace_endpoint(request: Request, query: TraceQuery) -> DeepTraceResult:
    started = time.perf_counter()
    key = _trace_key(query)
    trace_id = f"sha256:{key}"

    # No tracer -> the client keeps its instant reverse-search link (I3). Never an error.
    if _tracer is None:
        return DeepTraceResult(
            traceId=trace_id,
            available=False,
            summary="",
            sources=[],
            disclaimer=_TRACE_DISCLAIMER,
        )

    cache_key = f"trace:{key}"
    cached = await _cache.get(cache_key)
    if cached is not None:
        log.info("trace.cache_hit", trace_id=trace_id,
                 ms=round((time.perf_counter() - started) * 1000, 1))
        return DeepTraceResult.model_validate(cached)

    try:
        data = await _tracer.trace(query.claim, query.context, query.locale)
    except Exception as exc:  # graceful degradation (I3) — never fail the client action
        log.warning("trace.failed", trace_id=trace_id, error=str(exc))
        return DeepTraceResult(
            traceId=trace_id,
            available=False,
            summary="",
            sources=[],
            disclaimer=_TRACE_DISCLAIMER,
        )

    result = DeepTraceResult(
        traceId=trace_id,
        available=True,
        summary=data.summary,
        sources=[DeepSource(url=s.url, title=s.title, note=s.note) for s in data.sources],
        disclaimer=_TRACE_DISCLAIMER,
    )
    await _cache.set(cache_key, result.model_dump(mode="json"), settings.cache_ttl_seconds)
    log.info(
        "trace.computed",
        trace_id=trace_id,
        sources=len(result.sources),
        model=data.model,
        ms=round((time.perf_counter() - started) * 1000, 1),
    )
    return result
