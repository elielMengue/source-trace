import { t } from "./i18n";
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

const STATUS_WEIGHT: Record<ClaimStatus, number> = { supported: 1, weak: 0.5, unsupported: 0 };

export function localReport(extraction: Extraction, locale = "en", maxClaims = 20): ProvisionalReport {
  const tr = t(locale);
  const { text, links, citations } = extraction;
  const sentences = splitSentences(text).filter((s) => isClaimLike(s.text)).slice(0, maxClaims);

  // Unified sources: cited links first, then positional-citation URLs (deduped by URL),
  // mirroring the backend so source indexes line up between provisional and authoritative.
  const urlToIndex = new Map<string, number>();
  const unified: Extraction["links"] = [];
  const addUrl = (url: string, anchorText: string) => {
    if (!urlToIndex.has(url)) {
      urlToIndex.set(url, unified.length);
      unified.push({ url, anchorText });
    }
  };
  for (const l of links) addUrl(l.url, l.anchorText);
  for (const c of citations) if (c.url) addUrl(c.url, "");

  const sources: Source[] = unified.map((l, i) => ({
    index: i,
    url: l.url,
    status: "unknown",
    relevance: "unknown",
    domain: safeDomain(l.url),
  }));

  // Attach each positional citation to the claim it sits in or trails (nearest claim
  // whose start is at or before the chip) — same rule as the backend.
  const assigned = sentences.map(() => ({ idx: new Set<number>(), has: false }));
  for (const c of citations) {
    let target = -1;
    for (let i = 0; i < sentences.length; i++) {
      const start = sentences[i]!.start;
      if (start <= c.pos && (target === -1 || start > sentences[target]!.start)) target = i;
    }
    if (target === -1) continue;
    assigned[target]!.has = true;
    if (c.url) {
      const idx = urlToIndex.get(c.url);
      if (idx !== undefined) assigned[target]!.idx.add(idx);
    }
  }

  const claims: Claim[] = sentences.map((s, i) => {
    const matched = Array.from(
      new Set([...matchLinks(s.text, unified), ...assigned[i]!.idx]),
    ).sort((a, b) => a - b);
    const hasChip = assigned[i]!.has;
    // Local liveness is always unknown, so a sourced claim is at best "weak" (I3): the
    // background's authoritative report can only upgrade it to "supported" (ADR-2).
    const status: ClaimStatus = matched.length || hasChip ? "weak" : "unsupported";
    return {
      id: `p${i + 1}`,
      text: s.text,
      status,
      matchedSourceIndexes: matched,
      reason: matched.length
        ? "A source is cited (unverified locally)."
        : hasChip
          ? "A source is cited here; its link isn't exposed on the page."
          : "No citation found yet.",
      traceTip: matched.length || hasChip ? tr.tipOpenSource : tr.tipFindPrimary,
      span: { start: s.start, end: s.end },
    };
  });

  const sourced = claims.filter((c) => c.status !== "unsupported").length;
  const score =
    claims.length === 0
      ? 1
      : Math.round((claims.reduce((a, c) => a + STATUS_WEIGHT[c.status], 0) / claims.length) * 10000) /
        10000;

  const flags: TraceFlag[] = [];
  if (unified.length === 0) flags.push("no_visible_sources");
  const domains = new Set(sources.map((s) => s.domain).filter(Boolean));
  if (unified.length > 0 && domains.size === 1) flags.push("single_source");
  if (claims.length > 0 && sourced / claims.length < 0.5) flags.push("low_citation_density");

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
