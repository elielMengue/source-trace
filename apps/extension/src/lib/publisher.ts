/**
 * Descriptive publisher category — answers "who publishes this?", never "is it reliable?".
 * This is the architectural encoding of I1 for source hints: we surface the KIND of
 * publisher (transparent, checkable) and let the user judge. No trust/quality score.
 *
 * Lists are intentionally small and embedded; this is exactly the kind of data ADR-4
 * would later hot-swap as remote config.
 */
export interface PublisherHint {
  /** Compact chip label. */
  short: string;
  /** Fuller description for tooltips / the verification note. */
  long: string;
}

const KNOWN: Record<string, PublisherHint> = {
  "wikipedia.org": { short: "wiki", long: "encyclopedia" },
  "britannica.com": { short: "wiki", long: "encyclopedia" },
  "reddit.com": { short: "forum", long: "community forum" },
  "quora.com": { short: "forum", long: "community forum" },
  "stackexchange.com": { short: "forum", long: "community Q&A" },
  "stackoverflow.com": { short: "forum", long: "community Q&A" },
  "youtube.com": { short: "video", long: "video platform" },
  "youtu.be": { short: "video", long: "video platform" },
  "vimeo.com": { short: "video", long: "video platform" },
  "medium.com": { short: "blog", long: "blog platform" },
  "substack.com": { short: "blog", long: "blog platform" },
  "github.com": { short: "code", long: "code repository" },
  "arxiv.org": { short: "academic", long: "academic preprints" },
  "doi.org": { short: "academic", long: "academic (DOI)" },
  "researchgate.net": { short: "academic", long: "academic network" },
};

const NEWS = new Set([
  "nytimes.com", "washingtonpost.com", "theguardian.com", "bbc.com", "bbc.co.uk",
  "reuters.com", "apnews.com", "cnn.com", "npr.org", "aljazeera.com",
  "lemonde.fr", "lefigaro.fr", "liberation.fr", "france24.com", "lesechos.fr",
  "francetvinfo.fr", "nouvelobs.com", "20minutes.fr",
]);

/** Categorize a source's registrable domain. Returns null when we can't say honestly. */
export function publisherHint(domain: string): PublisherHint | null {
  const d = domain.toLowerCase().replace(/^www\./, "");

  // Walk registrable suffixes so subdomains resolve (en.wikipedia.org -> wikipedia.org).
  const parts = d.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const base = parts.slice(i).join(".");
    if (KNOWN[base]) return KNOWN[base];
    if (NEWS.has(base)) return { short: "news", long: "news outlet" };
  }

  if (d.endsWith(".gov") || /\.gov\.[a-z]{2}$/.test(d) || d.endsWith(".gouv.fr")) {
    return { short: "gov", long: "government" };
  }
  if (d.endsWith(".edu") || /\.edu\.[a-z]{2}$/.test(d) || /\.ac\.[a-z]{2}$/.test(d)) {
    return { short: "edu", long: "academic institution" };
  }
  return null;
}
