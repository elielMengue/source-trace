import type { Claim, ClaimStatus, Extraction, ProvisionalReport, Source, TraceFlag } from "./types";

/**
 * Instant, on-device heuristics that paint a provisional report in <150ms (I3).
 * A cheap mirror of the backend's deterministic path — never a truth judgment (I1).
 * The background worker replaces this with the authoritative report when it arrives,
 * only ever *upgrading* confidence (ADR-2), never flip-flopping.
 */

const SENTENCE_SPLIT = /[^.!?。！？…]+[.!?。！？…]+|[^.!?。！？…]+$/gu;

function splitSentences(text: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(SENTENCE_SPLIT)) {
    const raw = m[0];
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const start = (m.index ?? 0) + lead;
    out.push({ text: trimmed, start, end: start + trimmed.length });
  }
  return out;
}

function isClaimLike(s: string): boolean {
  if (s.trim().length < 15) return false;
  if (/[?？]\s*$/.test(s)) return false;
  return (s.match(/\p{L}+/gu)?.length ?? 0) >= 4;
}

function tokens(s: string): Set<string> {
  const set = new Set<string>();
  for (const m of s.toLowerCase().matchAll(/\p{L}+/gu)) if (m[0].length > 2) set.add(m[0]);
  return set;
}

function matchLinks(claim: string, links: Extraction["links"]): number[] {
  const ct = tokens(claim);
  if (ct.size === 0) return [];
  const matched: number[] = [];
  links.forEach((link, i) => {
    let overlap = 0;
    for (const t of tokens(link.anchorText)) if (ct.has(t)) overlap++;
    if (overlap >= 2) matched.push(i);
  });
  return matched;
}

export function localReport(extraction: Extraction, maxClaims = 20): ProvisionalReport {
  const { text, links } = extraction;
  const sentences = splitSentences(text).filter((s) => isClaimLike(s.text)).slice(0, maxClaims);

  const sources: Source[] = links.map((l, i) => ({
    index: i,
    url: l.url,
    status: "unknown",
    relevance: "unknown",
    domain: safeDomain(l.url),
  }));

  const claims: Claim[] = sentences.map((s, i) => {
    const matched = matchLinks(s.text, links);
    const status: ClaimStatus = matched.length ? "weak" : "unsupported";
    return {
      id: `p${i + 1}`,
      text: s.text,
      status,
      matchedSourceIndexes: matched,
      reason: matched.length ? "A source is cited (unverified locally)." : "No citation found yet.",
      traceTip: matched.length ? "Open the cited source and confirm it." : "Look for a primary source for this.",
      span: { start: s.start, end: s.end },
    };
  });

  const supported = claims.filter((c) => c.matchedSourceIndexes.length).length;
  const score = claims.length === 0 ? 1 : Math.round((supported / claims.length) * 1000) / 1000;

  const flags: TraceFlag[] = [];
  if (links.length === 0) flags.push("no_visible_sources");
  const domains = new Set(sources.map((s) => s.domain).filter(Boolean));
  if (links.length > 0 && domains.size === 1) flags.push("single_source");
  if (claims.length > 0 && supported / claims.length < 0.5) flags.push("low_citation_density");

  return {
    provisional: true,
    traceReportId: "sha256:" + "0".repeat(64),
    traceScore: score,
    generatedAt: new Date().toISOString(),
    engine: { heuristics: "local", llm: null, cached: false },
    flags,
    claims,
    sources,
  };
}

function safeDomain(url: string): string {
  try {
    const h = new URL(url).hostname;
    return h.startsWith("www.") ? h.slice(4) : h;
  } catch {
    return "";
  }
}
