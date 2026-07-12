"""Rate-limit client key: behind Railway's proxy the real client is in X-Forwarded-For,
not the socket peer. Guards the proxy-aware key so limits are per-client, not per-proxy.
"""

from __future__ import annotations

from starlette.requests import Request

from source_trace_api.main import _client_key


def _request(headers: dict[str, str], client_host: str | None) -> Request:
    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (client_host, 0) if client_host else None,
    }
    return Request(scope)


def test_key_prefers_first_forwarded_hop() -> None:
    req = _request({"x-forwarded-for": "203.0.113.7, 10.0.0.1"}, client_host="10.0.0.1")
    assert _client_key(req) == "203.0.113.7"


def test_key_falls_back_to_peer_without_forwarded_header() -> None:
    req = _request({}, client_host="198.51.100.42")
    assert _client_key(req) == "198.51.100.42"
