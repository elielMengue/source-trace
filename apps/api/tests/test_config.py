"""Settings parsing — especially ST_ALLOWED_EXTENSION_IDS, which pins CORS in prod.

Regression guard: an *empty* (set-but-blank) env value once crashed startup because
pydantic-settings JSON-decodes list fields at the source. The field is now NoDecode +
a custom parser accepting "" -> [], comma/space-separated, or a JSON array.
"""

from __future__ import annotations

import pytest

from source_trace_api.config import Settings


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("", []),
        ("   ", []),
        ("abcdefghijklmnopabcdefghijklmnop", ["abcdefghijklmnopabcdefghijklmnop"]),
        ("id_one,id_two", ["id_one", "id_two"]),
        ("id_one, id_two ,id_three", ["id_one", "id_two", "id_three"]),
        ("id_one id_two", ["id_one", "id_two"]),
        ('["id_one","id_two"]', ["id_one", "id_two"]),
        ("[]", []),
    ],
)
def test_allowed_extension_ids_parsing(
    monkeypatch: pytest.MonkeyPatch, raw: str, expected: list[str]
) -> None:
    monkeypatch.setenv("ST_ALLOWED_EXTENSION_IDS", raw)
    assert Settings().allowed_extension_ids == expected


def test_allowed_extension_ids_unset_defaults_empty(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("ST_ALLOWED_EXTENSION_IDS", raising=False)
    assert Settings().allowed_extension_ids == []
