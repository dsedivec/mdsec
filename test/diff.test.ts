import { describe, it, expect } from "vitest";
import { unifiedDiff } from "../src/diff.js";

const lines = (...ls: string[]) => ls.join("\n") + "\n";

describe("unifiedDiff", () => {
  it("returns empty string for identical inputs", () => {
    expect(unifiedDiff("a\nb\n", "a\nb\n", "f.md", false)).toBe("");
    expect(unifiedDiff("", "", "f.md", false)).toBe("");
  });

  it("emits one hunk with correct numbers for a single-line change", () => {
    const oldT = lines("l1", "l2", "l3", "l4", "l5", "l6", "l7");
    const newT = lines("l1", "l2", "l3", "L4", "l5", "l6", "l7");
    expect(unifiedDiff(oldT, newT, "doc.md", false)).toBe(
      [
        "--- doc.md",
        "+++ doc.md (mdsec)",
        "@@ -1,7 +1,7 @@",
        " l1",
        " l2",
        " l3",
        "-l4",
        "+L4",
        " l5",
        " l6",
        " l7",
        "",
      ].join("\n"),
    );
  });

  it("emits two hunks for changes far apart", () => {
    const old10 = Array.from({ length: 20 }, (_, i) => `l${i + 1}`);
    const neu = [...old10];
    neu[1] = "L2";
    neu[17] = "L18";
    const out = unifiedDiff(
      old10.join("\n") + "\n",
      neu.join("\n") + "\n",
      "doc.md",
      false,
    );
    expect(out.match(/^@@ /gm)).toHaveLength(2);
    expect(out).toContain("@@ -1,5 +1,5 @@");
    expect(out).toContain("@@ -15,6 +15,6 @@");
  });

  it("merges hunks whose context would touch", () => {
    const old10 = Array.from({ length: 12 }, (_, i) => `l${i + 1}`);
    const neu = [...old10];
    neu[2] = "L3";
    neu[8] = "L9"; // gap of 5 unchanged lines (< 2*3+1) => one hunk
    const out = unifiedDiff(
      old10.join("\n") + "\n",
      neu.join("\n") + "\n",
      "doc.md",
      false,
    );
    expect(out.match(/^@@ /gm)).toHaveLength(1);
  });

  it("truncates context at the first and last lines", () => {
    const oldT = lines("a", "b");
    const newT = lines("A", "b");
    const out = unifiedDiff(oldT, newT, "doc.md", false);
    expect(out).toContain("@@ -1,2 +1,2 @@");
    const oldT2 = lines("a", "b");
    const newT2 = lines("a", "B");
    expect(unifiedDiff(oldT2, newT2, "doc.md", false)).toContain(
      "@@ -1,2 +1,2 @@",
    );
  });

  it("handles insertions and deletions, not just replacements", () => {
    const out = unifiedDiff(lines("a", "b"), lines("a", "x", "b"), "f", false);
    expect(out).toContain("+x");
    expect(out).not.toContain("-a");
    const out2 = unifiedDiff(lines("a", "x", "b"), lines("a", "b"), "f", false);
    expect(out2).toContain("-x");
  });

  it("marks a missing trailing newline on the old side", () => {
    const out = unifiedDiff("a\nb", "a\nB\n", "f", false);
    expect(out).toContain("-b\n\\ No newline at end of file\n");
    expect(out).toContain("+B\n");
  });

  it("marks a missing trailing newline on the new side", () => {
    const out = unifiedDiff("a\nb\n", "a\nb", "f", false);
    expect(out).toContain("-b\n");
    expect(out).toContain("+b\n\\ No newline at end of file\n");
  });

  it("colors -/+/@@ lines when color is true and none when false", () => {
    const oldT = lines("a", "b");
    const newT = lines("a", "B");
    const colored = unifiedDiff(oldT, newT, "f", true);
    expect(colored).toContain("\x1b[31m-b\x1b[0m");
    expect(colored).toContain("\x1b[32m+B\x1b[0m");
    expect(colored).toContain("\x1b[36m@@ -1,2 +1,2 @@\x1b[0m");
    expect(colored).toContain("\x1b[31m--- f\x1b[0m");
    expect(colored).toContain("\x1b[32m+++ f (mdsec)\x1b[0m");
    expect(unifiedDiff(oldT, newT, "f", false)).not.toContain("\x1b[");
  });
});
