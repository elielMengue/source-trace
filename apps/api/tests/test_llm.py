import json

from source_trace_api.contracts import Relevance
from source_trace_api.llm import build_prompt, parse_extraction

ANSWER = "Rayleigh scattering makes the sky appear blue. Water boils at 100C at sea level."


def test_parse_locates_spans_verbatim():
    raw = json.dumps(
        {
            "claims": [
                {
                    "text": "Rayleigh scattering makes the sky appear blue.",
                    "matched_source_indexes": [0],
                    "relevance": "high",
                }
            ]
        }
    )
    claims = parse_extraction(raw, ANSWER, num_links=1, max_claims=20)
    assert len(claims) == 1
    c = claims[0]
    assert ANSWER[c.start : c.end] == c.text
    assert c.matched_indexes == [0]
    assert c.relevance == Relevance.high


def test_parse_drops_unlocatable_claim():
    raw = json.dumps(
        {"claims": [{"text": "The moon is made of cheese.", "matched_source_indexes": [], "relevance": "none"}]}
    )
    assert parse_extraction(raw, ANSWER, num_links=0, max_claims=20) == []


def test_parse_whitespace_normalized_fallback():
    # Model collapsed the double space after the first sentence.
    raw = json.dumps(
        {"claims": [{"text": "Water boils at 100C at sea level.", "matched_source_indexes": [], "relevance": "none"}]}
    )
    claims = parse_extraction(raw, ANSWER, num_links=0, max_claims=20)
    assert len(claims) == 1
    assert claims[0].start >= 0


def test_parse_clamps_out_of_range_indexes():
    raw = json.dumps(
        {
            "claims": [
                {
                    "text": "Rayleigh scattering makes the sky appear blue.",
                    "matched_source_indexes": [0, 5, -1],
                    "relevance": "medium",
                }
            ]
        }
    )
    claims = parse_extraction(raw, ANSWER, num_links=1, max_claims=20)
    assert claims[0].matched_indexes == [0]  # 5 and -1 dropped


def test_parse_respects_max_claims():
    raw = json.dumps(
        {"claims": [{"text": s, "matched_source_indexes": [], "relevance": "none"}
                    for s in ["Rayleigh scattering makes the sky appear blue.",
                              "Water boils at 100C at sea level."]]}
    )
    assert len(parse_extraction(raw, ANSWER, num_links=0, max_claims=1)) == 1


def test_build_prompt_includes_links_and_answer():
    from source_trace_api.contracts import Link

    prompt = build_prompt("some answer", [Link(url="https://x.com", anchorText="X")], 10)
    assert "https://x.com" in prompt
    assert "some answer" in prompt
