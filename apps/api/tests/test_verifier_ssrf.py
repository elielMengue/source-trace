import pytest

from source_trace_api.verifier import UnsafeUrlError, assert_url_allowed, is_blocked_ip


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
