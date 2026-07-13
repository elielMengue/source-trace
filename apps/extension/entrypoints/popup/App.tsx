import { useEffect, useState } from "react";
import type { PageMessage, PageReport } from "../../src/lib/messaging";
import { send } from "../../src/lib/messaging";
import type { Settings } from "../../src/lib/settings";
import type { SessionStats } from "../../src/lib/session";
import type { ClaimStatus, TraceReport } from "../../src/lib/types";
import { Wordmark } from "../../src/ui/Logo";

/** Ask the active tab's content script for its current trace summary (null if the tab
 * isn't an analyzed AI answer, e.g. no content script there). */
async function getActivePageReport(): Promise<PageReport> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) return null;
    return (await chrome.tabs.sendMessage(tab.id, { kind: "GET_PAGE_REPORT" } as PageMessage)) ?? null;
  } catch {
    return null; // no content script in this tab
  }
}

/** Tell the active tab to re-run its analysis (after the language changed) so the
 * on-page coaching tips re-localize without a manual page refresh. Best-effort. */
async function reAnalyzeActiveTab(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) await chrome.tabs.sendMessage(tab.id, { kind: "RE_ANALYZE" } as PageMessage);
  } catch {
    // no content script in this tab — nothing to re-analyze
  }
}

/** Coaching-tip languages the backend localizes (falls back to English otherwise). */
const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
];

const langOf = (locale: string) => (locale || "en").replace("_", "-").split("-", 1)[0]!.toLowerCase();

/** Popup (§4.4): current-page trace summary, session habit stats, privacy toggle. */
export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [page, setPage] = useState<PageReport>(null);

  useEffect(() => {
    void send({ kind: "GET_STATE" }).then((s) => {
      setSettings(s.settings);
      setStats(s.stats);
    });
    void getActivePageReport().then(setPage);
  }, []);

  const toggleMode = async () => {
    if (!settings) return;
    const mode = settings.mode === "full" ? "heuristics_only" : "full";
    const next = await send({ kind: "SET_SETTINGS", patch: { mode } });
    setSettings(next);
  };

  const changeLanguage = async (code: string) => {
    if (!settings || langOf(settings.locale) === code) return;
    const next = await send({ kind: "SET_SETTINGS", patch: { locale: code } });
    setSettings(next);
    await reAnalyzeActiveTab(); // re-localize the on-page tips in place
  };

  if (!settings || !stats) return <div className="p-body">Loading…</div>;

  const isPrivate = settings.mode === "heuristics_only";

  return (
    <div className="p-body">
      <header className="p-head">
        <Wordmark />
        <p className="p-tagline">Trace the sources — never the truth.</p>
      </header>

      <section className="p-card">
        <h2 className="p-h2">This page</h2>
        {page ? <PageSummary report={page} /> : <PageEmpty />}
      </section>

      <section className="p-card">
        <h2 className="p-h2">This browser</h2>
        <ul className="p-stats">
          <Stat label="Claims seen" value={stats.claims_seen} accent />
          <Stat label="Traces started" value={stats.traces_initiated} />
          <Stat label="Shares paused" value={stats.shares_paused} />
          <Stat label="Sessions" value={stats.sessions} />
        </ul>
        <p className="p-note">Counts only — no content leaves this device for these.</p>
      </section>

      <section className="p-card">
        <div className="p-row">
          <div>
            <div className="p-h2">Privacy mode</div>
            <div className="p-note">
              {isPrivate
                ? "Heuristics-only: analysis stays on your device."
                : "Full: answer text is sent to the zero-retention analysis service."}
            </div>
          </div>
          <button
            className={`p-switch ${isPrivate ? "is-on" : ""}`}
            role="switch"
            aria-checked={isPrivate}
            aria-label="On-device heuristics-only mode"
            onClick={toggleMode}
          >
            <span className="p-switch__knob" />
          </button>
        </div>
      </section>

      <section className="p-card">
        <div className="p-row">
          <div>
            <div className="p-h2">Language</div>
            <div className="p-note">Language of the coaching tips.</div>
          </div>
          <select
            className="p-select"
            aria-label="Coaching tips language"
            value={langOf(settings.locale)}
            onChange={(e) => void changeLanguage(e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <p className="p-disclosure">
        Source-Trace uses AI to analyze AI answers. It flags whether claims have a visible
        source — it never decides what is true.
      </p>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <li className={`p-stat${accent ? " p-stat--accent" : ""}`}>
      <span className="p-stat__value">{value}</span>
      <span className="p-stat__label">{label}</span>
    </li>
  );
}

const BREAKDOWN: { status: ClaimStatus; label: string }[] = [
  { status: "supported", label: "Sourced" },
  { status: "weak", label: "Weak" },
  { status: "unsupported", label: "Unsupported" },
];

function PageSummary({ report }: { report: TraceReport }) {
  const counts = { supported: 0, weak: 0, unsupported: 0 };
  for (const c of report.claims) counts[c.status]++;
  const n = report.claims.length;

  return (
    <>
      <div className="p-score">
        <ScoreGauge value={report.traceScore} />
        <div>
          <div className="p-score__title">Trace score</div>
          <div className="p-note">
            {n} {n === 1 ? "claim" : "claims"} on this answer · share with a visible source
          </div>
        </div>
      </div>
      <ul className="p-breakdown">
        {BREAKDOWN.map(({ status, label }) => (
          <li key={status} className={`p-brk p-brk--${status}`}>
            <span className="p-brk__dot" />
            <span className="p-brk__label">{label}</span>
            <span className="p-brk__count">{counts[status]}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function PageEmpty() {
  return (
    <p className="p-note">
      Open a Perplexity or ChatGPT answer to see its trace summary here.
    </p>
  );
}

/** Donut gauge of the page's trace score (0–100). Color tracks sourcing coverage:
 * green (well-sourced) → amber → red. Never a truth judgment (I1). */
function ScoreGauge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const r = 32;
  const circ = 2 * Math.PI * r;
  const color = value >= 0.67 ? "#1a7f37" : value >= 0.34 ? "#f6a623" : "#b3261e";
  return (
    <svg className="p-gauge" width="80" height="80" viewBox="0 0 80 80" aria-hidden="true">
      <circle cx="40" cy="40" r={r} fill="none" stroke="#e7e8ef" strokeWidth="8" />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${value * circ} ${circ}`}
        transform="rotate(-90 40 40)"
      />
      <text x="40" y="40" className="p-gauge__num" textAnchor="middle" dominantBaseline="central">
        {pct}
      </text>
    </svg>
  );
}
