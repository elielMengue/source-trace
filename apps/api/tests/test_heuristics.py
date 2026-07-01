from source_trace_api.contracts import ClaimStatus, Relevance, Source, SourceStatus, TraceFlag
from source_trace_api.heuristics import classify_claim, compute_flags, compute_trace_score


def _source(index: int, status: SourceStatus, domain: str = "example.com") -> Source:
    return Source(
        index=index, url=f"https://{domain}/x", status=status, relevance=Relevance.unknown, domain=domain
    )


def test_unsupported_when_no_match():
    status, reason = classify_claim([], [])
    assert status == ClaimStatus.unsupported
    assert "No citation" in reason


def test_supported_when_live_source():
    sources = [_source(0, SourceStatus.live)]
    status, _ = classify_claim([0], sources)
    assert status == ClaimStatus.supported


def test_weak_when_dead_source():
    sources = [_source(0, SourceStatus.dead)]
    status, reason = classify_claim([0], sources)
    assert status == ClaimStatus.weak
    assert "dead" in reason.lower()


def test_weak_when_unknown_liveness():
    sources = [_source(0, SourceStatus.unknown)]
    status, _ = classify_claim([0], sources)
    assert status == ClaimStatus.weak


def test_flag_no_visible_sources():
    flags = compute_flags(num_claims=2, matched_per_claim=[[], []], sources=[], num_links=0)
    assert TraceFlag.no_visible_sources in flags
    assert TraceFlag.low_citation_density in flags  # 0/2 supported


def test_flag_single_source():
    sources = [_source(0, SourceStatus.live, "a.com"), _source(1, SourceStatus.live, "a.com")]
    flags = compute_flags(num_claims=1, matched_per_claim=[[0]], sources=sources, num_links=2)
    assert TraceFlag.single_source in flags
    assert TraceFlag.no_visible_sources not in flags


def test_flag_dead_link():
    sources = [_source(0, SourceStatus.dead, "a.com"), _source(1, SourceStatus.live, "b.com")]
    flags = compute_flags(num_claims=1, matched_per_claim=[[1]], sources=sources, num_links=2)
    assert TraceFlag.dead_link in flags


def test_trace_score_weighting():
    assert compute_trace_score([]) == 1.0
    assert compute_trace_score([ClaimStatus.supported, ClaimStatus.unsupported]) == 0.5
    assert compute_trace_score([ClaimStatus.weak, ClaimStatus.weak]) == 0.5
    assert compute_trace_score([ClaimStatus.supported]) == 1.0
