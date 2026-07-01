"""Runtime configuration. Secrets/env only — no content is ever configured here."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ST_", env_file=".env", extra="ignore")

    # CORS: only the extension origin(s) may call the API (§8).
    allowed_origins: list[str] = ["chrome-extension://*"]

    # Cache
    cache_ttl_seconds: int = 7 * 24 * 3600  # 7d (§4.5)
    redis_url: str | None = None  # None -> in-memory cache (dev)

    # LLM (full mode). Absent key -> full mode degrades to heuristics-only.
    llm_api_key: str | None = None
    llm_model: str = "claude-opus-4-8"

    # Guarded fetcher (§8)
    fetch_timeout_seconds: float = 3.0
    fetch_max_redirects: int = 3


settings = Settings()
