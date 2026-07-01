"""Deterministic claim segmentation with character spans.

In heuristics-only mode (and as the fallback when the LLM pass fails) we cannot use
an LLM, so we split the answer into sentences and keep only "claim-like" ones. Spans
are byte-accurate character offsets so the overlay can highlight without re-parsing.

The LLM extractor (claims via the provider, batched) will replace/augment this in
`full` mode; it must return the same Claim shape so the pipeline is indifferent.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Sentence terminators across scripts we care about (Latin, CJK, Arabic, Devanagari …).
_SENTENCE_END = re.compile(r"[.!?。！？…]+|۔|।")

# A sentence that is purely a question is a prompt, not a claim to be sourced.
_QUESTION_END = re.compile(r"[?？]\s*$")


@dataclass(frozen=True)
class Sentence:
    text: str
    start: int
    end: int


def split_sentences(text: str) -> list[Sentence]:
    """Split into sentences, preserving exact character spans into the original text."""
    sentences: list[Sentence] = []
    cursor = 0
    for match in _SENTENCE_END.finditer(text):
        end = match.end()
        segment = text[cursor:end]
        stripped = segment.strip()
        if stripped:
            lead = len(segment) - len(segment.lstrip())
            start = cursor + lead
            real_end = start + len(stripped)
            sentences.append(Sentence(text=stripped, start=start, end=real_end))
        cursor = end
    # Trailing text with no terminator.
    tail = text[cursor:]
    if tail.strip():
        lead = len(tail) - len(tail.lstrip())
        start = cursor + lead
        stripped = tail.strip()
        sentences.append(Sentence(text=stripped, start=start, end=start + len(stripped)))
    return sentences


def is_claim_like(sentence: str) -> bool:
    """Heuristic: declarative, substantive statement that could carry a citation.

    Deliberately permissive — better to over-detect claims (and coach) than to miss
    an unsourced assertion. Excludes questions and trivially short fragments.
    """
    s = sentence.strip()
    if len(s) < 15:
        return False
    if _QUESTION_END.search(s):
        return False
    # Needs at least a couple of word-ish tokens.
    words = re.findall(r"\w+", s, flags=re.UNICODE)
    return len(words) >= 4


def extract_claims(text: str, max_claims: int) -> list[Sentence]:
    """Return up to ``max_claims`` claim-like sentences with spans."""
    claims = [s for s in split_sentences(text) if is_claim_like(s.text)]
    return claims[:max_claims]
