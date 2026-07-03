import { describe, expect, it } from "vitest";
import { localReport } from "./heuristics";
import type { Extraction } from "./types";

// Two claim-like sentences. PERIOD is the end of the first one, used to test that a
// chip placed just after a sentence attaches to THAT sentence.
const TEXT =
  "Le ciel paraît bleu selon la diffusion de Rayleigh. Les couchers de soleil rougissent pour la meme raison exacte.";
const PERIOD = TEXT.indexOf(".");

function extraction(over: Partial<Extraction> = {}): Extraction {
  return { text: TEXT, links: [], spans: [{ start: 0, end: TEXT.length }], citations: [], ...over };
}

describe("localReport", () => {
  it("marks everything unsupported when there are no sources", () => {
    const r = localReport(extraction());
    expect(r.claims).toHaveLength(2);
    expect(r.claims.every((c) => c.status === "unsupported")).toBe(true);
    expect(r.flags).toContain("no_visible_sources");
    expect(r.traceScore).toBe(0);
  });

  it("a positional citation with a URL backs its claim (weak, unverified locally)", () => {
    const r = localReport(extraction({ citations: [{ pos: 10, url: "https://a.example/x" }] }));
    expect(r.claims[0]!.status).toBe("weak");
    expect(r.claims[0]!.matchedSourceIndexes).toEqual([0]);
    expect(r.claims[1]!.status).toBe("unsupported");
    expect(r.sources).toHaveLength(1);
    expect(r.sources[0]!.domain).toBe("a.example");
    expect(r.flags).not.toContain("no_visible_sources");
  });

  it("a URL-less chip still lifts a claim out of unsupported", () => {
    const r = localReport(extraction({ citations: [{ pos: 10 }] }));
    expect(r.claims[0]!.status).toBe("weak");
    expect(r.claims[0]!.matchedSourceIndexes).toEqual([]);
    expect(r.claims[0]!.reason).toMatch(/isn't exposed/);
  });

  it("attaches a chip that trails a sentence to that sentence, not the next", () => {
    const r = localReport(
      extraction({ citations: [{ pos: PERIOD + 1, url: "https://a.example/x" }] }),
    );
    expect(r.claims[0]!.matchedSourceIndexes).toEqual([0]); // sentence 1
    expect(r.claims[1]!.matchedSourceIndexes).toEqual([]); // not sentence 2
  });

  it("weighs a weak claim at 0.5 in the trace score", () => {
    const r = localReport(extraction({ citations: [{ pos: 10, url: "https://a.example/x" }] }));
    expect(r.traceScore).toBe(0.25); // one weak of two claims: 0.5 / 2
  });

  it("flags a single source domain but clears it with multiple", () => {
    const one = localReport(extraction({ citations: [{ pos: 10, url: "https://a.example/x" }] }));
    expect(one.flags).toContain("single_source");
    const two = localReport(
      extraction({
        citations: [
          { pos: 10, url: "https://a.example/x" },
          { pos: TEXT.indexOf("couchers"), url: "https://b.example/y" },
        ],
      }),
    );
    expect(two.flags).not.toContain("single_source");
  });
});
