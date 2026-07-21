/**
 * Choose which adapter-matched node is the answer to analyze.
 *
 * Adapters match by selector, and some sites (Perplexity) tag every paragraph and list
 * bullet with the same answer class, all *nested inside* the real answer container — so a
 * naive "last matched node" grabs a trailing child fragment (e.g. the closing caveat
 * sentence) instead of the whole answer, which then produces a single, sourced-only-once
 * claim. Keep only OUTERMOST matches (drop any node contained by another match), then take
 * the LAST substantial one: the most recent full answer in a multi-turn thread. (Globally
 * longest froze on the first answer of a conversation; plain "last" grabbed a sub-block.)
 */
export function pickAnswerNode(nodes: HTMLElement[], minChars: number): HTMLElement | null {
  if (nodes.length === 0) return null;
  const outermost = nodes.filter((n) => !nodes.some((o) => o !== n && o.contains(n)));
  const textLen = (n: HTMLElement) => (n.innerText ?? n.textContent ?? "").length;
  const substantial = outermost.filter((n) => textLen(n) >= minChars);
  const pool = substantial.length ? substantial : outermost;
  return pool[pool.length - 1] ?? null;
}
