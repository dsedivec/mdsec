import { describe, it, expect } from "vitest";
import { buildModel } from "../src/model.js";

const doc = (s: string) => buildModel(s, {});

describe("buildModel", () => {
  it("single H1 is title; H2s numbered from 1", () => {
    const m = doc("# Title\n\n## Alpha\n\n## Beta\n");
    expect(m.minLevel).toBe(2);
    expect(m.sections.map((s) => s.newPath)).toEqual([null, ["1"], ["2"]]);
  });

  it("frontmatter title numbers H1s", () => {
    const m = doc("---\ntitle: Doc\n---\n\n# Alpha\n\n# Beta\n\n## Sub\n");
    expect(m.minLevel).toBe(1);
    expect(m.sections.map((s) => s.newPath)).toEqual([["1"], ["2"], ["2", "1"]]);
  });

  it("multiple H1s numbered", () => {
    const m = doc("# One\n\n# Two\n");
    expect(m.minLevel).toBe(1);
    expect(m.sections.map((s) => s.newPath)).toEqual([["1"], ["2"]]);
  });

  it("computes GitHub anchors incl. duplicates and blockquoted headings", () => {
    const m = doc("# T\n\n## Foo\n\n> ## Foo\n\n## Foo\n");
    expect(m.sections.map((s) => s.oldAnchor)).toEqual(["t", "foo", "foo-1", "foo-2"]);
    expect(m.sections[2].inBlockquote).toBe(true);
    expect(m.sections[2].newPath).toBeNull();
  });

  it("strips existing prefixes into bareTitle", () => {
    const m = doc("# T\n\n## 3. Alpha\n\n### 3.1 Sub\n");
    expect(m.sections[1].bareTitle).toBe("Alpha");
    expect(m.sections[1].newPath).toEqual(["1"]);
    expect(m.sections[2].newPath).toEqual(["1", "1"]);
  });

  it("does not strip prefix when inline markup surrounds the section number", () => {
    const m = doc("# T\n\n## **3.** Alpha\n");
    expect(m.sections[1].prefixEnd).toBeNull();
    expect(m.sections[1].bareTitle).toBe(m.sections[1].oldText);
    expect(m.warnings.some((w) => w.includes("3. Alpha"))).toBe(true);
  });

  it("does not strip appendix word when wrapped in inline markup", () => {
    const m = doc("# T\n\n## *Appendix* Backups\n");
    expect(m.sections[1].prefixEnd).toBeNull();
    expect(m.sections[1].bareTitle).toBe(m.sections[1].oldText);
    expect(m.warnings.some((w) => w.includes("Appendix Backups"))).toBe(true);
  });

  it("appendix mode letters top-level sections", () => {
    const m = doc("# T\n\n## Intro\n\n## Appendix Backups\n\n### Restore\n\n## Appendix Formats\n");
    expect(m.sections.map((s) => s.newPath)).toEqual([null, ["1"], ["A"], ["A", "1"], ["B"]]);
    expect(m.sections[2].isAppendix).toBe(true);
  });

  it("re-parses existing appendix prefixes", () => {
    const m = doc("# T\n\n## Appendix A. Backups\n\n### A.1 Restore\n");
    expect(m.sections[1].bareTitle).toBe("Backups");
    expect(m.sections[1].isAppendix).toBe(true);
    expect(m.sections[2].newPath).toEqual(["A", "1"]);
  });

  it("warns on skipped levels", () => {
    const m = doc("# T\n\n## A\n\n#### Deep\n");
    expect(m.sections[2].newPath).toEqual(["1", "1", "1"]);
    expect(m.warnings.some((w) => /skipped/i.test(w))).toBe(true);
  });
});
