import ReactDOM from "react-dom/client";
import { adapterFor } from "../../src/adapters";
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

    // Learn the analysis mode so the overlay only offers deep trace in full mode (the
    // action sends text to the backend; privacy mode must stay on-device — I2).
    void send({ kind: "GET_STATE" })
      .then((state) => useOverlay.getState().setMode(state.settings.mode))
      .catch(() => {});

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
        lastText = "";
        void analyze();
        respond({ ok: true });
      }
      return false;
    });

    const analyze = debounce(async () => {
      const nodes = adapter.findAnswerNodes(document);
      if (nodes.length === 0) return; // nothing to analyze yet — stay silent
      // Adapters may match several blocks: sub-items (Perplexity marks each list bullet
      // `.prose` too) AND, in a multi-turn thread, every past answer. Take the LAST node
      // with substantial text — the most recent real answer — which skips short bullets
      // yet still re-analyzes each follow-up (picking the globally-longest node froze
      // analysis on the first, longest answer of the conversation).
      const substantial = nodes.filter((n) => (n.innerText ?? "").length >= MIN_ANSWER_CHARS);
      const node = (substantial.length ? substantial : nodes)[
        (substantial.length ? substantial : nodes).length - 1
      ]!;
      const extraction: Extraction = adapter.extract(node);
      if (extraction.text.length < MIN_ANSWER_CHARS || extraction.text === lastText) return;
      lastText = extraction.text;
      // Grounding context for the deep-trace action (the answer the user is reading).
      useOverlay.getState().setAnswerText(extraction.text);

      // I3: paint provisional (local) immediately, then reconcile with the authoritative report.
      const provisional = localReport(extraction);
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
