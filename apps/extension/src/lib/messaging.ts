import type { Extraction, SourceSite, TraceReport } from "./types";
import type { Settings } from "./settings";
import type { SessionStats } from "./session";

/**
 * Typed message bus over chrome.runtime (§4.2). A discriminated union keeps every
 * hop (content <-> background <-> popup) type-checked and prevents injection between
 * contexts (§8) — the background only ever acts on these known shapes.
 */
export type Message =
  | { kind: "ANALYZE"; extraction: Extraction; sourceSite: SourceSite }
  | { kind: "EVENT"; name: keyof SessionStats }
  | { kind: "GET_STATE" }
  | { kind: "SET_SETTINGS"; patch: Partial<Settings> };

export interface StateResponse {
  settings: Settings;
  stats: SessionStats;
}

export interface MessageResponses {
  ANALYZE: TraceReport;
  EVENT: { ok: true };
  GET_STATE: StateResponse;
  SET_SETTINGS: Settings;
}

/** Sent from the popup to the active tab's content script (via chrome.tabs.sendMessage),
 * not to the background. The content script replies with its current report, or null. */
export type PageMessage = { kind: "GET_PAGE_REPORT" };
export type PageReport = TraceReport | null;

export function send<K extends Message["kind"]>(
  msg: Extract<Message, { kind: K }>,
): Promise<MessageResponses[K]> {
  return chrome.runtime.sendMessage(msg) as Promise<MessageResponses[K]>;
}
