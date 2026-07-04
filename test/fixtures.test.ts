import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runDocument } from "../src/run.js";

const dir = fileURLToPath(new URL("./fixtures", import.meta.url));
describe("fixtures", () => {
  for (const name of readdirSync(dir)) {
    it(name, () => {
      const input = readFileSync(join(dir, name, "input.md"), "utf8");
      const expected = readFileSync(join(dir, name, "expected.md"), "utf8");
      const { output } = runDocument(input, {});
      expect(output).toBe(expected);
      // Idempotence: running again is a no-op.
      expect(runDocument(output, {}).output).toBe(output);
    });
  }
});
