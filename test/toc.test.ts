import { describe, it, expect } from "vitest";
import { runDocument } from "../src/run.js";

describe("toc", () => {
  it("generates between markers", () => {
    const src = "# T\n\n<!-- toc -->\n<!-- /toc -->\n\n## Alpha\n\n### Sub\n";
    expect(runDocument(src, {}).output).toBe(
      "# T\n\n<!-- toc -->\n- [1. Alpha](#1-alpha)\n  - [1.1 Sub](#11-sub)\n<!-- /toc -->\n\n## 1. Alpha\n\n### 1.1 Sub\n",
    );
  });
  it("replaces stale content and respects tocDepth", () => {
    const src =
      "# T\n\n<!-- toc -->\n- [old junk](#nope)\n<!-- /toc -->\n\n## Alpha\n\n### Sub\n";
    expect(runDocument(src, { tocDepth: 1 }).output).toContain(
      "<!-- toc -->\n- [1. Alpha](#1-alpha)\n<!-- /toc -->",
    );
  });
  it("no markers, no toc", () => {
    const src = "# T\n\n## Alpha\n";
    expect(runDocument(src, {}).output).not.toContain("<!-- toc -->");
  });
  it("warns on unclosed marker", () => {
    const src = "# T\n\n<!-- toc -->\n\n## Alpha\n";
    const r = runDocument(src, {});
    expect(r.warnings.some((w) => /toc/i.test(w))).toBe(true);
  });
});
