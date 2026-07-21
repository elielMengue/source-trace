import ReactDOM from "react-dom/client";
import { adapterFor } from "../../src/adapters";
import { pickAnswerNode } from "../../src/adapters/pick";
import { localReport } from "../../src/lib/heuristics";
import { send } from "../../src/lib/messaging";
import type { Extraction, TraceReport } from "../../src/lib/types";
import type { PageMessage } from "../../src/lib/messaging";
import { applyHighlights, clearHighlights } from "../../src/ui/highlight";
import { Overlay } from "../../src/ui/Overlay";
import { useOverlay } from "../../src/ui/store";
import "../../src/ui/overlay.css";

const PRE_SHARE_THRESHOLD = 0.5;
const DEBOUNCE_MS = 800;
const MIN_ANSWER_CHARS = 40; // below this a block is a fragment (bullet, label), not an answer

export default defineContentScript({
  matches: [
    "*://*.perplexity.ai/*",
    "*://perplexity.ai/*",
    "*://chatgpt.com/*",
    "*://chat.openai.com/*",
  ],
  cssInjectionMode: "ui",

  async main(ctx) {
    const adapter = adapterFor(location.href);
    // Graceful degradation (§4.1): unknown site or no adapter -> stay silent.
    if (!adapter) return;

    const store = useOverlay.getState();
    store.setSourceSite(adapter.id);
    void send({ kind: "EVENT", name: "sessions" });
    void loadBrandFonts();

    // Learn the mode / consent / locale so the overlay can gate deep trace, show the
    // first-run consent banner, and localize its UI strings.
    const syncSettings = async () => {
      try {
        const state = await send({ kind: "GET_STATE" });
        const s = useOverlay.getState();
        s.setMode(state.settings.mode);
        s.setModeChosen(state.settings.modeChosen);
        s.setLocale(state.settings.locale);
      } catch {
        // background unreachable — keep defaults
      }
    };
    void syncSettings();

    const ui = await createShadowRootUi(ctx, {
      name: "source-trace-ui",
      position: "inline",
      anchor: "body",
      onMount(container) {
        const root = ReactDOM.createRoot(container);
        root.render(<Overlay />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();

    let lastText = "";
    let latest: TraceReport | null = null;
    let current: TraceReport | null = null; // best report so far (provisional or authoritative)

    // The popup asks the active tab for its current trace summary, or tells it to
    // re-analyze (e.g. the language changed) — resetting lastText so the unchanged answer
    // text still re-runs, picking up the new locale for coaching tips.
    chrome.runtime.onMessage.addListener((msg: PageMessage, _sender, respond) => {
      if (msg?.kind === "GET_PAGE_REPORT") respond(current);
      else if (msg?.kind === "RE_ANALYZE") {
        // Refresh mode/locale first (e.g. language or mode changed), then re-run so both
        // the localized UI strings and the report reflect the new settings.
        lastText = "";
        void syncSettings().then(() => analyze());
        respond({ ok: true });
      }
      return false;
    });

    const analyze = debounce(async () => {
      const node = pickAnswerNode(adapter.findAnswerNodes(document), MIN_ANSWER_CHARS);
      if (!node) return; // nothing substantial to analyze yet — stay silent
      const extraction: Extraction = adapter.extract(node);
      if (extraction.text.length < MIN_ANSWER_CHARS || extraction.text === lastText) return;
      lastText = extraction.text;
      // Grounding context for the deep-trace action (the answer the user is reading).
      useOverlay.getState().setAnswerText(extraction.text);

      // I3: paint provisional (local) immediately, then reconcile with the authoritative report.
      const provisional = localReport(extraction, useOverlay.getState().locale);
      current = provisional;
      useOverlay.getState().setReport(provisional, true);
      applyHighlights(node, adapter.selectors, provisional.claims);

      try {
        const report = await send({
          kind: "ANALYZE",
          extraction,
          sourceSite: adapter.id,
        });
        latest = report;
        current = report;
        useOverlay.getState().setReport(report, false);
        applyHighlights(node, adapter.selectors, report.claims);
      } catch {
        // Background already falls back to local; nothing else to do.
      }
    }, DEBOUNCE_MS);

    const observer = new MutationObserver(() => void analyze());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    ctx.onInvalidated(() => observer.disconnect());
    ctx.onInvalidated(() => clearHighlights());

    // The overlay's consent banner / mode toggle change settings, then dispatch this event
    // so the already-rendered answer is re-analyzed immediately (same isolated world as the
    // UI). Re-sync settings first so the store's mode/locale drive the fresh render.
    const reanalyze = () => {
      lastText = "";
      void syncSettings().then(() => analyze());
    };
    window.addEventListener("st:reanalyze", reanalyze);
    ctx.onInvalidated(() => window.removeEventListener("st:reanalyze", reanalyze));

    // Pre-share pause (§4.3): soft, dismissible — never blocks the copy.
    const onCopy = () => {
      if (latest && latest.traceScore < PRE_SHARE_THRESHOLD && latest.claims.length > 0) {
        useOverlay.getState().setPause(true);
        void send({ kind: "EVENT", name: "shares_paused" });
      }
    };
    document.addEventListener("copy", onCopy, true);
    ctx.onInvalidated(() => document.removeEventListener("copy", onCopy, true));

    void analyze();
  },
});

/** Load the self-hosted brand fonts into the page document so the shadow-root overlay
 * can use them. No external CDN; degrades to system fonts if the page CSP blocks it. */
async function loadBrandFonts(): Promise<void> {
  if (!("fonts" in document)) return;

  // Brand fonts are used on every overlay -> load eagerly.
  const brand: [string, string, string][] = [
    ["IBM Plex Sans", "/fonts/ibm-plex-sans.woff2", "400 600"],
    ["Space Grotesk", "/fonts/space-grotesk.woff2", "500 700"],
  ];
  await Promise.all(
    brand.map(async ([family, path, weight]) => {
      try {
        const face = new FontFace(family, `url(${chrome.runtime.getURL(path)})`, {
          weight,
          display: "swap",
        });
        document.fonts.add(await face.load());
      } catch {
        // Page CSP may block the fetch — the overlay falls back to system fonts.
      }
    }),
  );

  // i18n script-coverage fallbacks — registered but NOT loaded, so the browser fetches
  // them only if a matching glyph (e.g. Hebrew) actually renders. unicode-range keeps
  // Latin (en/fr/es) on the brand fonts, so these cost nothing in the common case.
  const fallbacks: [string, string, FontFaceDescriptors][] = [
    [
      "Noto Sans Hebrew",
      "/fonts/noto-sans-hebrew.woff2",
      { unicodeRange: "U+0590-05FF, U+FB1D-FB4F, U+200E-200F" },
    ],
    ["Noto Serif", "/fonts/noto-serif.woff2", {}],
  ];
  for (const [family, path, desc] of fallbacks) {
    try {
      document.fonts.add(
        new FontFace(family, `url(${chrome.runtime.getURL(path)})`, {
          display: "swap",
          ...desc,
        }),
      );
    } catch {
      // ignore — the fallback simply won't be available on this page
    }
  }
}

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let handle: ReturnType<typeof setTimeout> | undefined;
  return ((...args: Parameters<T>) => {
    if (handle) clearTimeout(handle);
    handle = setTimeout(() => fn(...args), ms);
  }) as T;
}
