from source_trace_api.citations import domain_of, match_claim_to_links
from source_trace_api.contracts import Link


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
