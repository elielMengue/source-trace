import type { Claim, Source } from "../lib/types";
import { send } from "../lib/messaging";
import { FLAG_LABEL, reverseSearchUrl, secondSourceUrl, sourceLabel, STATUS_LABEL } from "./format";
import { useOverlay } from "./store";

/**
 * Injected overlay (§4.3). Renders the Trace Report as a coaching panel: per-claim
 * sourcing status + "trace this" actions, plus a soft pre-share pause. It never asserts
 * truth — only whether a claim has visible sourcing (I1).
 */
export function Overlay() {
  const { report, provisional, showPause, collapsed, setCollapsed, setPause } = useOverlay();
  if (!report) return null;

  const scorePct = Math.round(report.traceScore * 100);

  return (
    <section className="st-panel" role="complementary" aria-label="Source-Trace analysis">
      <header className="st-header">
        <span className="st-title">Source-Trace</span>
        {provisional && <span className="st-provisional" aria-live="polite">analyzing…</span>}
        <span className="st-score" title="Share of claims with a visible source (not truth)">
          {scorePct}%
        </span>
        <button
          className="st-icon-btn"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand panel" : "Collapse panel"}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? "▸" : "▾"}
        </button>
      </header>

      {!collapsed && (
        <>
          {report.flags.length > 0 && (
            <div className="st-flags">
              {report.flags.map((f) => (
                <span key={f} className="st-flag">{FLAG_LABEL[f]}</span>
              ))}
            </div>
          )}

          <div className="st-claims">
            {report.claims.length === 0 && <p>No checkable claims detected.</p>}
            {report.claims.map((c) => (
              <ClaimCard
                key={c.id}
                claim={c}
                sources={c.matchedSourceIndexes
                  .map((i) => report.sources[i])
                  .filter((s): s is Source => Boolean(s))}
              />
            ))}
          </div>

          {showPause && (
            <div className="st-pause" role="alertdialog" aria-label="Pre-share check">
              <span className="st-pause__text">
                Some claims here have no visible source. Consider tracing them before sharing.
              </span>
              <button className="st-btn" onClick={() => setPause(false)}>Dismiss</button>
            </div>
          )}

          <p className="st-disclosure">
            Analysis is AI-assisted and describes visible sourcing, not truth.
          </p>
        </>
      )}
    </section>
  );
}

function ClaimCard({ claim, sources }: { claim: Claim; sources: Source[] }) {
  const onTrace = () => void send({ kind: "EVENT", name: "traces_initiated" });

  return (
    <article className={`st-claim st-claim--${claim.status}`}>
      <div className="st-claim__status">{STATUS_LABEL[claim.status]}</div>
      <p className="st-claim__text">{truncate(claim.text, 160)}</p>
      {sources.length > 0 && (
        <div className="st-claim__sources">
          {sources.map((s) => (
            <a
              key={s.index}
              className={`st-src st-src--${s.status}`}
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              title={`${s.url} — ${s.status}`}
            >
              {sourceLabel(s)}
            </a>
          ))}
        </div>
      )}
      <p className="st-claim__tip">{claim.traceTip}</p>
      {claim.status !== "supported" && (
        <div className="st-actions">
          <a
            className="st-btn"
            href={reverseSearchUrl(claim.text)}
            target="_blank"
            rel="noreferrer noopener"
            onClick={onTrace}
          >
            Trace this
          </a>
          <a
            className="st-btn"
            href={secondSourceUrl(claim.text)}
            target="_blank"
            rel="noreferrer noopener"
            onClick={onTrace}
          >
            Find a second source
          </a>
        </div>
      )}
    </article>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}
