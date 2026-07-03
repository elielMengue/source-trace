import type { Extraction, SourceSite } from "../lib/types";

/**
 * The most fragile surface: AI sites change their DOM often. We isolate that
 * fragility behind this interface so a broken selector breaks one site, never the
 * whole extension (§4.1). Selectors are data (config), so a fix is a config push.
 */
export interface SiteAdapter {
  id: SourceSite;
  /** Selectors kept as data so they can later be hot-swapped via remote config (ADR-4). */
  selectors: AdapterSelectors;
  matches(url: string): boolean;
  findAnswerNodes(root: ParentNode): HTMLElement[];
  extract(node: HTMLElement): Extraction;
}

export interface AdapterSelectors {
  /** Elements that contain a rendered AI answer. */
  answer: string;
  /** Cited-source elements, scoped within an answer node. May be an anchor itself
   * (ChatGPT) or a wrapper containing one (Perplexity's `.citation` chip). */
  citation: string;
  /** When true, citation elements are UI chips (e.g. Perplexity's "tangente-mag +1")
   * whose labels are not prose and must be stripped from the extracted claim text; the
   * chip's position becomes a positional citation into the claim text. */
  citationsAreChips?: boolean;
  /** Attribute on a citation chip (or a descendant) holding its source URL, e.g.
   * Perplexity's `data-pplx-citation-url`. Falls back to an inner `<a href>`. */
  citationUrlAttr?: string;
}
