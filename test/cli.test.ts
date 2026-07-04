import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const CLI = ["--import", "tsx", cliPath];
const run = (args: string[], input?: string) =>
  spawnSync("node", [...CLI, ...args], { input, encoding: "utf8" });

describe("cli", () => {
  it("filters stdin to stdout", () => {
    const r = run([], "# T\n\n## Alpha\n");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("# T\n\n## 1. Alpha\n");
  });
  it("writes in place with -w", () => {
    const dir = mkdtempSync(join(tmpdir(), "mdsec-"));
    const f = join(dir, "doc.md");
    writeFileSync(f, "# T\n\n## Alpha\n");
    const r = run(["-w", f]);
    expect(r.status).toBe(0);
    expect(readFileSync(f, "utf8")).toBe("# T\n\n## 1. Alpha\n");
  });
  it("--check exits 1 when changes needed, 0 when clean", () => {
    expect(run(["--check"], "# T\n\n## Alpha\n").status).toBe(1);
    expect(run(["--check"], "# T\n\n## 1. Alpha\n").status).toBe(0);
  });
  it("--check --strict fails on warnings", () => {
    const r = run(["--check", "--strict"], "# T\n\n## 1. Alpha\n\n[x](#zzzz-qqqq)\n");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/unresolved/);
  });
  it("--min-level overrides inference", () => {
    const r = run(["--min-level", "1"], "# Only One\n\n## Sub\n");
    expect(r.stdout).toBe("# 1. Only One\n\n## 1.1 Sub\n");
  });
});
