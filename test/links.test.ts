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
});

describe("fuzzy link resolution", () => {
  it("resolves when heading title was edited slightly", () => {
    const src = "# T\n\n## 1. Alpha Settings\n\n[section 1](#1-alpha-setting)\n";
    const r = runDocument(src, {});
    expect(r.output).toContain("(#1-alpha-settings)");
    expect(r.warnings.some((w) => /fuzzy/i.test(w))).toBe(true);
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
});
