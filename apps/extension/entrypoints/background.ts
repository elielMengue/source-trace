import { analyze } from "../src/lib/api";
import { localReport } from "../src/lib/heuristics";
import type { Message, MessageResponses } from "../src/lib/messaging";
import { getSettings, setSettings } from "../src/lib/settings";
import { bumpStat, getStats } from "../src/lib/session";
import type { TraceReport } from "../src/lib/types";

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
          // heuristics_only never leaves the browser (ADR-1): no network call at all.
          if (settings.mode === "heuristics_only") return localReport(m.extraction);

          const key = cacheKey(m, settings.locale);
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

function cacheKey(m: Extract<Message, { kind: "ANALYZE" }>, locale: string): string {
  const links = m.extraction.links.map((l) => l.url).join("|");
  return `${locale}::${m.extraction.text}::${links}`;
}
