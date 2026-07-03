import pytest

from source_trace_api.contracts import Link, SourceStatus
from source_trace_api.verifier import (
    UnsafeUrlError,
    assert_url_allowed,
    classify_status,
    is_blocked_ip,
    verify_link,
)


class _Resp:
    def __init__(self, code: int) -> None:
        self.status_code = code


class _Stream:
    def __init__(self, code: int) -> None:
        self._code = code

    async def __aenter__(self) -> _Resp:
        return _Resp(self._code)

    async def __aexit__(self, *_exc) -> bool:
        return False


class _FakeClient:
    """Stands in for httpx.AsyncClient: canned HEAD and streaming-GET responses."""

    def __init__(self, head_code: int, get_code: int | None = None) -> None:
        self._head_code = head_code
        self._get_code = get_code

    async def head(self, _url: str) -> _Resp:
        return _Resp(self._head_code)

    def stream(self, _method: str, _url: str) -> _Stream:
        assert self._get_code is not None, "GET fallback should not run"
        return _Stream(self._get_code)


@pytest.mark.parametrize(
    "ip",
    [
        "127.0.0.1",       # loopback
        "10.0.0.5",        # private
        "192.168.1.1",     # private
        "169.254.169.254", # link-local (cloud metadata!)
        "::1",             # loopback v6
        "0.0.0.0",         # unspecified
        "224.0.0.1",       # multicast
    ],
)
def test_blocked_ips(ip):
    assert is_blocked_ip(ip) is True


@pytest.mark.parametrize("ip", ["8.8.8.8", "1.1.1.1"])
def test_public_ips_allowed(ip):
    assert is_blocked_ip(ip) is False


def test_scheme_allowlist():
    with pytest.raises(UnsafeUrlError):
        assert_url_allowed("file:///etc/passwd")
    with pytest.raises(UnsafeUrlError):
        assert_url_allowed("ftp://example.com/x")


def test_literal_private_ip_url_rejected():
    with pytest.raises(UnsafeUrlError):
        assert_url_allowed("http://169.254.169.254/latest/meta-data/")
    with pytest.raises(UnsafeUrlError):
        assert_url_allowed("http://127.0.0.1:8000/")


def test_missing_host_rejected():
    with pytest.raises(UnsafeUrlError):
        assert_url_allowed("http:///nohost")


@pytest.mark.parametrize(
    "code,expected",
    [
        (200, SourceStatus.live),
        (301, SourceStatus.live),
        (401, SourceStatus.live),  # gated, but exists
        (403, SourceStatus.live),  # bot-blocked, but exists
        (405, SourceStatus.live),  # HEAD not allowed
        (429, SourceStatus.live),  # rate limited
        (404, SourceStatus.dead),
        (410, SourceStatus.dead),
        (500, SourceStatus.dead),
    ],
)
def test_classify_status(code, expected):
    assert classify_status(code) is expected


# A public IP literal keeps assert_url_allowed off the network (no DNS lookup).
_SAFE = Link(url="https://8.8.8.8/", anchorText="")


async def test_live_head_needs_no_get_fallback():
    res = await verify_link(_FakeClient(head_code=200), _SAFE)  # get_code None -> asserts unused
    assert res.status is SourceStatus.live


async def test_head_dead_falls_back_to_get_live():
    res = await verify_link(_FakeClient(head_code=404, get_code=200), _SAFE)
    assert res.status is SourceStatus.live


async def test_head_and_get_dead_is_dead():
    res = await verify_link(_FakeClient(head_code=500, get_code=404), _SAFE)
    assert res.status is SourceStatus.dead


async def test_unsafe_url_is_unknown_without_fetching():
    res = await verify_link(_FakeClient(head_code=200), Link(url="http://127.0.0.1/", anchorText=""))
    assert res.status is SourceStatus.unknown
