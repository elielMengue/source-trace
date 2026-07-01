"""Contract discipline: reports the API produces MUST validate against the shared
JSON Schema (source of truth). This is what prevents client/server drift (§6).
"""

import json
from pathlib import Path

import pytest
from jsonschema import Draft7Validator

from source_trace_api.contracts import AnalyzeRequest
from source_trace_api.pipeline import analyze

SCHEMA_DIR = Path(__file__).resolve().parents[3] / "packages" / "shared" / "schema"


def _load(name: str) -> dict:
    return json.loads((SCHEMA_DIR / name).read_text(encoding="utf-8"))


@pytest.fixture
def report_validator():
    return Draft7Validator(_load("trace-report.schema.json"))


@pytest.fixture
def request_validator():
    return Draft7Validator(_load("analyze-request.schema.json"))


def _sample_request(links=None):
    return {
        "answer": {
            "text": "Rayleigh scattering makes the sky appear blue. What causes sunsets?",
            "links": links or [],
        },
        "context": {"sourceSite": "perplexity", "locale": "en-US", "clientVersion": "1.0.0"},
        "options": {"mode": "heuristics_only", "maxClaims": 20},
    }


async def test_produced_report_conforms_to_schema(report_validator):
    req = AnalyzeRequest.model_validate(_sample_request())
    report = await analyze(req)
    errors = list(report_validator.iter_errors(report.model_dump(mode="json")))
    assert errors == [], [e.message for e in errors]


async def test_report_with_sources_conforms(report_validator):
    links = [{"url": "https://nasa.gov", "anchorText": "Rayleigh scattering, NASA"}]
    req = AnalyzeRequest.model_validate(_sample_request(links=links))
    report = await analyze(req)
    errors = list(report_validator.iter_errors(report.model_dump(mode="json")))
    assert errors == [], [e.message for e in errors]


def test_sample_request_conforms(request_validator):
    errors = list(request_validator.iter_errors(_sample_request()))
    assert errors == [], [e.message for e in errors]
