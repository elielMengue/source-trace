// Re-export the shared contract (single source of truth) and define client-only types.
import type { AnalyzeMode, SourceSite, TraceReport } from "@source-trace/shared/types";

export type {
  AnalyzeMode,
  AnalyzeRequest,
  Claim,
  ClaimStatus,
  Relevance,
  Source,
  SourceSite,
  TraceFlag,
  TraceReport,
} from "@source-trace/shared/types";

/** What a site adapter pulls out of the page. */
export interface Extraction {
  text: string;
  links: { url: string; anchorText: string }[];
  /** Char spans (into `text`) the overlay can highlight without re-parsing. */
  spans: { start: number; end: number }[];
  /** Positional citations (inline source chips). `pos` is an offset into `text`;
   * `url` is present only when the chip exposes its link in the DOM. */
  citations: { pos: number; url?: string }[];
}

/**
 * A provisional report is the same shape as a Trace Report but computed locally and
 * cheaply, so the UI can paint instantly (I3). `engine.heuristics` is "local".
 */
export type ProvisionalReport = TraceReport & { provisional: true };

export interface AnalyzeContext {
  sourceSite: SourceSite;
  locale: string;
  mode: AnalyzeMode;
}

/** One independent source found by the deep-trace action, with a neutral, attributed
 * note describing what it says about the topic (never a truth verdict — I1). */
export interface DeepSource {
  url: string;
  title: string;
  note: string;
}

/** Result of POST /v1/trace. `available` is false when the LLM/web-search backend isn't
 * configured or failed — the UI then keeps its instant reverse-search link. */
export interface DeepTraceResult {
  traceId: string;
  available: boolean;
  summary: string;
  sources: DeepSource[];
  disclaimer: string;
}
