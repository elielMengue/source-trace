import type { AnalyzeContext, DeepTraceResult, Extraction, TraceReport } from "./types";

/** Calls st-api POST /v1/analyze. Throws on network/HTTP error so callers can fall back. */
export async function analyze(
  apiBaseUrl: string,
  extraction: Extraction,
  ctx: AnalyzeContext,
  clientVersion: string,
  maxClaims = 20,
  signal?: AbortSignal,
): Promise<TraceReport> {
  const res = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/v1/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      answer: {
        text: extraction.text,
        links: extraction.links,
        citations: extraction.citations,
      },
      context: { sourceSite: ctx.sourceSite, locale: ctx.locale, clientVersion },
      options: { mode: ctx.mode, maxClaims },
    }),
    signal,
  });
  if (!res.ok) throw new Error(`st-api ${res.status}`);
  return (await res.json()) as TraceReport;
}

/** Calls st-api POST /v1/trace for one flagged claim (deep-trace action). Throws on
 * network/HTTP error so the caller can fall back to the instant reverse-search link. */
export async function deepTrace(
  apiBaseUrl: string,
  claim: string,
  context: string,
  locale: string,
  signal?: AbortSignal,
): Promise<DeepTraceResult> {
  const res = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/v1/trace`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ claim, context, locale }),
    signal,
  });
  if (!res.ok) throw new Error(`st-api ${res.status}`);
  return (await res.json()) as DeepTraceResult;
}
