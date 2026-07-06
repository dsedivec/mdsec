import { describe, it, expect } from "vitest";
import { runDocument } from "../src/run.js";

describe("link rewriting", () => {
  it("rewrites fragments when anchors change", () => {
    const src = "# T\n\n## Alpha\n\nSee [Alpha](#alpha).\n\n## Beta\n";
    expect(runDocument(src, {}).output).toBe(
      "# T\n\n## 1. Alpha\n\nSee [Alpha](#1-alpha).\n\n## 2. Beta\n",
    );
  });
  it("rewrites numbered link text: section X.Y, §X.Y, leading number", () => {
    const src =
      "# T\n\n## 2. Beta\n\n## 1. Alpha\n\nSee [section 2](#2-beta), [§2](#2-beta), [2 Beta](#2-beta), and [Beta](#2-beta).\n";
    expect(runDocument(src, {}).output).toBe(
      "# T\n\n## 1. Beta\n\n## 2. Alpha\n\nSee [section 1](#1-beta), [§1](#1-beta), [1 Beta](#1-beta), and [Beta](#1-beta).\n",
    );
  });
  it("rewrites lettered leading section tokens (appendix renumbering) but not bare words", () => {
    const src =
      "# T\n\n## Appendix B. Backups\n\n### B.1 Restore\n\n[B.1 Restore](#b1-restore)\n";
    const r = runDocument(src, {});
    expect(r.output).toContain("[A.1 Restore](#a1-restore)");
  });
  it("warns on unresolvable links and leaves them alone", () => {
    const src = "# T\n\n## Alpha\n\n[gone](#nope)\n";
    const r = runDocument(src, {});
    expect(r.output).toContain("[gone](#nope)");
    expect(r.warnings.some((w) => w.includes("#nope"))).toBe(true);
  });
  it("rewrites link-reference definitions", () => {
    const src = "# T\n\n## Alpha\n\nSee [Alpha][a].\n\n[a]: #alpha\n";
    expect(runDocument(src, {}).output).toContain("[a]: #1-alpha");
  });
  it("does not touch external URLs with fragments", () => {
    const src = "# T\n\n## Alpha\n\n[x](https://ex.com/#alpha)\n";
    expect(runDocument(src, {}).output).toContain("https://ex.com/#alpha");
  });
  it("does not corrupt link text containing a bare word after 'section'", () => {
    const src = "# T\n\n## Caching\n\n[section about caching](#caching)\n";
    const r = runDocument(src, {});
    expect(r.output).toContain("[section about caching](#1-caching)");
  });
  it("still rewrites 'section A.2' and '§B' style tokens", () => {
    const src =
      "# T\n\n## Appendix B. Backups\n\n### B.1 Restore\n\nSee [section B.1](#b1-restore) and [§B](#appendix-b-backups).\n";
    const r = runDocument(src, {});
    expect(r.output).toContain("[section A.1](#a1-restore)");
    expect(r.output).toContain("[§A](#appendix-a-backups)");
  });
});

describe("fuzzy link resolution", () => {
  it("resolves when heading title was edited slightly", () => {
    const src = "# T\n\n## 1. Alpha Settings\n\n[section 1](#1-alpha-setting)\n";
    const r = runDocument(src, {});
    expect(r.output).toContain("(#1-alpha-settings)");
    expect(r.warnings.some((w) => /by section number/.test(w))).toBe(true);
  });
  it("resolves bare-title fragment against numbered heading", () => {
    const src = "# T\n\n## 3. Alpha\n\n[Alpha](#alpha)\n";
    expect(runDocument(src, {}).output).toContain("(#1-alpha)");
  });
  it("warns and leaves ambiguous fragments", () => {
    // Fragment chosen (via score-logging, per brief) so it lands within 0.05
    // Dice-similarity of both anchors and above the 0.8 threshold for both,
    // genuinely exercising the ambiguity branch rather than the "unresolved"
    // one that the original "#alpha-onee" fragment hit (0.94 vs 0.59).
    const src = "# T\n\n## Alpha Noma\n\n## Alpha Nomb\n\n[x](#alpha-nomc)\n";
    const r = runDocument(src, {});
    expect(r.output).toContain("(#alpha-nomc)");
    expect(r.warnings.some((w) => /ambiguous/i.test(w))).toBe(true);
  });
  it("resolves (not ambiguous) when only the best score clears the 0.8 threshold and the runner-up doesn't, even though within 0.05 of it", () => {
    // dice("alpha-beta-gamma-delta-epsilon", "alpha-beta-gamm-delta-esion") = 0.833 (>= 0.8)
    // dice("alpha-beta-gamma-delta-epsilon", "aph-bta-gamma-deltaepsilon")  = 0.792 (< 0.8)
    // gap is ~0.042 (< 0.05), so under the old rule this fell into "ambiguous";
    // under the fixed rule only two candidates *both* >= 0.8 count as ambiguous.
    const src =
      "# T\n\n## Alpha Beta Gamm Delta Esion\n\n## Aph Bta Gamma Deltaepsilon\n\n[x](#alpha-beta-gamma-delta-epsilon)\n";
    const r = runDocument(src, {});
    expect(r.warnings.some((w) => /ambiguous/i.test(w))).toBe(false);
    expect(r.warnings.some((w) => /fuzzy/i.test(w))).toBe(true);
    expect(r.output).toContain("(#1-alpha-beta-gamm-delta-esion)");
  });
  it("does not strip a lone leading article letter from a bare-title fragment", () => {
    // "a-quick-guide-to-things" must not be treated as a "a-" section-token
    // prefix over bare title "Quick Guide" (which would wrongly strip to
    // "quick-guide-to-things"); nor is it fuzzy-similar enough (dice ~0.62)
    // to "quick-guide" to resolve via similarity, so it must stay unresolved.
    const src = "# T\n\n## Quick Guide\n\n[x](#a-quick-guide-to-things)\n";
    const r = runDocument(src, {});
    expect(r.output).toContain("(#a-quick-guide-to-things)");
    expect(r.warnings.some((w) => w.includes("#a-quick-guide-to-things"))).toBe(true);
  });
});

describe("number-prefix link resolution (renamed headings)", () => {
  it("resolves a link to a renamed heading via its unchanged number", () => {
    const src =
      "# T\n\n## 1. Alpha\n\n## 2. Message Format\n\nSee [section 2](#2-common-message-envelope).\n";
    const r = runDocument(src, {});
    expect(r.output).toBe(
      "# T\n\n## 1. Alpha\n\n## 2. Message Format\n\nSee [section 2](#2-message-format).\n",
    );
    expect(r.warnings.some((w) => /by section number/.test(w))).toBe(true);
  });
  it("resolves via the old number even when the same run renumbers the section", () => {
    const src =
      "# T\n\n## 1. Alpha\n\n## New Thing\n\n## 2. Message Format\n\nSee [section 2](#2-common-message-envelope).\n";
    const r = runDocument(src, {});
    expect(r.output).toBe(
      "# T\n\n## 1. Alpha\n\n## 2. New Thing\n\n## 3. Message Format\n\nSee [section 3](#3-message-format).\n",
    );
  });
  it("warns and leaves the link when two headings share the old number", () => {
    const src = "# T\n\n## 2. Foo\n\n## 2. Bar\n\n[x](#2-baz)\n";
    const r = runDocument(src, {});
    expect(r.output).toContain("(#2-baz)");
    expect(r.warnings.some((w) => /ambiguous/i.test(w))).toBe(true);
  });
  it("resolves lettered appendix sub-section fragments", () => {
    const src =
      "# T\n\n## Appendix B. Backups\n\n### B.1 Data Restore\n\n[B.1](#b1-restore)\n";
    const r = runDocument(src, {});
    expect(r.output).toContain("[A.1](#a1-data-restore)");
  });
  it("resolves top-level appendix fragments", () => {
    const src = "# T\n\n## Appendix B. Storage\n\n[x](#appendix-b-backups)\n";
    const r = runDocument(src, {});
    expect(r.output).toContain("(#appendix-a-storage)");
  });
});
