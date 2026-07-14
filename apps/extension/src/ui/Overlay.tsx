import { useRef, useState } from "react";
import { publisherHint } from "../lib/publisher";
import type { Claim, Relevance, Source, TraceReport } from "../lib/types";
import { send } from "../lib/messaging";
import { buildVerificationNote, reverseSearchUrl, secondSourceUrl, sourceLabel } from "./format";
import { Glyph } from "./Logo";
import { useOverlay } from "./store";
import { t } from "../lib/i18n";
import type { AnalyzeMode } from "../lib/types";

/**
 * Injected overlay (§4.3). Renders the Trace Report as a coaching panel: per-claim
 * sourcing status + "trace this" actions, plus a soft pre-share pause. It never asserts
 * truth — only whether a claim has visible sourcing (I1).
 */
export function Overlay() {
  const { report, provisional, showPause, collapsed, setCollapsed, setPause, locale } =
    useOverlay();
  if (!report) return null;

  const s = t(locale);
  const scorePct = Math.round(report.traceScore * 100);

  return (
    <>
    <section className="st-panel" role="complementary" aria-label="Source-Trace analysis">
      <header className="st-header">
        <span className="st-brand-glyph">
          <Glyph size={18} />
        </span>
        <span className="st-title">Source-Trace</span>
        {provisional && <span className="st-provisional" aria-live="polite">{s.analyzing}</span>}
        <span className="st-score" title={s.scoreTitle}>
          {scorePct}%
        </span>
        <button
          className="st-icon-btn"
          aria-expanded={!collapsed}
          aria-label={collapsed ? s.expand : s.collapse}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? "▸" : "▾"}
        </button>
      </header>

      {!collapsed && (
        <>
          <ConsentBanner />

          {report.flags.length > 0 && (
            <div className="st-flags">
              {report.flags.map((f) => (
                <span key={f} className="st-flag">{s[`flag_${f}` as keyof typeof s]}</span>
              ))}
            </div>
          )}

          <div className="st-claims">
            {report.claims.length === 0 && <p>{s.noClaims}</p>}
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
              <span className="st-pause__text">{s.pauseText}</span>
              <button className="st-btn" onClick={() => setPause(false)}>{s.dismiss}</button>
            </div>
          )}

          <div className="st-foot">
            <ModeToggle />
            <VerificationNote report={report} />
            <p className="st-disclosure">{s.disclosure}</p>
          </div>
        </>
      )}
    </section>
    <DeepTraceBubble />
    </>
  );
}

/** Compact analysis-mode switch, right in the panel — so a user can go on-device for a
 * sensitive topic (or back to Full) without opening the popup. Switching re-analyzes in
 * place. Setting the mode here also counts as the first-run choice (modeChosen). */
function ModeToggle() {
  const mode = useOverlay((st) => st.mode);
  const locale = useOverlay((st) => st.locale);
  const s = t(locale);

  const pick = async (next: AnalyzeMode) => {
    if (next === mode) return;
    await send({ kind: "SET_SETTINGS", patch: { mode: next, modeChosen: true } });
    const store = useOverlay.getState();
    store.setMode(next);
    store.setModeChosen(true);
    window.dispatchEvent(new CustomEvent("st:reanalyze"));
  };

  return (
    <div className="st-mode" role="group" aria-label={s.modeGroup}>
      <button
        className={`st-mode__opt${mode === "heuristics_only" ? " is-active" : ""}`}
        aria-pressed={mode === "heuristics_only"}
        onClick={() => pick("heuristics_only")}
      >
        🔒 {s.modeOnDevice}
      </button>
      <button
        className={`st-mode__opt${mode === "full" ? " is-active" : ""}`}
        aria-pressed={mode === "full"}
        onClick={() => pick("full")}
      >
        ☁ {s.modeFull}
      </button>
    </div>
  );
}

/** First-run consent (§8 / CWS): everything runs on-device until the user makes an
 * affirmative choice here. "Enable Full mode" is the disclosure + action required before
 * any answer text is sent to the backend. Dismissed forever once a choice is made. */
function ConsentBanner() {
  const modeChosen = useOverlay((st) => st.modeChosen);
  const locale = useOverlay((st) => st.locale);
  const tr = t(locale);
  if (modeChosen) return null;

  const enableFull = async () => {
    const s = useOverlay.getState();
    await send({ kind: "SET_SETTINGS", patch: { mode: "full", modeChosen: true } });
    s.setMode("full");
    s.setModeChosen(true);
    // Re-analyze the answer already on screen so the full report loads immediately.
    window.dispatchEvent(new CustomEvent("st:reanalyze"));
  };
  const stayLocal = async () => {
    await send({ kind: "SET_SETTINGS", patch: { modeChosen: true } });
    useOverlay.getState().setModeChosen(true);
  };

  return (
    <section className="st-consent" role="region" aria-label={tr.consentTitle}>
      <p className="st-consent__text">
        <strong>{tr.consentTitle}</strong> {tr.consentBody}
      </p>
      <div className="st-consent__actions">
        <button className="st-btn st-btn--primary" onClick={enableFull}>
          {tr.consentEnable}
        </button>
        <button className="st-btn" onClick={stayLocal}>
          {tr.consentStay}
        </button>
        <a
          className="st-consent__link"
          href="https://github.com/elielMengue/source-trace/blob/main/PRIVACY.md"
          target="_blank"
          rel="noreferrer noopener"
        >
          {tr.privacyPolicy}
        </a>
      </div>
    </section>
  );
}

function ClaimCard({ claim, sources }: { claim: Claim; sources: Source[] }) {
  // "Effective full mode" = Full chosen AND consented; gates the network-bound deep trace.
  const fullMode = useOverlay((st) => st.mode === "full" && st.modeChosen);
  const deep = useOverlay((st) => st.deep);
  const tr = t(useOverlay((st) => st.locale));
  const tracingThis = deep?.status === "loading" && deep.claim === claim.text;
  const onTrace = () => void send({ kind: "EVENT", name: "traces_initiated" });

  // Kick off deep trace and stream the result into the floating bubble via the store.
  const runDeep = async () => {
    const { openDeep, setDeepResult, answerText } = useOverlay.getState();
    openDeep(claim.text);
    try {
      const r = await send({ kind: "DEEP_TRACE", claim: claim.text, context: answerText });
      setDeepResult(r.available ? "done" : "unavailable", r.available ? r : null);
    } catch {
      setDeepResult("unavailable", null);
    }
  };

  return (
    <article className={`st-claim st-claim--${claim.status}`}>
      <div className="st-claim__status">{tr[`status_${claim.status}` as keyof typeof tr]}</div>
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
        <>
          <div className="st-actions">
            <a
              className="st-btn"
              href={reverseSearchUrl(claim.text)}
              target="_blank"
              rel="noreferrer noopener"
              onClick={onTrace}
            >
              {tr.traceThis}
            </a>
            <a
              className="st-btn"
              href={secondSourceUrl(claim.text)}
              target="_blank"
              rel="noreferrer noopener"
              onClick={onTrace}
            >
              {tr.secondSource}
            </a>
          </div>
          {/* Deep trace sends the claim to the backend, so it's offered in full mode only
              (privacy mode stays on-device — I2). The result opens as a separate floating
              chat bubble; the instant links above always remain. */}
          {fullMode && (
            <button
              className="st-btn st-btn--deep"
              disabled={tracingThis}
              onClick={runDeep}
            >
              {tracingThis ? tr.tracing : tr.deepTrace}
            </button>
          )}
        </>
      )}
    </article>
  );
}

/** The deep-trace result, shown as a floating chat bubble independent of the claims list
 * (bottom-left, scrollable, dismissible). It surfaces independent sources with a neutral,
 * attributed note each — never a truth verdict (I1). */
function DeepTraceBubble() {
  const deep = useOverlay((st) => st.deep);
  const closeDeep = useOverlay((st) => st.closeDeep);
  const tr = t(useOverlay((st) => st.locale));
  const asideRef = useRef<HTMLElement>(null);
  // Explicit position once the user has dragged the bubble; null = default CSS anchor
  // (bottom-left). Persisted across opens so the bubble stays where the user put it.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  if (!deep) return null;
  const { status, claim, result } = deep;

  const onGripDown = (e: React.PointerEvent) => {
    // Don't start a drag from the close button.
    if ((e.target as HTMLElement).closest("button")) return;
    const el = asideRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onGripMove = (e: React.PointerEvent) => {
    const el = asideRef.current;
    if (!drag.current || !el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(4, Math.min(e.clientX - drag.current.dx, window.innerWidth - w - 4));
    const top = Math.max(4, Math.min(e.clientY - drag.current.dy, window.innerHeight - h - 4));
    setPos({ left, top });
  };
  const onGripUp = (e: React.PointerEvent) => {
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  return (
    <aside
      ref={asideRef}
      className="st-bubble"
      role="dialog"
      aria-label="Deep trace summary"
      style={pos ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto" } : undefined}
    >
      <header
        className="st-bubble__head"
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
      >
        <span className="st-brand-glyph">
          <Glyph size={16} />
        </span>
        <span className="st-bubble__title">{tr.deepTitle}</span>
        <span className="st-bubble__grip" aria-hidden="true" title={tr.dragMove}>
          ⠿
        </span>
        <button className="st-icon-btn" aria-label={tr.closeDeep} onClick={closeDeep}>
          ✕
        </button>
      </header>
      <div className="st-bubble__body">
        <p className="st-bubble__claim">{tr.tracingLabel} “{truncate(claim, 180)}”</p>

        {status === "loading" && (
          <div className="st-deep st-deep--busy" role="status" aria-live="polite">
            <span className="st-spinner" aria-hidden="true" />
            <span>{tr.searching}</span>
          </div>
        )}

        {status === "unavailable" && (
          <p className="st-deep__note">{tr.deepUnavailable}</p>
        )}

        {status === "done" && result && (
          <>
            {result.summary && <p className="st-bubble__summary">{result.summary}</p>}
            {result.sources.length > 0 && (
              <ul className="st-deep__sources">
                {result.sources.map((s) => (
                  <li key={s.url} className="st-deep__source">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="st-deep__link"
                    >
                      {s.title}
                    </a>
                    {s.note && <span className="st-deep__snote"> — {s.note}</span>}
                  </li>
                ))}
              </ul>
            )}
            {result.disclaimer && <p className="st-deep__disclaimer">{result.disclaimer}</p>}
          </>
        )}
      </div>
    </aside>
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
  const tr = t(useOverlay((st) => st.locale));
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
        {open ? tr.hideNote : tr.seeNote}
      </button>
      {open && (
        <div className="st-note__panel">
          <pre className="st-note__text">{note}</pre>
          <button className="st-btn st-note__copy" onClick={onCopy}>
            {copied ? tr.copied : tr.copy}
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
