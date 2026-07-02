import ReactDOM from "react-dom/client";
import { adapterFor } from "../../src/adapters";
import { localReport } from "../../src/lib/heuristics";
import { send } from "../../src/lib/messaging";
import type { Extraction, TraceReport } from "../../src/lib/types";
import { Overlay } from "../../src/ui/Overlay";
import { useOverlay } from "../../src/ui/store";
import "../../src/ui/overlay.css";

const PRE_SHARE_THRESHOLD = 0.5;
const DEBOUNCE_MS = 800;

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

    const analyze = debounce(async () => {
      const nodes = adapter.findAnswerNodes(document);
      if (nodes.length === 0) return; // nothing to analyze yet — stay silent
      // Adapters may match several blocks (e.g. Perplexity marks each list item as
      // `.prose` too). The real answer is the one with the most text — picking the
      // last DOM node grabbed a 10-char bullet and starved the pipeline.
      const node = nodes.reduce((a, b) =>
        (b.innerText ?? "").length > (a.innerText ?? "").length ? b : a,
      );
      const extraction: Extraction = adapter.extract(node);
      if (extraction.text.length < 40 || extraction.text === lastText) return;
      lastText = extraction.text;

      // I3: paint provisional (local) immediately, then reconcile with the authoritative report.
      useOverlay.getState().setReport(localReport(extraction), true);

      try {
        const report = await send({
          kind: "ANALYZE",
          extraction,
          sourceSite: adapter.id,
        });
        latest = report;
        useOverlay.getState().setReport(report, false);
      } catch {
        // Background already falls back to local; nothing else to do.
      }
    }, DEBOUNCE_MS);

    const observer = new MutationObserver(() => void analyze());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    ctx.onInvalidated(() => observer.disconnect());

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

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let handle: ReturnType<typeof setTimeout> | undefined;
  return ((...args: Parameters<T>) => {
    if (handle) clearTimeout(handle);
    handle = setTimeout(() => fn(...args), ms);
  }) as T;
}
