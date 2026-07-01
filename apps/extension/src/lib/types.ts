// Re-export the shared contract (single source of truth) and define client-only types.
import type { AnalyzeMode, SourceSite, TraceReport } from "@source-trace/shared/types";

export type {
  AnalyzeMode,
  AnalyzeRequest,
  Claim,
  ClaimStatus,
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
