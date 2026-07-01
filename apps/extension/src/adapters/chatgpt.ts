import { extractFrom } from "./extract";
import type { SiteAdapter } from "./types";

/**
 * ChatGPT usually does NOT cite, so it exercises the "trace this" path — the deliberate
 * contrast with Perplexity that demos the product's point (§4.1).
 */
export const chatgptAdapter: SiteAdapter = {
  id: "chatgpt",
  selectors: {
    // Assistant turns are marked with a data attribute.
    answer: "[data-message-author-role='assistant'] .markdown, [data-message-author-role='assistant']",
    citation: "a[href^='http']",
  },
  matches(url) {
    return /^https?:\/\/(chatgpt\.com|chat\.openai\.com)\//i.test(url);
  },
  findAnswerNodes(root) {
    return Array.from(root.querySelectorAll<HTMLElement>(this.selectors.answer));
  },
  extract(node) {
    return extractFrom(node, this.selectors);
  },
};
