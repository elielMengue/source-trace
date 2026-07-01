# st-api container. Build context = repo root:
#   docker build -f infra/docker/api.Dockerfile -t source-trace-api .
FROM python:3.13-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Contract lives outside apps/api — copy the schema so the service can ship with it.
COPY packages/shared/schema /app/packages/shared/schema
COPY apps/api/pyproject.toml /app/apps/api/pyproject.toml
COPY apps/api/src /app/apps/api/src

RUN pip install /app/apps/api

# Non-root runtime.
RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8000
CMD ["uvicorn", "source_trace_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
