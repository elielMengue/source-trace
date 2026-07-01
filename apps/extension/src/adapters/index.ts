import { chatgptAdapter } from "./chatgpt";
import { perplexityAdapter } from "./perplexity";
import type { SiteAdapter } from "./types";

export type { SiteAdapter } from "./types";

const ADAPTERS: SiteAdapter[] = [perplexityAdapter, chatgptAdapter];

/** Resolve the adapter for a URL, or null if this isn't a supported site. */
export function adapterFor(url: string): SiteAdapter | null {
  return ADAPTERS.find((a) => a.matches(url)) ?? null;
}
