import { describe, it, expect } from "vitest";
import { buildModel } from "../src/model.js";

const anchors = (s: string) => buildModel(s, {}).sections.map((x) => x.oldAnchor);

describe("GitHub slug parity", () => {
  it("punctuation and case", () => {
    expect(anchors("# T\n\n## Foo, Bar & Baz!\n\n## C'est l'été\n")).toEqual([
      "t",
      "foo-bar--baz",
      "cest-lété",
    ]);
  });
  it("duplicates", () => {
    expect(anchors("# X\n\n## X\n\n## X\n")).toEqual(["x", "x-1", "x-2"]);
  });
});
