import type { AnalyzeMode } from "./types";

/** User settings, persisted in chrome.storage.local. No content, ever (§9). */
export interface Settings {
  /** Privacy mode: full sends text to st-api; heuristics_only never leaves the browser. */
  mode: AnalyzeMode;
  /** BCP-47 locale for coaching tips; defaults to the browser UI language. */
  locale: string;
  /** st-api origin. */
  apiBaseUrl: string;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "full",
  locale: typeof navigator !== "undefined" ? navigator.language : "en-US",
  apiBaseUrl: "http://127.0.0.1:8000",
};

const KEY = "settings";

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[KEY] as Partial<Settings> | undefined) };
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}
