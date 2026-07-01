import pytest
from fastapi.testclient import TestClient

from source_trace_api.main import app


@pytest.fixture
def client():
    return TestClient(app)


def _req(text: str, links=None, mode="heuristics_only"):
    return {
        "answer": {"text": text, "links": links or []},
        "context": {"sourceSite": "chatgpt", "locale": "en-US", "clientVersion": "1.0.0"},
        "options": {"mode": mode, "maxClaims": 20},
    }


def test_healthz(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_analyze_no_sources_flags_unsupported(client):
    r = client.post("/v1/analyze", json=_req("Rayleigh scattering makes the sky appear blue."))
    assert r.status_code == 200
    body = r.json()
    assert body["traceReportId"].startswith("sha256:")
    assert body["engine"]["llm"] is None  # heuristics-only
    assert "no_visible_sources" in body["flags"]
    assert body["claims"][0]["status"] == "unsupported"
    assert body["claims"][0]["traceTip"]  # coaching tip present
    assert body["traceScore"] == 0.0


def test_analyze_with_matching_link(client):
    links = [{"url": "https://nasa.gov", "anchorText": "Rayleigh scattering, NASA"}]
    r = client.post(
        "/v1/analyze",
        json=_req("Rayleigh scattering makes the sky appear blue.", links=links),
    )
    body = r.json()
    # heuristics-only: source liveness unknown -> weak (cited but unconfirmed)
    assert body["claims"][0]["matchedSourceIndexes"] == [0]
    assert body["claims"][0]["status"] == "weak"
    assert body["sources"][0]["status"] == "unknown"


def test_cache_hit_on_second_call(client):
    payload = _req("Water boils at one hundred degrees Celsius at sea level.")
    first = client.post("/v1/analyze", json=payload).json()
    second = client.post("/v1/analyze", json=payload).json()
    assert first["engine"]["cached"] is False
    assert second["engine"]["cached"] is True
    assert first["traceReportId"] == second["traceReportId"]


def test_locale_changes_tip_language(client):
    payload = _req("Le ciel paraît bleu à cause de la diffusion de Rayleigh.")
    payload["context"]["locale"] = "fr-FR"
    body = client.post("/v1/analyze", json=payload).json()
    assert "Recherchez" in body["claims"][0]["traceTip"]


def test_rejects_extra_fields(client):
    bad = _req("The sky is blue and this is a claim.")
    bad["answer"]["unexpected"] = True
    r = client.post("/v1/analyze", json=bad)
    assert r.status_code == 422
