import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, fullModeActive } from "./settings";

describe("consent gate", () => {
  it("defaults to on-device with no prior choice (nothing sent on first run)", () => {
    expect(DEFAULT_SETTINGS.mode).toBe("heuristics_only");
    expect(DEFAULT_SETTINGS.modeChosen).toBe(false);
    expect(fullModeActive(DEFAULT_SETTINGS)).toBe(false);
  });

  it("only sends to the backend once Full mode is explicitly chosen", () => {
    expect(fullModeActive({ mode: "heuristics_only", modeChosen: false })).toBe(false);
    expect(fullModeActive({ mode: "heuristics_only", modeChosen: true })).toBe(false);
    // Full but not yet consented (e.g. a migrated dev install) -> still no network.
    expect(fullModeActive({ mode: "full", modeChosen: false })).toBe(false);
    // The only combination that permits a network call:
    expect(fullModeActive({ mode: "full", modeChosen: true })).toBe(true);
  });
});
