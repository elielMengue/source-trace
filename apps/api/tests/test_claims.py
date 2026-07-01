from source_trace_api.claims import extract_claims, is_claim_like, split_sentences


def test_spans_are_accurate():
    text = "The sky is blue.  Water boils at 100 degrees C."
    sentences = split_sentences(text)
    assert len(sentences) == 2
    for s in sentences:
        assert text[s.start : s.end] == s.text


def test_questions_are_not_claims():
    assert not is_claim_like("What is the capital of France?")
    assert is_claim_like("Paris is the capital of France.")


def test_short_fragments_excluded():
    assert not is_claim_like("Yes.")
    assert not is_claim_like("OK sure.")


def test_extract_respects_max_claims():
    text = " ".join(f"Claim number {i} is a substantive statement." for i in range(10))
    assert len(extract_claims(text, max_claims=3)) == 3


def test_non_english_sentence_splitting():
    text = "水は100度で沸騰する。空は青い。"
    sentences = split_sentences(text)
    assert len(sentences) == 2
    assert sentences[0].text == "水は100度で沸騰する。"
