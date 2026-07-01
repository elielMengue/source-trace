import type { AnalyzeContext, Extraction, TraceReport } from "./types";

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
      answer: { text: extraction.text, links: extraction.links },
      context: { sourceSite: ctx.sourceSite, locale: ctx.locale, clientVersion },
      options: { mode: ctx.mode, maxClaims },
    }),
    signal,
  });
  if (!res.ok) throw new Error(`st-api ${res.status}`);
  return (await res.json()) as TraceReport;
}
