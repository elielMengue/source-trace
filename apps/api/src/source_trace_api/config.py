"""Runtime configuration. Secrets/env only — no content is ever configured here."""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ST_", env_file=".env", extra="ignore")

    # CORS (§8): pin to specific published extension IDs in production via
    # ST_ALLOWED_EXTENSION_IDS (comma/JSON list of 32-char ids). When empty (dev), we
    # fall back to accepting any well-formed unpacked-extension origin — never `*`.
    allowed_extension_ids: list[str] = []

    # Cache
    cache_ttl_seconds: int = 7 * 24 * 3600  # 7d (§4.5)
    redis_url: str | None = None  # None -> in-memory cache (dev)

    # LLM (full mode). Absent key -> full mode degrades to heuristics-only.
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


settings = Settings()
