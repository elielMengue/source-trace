"""Pure, unit-tested heuristics. These run even when the LLM pass is unavailable,
so the product is always useful (failure policy, §4.5).

Everything here is about VISIBLE SOURCING, never truth (invariant I1).
"""

from __future__ import annotations

from .contracts import ClaimStatus, Source, SourceStatus, TraceFlag

# A citation is considered dead-backing if its only matched source is dead.
LOW_DENSITY_THRESHOLD = 0.5

_STATUS_WEIGHT = {
    ClaimStatus.supported: 1.0,
    ClaimStatus.weak: 0.5,
    ClaimStatus.unsupported: 0.0,
}


def classify_claim(matched_indexes: list[int], sources: list[Source]) -> tuple[ClaimStatus, str]:
    """Decide a claim's SOURCING status from its matched sources.

    - supported: at least one live matched source
    - weak: matched only to sources that are dead or unknown-liveness
    - unsupported: no matched source at all
    """
    if not matched_indexes:
        return ClaimStatus.unsupported, "No citation found for this statement."

    matched = [sources[i] for i in matched_indexes if 0 <= i < len(sources)]
    if any(s.status == SourceStatus.live for s in matched):
        return ClaimStatus.supported, "A cited source appears to back this statement."
    if any(s.status == SourceStatus.dead for s in matched):
        return ClaimStatus.weak, "The cited source did not respond (dead link)."
    return ClaimStatus.weak, "A source is cited but its liveness could not be confirmed."


def compute_flags(
    *,
    num_claims: int,
    matched_per_claim: list[list[int]],
    sources: list[Source],
    num_links: int,
) -> list[TraceFlag]:
    """Report-level flags (§4.5: no-source / single-source / dead-link / density)."""
    flags: list[TraceFlag] = []

    if num_links == 0:
        flags.append(TraceFlag.no_visible_sources)

    distinct_domains = {s.domain for s in sources if s.domain}
    if num_links > 0 and len(distinct_domains) == 1:
        flags.append(TraceFlag.single_source)

    if any(s.status == SourceStatus.dead for s in sources):
        flags.append(TraceFlag.dead_link)

    if num_claims > 0:
        supported = sum(1 for m in matched_per_claim if m)
        if supported / num_claims < LOW_DENSITY_THRESHOLD:
            flags.append(TraceFlag.low_citation_density)

    # Preserve enum order, dedupe.
    order = list(TraceFlag)
    return sorted(set(flags), key=order.index)


def compute_trace_score(statuses: list[ClaimStatus]) -> float:
    """Share of claims with adequate visible support (supported=1, weak=0.5).

    No claims -> 1.0 (nothing to trace), which keeps the pre-share pause from firing
    on non-claim content.
    """
    if not statuses:
        return 1.0
    total = sum(_STATUS_WEIGHT[s] for s in statuses)
    return round(total / len(statuses), 4)
