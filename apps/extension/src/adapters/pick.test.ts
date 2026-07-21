import { describe, expect, it } from "vitest";
import { pickAnswerNode } from "./pick";

/** Build the Perplexity-style nested layout: one outer answer container whose children
 * are per-paragraph/bullet blocks that ALSO match the adapter selector. `findAnswerNodes`
 * returns the container first, then every nested block. */
function perplexityNodes(): HTMLElement[] {
  const outer = document.createElement("div");
  outer.className = "prose";
  outer.textContent =
    "Intermittent fasting can help some people lose weight and may improve blood sugar. " +
    "The long-term benefits are still unclear for most healthy adults over many years.";
  const bullets = [
    "Weight loss, mainly because it reduces total calorie intake over the week.",
    "It is not a good fit for everyone, especially people who are pregnant.",
  ].map((t) => {
    const b = document.createElement("div");
    b.className = "prose-p"; // matches [class*='prose']
    b.textContent = t;
    outer.appendChild(b);
    return b;
  });
  // Matched order mirrors querySelectorAll: outer container first, then its descendants.
  return [outer, ...bullets];
}

describe("pickAnswerNode", () => {
  it("selects the outer answer container, not a trailing nested bullet", () => {
    const nodes = perplexityNodes();
    const picked = pickAnswerNode(nodes, 40);
    expect(picked).toBe(nodes[0]); // the full answer, not the last child fragment
  });

  it("returns null when there are no matched nodes", () => {
    expect(pickAnswerNode([], 40)).toBeNull();
  });

  it("takes the LAST outermost answer in a multi-turn thread", () => {
    const mk = (t: string) => {
      const d = document.createElement("div");
      d.className = "prose";
      d.textContent = t;
      return d;
    };
    const a1 = mk("First answer of the conversation, reasonably long to be substantial.");
    const a2 = mk("Second, most recent answer that we actually want to analyze now here.");
    // Neither contains the other -> both outermost -> pick the most recent.
    expect(pickAnswerNode([a1, a2], 40)).toBe(a2);
  });

  it("falls back to outermost nodes when none clear the substantial threshold", () => {
    const d = document.createElement("div");
    d.className = "prose";
    d.textContent = "short";
    expect(pickAnswerNode([d], 40)).toBe(d);
  });
});
