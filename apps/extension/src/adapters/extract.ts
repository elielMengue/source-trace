import type { Extraction } from "../lib/types";
import type { AdapterSelectors } from "./types";

/**
 * Shared extraction used by every adapter: read the answer node's text and its cited
 * links. Spans currently cover the whole answer as one block; per-claim spans are
 * computed server-side (claims come back with their own spans). Keeping this shared
 * means a DOM quirk is fixed once for all sites.
 */
export function extractFrom(node: HTMLElement, selectors: AdapterSelectors): Extraction {
  const links: Extraction["links"] = [];
  const seen = new Set<string>();
  const chipLabels: string[] = [];

  for (const el of node.querySelectorAll<HTMLElement>(selectors.citation)) {
    if (selectors.citationsAreChips) {
      const label = normalizeWhitespace(el.innerText ?? el.textContent ?? "");
      if (label) chipLabels.push(label);
    }
    // The citation may be the anchor itself (ChatGPT) or wrap one (Perplexity chip).
    const anchor =
      el instanceof HTMLAnchorElement ? el : el.querySelector<HTMLAnchorElement>("a[href]");
    const url = anchor?.href;
    if (!url || seen.has(url) || !/^https?:/i.test(url)) continue;
    seen.add(url);
    links.push({ url, anchorText: normalizeWhitespace(anchor?.innerText ?? el.innerText ?? "") });
  }

  let text = normalizeWhitespace(node.innerText ?? node.textContent ?? "");
  // Chip labels ("tangente-mag +1") render inline but are UI, not prose — strip them
  // so they don't leak into claim text. Literal (non-regex) subtraction.
  for (const label of chipLabels) {
    text = text.split(label).join(" ");
  }
  text = normalizeWhitespace(text);

  return { text, links, spans: text ? [{ start: 0, end: text.length }] : [] };
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
