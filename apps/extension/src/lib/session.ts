/**
 * Anonymous, local-only event counters — the pilot-evidence pipeline (§9).
 * Counts only; no content, no PII, no per-event detail. Feeds objectives O2/O4.
 */
export interface SessionStats {
  sessions: number;
  claims_seen: number;
  traces_initiated: number;
  shares_paused: number;
}

const KEY = "session_stats";

export const ZERO_STATS: SessionStats = {
  sessions: 0,
  claims_seen: 0,
  traces_initiated: 0,
  shares_paused: 0,
};

export async function getStats(): Promise<SessionStats> {
  const stored = await chrome.storage.local.get(KEY);
  return { ...ZERO_STATS, ...(stored[KEY] as Partial<SessionStats> | undefined) };
}

export async function bumpStat(key: keyof SessionStats, by = 1): Promise<void> {
  const stats = await getStats();
  stats[key] += by;
  await chrome.storage.local.set({ [KEY]: stats });
}
