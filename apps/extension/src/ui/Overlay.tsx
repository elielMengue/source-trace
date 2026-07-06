import { useState } from "react";
import { publisherHint } from "../lib/publisher";
import type { Claim, Relevance, Source, TraceReport } from "../lib/types";
import { send } from "../lib/messaging";
import {
  buildVerificationNote,
  FLAG_LABEL,
  reverseSearchUrl,
  secondSourceUrl,
  sourceLabel,
  STATUS_LABEL,
} from "./format";
import { Glyph } from "./Logo";
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
        <span className="st-brand-glyph">
          <Glyph size={18} />
        </span>
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

          <div className="st-foot">
            <VerificationNote report={report} />
            <p className="st-disclosure">
              Analysis is AI-assisted and describes visible sourcing, not truth.
            </p>
          </div>
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
          {sources.map((s) => {
            const hint = publisherHint(s.domain);
            return (
              <a
                key={s.index}
                className={`st-src st-src--${s.status}`}
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                title={`${s.url} — ${s.status}, relevance ${s.relevance}`}
              >
                {sourceLabel(s)}
                {hint && (
                  <span className="st-src__kind" title={`Publisher: ${hint.long}`}>
                    {hint.short}
                  </span>
                )}
                <RelevanceBars level={s.relevance} />
              </a>
            );
          })}
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

/** Signal-bar indicator of how relevant the LLM judged a source (full mode only).
 * Hidden when relevance is unknown (e.g. heuristics-only) — never implies truth. */
function RelevanceBars({ level }: { level: Relevance }) {
  const filled = level === "high" ? 3 : level === "medium" ? 2 : level === "low" ? 1 : 0;
  if (filled === 0) return null;
  return (
    <span className="st-rel" title={`Relevance: ${level}`} aria-label={`Relevance ${level}`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`st-rel__bar${i < filled ? " is-on" : ""}`} />
      ))}
    </span>
  );
}

/** Expand a preview of the portable verification note, then copy it from inside — so you
 * always see exactly what lands on the clipboard (WYSIWYG copy). */
function VerificationNote({ report }: { report: TraceReport }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const note = buildVerificationNote(report);
  const onCopy = async () => {
    await copyText(note);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="st-note">
      <button
        className="st-btn st-btn--wide"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Hide verification note ▴" : "See verification note ▾"}
      </button>
      {open && (
        <div className="st-note__panel">
          <pre className="st-note__text">{note}</pre>
          <button className="st-btn st-note__copy" onClick={onCopy}>
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Clipboard write with a legacy fallback (some pages restrict the async Clipboard API). */
async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // fall through
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } finally {
    ta.remove();
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}
