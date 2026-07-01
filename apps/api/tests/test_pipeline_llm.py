"""Pipeline tests for the full-mode LLM path — offline, via fake extractors.
No API key or network is used."""


from source_trace_api.contracts import AnalyzeRequest, Link, Relevance
from source_trace_api.llm import LlmClaim
from source_trace_api.pipeline import analyze

TEXT = "Rayleigh scattering makes the sky appear blue. It is a well studied effect."


def _request(mode="full", links=None):
    return AnalyzeRequest.model_validate(
        {
            "answer": {"text": TEXT, "links": links or []},
            "context": {"sourceSite": "chatgpt", "locale": "en-US", "clientVersion": "1.0.0"},
            "options": {"mode": mode, "maxClaims": 20},
        }
    )


class FakeExtractor:
    def __init__(self, claims, model="claude-opus-4-8"):
        self._claims = claims
        self._model = model

    async def extract(self, text, links, max_claims, locale):
        return self._claims, self._model


class FailingExtractor:
    async def extract(self, text, links, max_claims, locale):
        raise RuntimeError("provider down")


async def test_llm_claims_are_used_and_engine_records_model(monkeypatch):
    # Give the pipeline a key so network verification path is exercised (but no links).
    monkeypatch.setattr("source_trace_api.pipeline.settings.llm_api_key", "test-key")
    claim = LlmClaim(
        text="Rayleigh scattering makes the sky appear blue.",
        start=0,
        end=46,
        matched_indexes=[],
        relevance=Relevance.unknown,
    )
    report = await analyze(_request(), extractor=FakeExtractor([claim]))
    assert report.engine.llm == "claude-opus-4-8"
    assert len(report.claims) == 1
    assert report.claims[0].status == "unsupported"  # no matched source


async def test_llm_relevance_propagates_to_source(monkeypatch):
    monkeypatch.setattr("source_trace_api.pipeline.settings.llm_api_key", "test-key")
    links = [Link(url="https://nasa.gov", anchorText="NASA")]
    claim = LlmClaim(
        text="Rayleigh scattering makes the sky appear blue.",
        start=0,
        end=46,
        matched_indexes=[0],
        relevance=Relevance.high,
    )
    # Clear the key so no real network verification runs (network needs a key); the LLM
    # path still runs (use_llm needs only full mode + extractor), so relevance still applies.
    monkeypatch.setattr("source_trace_api.pipeline.settings.llm_api_key", None)
    report = await analyze(_request(links=links), extractor=FakeExtractor([claim]))
    assert report.sources[0].relevance == "high"
    assert report.claims[0].matchedSourceIndexes == [0]


async def test_llm_failure_falls_back_to_heuristics(monkeypatch):
    monkeypatch.setattr("source_trace_api.pipeline.settings.llm_api_key", "test-key")
    report = await analyze(_request(), extractor=FailingExtractor())
    assert report.engine.llm is None  # fell back
    assert len(report.claims) >= 1  # deterministic extraction still produced claims


async def test_heuristics_only_ignores_extractor():
    claim = LlmClaim(text="unused", start=0, end=6)
    report = await analyze(_request(mode="heuristics_only"), extractor=FakeExtractor([claim]))
    assert report.engine.llm is None
    # deterministic claim text, not the fake "unused"
    assert all(c.text != "unused" for c in report.claims)
