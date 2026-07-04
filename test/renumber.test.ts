import { describe, it, expect } from "vitest";
import { buildModel } from "../src/model.js";
import { renumberEdits, newHeadingText, computeNewAnchors } from "../src/renumber.js";
import { applyEdits } from "../src/edits.js";

const run = (s: string) => applyEdits(s, renumberEdits(buildModel(s, {})));

describe("renumberEdits", () => {
  it("adds numbers", () => {
    expect(run("# T\n\n## Alpha\n\n### Sub\n\n## Beta\n")).toBe(
      "# T\n\n## 1. Alpha\n\n### 1.1 Sub\n\n## 2. Beta\n",
    );
  });
  it("updates stale numbers after a move", () => {
    expect(run("# T\n\n## 2. Beta\n\n## 1. Alpha\n")).toBe(
      "# T\n\n## 1. Beta\n\n## 2. Alpha\n",
    );
  });
  it("is idempotent", () => {
    const once = run("# T\n\n## Alpha\n\n### Sub\n");
    expect(run(once)).toBe(once);
  });
  it("leaves blockquoted and code-fenced headings alone", () => {
    const src = "# T\n\n> ## Quoted\n\n```\n## fake\n```\n\n## Real\n";
    expect(run(src)).toBe("# T\n\n> ## Quoted\n\n```\n## fake\n```\n\n## 1. Real\n");
  });
  it("numbers setext headings", () => {
    expect(run("# T\n\nAlpha\n-----\n")).toBe("# T\n\n1. Alpha\n-----\n");
  });
  it("handles appendices", () => {
    expect(run("# T\n\n## Intro\n\n## Appendix Backups\n\n### Restore\n")).toBe(
      "# T\n\n## 1. Intro\n\n## Appendix A. Backups\n\n### A.1 Restore\n",
    );
  });
});

describe("computeNewAnchors", () => {
  it("slugs new heading text with duplicate suffixes", () => {
    const m = buildModel("# T\n\n## Foo\n\n## Foo\n", {});
    const anchors = [...computeNewAnchors(m).values()];
    expect(anchors).toEqual(["t", "1-foo", "2-foo"]);
  });
});
