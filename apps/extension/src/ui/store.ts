import { create } from "zustand";
import type { AnalyzeMode, DeepTraceResult, SourceSite, TraceReport } from "../lib/types";

export type DeepStatus = "loading" | "done" | "unavailable";

/** A deep-trace conversation, shown as a floating chat bubble separate from the claims
 * list. Null when no bubble is open. */
export interface DeepState {
  status: DeepStatus;
  claim: string;
  result: DeepTraceResult | null;
}

interface OverlayState {
  report: TraceReport | null;
  provisional: boolean;
  sourceSite: SourceSite | null;
  /** Analysis mode: deep trace is offered in "full" only (privacy mode stays on-device). */
  mode: AnalyzeMode;
  /** Whether the user has made the first-run mode choice. Until then we show the consent
   * banner and treat everything as on-device (no network before an affirmative action). */
  modeChosen: boolean;
  /** The current answer's text — passed as grounding context to the deep-trace action. */
  answerText: string;
  /** The open deep-trace bubble, or null when closed. */
  deep: DeepState | null;
  /** Soft, dismissible pre-share prompt (never a hard block — I1/I3). */
  showPause: boolean;
  collapsed: boolean;

  setReport: (report: TraceReport, provisional: boolean) => void;
  setSourceSite: (site: SourceSite) => void;
  setMode: (mode: AnalyzeMode) => void;
  setModeChosen: (chosen: boolean) => void;
  setAnswerText: (text: string) => void;
  openDeep: (claim: string) => void;
  setDeepResult: (status: DeepStatus, result: DeepTraceResult | null) => void;
  closeDeep: () => void;
  setPause: (show: boolean) => void;
  setCollapsed: (collapsed: boolean) => void;
}

export const useOverlay = create<OverlayState>((set) => ({
  report: null,
  provisional: false,
  sourceSite: null,
  mode: "heuristics_only",
  modeChosen: false,
  answerText: "",
  deep: null,
  showPause: false,
  collapsed: false,
  setReport: (report, provisional) => set({ report, provisional }),
  setSourceSite: (sourceSite) => set({ sourceSite }),
  setMode: (mode) => set({ mode }),
  setModeChosen: (modeChosen) => set({ modeChosen }),
  setAnswerText: (answerText) => set({ answerText }),
  openDeep: (claim) => set({ deep: { status: "loading", claim, result: null } }),
  setDeepResult: (status, result) =>
    set((s) => (s.deep ? { deep: { ...s.deep, status, result } } : {})),
  closeDeep: () => set({ deep: null }),
  setPause: (showPause) => set({ showPause }),
  setCollapsed: (collapsed) => set({ collapsed }),
}));
