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
