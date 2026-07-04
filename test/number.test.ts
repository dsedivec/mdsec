import { describe, it, expect } from "vitest";
import { formatPrefix, parsePrefix, letterFor, formatNumber } from "../src/number.js";

describe("formatPrefix", () => {
  it("formats numeric paths", () => {
    expect(formatPrefix(["2"], { appendixTop: false })).toBe("2.");
    expect(formatPrefix(["2", "3"], { appendixTop: false })).toBe("2.3");
    expect(formatPrefix(["2", "3", "1"], { appendixTop: false })).toBe("2.3.1");
  });
  it("formats appendix paths", () => {
    expect(formatPrefix(["A"], { appendixTop: true })).toBe("Appendix A.");
    expect(formatPrefix(["A", "1"], { appendixTop: false })).toBe("A.1");
  });
});

describe("parsePrefix", () => {
  it("parses numeric prefixes", () => {
    expect(parsePrefix("2.3 Foo Bar")).toEqual({ path: ["2", "3"], rest: "Foo Bar", isAppendixForm: false });
    expect(parsePrefix("2. Foo")).toEqual({ path: ["2"], rest: "Foo", isAppendixForm: false });
  });
  it("parses appendix prefixes", () => {
    expect(parsePrefix("Appendix A. Backups")).toEqual({ path: ["A"], rest: "Backups", isAppendixForm: true });
    expect(parsePrefix("A.1 Restore")).toEqual({ path: ["A", "1"], rest: "Restore", isAppendixForm: false });
  });
  it("returns null when no prefix", () => {
    expect(parsePrefix("Plain Title")).toBeNull();
    expect(parsePrefix("Appendix on Formats")).toBeNull();
    expect(parsePrefix("2Fast 2Furious")).toBeNull();
  });
});

describe("letterFor", () => {
  it("letters", () => {
    expect(letterFor(1)).toBe("A");
    expect(letterFor(26)).toBe("Z");
    expect(letterFor(27)).toBe("AA");
  });
});

describe("formatNumber", () => {
  it("plain dotted", () => {
    expect(formatNumber(["2"])).toBe("2");
    expect(formatNumber(["A", "1", "2"])).toBe("A.1.2");
  });
});
