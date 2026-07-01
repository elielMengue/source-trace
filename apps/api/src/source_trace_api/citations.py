"""Match claims to the answer's provided links.

Deterministic v1: token overlap between a claim and each link's anchor text / domain.
This is intentionally conservative and clearly a heuristic — the LLM-assisted relevance
pass (full mode) refines it. It never asserts truth, only whether a *visible* source
plausibly backs the claim (invariant I1).
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

from .contracts import Link

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
