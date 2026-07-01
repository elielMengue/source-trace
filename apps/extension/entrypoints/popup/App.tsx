import { useEffect, useState } from "react";
import { send } from "../../src/lib/messaging";
import type { Settings } from "../../src/lib/settings";
import type { SessionStats } from "../../src/lib/session";

/** Popup (§4.4): session summary, habit stats, and the privacy mode toggle + disclosure. */
export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState<SessionStats | null>(null);

  useEffect(() => {
    void send({ kind: "GET_STATE" }).then((s) => {
      setSettings(s.settings);
      setStats(s.stats);
    });
  }, []);

  const toggleMode = async () => {
    if (!settings) return;
    const mode = settings.mode === "full" ? "heuristics_only" : "full";
    const next = await send({ kind: "SET_SETTINGS", patch: { mode } });
    setSettings(next);
  };

  if (!settings || !stats) return <div className="p-body">Loading…</div>;

  const isPrivate = settings.mode === "heuristics_only";

  return (
    <div className="p-body">
      <h1 className="p-title">Source-Trace</h1>

      <section className="p-card">
        <h2 className="p-h2">This browser</h2>
        <ul className="p-stats">
          <Stat label="Claims seen" value={stats.claims_seen} />
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

      <p className="p-disclosure">
        Source-Trace uses AI to analyze AI answers. It flags whether claims have a visible
        source — it never decides what is true.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <li className="p-stat">
      <span className="p-stat__value">{value}</span>
      <span className="p-stat__label">{label}</span>
    </li>
  );
}
