import type { Extraction } from "../lib/types";
import type { AdapterSelectors } from "./types";

/**
 * Shared extraction: read the answer node's text and its cited sources.
 *
 * A single DOM walk (`walkAnswer`) produces the cleaned claim text plus, for chip sites
 * (Perplexity), positional citations. The walk also records, per emitted character, the
 * DOM text node it came from — the `origins` map — so the overlay can highlight claim
 * spans back on the page without re-deriving positions (see `answerCharMap`).
 *
 *  - Chips (Perplexity): `.citation` chips are UI, not prose — their labels are dropped
 *    and their POSITION is recorded as a citation (the sentence it sits in/after is
 *    sourced). URL captured when the chip exposes it (I1: presence alone marks sourced).
 *  - Plain (ChatGPT): inline `<a href>` anchors are real prose (kept in text) and are
 *    collected as links.
 */
export function extractFrom(node: HTMLElement, selectors: AdapterSelectors): Extraction {
  const { text, citations } = walkAnswer(node, selectors);
  const spans = text ? [{ start: 0, end: text.length }] : [];
  if (selectors.citationsAreChips) return { text, links: [], spans, citations };
  return { text, links: collectLinks(node, selectors.citation), spans, citations: [] };
}

/** Where a cleaned-text character came from in the live DOM. Null for synthetic chars
 * (whitespace inserted at block boundaries), which are never span endpoints worth mapping. */
export interface CharOrigin {
  node: Text;
  offset: number;
}

/** Re-walk the answer node and return the cleaned text with a per-character DOM map.
 * Used by the highlighter to turn claim spans into live DOM Ranges. */
export function answerCharMap(
  node: HTMLElement,
  selectors: AdapterSelectors,
): { text: string; origins: (CharOrigin | null)[] } {
  const { text, origins } = walkAnswer(node, selectors);
  return { text, origins };
}

const BLOCK = /^(P|DIV|LI|UL|OL|H[1-6]|BLOCKQUOTE|SECTION|ARTICLE|TABLE|TR|PRE|BR)$/;

interface WalkResult {
  text: string;
  citations: Extraction["citations"];
  origins: (CharOrigin | null)[];
}

/** The one place DOM → claim-text rules live, so extraction and highlighting never drift.
 * Emits chars with whitespace collapsed and block boundaries turned into single spaces. */
function walkAnswer(node: HTMLElement, selectors: AdapterSelectors): WalkResult {
  const chips = !!selectors.citationsAreChips;
  const citeSel = selectors.citation;
  const chars: string[] = [];
  const origins: (CharOrigin | null)[] = [];
  const citations: Extraction["citations"] = [];
  const lastIsSpace = () => chars.length > 0 && chars[chars.length - 1] === " ";

  const push = (ch: string, origin: CharOrigin | null) => {
    if (/\s/.test(ch)) {
      if (chars.length === 0 || lastIsSpace()) return; // collapse runs; never lead
      chars.push(" ");
      origins.push(origin);
    } else {
      chars.push(ch);
      origins.push(origin);
    }
  };

  const walk = (parent: Node) => {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child as Text;
        const s = t.textContent ?? "";
        for (let i = 0; i < s.length; i++) push(s[i]!, { node: t, offset: i });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (chips && el.matches(citeSel)) {
          // Record position (trailing space excluded so a chip trailing a sentence
          // attaches to that sentence), drop the label, don't descend.
          const pos = lastIsSpace() ? chars.length - 1 : chars.length;
          const url = citationUrl(el, selectors);
          const cite: { pos: number; url?: string } = { pos };
          if (url && /^https?:/i.test(url)) cite.url = url;
          citations.push(cite);
          continue;
        }
        const block = BLOCK.test(el.tagName);
        if (block) push(" ", null);
        walk(el);
        if (block) push(" ", null);
      }
    }
  };
  walk(node);

  while (chars.length && chars[chars.length - 1] === " ") {
    chars.pop();
    origins.pop();
  }
  return { text: chars.join(""), citations, origins };
}

function collectLinks(node: HTMLElement, citationSel: string): Extraction["links"] {
  const links: Extraction["links"] = [];
  const seen = new Set<string>();
  for (const el of node.querySelectorAll<HTMLAnchorElement>(citationSel)) {
    const url = el.href;
    if (!url || seen.has(url) || !/^https?:/i.test(url)) continue;
    seen.add(url);
    links.push({ url, anchorText: normalizeWhitespace(el.innerText ?? el.textContent ?? "") });
  }
  return links;
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
