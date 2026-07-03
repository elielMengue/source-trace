import { describe, expect, it } from "vitest";
import { localReport } from "../lib/heuristics";
import { chatgptAdapter } from "./chatgpt";
import { extractFrom } from "./extract";
import { perplexityAdapter } from "./perplexity";

/** Parse an HTML fragment and return its first element (the answer container). */
function node(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html.trim();
  return host.firstElementChild as HTMLElement;
}

describe("extractFrom — Perplexity chips", () => {
  // A chip trailing the first sentence, carrying its URL in data-pplx-citation-url,
  // plus a second uncited sentence.
  const html = `
    <div class="prose"><p>La conjecture de Goldbach reste un probleme ouvert aujourd hui.<span class="citation" data-pplx-citation-url="https://dcode.example/g">dcode<span class="opacity-50">+1</span></span> Une seconde phrase assez longue pour compter comme un claim.</p></div>`;

  it("strips chip labels from the claim text", () => {
    const { text } = extractFrom(node(html), perplexityAdapter.selectors);
    expect(text).not.toMatch(/dcode/);
    expect(text).not.toMatch(/\+1/);
    expect(text).toContain("La conjecture de Goldbach");
    expect(text).toContain("Une seconde phrase");
  });

  it("captures the chip URL as a positional citation (no plain links)", () => {
    const { citations, links } = extractFrom(node(html), perplexityAdapter.selectors);
    expect(links).toEqual([]);
    expect(citations).toHaveLength(1);
    expect(citations[0]!.url).toBe("https://dcode.example/g");
  });

  it("attaches the trailing chip to the sentence it follows (integration)", () => {
    const report = localReport(extractFrom(node(html), perplexityAdapter.selectors));
    expect(report.claims[0]!.status).toBe("weak");
    expect(report.claims[0]!.matchedSourceIndexes).toEqual([0]);
    expect(report.claims[1]!.status).toBe("unsupported");
  });

  it("records a URL-less chip's position but leaves its URL unset", () => {
    const noUrl = `<div class="prose"><p>Une affirmation isolee sans lien expose ici meme.<span class="citation">tangente<span>+1</span></span></p></div>`;
    const { text, citations } = extractFrom(node(noUrl), perplexityAdapter.selectors);
    expect(text).not.toMatch(/tangente/);
    expect(citations).toHaveLength(1);
    expect(citations[0]!.url).toBeUndefined();
  });
});

describe("extractFrom — ChatGPT plain path", () => {
  it("reads inline anchors as links and keeps their text as prose", () => {
    const html = `<div data-message-author-role="assistant"><div class="markdown"><p>Une phrase avec une source citee ouvertement ici. <a href="https://b.example/p">reference</a></p></div></div>`;
    const { links, citations, text } = extractFrom(node(html), chatgptAdapter.selectors);
    expect(citations).toEqual([]);
    expect(links).toHaveLength(1);
    expect(links[0]!.url).toMatch(/^https:\/\/b\.example\/p/);
    expect(text).toContain("reference"); // anchor text is real prose — not stripped
  });
});
