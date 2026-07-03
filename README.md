# Source-Trace

A **browser extension + analysis backend** that reads an AI-generated answer, identifies
which claims have visible, checkable sourcing, and **coaches the user to trace them** —
rather than declaring anything true or false.

See [`Source-Trace_Technical_Design.md`](./Source-Trace_Technical_Design.md) for the full design.

## Product invariants (non-negotiable)

- **I1 — Coach, not oracle.** `status` describes whether a claim has adequate *visible sourcing*, never whether it is *true*.
- **I2 — Transparent by construction.** We disclose AI use in-product and offer an on-device path.
- **I3 — Progressive, never blocking.** The UI paints instantly and enriches as analysis returns; a slow/failed backend degrades to heuristics-only.

## Monorepo layout

```
source-trace/
  apps/
    extension/     # WXT + React (adapters, overlay, popup, background)  [scaffolded]
    api/           # FastAPI (analyze, claims, citations, verifier, heuristics, coach)
  packages/
    shared/        # JSON Schema + generated TS/Pydantic types (Trace Report)
  infra/
    docker/  ci/
```

## Build sequence (from the design doc §14)

1. `packages/shared` — Trace Report JSON Schema (contract-first). ✅
2. `apps/api` — FastAPI skeleton + heuristics + cache; `/v1/analyze` returning heuristics-only. ✅
3. `apps/extension` — WXT shell + Perplexity/ChatGPT adapters + provisional render + overlay + popup. ✅
4. LLM claim extraction + citation verification; wire `full`-mode network path. ✅
5. Overlay coaching UX + pre-share pause + i18n; privacy toggle + inline DOM highlighting (CSS Custom Highlight API). ✅
6. Anonymous counters → pilot → export evidence. ✅ counters shipped · ⏳ aggregate export is post-pilot.

See §12 of the design doc for the per-feature checklist.

## Quickstart — extension

```bash
pnpm install
pnpm dev:ext        # loads a dev build; open Perplexity or ChatGPT
pnpm build:ext      # production MV3 bundle in apps/extension/.output/chrome-mv3
```

The extension talks to `st-api` at `http://127.0.0.1:8000` by default (change in the popup
later, or via settings). Run the API first for `full` mode; `heuristics_only` mode needs no
backend and never leaves the browser.

## Quickstart — API

```bash
cd apps/api
python -m venv .venv
# Windows PowerShell:  .venv\Scripts\Activate.ps1
# bash:                source .venv/bin/activate
pip install -e ".[dev]"
uvicorn source_trace_api.main:app --reload
```

Then:

```bash
curl -X POST http://127.0.0.1:8000/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"answer":{"text":"The sky is blue. Studies show it is caused by Rayleigh scattering.","links":[]},"context":{"sourceSite":"chatgpt","locale":"en-US","clientVersion":"1.0.0"},"options":{"mode":"heuristics_only","maxClaims":20}}'
```

Run tests:

```bash
cd apps/api && pytest
```
