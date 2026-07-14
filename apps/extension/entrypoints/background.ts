import { analyze, deepTrace } from "../src/lib/api";
import { localReport } from "../src/lib/heuristics";
import type { Message, MessageResponses } from "../src/lib/messaging";
import { fullModeActive, getSettings, setSettings } from "../src/lib/settings";
import { bumpStat, getStats } from "../src/lib/session";
import type { DeepTraceResult, TraceReport } from "../src/lib/types";

/** The client falls back to its instant reverse-search link when deep trace is
 * unavailable (privacy mode, no key, or a backend error) — never an error to the UI. */
const DEEP_TRACE_UNAVAILABLE: DeepTraceResult = {
  traceId: "",
  available: false,
  summary: "",
  sources: [],
  disclaimer: "",
};

/**
 * Orchestrator (§4.2). Owns the messaging bus, the st-api call, and anonymous counters.
 * Ephemeral by design (MV3) — an in-memory cache is a best-effort speedup, not state.
 */
export default defineBackground(() => {
  const clientVersion = chrome.runtime.getManifest().version;
  const cache = new Map<string, TraceReport>(); // key: text+links+locale+mode (best-effort)

  chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
    handle(msg)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: String(err) }));
    return true; // async response
  });

  async function handle(msg: Message): Promise<MessageResponses[Message["kind"]]> {
    switch (msg.kind) {
      case "ANALYZE": {
        const settings = await getSettings();
        const report = await runAnalysis(msg);
        await bumpStat("claims_seen", report.claims.length);
        return report;

        async function runAnalysis(m: Extract<Message, { kind: "ANALYZE" }>): Promise<TraceReport> {
          // No network before consent (by construction, not just UI): stay on-device unless
          // the user has explicitly chosen Full mode. heuristics_only never leaves the
          // browser either (ADR-1). Either way -> no network call at all.
          if (!fullModeActive(settings)) return localReport(m.extraction);

          const key = await cacheKey(m, settings.locale);
          const hit = cache.get(key);
          if (hit) return { ...hit, engine: { ...hit.engine, cached: true } };

          try {
            const report = await analyze(
              settings.apiBaseUrl,
              m.extraction,
              { sourceSite: m.sourceSite, locale: settings.locale, mode: "full" },
              clientVersion,
            );
            cache.set(key, report);
            return report;
          } catch {
            // Graceful degradation (I3): a failed backend never blocks reading.
            return localReport(m.extraction);
          }
        }
      }
      case "DEEP_TRACE": {
        const settings = await getSettings();
        // No network before consent, and never in privacy mode (I2) — keep the local link.
        if (!fullModeActive(settings)) return DEEP_TRACE_UNAVAILABLE;
        try {
          const result = await deepTrace(
            settings.apiBaseUrl,
            msg.claim,
            msg.context,
            settings.locale,
          );
          if (result.available) await bumpStat("traces_initiated");
          return result;
        } catch {
          // Graceful degradation (I3): a failed backend falls back to the instant link.
          return DEEP_TRACE_UNAVAILABLE;
        }
      }
      case "EVENT":
        await bumpStat(msg.name);
        return { ok: true };
      case "GET_STATE":
        return { settings: await getSettings(), stats: await getStats() };
      case "SET_SETTINGS":
        return setSettings(msg.patch);
    }
  }
});

/** SHA-256 of the content+params — never store answer text as a key, even in the
 * ephemeral in-memory worker cache (consistent with the API's "hashes only" principle). */
async function cacheKey(m: Extract<Message, { kind: "ANALYZE" }>, locale: string): Promise<string> {
  const links = m.extraction.links.map((l) => l.url).join("|");
  const citations = m.extraction.citations.map((c) => `${c.pos}:${c.url ?? ""}`).join("|");
  const payload = `${locale}::${m.extraction.text}::${links}::${citations}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
