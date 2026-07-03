from source_trace_api.citations import (
    assign_citations_to_spans,
    domain_of,
    match_claim_to_links,
)
from source_trace_api.contracts import Citation, Link


def test_domain_strips_www():
    assert domain_of("https://www.example.com/path") == "example.com"
    assert domain_of("https://sub.example.org") == "sub.example.org"


def test_match_by_anchor_overlap():
    links = [Link(url="https://nasa.gov", anchorText="Rayleigh scattering explained by NASA")]
    matched = match_claim_to_links(
        "Rayleigh scattering causes the sky to appear blue.", links
    )
    assert matched == [0]


def test_no_match_when_unrelated():
    links = [Link(url="https://cooking.com", anchorText="best pasta recipes")]
    matched = match_claim_to_links("Rayleigh scattering causes the blue sky.", links)
    assert matched == []


def test_citations_assigned_to_their_own_claim():
    spans = [(0, 20), (21, 40)]
    citations = [Citation(pos=10, url="https://a.com"), Citation(pos=35, url="https://b.com")]
    url_to_index = {"https://a.com": 0, "https://b.com": 1}
    result = assign_citations_to_spans(spans, citations, url_to_index)
    assert result == [([0], True), ([1], True)]


def test_trailing_chip_attaches_to_preceding_claim():
    # A chip placed just after a sentence's period ("… démontrée. [chip]") backs THAT
    # sentence, not the next one.
    spans = [(0, 12), (13, 25)]
    citations = [Citation(pos=12, url="https://a.com")]
    result = assign_citations_to_spans(spans, citations, {"https://a.com": 0})
    assert result == [([0], True), ([], False)]


def test_citation_without_url_flags_presence_only():
    result = assign_citations_to_spans([(0, 20)], [Citation(pos=5)], {})
    assert result == [([], True)]  # no URL -> presence recorded, no source index


def test_citation_before_first_claim_is_ignored():
    citations = [Citation(pos=2, url="https://a.com")]
    result = assign_citations_to_spans([(5, 20)], citations, {"https://a.com": 0})
    assert result == [([], False)]
