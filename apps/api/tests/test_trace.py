import json

import pytest
from fastapi.testclient import TestClient

import source_trace_api.main as main
from source_trace_api.main import app
from source_trace_api.trace import TraceData, build_prompt, parse_trace


@pytest.fixture
def client():
    return TestClient(app)


# ---- parse_trace -----------------------------------------------------------


def test_parse_trace_keeps_valid_sources():
    raw = json.dumps(
        {
            "summary": "Independent sources broadly discuss the same event.",
            "sources": [
                {"url": "https://example.org/a", "title": "A", "note": "According to A, ..."},
                {"url": "https://news.example/b", "title": "B", "note": "B reports ..."},
            ],
        }
    )
    data = parse_trace(raw)
    assert data.summary.startswith("Independent sources")
    assert [s.url for s in data.sources] == ["https://example.org/a", "https://news.example/b"]


def test_parse_trace_drops_non_http_and_extracts_embedded_json():
    raw = 'Here you go:\n{"summary": "s", "sources": [{"url": "ftp://x", "title": "t", "note": "n"}]}'
    data = parse_trace(raw)
    assert data.summary == "s"
    assert data.sources == []  # ftp:// is not an openable link


def test_parse_trace_titles_default_to_url():
    raw = json.dumps({"summary": "s", "sources": [{"url": "https://ex.org/x", "note": "n"}]})
    data = parse_trace(raw)
    assert data.sources[0].title == "https://ex.org/x"


def test_parse_trace_raises_without_json():
    with pytest.raises(ValueError):
        parse_trace("I could not find any sources.")


def test_build_prompt_includes_context_only_when_present():
    assert "SURROUNDING CONTEXT" not in build_prompt("claim", "")
    assert "SURROUNDING CONTEXT" in build_prompt("claim", "some context")


# ---- endpoint --------------------------------------------------------------


def test_trace_available_false_when_no_tracer(client, monkeypatch):
    monkeypatch.setattr(main, "_tracer", None)
    r = client.post("/v1/trace", json={"claim": "The bridge opened in 1937.", "locale": "en"})
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is False
    assert body["sources"] == []
    assert body["traceId"].startswith("sha256:")
    assert body["disclaimer"]


def test_trace_returns_sources_from_tracer(client, monkeypatch):
    class FakeTracer:
        async def trace(self, claim, context, locale):
            return TraceData(
                summary="Two independent outlets cover this.",
                sources=[],
                model="claude-opus-4-8",
            )

    monkeypatch.setattr(main, "_tracer", FakeTracer())
    # Isolate from any cached run of the same claim in another test.
    r = client.post("/v1/trace", json={"claim": "unique-claim-xyz", "locale": "en"})
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is True
    assert body["summary"] == "Two independent outlets cover this."


def test_trace_degrades_when_tracer_raises(client, monkeypatch):
    class BoomTracer:
        async def trace(self, claim, context, locale):
            raise RuntimeError("web search unavailable")

    monkeypatch.setattr(main, "_tracer", BoomTracer())
    r = client.post("/v1/trace", json={"claim": "claim-that-fails", "locale": "en"})
    assert r.status_code == 200
    assert r.json()["available"] is False
