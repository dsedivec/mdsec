import { describe, it, expect } from "vitest";
import { applyEdits } from "../src/edits.js";

describe("applyEdits", () => {
  it("splices edits regardless of given order", () => {
    const src = "abcdefghij";
    expect(
      applyEdits(src, [
        { start: 0, end: 2, replacement: "XX" },
        { start: 5, end: 5, replacement: "+" },
        { start: 8, end: 10, replacement: "" },
      ]),
    ).toBe("XXcde+fgh");
  });
  it("rejects overlapping edits", () => {
    expect(() =>
      applyEdits("abcdef", [
        { start: 0, end: 3, replacement: "x" },
        { start: 2, end: 4, replacement: "y" },
      ]),
    ).toThrow(/overlap/i);
  });
});
