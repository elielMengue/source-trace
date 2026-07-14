import { describe, expect, it } from "vitest";
import type { TraceReport } from "../lib/types";
import { buildVerificationNote, reverseSearchUrl, secondSourceUrl } from "./format";

const report: TraceReport = {
  traceReportId: `sha256:${"0".repeat(64)}`,
  traceScore: 0.5,
  generatedAt: "2026-01-01T00:00:00Z",
  engine: { heuristics: "local", llm: null, cached: false },
  flags: ["single_source"],
  sources: [
    { index: 0, url: "https://www.dcode.fr/x", status: "live", relevance: "unknown", domain: "dcode.fr" },
  ],
  claims: [
    {
      id: "c1",
      text: "Alpha claim goes here.",
      status: "supported",
      matchedSourceIndexes: [0],
      reason: "",
      traceTip: "",
      span: { start: 0, end: 22 },
    },
    {
      id: "c2",
      text: "Beta claim goes here.",
      status: "unsupported",
      matchedSourceIndexes: [],
      reason: "",
      traceTip: "",
      span: { start: 23, end: 44 },
    },
  ],
};

describe("buildVerificationNote", () => {
  it("summarizes score, flags, and per-claim status + cited sources", () => {
    const note = buildVerificationNote(report);
    expect(note).toContain("Trace score: 50% (share of claims with a visible source)");
    expect(note).toContain("Flags: Relies on a single source");
    expect(note).toContain("1. [Has a visible source] Alpha claim goes here.");
    expect(note).toContain("   sources: dcode.fr");
    expect(note).toContain("2. [No visible source] Beta claim goes here.");
    expect(note).toContain("Describes visible sourcing, not truth.");
  });

  it("omits the sources line for an unsourced claim", () => {
    const note = buildVerificationNote(report);
    const betaLine = note.split("\n").findIndex((l) => l.includes("Beta claim"));
    expect(note.split("\n")[betaLine + 1]).not.toContain("sources:");
  });
});

describe("search URLs", () => {
  const longClaim =
    "Regular meditation is linked with lower stress and several measurable physical " +
    "benefits, especially for the heart, brain, and immune system over time.";

  it("does not force an exact-phrase quote (which lands on Google 'no results')", () => {
    const url = reverseSearchUrl(longClaim);
    const q = decodeURIComponent(new URL(url).searchParams.get("q")!);
    expect(q).not.toContain('"'); // no exact-phrase quoting
  });

  it("trims a long claim to its first words at a word boundary", () => {
    const q = decodeURIComponent(new URL(reverseSearchUrl(longClaim)).searchParams.get("q")!);
    expect(q.split(/\s+/).length).toBeLessThanOrEqual(16);
    expect(longClaim).toContain(q.split(" -site:")[0]!); // a real prefix, no mid-word cut
  });

  it("second-source query steers away from the usual first hit", () => {
    const q = decodeURIComponent(new URL(secondSourceUrl(longClaim)).searchParams.get("q")!);
    expect(q).toContain("-site:wikipedia.org");
  });
});
