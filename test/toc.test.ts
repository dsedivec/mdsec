import { describe, it, expect } from "vitest";
import { runDocument } from "../src/run.js";

const TOC_HEADING = "## Table of Contents";

describe("toc", () => {
  it("generates between markers with a default title heading", () => {
    const src = "# T\n\n<!-- toc -->\n\n<!-- /toc -->\n\n## Alpha\n\n### Sub\n";
    expect(runDocument(src, {}).output).toBe(
      `# T\n\n<!-- toc -->\n\n${TOC_HEADING}\n\n- [1. Alpha](#1-alpha)\n  - [1.1 Sub](#11-sub)\n\n<!-- /toc -->\n\n## 1. Alpha\n\n### 1.1 Sub\n`,
    );
  });
  it("is idempotent with the title heading (heading not numbered or listed)", () => {
    const src = "# T\n\n<!-- toc -->\n\n<!-- /toc -->\n\n## Alpha\n\n### Sub\n";
    const once = runDocument(src, {}).output;
    const twice = runDocument(once, {}).output;
    expect(twice).toBe(once);
    expect(once).not.toContain("1. Table of Contents");
    expect(once).not.toContain("(#table-of-contents)");
  });
  it("supports a custom title", () => {
    const src = "# T\n\n<!-- toc -->\n\n<!-- /toc -->\n\n## Alpha\n";
    expect(runDocument(src, { tocTitle: "Contents" }).output).toContain(
      "<!-- toc -->\n\n## Contents\n\n- [1. Alpha](#1-alpha)\n\n<!-- /toc -->",
    );
  });
  it("can disable the title", () => {
    const src = "# T\n\n<!-- toc -->\n\n<!-- /toc -->\n\n## Alpha\n";
    expect(runDocument(src, { tocTitle: false }).output).toContain(
      "<!-- toc -->\n\n- [1. Alpha](#1-alpha)\n\n<!-- /toc -->",
    );
  });
  it("uses the top numbered level for the title heading", () => {
    const src =
      "---\ntitle: Doc\n---\n\n<!-- toc -->\n\n<!-- /toc -->\n\n# Alpha\n";
    expect(runDocument(src, {}).output).toContain(
      "<!-- toc -->\n\n# Table of Contents\n\n- [1. Alpha](#1-alpha)\n\n<!-- /toc -->",
    );
  });
  it("replaces stale content and respects tocDepth", () => {
    const src =
      "# T\n\n<!-- toc -->\n- [old junk](#nope)\n\n<!-- /toc -->\n\n## Alpha\n\n### Sub\n";
    expect(runDocument(src, { tocDepth: 1 }).output).toContain(
      `<!-- toc -->\n\n${TOC_HEADING}\n\n- [1. Alpha](#1-alpha)\n\n<!-- /toc -->`,
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
  it("escapes brackets and backslashes in TOC labels", () => {
    const src =
      "# T\n\n<!-- toc -->\n\n<!-- /toc -->\n\n## Caching [fast] stuff\n";
    const r = runDocument(src, {});
    expect(r.output).toContain("Caching \\[fast\\] stuff");
  });
  it("does not crash when stale TOC content has internal links that resolve", () => {
    const src =
      "# T\n\n<!-- toc -->\n- [Alpha](#alpha)\n\n<!-- /toc -->\n\n## Alpha\n\n### Sub\n";
    expect(() => runDocument(src, {})).not.toThrow();
    const r = runDocument(src, {});
    expect(r.output).toBe(
      `# T\n\n<!-- toc -->\n\n${TOC_HEADING}\n\n- [1. Alpha](#1-alpha)\n  - [1.1 Sub](#11-sub)\n\n<!-- /toc -->\n\n## 1. Alpha\n\n### 1.1 Sub\n`,
    );
  });
});
