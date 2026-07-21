"""Runtime configuration. Secrets/env only — no content is ever configured here."""

from __future__ import annotations

from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ST_", env_file=".env", extra="ignore")

    # CORS (§8): pin to specific published extension IDs in production via
    # ST_ALLOWED_EXTENSION_IDS. When empty/unset (dev), we fall back to accepting any
    # well-formed unpacked-extension origin — never `*`.
    #
    # NoDecode: don't let pydantic-settings JSON-decode this env value at the source
    # (an empty string or a bare comma-separated list is not valid JSON and would crash
    # startup). We parse it ourselves below, accepting: "" -> [], "id1,id2" (comma or
    # whitespace separated), or a JSON array.
    allowed_extension_ids: Annotated[list[str], NoDecode] = []

    @field_validator("allowed_extension_ids", mode="before")
    @classmethod
    def _parse_extension_ids(cls, v: object) -> object:
        if v is None:
            return []
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return []
            if s.startswith("["):
                import json

                return json.loads(s)
            return [part.strip() for part in s.replace(",", " ").split() if part.strip()]
        return v

    # Cache
    cache_ttl_seconds: int = 7 * 24 * 3600  # 7d (§4.5)
    redis_url: str | None = None  # None -> in-memory cache (dev)

    # LLM (full mode). Absent key -> full mode still verifies source liveness (the green
    # path is LLM-free), but claim extraction/relevance degrades to the deterministic path.
    llm_api_key: str | None = None
    llm_model: str = "claude-opus-4-8"

    # Deep trace (POST /v1/trace) — the "search independent sources" action.
    # Provider: "gemini" for the demo (Google Search grounding), "anthropic" for prod
    # (web search under zero-retention, ADR-1). "auto" picks whichever key is present.
    trace_provider: str = "auto"
    # Gemini key is read WITHOUT the ST_ prefix (the .env ships GEMINI_API_KEY).
    gemini_api_key: str | None = Field(default=None, validation_alias="GEMINI_API_KEY")
    gemini_model: str = "gemini-2.5-flash"

    # Guarded fetcher (§8)
    fetch_timeout_seconds: float = 3.0
    fetch_max_redirects: int = 3

    # Rate limiting (public /v1/* endpoints protect the LLM quota). Values are slowapi
    # limit strings. trace is stricter — it fans out to an LLM + web search.
    rate_limit_enabled: bool = True
    rate_limit: str = "60/minute"
    trace_rate_limit: str = "12/minute"


settings = Settings()
