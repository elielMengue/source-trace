import type { ClaimStatus, TraceFlag } from "../lib/types";

export const STATUS_LABEL: Record<ClaimStatus, string> = {
  supported: "Has a visible source",
  weak: "Weak / unverified source",
  unsupported: "No visible source",
};

export const FLAG_LABEL: Record<TraceFlag, string> = {
  no_visible_sources: "No sources cited",
  single_source: "Relies on a single source",
  dead_link: "A cited link is dead",
  low_citation_density: "Few claims are sourced",
};

/** A trace action: reverse-search the claim phrase for a primary source. */
export function reverseSearchUrl(claimText: string): string {
  const q = claimText.length > 120 ? claimText.slice(0, 120) : claimText;
  return `https://www.google.com/search?q=${encodeURIComponent(`"${q}"`)}`;
}

/** "Find a second source" — same phrase, encourage a different origin. */
export function secondSourceUrl(claimText: string): string {
  const q = claimText.length > 120 ? claimText.slice(0, 120) : claimText;
  return `https://www.google.com/search?q=${encodeURIComponent(`${q} -site:wikipedia.org`)}`;
}
