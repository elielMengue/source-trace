"""Guarded source verification (§8, ADR-5).

Fetching arbitrary URLs that came from untrusted AI output is a live SSRF vector, so
every fetch goes through these guards — never a naive httpx.get:

  * scheme allowlist (http/https only)
  * resolve DNS and block private / loopback / link-local / reserved IP ranges
    (checked against EVERY resolved address to defeat DNS-rebinding-style tricks)
  * capped redirects, short timeout, HEAD request, no auth headers forwarded

In heuristics-only mode the network is never touched; sources are reported as `unknown`.
"""

from __future__ import annotations

import ipaddress
import socket
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx

from .citations import domain_of
from .config import settings
from .contracts import Link, Relevance, Source, SourceStatus

_ALLOWED_SCHEMES = {"http", "https"}


class UnsafeUrlError(ValueError):
    """Raised when a URL is not allowed to be fetched."""


def is_blocked_ip(ip: str) -> bool:
    """True if the address is not a normal, globally-routable public host."""
    addr = ipaddress.ip_address(ip)
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
        or not addr.is_global
    )


def assert_url_allowed(url: str) -> None:
    """Validate scheme + resolve host and reject any private/loopback/etc. address.

    Pure enough to unit-test the scheme/IP-literal paths without network access.
    """
    parsed = urlparse(url)
    if parsed.scheme not in _ALLOWED_SCHEMES:
        raise UnsafeUrlError(f"scheme not allowed: {parsed.scheme!r}")
    host = parsed.hostname
    if not host:
        raise UnsafeUrlError("missing host")

    try:
        infos = socket.getaddrinfo(host, parsed.port or 0, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:  # unresolvable
        raise UnsafeUrlError(f"cannot resolve host: {host}") from exc

    for info in infos:
        ip = info[4][0]
        if is_blocked_ip(ip):
            raise UnsafeUrlError(f"host resolves to blocked address: {ip}")


@dataclass
class VerifyResult:
    status: SourceStatus
    relevance: Relevance


# Status codes that mean the resource EXISTS even though it refused our probe: auth /
# permission walls, HEAD-not-allowed, not-acceptable, and rate limits. A dead link is
# one that resolves to nothing (404/410) or fails to connect. We treat gated hosts as
# live because many real sources 403 an unknown bot yet clearly exist — invariant I1 is
# "does a visible source exist", not "is it freely fetchable by us".
_GATED = frozenset({401, 403, 405, 406, 429})


def classify_status(status_code: int) -> SourceStatus:
    if status_code < 400 or status_code in _GATED:
        return SourceStatus.live
    return SourceStatus.dead


async def verify_link(client: httpx.AsyncClient, link: Link) -> VerifyResult:
    try:
        assert_url_allowed(link.url)
    except UnsafeUrlError:
        return VerifyResult(SourceStatus.unknown, Relevance.unknown)
    try:
        resp = await client.head(link.url)
        status = classify_status(resp.status_code)
        if status is SourceStatus.dead:
            # Some servers don't implement HEAD (or 404 it) but serve GET fine. Stream so
            # we read the status line without downloading the body.
            async with client.stream("GET", link.url) as get_resp:
                status = classify_status(get_resp.status_code)
        return VerifyResult(status, Relevance.unknown)
    except httpx.HTTPError:
        return VerifyResult(SourceStatus.dead, Relevance.unknown)


def build_client() -> httpx.AsyncClient:
    limits = httpx.Limits(max_connections=10)
    return httpx.AsyncClient(
        timeout=settings.fetch_timeout_seconds,
        max_redirects=settings.fetch_max_redirects,
        follow_redirects=True,
        headers={"user-agent": "source-trace-verifier/0.1"},
        limits=limits,
    )


async def verify_links(links: list[Link], *, network: bool) -> list[Source]:
    """Build Source records. When ``network`` is False, everything is `unknown`."""
    if not network:
        return [
            Source(
                index=i,
                url=link.url,
                status=SourceStatus.unknown,
                relevance=Relevance.unknown,
                domain=domain_of(link.url),
            )
            for i, link in enumerate(links)
        ]

    async with build_client() as client:
        results = [await verify_link(client, link) for link in links]
    return [
        Source(
            index=i,
            url=link.url,
            status=res.status,
            relevance=res.relevance,
            domain=domain_of(link.url),
        )
        for i, (link, res) in enumerate(zip(links, results, strict=True))
    ]
