import { describe, expect, it } from "vitest";
import { extractFrom } from "../adapters/extract";
import { perplexityAdapter } from "../adapters/perplexity";
import { localReport } from "../lib/heuristics";
import { buildClaimRanges } from "./highlight";

/** Parse HTML and attach it (ranges must live in a document) and return the container. */
function node(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html.trim();
  document.body.appendChild(host);
  return host.firstElementChild as HTMLElement;
}

describe("buildClaimRanges", () => {
  it("maps each claim span to a DOM range covering its sentence, excluding the chip", () => {
    const html = `<div class="prose"><p>La conjecture de Goldbach reste un probleme ouvert.<span class="citation" data-pplx-citation-url="https://d.example/x">d</span> Une deuxieme phrase assez longue pour compter ici.</p></div>`;
    const el = node(html);
    const report = localReport(extractFrom(el, perplexityAdapter.selectors));
    const ranges = buildClaimRanges(el, perplexityAdapter.selectors, report.claims);

    expect(ranges).toHaveLength(report.claims.length);
    // Sentence 1 has the trailing chip -> sourced -> weak (unverified locally).
    expect(ranges[0]!.status).toBe("weak");
    expect(ranges[0]!.range.toString()).toBe(
      "La conjecture de Goldbach reste un probleme ouvert.",
    );
    // Sentence 2 is uncited.
    expect(ranges[1]!.status).toBe("unsupported");
    expect(ranges[1]!.range.toString()).toContain("deuxieme phrase");
  });

  it("skips a claim whose span no longer matches the DOM (drift guard)", () => {
    const el = node(
      `<div class="prose"><p>Une phrase suffisamment longue pour etre un claim ici meme.</p></div>`,
    );
    const report = localReport(extractFrom(el, perplexityAdapter.selectors));
    const drifted = report.claims.map((c) => ({ ...c, text: `${c.text} DRIFTED` }));
    expect(buildClaimRanges(el, perplexityAdapter.selectors, drifted)).toEqual([]);
  });
});
