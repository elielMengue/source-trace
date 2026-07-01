"""Locale-aware coaching tips. Templates now; an LLM fallback can enrich them later.

Never English-only (i18n requirement §10). We resolve by language subtag and fall back
to English, but the *presence* of a localized path is the point — templates are easy to
extend per language without code changes.
"""

from __future__ import annotations

from .contracts import ClaimStatus

# language subtag -> {status -> template}. `{snippet}` is a short quote of the claim.
_TEMPLATES: dict[str, dict[ClaimStatus, str]] = {
    "en": {
        ClaimStatus.unsupported: "Reverse-search the phrase “{snippet}” to find a primary source.",
        ClaimStatus.weak: "A source is cited but weak — look for a second, independent source for “{snippet}”.",
        ClaimStatus.supported: "A source is cited. Open it and confirm it actually says “{snippet}”.",
    },
    "fr": {
        ClaimStatus.unsupported: "Recherchez la phrase « {snippet} » pour trouver une source primaire.",
        ClaimStatus.weak: "Une source est citée mais faible — cherchez une seconde source indépendante pour « {snippet} ».",
        ClaimStatus.supported: "Une source est citée. Ouvrez-la et vérifiez qu’elle dit bien « {snippet} ».",
    },
    "es": {
        ClaimStatus.unsupported: "Busca la frase «{snippet}» para encontrar una fuente primaria.",
        ClaimStatus.weak: "Se cita una fuente pero es débil: busca una segunda fuente independiente para «{snippet}».",
        ClaimStatus.supported: "Se cita una fuente. Ábrela y confirma que realmente dice «{snippet}».",
    },
}


def _snippet(text: str, limit: int = 48) -> str:
    text = text.strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def language_of(locale: str) -> str:
    return (locale or "en").replace("_", "-").split("-", 1)[0].lower()


def trace_tip(claim_text: str, status: ClaimStatus, locale: str) -> str:
    lang = language_of(locale)
    templates = _TEMPLATES.get(lang, _TEMPLATES["en"])
    return templates[status].format(snippet=_snippet(claim_text))
