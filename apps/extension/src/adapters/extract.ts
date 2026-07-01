import type { Extraction } from "../lib/types";
import type { AdapterSelectors } from "./types";

/**
 * Shared extraction used by every adapter: read the answer node's text and its cited
 * links. Spans currently cover the whole answer as one block; per-claim spans are
 * computed server-side (claims come back with their own spans). Keeping this shared
 * means a DOM quirk is fixed once for all sites.
 */
export function extractFrom(node: HTMLElement, selectors: AdapterSelectors): Extraction {
  const text = normalizeWhitespace(node.innerText ?? node.textContent ?? "");

  const links: Extraction["links"] = [];
  const seen = new Set<string>();
  for (const el of node.querySelectorAll<HTMLAnchorElement>(selectors.citation)) {
    const url = el.href;
    if (!url || seen.has(url) || !/^https?:/i.test(url)) continue;
    seen.add(url);
    links.push({ url, anchorText: normalizeWhitespace(el.innerText ?? "") });
  }

  return { text, links, spans: text ? [{ start: 0, end: text.length }] : [] };
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
