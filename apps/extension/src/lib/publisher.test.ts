import { describe, expect, it } from "vitest";
import { publisherHint } from "./publisher";

describe("publisherHint", () => {
  it("categorizes known publishers, including subdomains and www", () => {
    expect(publisherHint("en.wikipedia.org")?.short).toBe("wiki");
    expect(publisherHint("www.reddit.com")?.long).toContain("forum");
    expect(publisherHint("youtu.be")?.short).toBe("video");
  });

  it("recognizes news outlets (incl. multi-part TLDs)", () => {
    expect(publisherHint("lemonde.fr")?.short).toBe("news");
    expect(publisherHint("news.bbc.co.uk")?.short).toBe("news");
  });

  it("uses TLD rules for government and academia", () => {
    expect(publisherHint("nasa.gov")?.short).toBe("gov");
    expect(publisherHint("service-public.gouv.fr")?.short).toBe("gov");
    expect(publisherHint("mit.edu")?.short).toBe("edu");
    expect(publisherHint("ox.ac.uk")?.short).toBe("edu");
  });

  it("returns null when it cannot categorize honestly", () => {
    expect(publisherHint("dcode.fr")).toBeNull();
    expect(publisherHint("some-random-blog.example")).toBeNull();
  });
});
