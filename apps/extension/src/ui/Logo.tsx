/**
 * The "source graph" mark: two hollow nodes tracing down to a single amber source node.
 * Inlined as SVG so it renders identically in the popup and inside the content-script
 * shadow root without asset-URL resolution or web_accessible_resources.
 *
 * Brand: indigo #4457F0 (trace), amber #F6A623 (source node, always this color).
 */
export function Glyph({ size = 24, stroke = "#4457F0" }: { size?: number; stroke?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M16.3 19 L21.6 29.3 M31.7 19 L26.4 29.3 M18.4 15.5 L29.6 15.5"
        stroke={stroke}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="14.5" cy="15.5" r="3.7" fill="none" stroke={stroke} strokeWidth="3" />
      <circle cx="33.5" cy="15.5" r="3.7" fill="none" stroke={stroke} strokeWidth="3" />
      <circle cx="24" cy="34" r="5" fill="#F6A623" />
    </svg>
  );
}

/** Icon-in-a-tile + wordmark lockup. `tone="onLight"` for panels, `"onDark"` unused yet. */
export function Wordmark({ glyphSize = 20 }: { glyphSize?: number }) {
  return (
    <span className="st-brand">
      <span className="st-brand__tile">
        <Glyph size={glyphSize} stroke="#ffffff" />
      </span>
      <span className="st-brand__word">
        Source<span className="st-brand__dash">-</span>
        <b className="st-brand__strong">Trace</b>
      </span>
    </span>
  );
}
