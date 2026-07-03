"""Cache abstraction. Keyed by hash(text+locale+mode) — only hashes, never content (§8).

An in-memory TTL cache is used for dev/tests; a Redis-backed implementation can be
dropped in behind the same interface without touching the pipeline.
"""

from __future__ import annotations

import hashlib
import time
from typing import Protocol

from .contracts import AnalyzeMode, Citation, Link


def content_hash(
    text: str,
    links: list[Link],
    locale: str,
    mode: AnalyzeMode,
    citations: list[Citation] | None = None,
) -> str:
    """Stable cache/report key derived only from content + params (no plaintext stored).

    Links and citations are folded in: two answers with identical text but different
    cited sources produce different reports, so they must not share a cache entry.
    """
    h = hashlib.sha256()
    h.update(text.encode("utf-8"))
    for link in links:
        h.update(b"\x00")
        h.update(link.url.encode("utf-8"))
    for citation in citations or ():
        h.update(b"\x02")
        h.update(str(citation.pos).encode("utf-8"))
        h.update(b"\x00")
        h.update((citation.url or "").encode("utf-8"))
    h.update(b"\x01")
    h.update(locale.encode("utf-8"))
    h.update(b"\x00")
    h.update(mode.value.encode("utf-8"))
    return h.hexdigest()


class ReportCache(Protocol):
    async def get(self, key: str) -> dict | None: ...
    async def set(self, key: str, value: dict, ttl_seconds: int) -> None: ...


class InMemoryCache:
    """Process-local TTL cache. Fine for dev/tests; not shared across workers."""

    def __init__(self) -> None:
        self._store: dict[str, tuple[float, dict]] = {}

    async def get(self, key: str) -> dict | None:
        item = self._store.get(key)
        if item is None:
            return None
        expires_at, value = item
        if expires_at < time.monotonic():
            self._store.pop(key, None)
            return None
        return value

    async def set(self, key: str, value: dict, ttl_seconds: int) -> None:
        self._store[key] = (time.monotonic() + ttl_seconds, value)
