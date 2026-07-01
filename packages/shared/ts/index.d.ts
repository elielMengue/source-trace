// Types for the Source-Trace contract.
//
// The JSON Schemas in ../schema are the SOURCE OF TRUTH. These declarations
// mirror them and can be regenerated with `pnpm --filter @source-trace/shared gen:ts`.
// A backend contract test validates that produced reports conform to the schema,
// so client and server cannot silently drift.

export type ClaimStatus = "supported" | "weak" | "unsupported";
export type SourceStatus = "live" | "dead" | "unknown";
export type Relevance = "high" | "medium" | "low" | "unknown";
export type TraceFlag =
  | "no_visible_sources"
  | "single_source"
  | "dead_link"
  | "low_citation_density";
export type AnalyzeMode = "full" | "heuristics_only";
export type SourceSite = "chatgpt" | "perplexity" | "gemini" | "claude";

export interface Span {
  start: number;
  end: number;
}

export interface Claim {
  id: string;
  text: string;
  /** About SOURCING, per invariant I1 — never about truth. */
  status: ClaimStatus;
  matchedSourceIndexes: number[];
  reason: string;
  traceTip: string;
  span: Span;
}

export interface Source {
  index: number;
  url: string;
  status: SourceStatus;
  relevance: Relevance;
  domain: string;
}

export interface EngineInfo {
  heuristics: string;
  /** LLM model id, or null when the LLM pass did not run (heuristics-only). */
  llm: string | null;
  cached: boolean;
}

export interface TraceReport {
  traceReportId: string;
  /** Share of claims with adequate VISIBLE support (not truth). */
  traceScore: number;
  generatedAt: string;
  engine: EngineInfo;
  flags: TraceFlag[];
  claims: Claim[];
  sources: Source[];
}

export interface AnalyzeRequest {
  answer: {
    text: string;
    links: { url: string; anchorText: string }[];
  };
  context: {
    sourceSite: SourceSite;
    locale: string;
    clientVersion: string;
  };
  options: {
    mode: AnalyzeMode;
    maxClaims: number;
  };
}
