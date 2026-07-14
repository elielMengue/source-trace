import type { AnalyzeMode } from "./types";

/** User settings, persisted in chrome.storage.local. No content, ever (§9). */
export interface Settings {
  /** Privacy mode: full sends text to st-api; heuristics_only never leaves the browser. */
  mode: AnalyzeMode;
  /** True once the user has explicitly picked a mode (first-run consent). Until then,
   * Full mode is treated as on-device so nothing is sent before an affirmative action. */
  modeChosen: boolean;
  /** BCP-47 locale for coaching tips; defaults to the browser UI language. */
  locale: string;
  /** st-api origin. */
  apiBaseUrl: string;
}

export const DEFAULT_SETTINGS: Settings = {
  // Default to on-device: nothing leaves the browser until the user opts into Full mode
  // via the first-run consent prompt (Chrome Web Store: disclosure + action before send).
  mode: "heuristics_only",
  modeChosen: false,
  locale: typeof navigator !== "undefined" ? navigator.language : "en-US",
  // Hosted st-api (Railway). For local development, change DEFAULT here and reload.
  apiBaseUrl: "https://st-api-production-31b6.up.railway.app",
};

/** Single source of truth for "may answer content be sent to the backend?". Full mode is
 * effective only once the user has explicitly consented — so no network happens before an
 * affirmative choice, by construction (not just by UI flow). */
export function fullModeActive(settings: Pick<Settings, "mode" | "modeChosen">): boolean {
  return settings.mode === "full" && settings.modeChosen;
}

const KEY = "settings";

// Earlier builds defaulted apiBaseUrl to a local dev server. The backend is now hosted and
// there is no UI to set a custom URL, so a stored localhost value is a stale default to
// upgrade — not a deliberate user choice. Migrate it forward so Full mode / Deep trace reach
// the hosted backend instead of an (offline) local one.
const LEGACY_LOCAL_API = "http://127.0.0.1:8000";

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(KEY);
  const merged = { ...DEFAULT_SETTINGS, ...(stored[KEY] as Partial<Settings> | undefined) };
  if (merged.apiBaseUrl === LEGACY_LOCAL_API) merged.apiBaseUrl = DEFAULT_SETTINGS.apiBaseUrl;
  return merged;
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}
