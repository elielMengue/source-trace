import { answerCharMap, type CharOrigin } from "../adapters/extract";
import type { AdapterSelectors } from "../adapters/types";
import type { Claim, ClaimStatus } from "../lib/types";

/**
 * Inline highlighting of claim spans on the page, colored by sourcing status (§4.1).
 *
 * Uses the CSS Custom Highlight API: we register `Range`s, never wrap or mutate the
 * page's nodes — so we don't break the site's React tree and don't feed our own
 * MutationObserver. Ranges are rebuilt each analyze cycle from a fresh DOM walk, so
 * they stay valid as answers stream/re-render. Degrades silently where unsupported.
 */

const STYLE_ID = "source-trace-highlight-style";
const NAMES: Record<ClaimStatus, string> = {
  supported: "st-claim-supported",
  weak: "st-claim-weak",
  unsupported: "st-claim-unsupported",
};

// Accessed without relying on a specific TS lib version for the Highlight API types.
interface HighlightRegistryLike {
  set(name: string, highlight: unknown): unknown;
  delete(name: string): unknown;
}
const HighlightCtor = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown })
  .Highlight;
const registry = (CSS as unknown as { highlights?: HighlightRegistryLike }).highlights;
// CSS.highlights is a "maplike" HighlightRegistry, NOT a real Map — detect by its methods,
// not `instanceof Map` (which is false in Chrome and silently disabled all highlighting).
const isSupported =
  typeof HighlightCtor === "function" && !!registry && typeof registry.set === "function";

/** A claim span resolved to a live DOM Range plus its status. Split out from registration
 * so the mapping logic is unit-testable without the (browser-only) Highlight API. */
export function buildClaimRanges(
  node: HTMLElement,
  selectors: AdapterSelectors,
  claims: Claim[],
): { status: ClaimStatus; range: Range }[] {
  const { text, origins } = answerCharMap(node, selectors);
  const out: { status: ClaimStatus; range: Range }[] = [];
  for (const claim of claims) {
    const { start, end } = claim.span;
    if (start < 0 || end > text.length || start >= end) continue;
    // Guard against DOM drift since the report was computed: only highlight an exact match.
    if (text.slice(start, end) !== claim.text) continue;
    const startO = scan(origins, start, end, 1);
    const endO = scan(origins, start, end, -1);
    if (!startO || !endO) continue;
    try {
      const range = document.createRange();
      range.setStart(startO.node, startO.offset);
      range.setEnd(endO.node, endO.offset + 1);
      out.push({ status: claim.status, range });
    } catch {
      // A boundary node was detached between the walk and now — skip this claim.
    }
  }
  return out;
}

export function applyHighlights(
  node: HTMLElement,
  selectors: AdapterSelectors,
  claims: Claim[],
): void {
  if (!isSupported) return;
  ensureStyle();
  const buckets: Record<ClaimStatus, Range[]> = { supported: [], weak: [], unsupported: [] };
  for (const { status, range } of buildClaimRanges(node, selectors, claims)) {
    buckets[status].push(range);
  }
  for (const status of Object.keys(buckets) as ClaimStatus[]) {
    const ranges = buckets[status];
    if (ranges.length) registry!.set(NAMES[status], new HighlightCtor!(...ranges));
    else registry!.delete(NAMES[status]);
  }
}

export function clearHighlights(): void {
  if (!isSupported) return;
  for (const name of Object.values(NAMES)) registry!.delete(name);
}

/** First (dir=1) or last (dir=-1) non-synthetic origin within [from, to). */
function scan(
  origins: (CharOrigin | null)[],
  from: number,
  to: number,
  dir: 1 | -1,
): CharOrigin | null {
  const step = dir === 1 ? 1 : -1;
  const first = dir === 1 ? from : to - 1;
  for (let i = first; i >= from && i < to; i += step) {
    const o = origins[i];
    if (o) return o;
  }
  return null;
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  // Highlights live on page text nodes, so the style must be in the page document
  // (not the overlay's shadow root).
  // Soft background tints only — no wavy underline. A red "error" underline would read
  // as "this is wrong", but Source-Trace only reports MISSING sourcing, never truth (I1).
  style.textContent = [
    "::highlight(st-claim-supported){background-color:rgba(22,163,74,0.20);}",
    "::highlight(st-claim-weak){background-color:rgba(217,119,6,0.22);}",
    "::highlight(st-claim-unsupported){background-color:rgba(220,38,38,0.16);}",
  ].join("");
  (document.head ?? document.documentElement).appendChild(style);
}
