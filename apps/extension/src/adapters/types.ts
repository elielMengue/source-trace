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
  /** Anchor elements to treat as cited links, scoped within an answer node. */
  citation: string;
}
