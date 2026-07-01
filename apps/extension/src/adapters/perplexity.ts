import { extractFrom } from "./extract";
import type { SiteAdapter } from "./types";

/**
 * Perplexity already cites sources, so it exercises the "supported" path and the
 * citation-matching flow (§4.1). Selectors are best-effort and intentionally data —
 * when the DOM shifts, this is a one-line config change, not a code rewrite.
 */
export const perplexityAdapter: SiteAdapter = {
  id: "perplexity",
  selectors: {
    // Answer prose blocks. Perplexity renders answers as prose containers.
    answer: "[class*='prose'], .prose",
    // Numbered citation anchors within an answer.
    citation: "a[href^='http']",
  },
  matches(url) {
    return /^https?:\/\/(www\.)?perplexity\.ai\//i.test(url);
  },
  findAnswerNodes(root) {
    return Array.from(root.querySelectorAll<HTMLElement>(this.selectors.answer));
  },
  extract(node) {
    return extractFrom(node, this.selectors);
  },
};
