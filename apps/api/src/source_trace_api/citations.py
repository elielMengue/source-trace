"""Match claims to the answer's provided links.

Deterministic v1: token overlap between a claim and each link's anchor text / domain.
This is intentionally conservative and clearly a heuristic — the LLM-assisted relevance
pass (full mode) refines it. It never asserts truth, only whether a *visible* source
plausibly backs the claim (invariant I1).
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

from .contracts import Citation, Link

# Tiny multilingual-agnostic stopword-ish filter: drop very short tokens only, so we
# don't bake in English assumptions (i18n requirement §10).
_TOKEN = re.compile(r"\w+", flags=re.UNICODE)


def _tokens(text: str) -> set[str]:
    return {t for t in (m.group(0).lower() for m in _TOKEN.finditer(text)) if len(t) > 2}


def domain_of(url: str) -> str:
    try:
        host = urlparse(url).hostname or ""
    except ValueError:
        return ""
    return host[4:] if host.startswith("www.") else host


def match_claim_to_links(claim_text: str, links: list[Link]) -> list[int]:
    """Return indexes of links that plausibly back the claim (by token overlap)."""
    claim_tokens = _tokens(claim_text)
    if not claim_tokens:
        return []
    matched: list[int] = []
    for idx, link in enumerate(links):
        link_tokens = _tokens(link.anchorText) | _tokens(domain_of(link.url))
        overlap = claim_tokens & link_tokens
        if len(overlap) >= 2:
            matched.append(idx)
    return matched


def assign_citations_to_spans(
    spans: list[tuple[int, int]], citations: list[Citation], url_to_index: dict[str, int]
) -> list[tuple[list[int], bool]]:
    """Attach each positional citation to the claim it backs, per claim.

    A chip backs the claim it sits inside, or — since sites like Perplexity place the
    chip just *after* the sentence ("… démontrée. [chip]") — the nearest claim it trails
    (the one with the largest ``start`` at or before ``pos``). Returns, per span,
    ``(source_indexes, has_citation)``: indexes cover only citations with a known-source
    URL, while ``has_citation`` marks a claim visibly-sourced even when the chip's link
    isn't exposed in the DOM (I1).
    """
    result: list[tuple[list[int], bool]] = [([], False) for _ in spans]
    for citation in citations:
        target = -1
        for i, (start, _end) in enumerate(spans):
            if start <= citation.pos and (target == -1 or start > spans[target][0]):
                target = i
        if target == -1:
            continue  # citation precedes the first claim — nothing to attach to
        indexes, _ = result[target]
        if citation.url:
            idx = url_to_index.get(citation.url)
            if idx is not None and idx not in indexes:
                indexes.append(idx)
        result[target] = (indexes, True)
    return [(sorted(idxs), present) for idxs, present in result]
