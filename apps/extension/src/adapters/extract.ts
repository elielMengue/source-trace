import type { Extraction } from "../lib/types";
import type { AdapterSelectors } from "./types";

/**
 * Shared extraction: read the answer node's text and its cited sources. Two modes:
 *
 *  - Plain (ChatGPT): text is the node's innerText; citations are inline `<a href>` whose
 *    anchor text is real prose, so nothing is stripped.
 *  - Chips (Perplexity): sources are UI chips (`.citation`) whose labels ("dcode +1") are
 *    NOT prose. We walk the DOM, drop each chip's label, and record its POSITION as a
 *    positional citation — the reliable per-claim sourcing signal (a chip sits inside or
 *    just after the sentence it backs). The URL is captured when the chip exposes it;
 *    when it doesn't, the position alone still proves the claim is visibly sourced (I1).
 *
 * Keeping this shared means a DOM quirk is fixed once for all sites.
 */
export function extractFrom(node: HTMLElement, selectors: AdapterSelectors): Extraction {
  if (selectors.citationsAreChips) return extractWithChips(node, selectors);

  const text = normalizeWhitespace(node.innerText ?? node.textContent ?? "");
  const links: Extraction["links"] = [];
  const seen = new Set<string>();
  for (const el of node.querySelectorAll<HTMLAnchorElement>(selectors.citation)) {
    const url = el.href;
    if (!url || seen.has(url) || !/^https?:/i.test(url)) continue;
    seen.add(url);
    links.push({ url, anchorText: normalizeWhitespace(el.innerText ?? "") });
  }
  return { text, links, spans: text ? [{ start: 0, end: text.length }] : [], citations: [] };
}

// A non-whitespace marker standing in for a removed chip. NUL never occurs in web text,
// and it survives whitespace collapsing, so we can recover each chip's position in the
// cleaned text afterwards. Built via fromCharCode to keep the source pure ASCII.
const CHIP = String.fromCharCode(0);
const BLOCK = /^(P|DIV|LI|UL|OL|H[1-6]|BLOCKQUOTE|SECTION|ARTICLE|TABLE|TR|PRE|BR)$/;

function extractWithChips(node: HTMLElement, selectors: AdapterSelectors): Extraction {
  const citeSel = selectors.citation;
  const urls: (string | null)[] = [];
  let raw = "";

  const walk = (parent: Node): void => {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        raw += child.textContent ?? "";
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (el.matches(citeSel)) {
          raw += CHIP; // record position; drop the chip's label (it's UI, not prose)
          urls.push(citationUrl(el, selectors));
          continue;
        }
        const block = BLOCK.test(el.tagName);
        if (block) raw += "\n";
        walk(el);
        if (block) raw += "\n";
      }
    }
  };
  walk(node);

  // Collapse whitespace runs to single spaces (CHIP markers are preserved) and trim.
  raw = raw.replace(/\s+/g, " ").trim();

  // Rebuild the clean text, dropping the markers. A chip's position is recorded just
  // after the preceding word (trailing space excluded) so a chip that trails a sentence
  // ("… démontrée. [chip]") attaches to that sentence, not the next one.
  let text = "";
  const citations: Extraction["citations"] = [];
  let ci = 0;
  for (const ch of raw) {
    if (ch === CHIP) {
      const url = urls[ci++];
      const pos = text.endsWith(" ") ? text.length - 1 : text.length;
      const cite: { pos: number; url?: string } = { pos };
      if (url && /^https?:/i.test(url)) cite.url = url;
      citations.push(cite);
      continue;
    }
    if (ch === " " && text.endsWith(" ")) continue; // avoid doubles where a chip was removed
    text += ch;
  }
  text = text.trimEnd();

  return { text, links: [], spans: text ? [{ start: 0, end: text.length }] : [], citations };
}

/** Resolve a chip's source URL from its configured data attribute, then a nested one,
 * then an inner `<a href>`. Returns null when the link isn't exposed in the DOM. */
function citationUrl(el: HTMLElement, selectors: AdapterSelectors): string | null {
  const attr = selectors.citationUrlAttr;
  if (attr) {
    const own = el.getAttribute(attr);
    if (own) return own;
    const nested = el.querySelector<HTMLElement>(`[${attr}]`)?.getAttribute(attr);
    if (nested) return nested;
  }
  const anchor =
    el instanceof HTMLAnchorElement ? el : el.querySelector<HTMLAnchorElement>("a[href]");
  return anchor?.href ?? null;
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
