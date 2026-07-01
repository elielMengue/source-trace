import { create } from "zustand";
import type { SourceSite, TraceReport } from "../lib/types";

interface OverlayState {
  report: TraceReport | null;
  provisional: boolean;
  sourceSite: SourceSite | null;
  /** Soft, dismissible pre-share prompt (never a hard block — I1/I3). */
  showPause: boolean;
  collapsed: boolean;

  setReport: (report: TraceReport, provisional: boolean) => void;
  setSourceSite: (site: SourceSite) => void;
  setPause: (show: boolean) => void;
  setCollapsed: (collapsed: boolean) => void;
}

export const useOverlay = create<OverlayState>((set) => ({
  report: null,
  provisional: false,
  sourceSite: null,
  showPause: false,
  collapsed: false,
  setReport: (report, provisional) => set({ report, provisional }),
  setSourceSite: (sourceSite) => set({ sourceSite }),
  setPause: (showPause) => set({ showPause }),
  setCollapsed: (collapsed) => set({ collapsed }),
}));
