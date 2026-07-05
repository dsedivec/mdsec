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
  it("accepts multiple files with -w (pre-commit style)", () => {
    const dir = mkdtempSync(join(tmpdir(), "mdsec-"));
    const a = join(dir, "a.md");
    const b = join(dir, "b.md");
    writeFileSync(a, "# T\n\n## Alpha\n");
    writeFileSync(b, "# T\n\n## 1. Beta\n");
    const r = run(["-w", a, b]);
    expect(r.status).toBe(0);
    expect(readFileSync(a, "utf8")).toBe("# T\n\n## 1. Alpha\n");
    expect(readFileSync(b, "utf8")).toBe("# T\n\n## 1. Beta\n");
  });
  it("rejects multiple files without --write or --check", () => {
    const dir = mkdtempSync(join(tmpdir(), "mdsec-"));
    const a = join(dir, "a.md");
    const b = join(dir, "b.md");
    writeFileSync(a, "# T\n");
    writeFileSync(b, "# T\n");
    const r = run([a, b]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/multiple FILE/);
  });
  it("--check with multiple files exits 1 if any needs changes", () => {
    const dir = mkdtempSync(join(tmpdir(), "mdsec-"));
    const a = join(dir, "a.md");
    const b = join(dir, "b.md");
    writeFileSync(a, "# T\n\n## 1. Alpha\n");
    writeFileSync(b, "# T\n\n## Beta\n");
    expect(run(["--check", a, b]).status).toBe(1);
    writeFileSync(b, "# T\n\n## 1. Beta\n");
    expect(run(["--check", a, b]).status).toBe(0);
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
  it("--toc-title and --no-toc-title control the TOC heading", () => {
    const src = "# T\n\n<!-- toc -->\n<!-- /toc -->\n\n## Alpha\n";
    const custom = run(["--toc-title", "Contents"], src);
    expect(custom.stdout).toContain("<!-- toc -->\n## Contents\n\n");
    const none = run(["--no-toc-title"], src);
    expect(none.stdout).toContain("<!-- toc -->\n- [1. Alpha](#1-alpha)\n");
  });
  it("--min-level overrides inference", () => {
    const r = run(["--min-level", "1"], "# Only One\n\n## Sub\n");
    expect(r.stdout).toBe("# 1. Only One\n\n## 1.1 Sub\n");
  });
  it("missing file exits 2 with a clean error, no stack trace", () => {
    const r = run(["/no/such/file-xyz.md"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/mdsec:/);
    expect(r.stderr).not.toMatch(/ at /);
  });
  it("unknown flag exits 2 with a clean error", () => {
    const r = run(["--bogus"], "# T\n");
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/mdsec:/);
    expect(r.stderr).not.toMatch(/\.(js|ts):\d+/);
  });
  it("coerces numeric-string config values (e.g. tocDepth) to numbers", () => {
    const dir = mkdtempSync(join(tmpdir(), "mdsec-"));
    writeFileSync(join(dir, ".mdsec.json"), JSON.stringify({ tocDepth: "1" }));
    const f = join(dir, "doc.md");
    writeFileSync(
      f,
      "# T\n\n<!-- toc -->\n<!-- /toc -->\n\n## Alpha\n\n### Sub\n",
    );
    const r = run([f]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(
      "<!-- toc -->\n## Table of Contents\n\n- [1. Alpha](#1-alpha)\n<!-- /toc -->",
    );
    expect(r.stdout).not.toContain("[1.1 Sub]");
  });
  it("--verbose reports each applied edit to stderr", () => {
    const r = run(["--verbose"], "# T\n\n## Alpha\n");
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/edit @/);
  });
  it("invalid config value exits 2 mentioning the config path or field", () => {
    const dir = mkdtempSync(join(tmpdir(), "mdsec-"));
    writeFileSync(join(dir, ".mdsec.json"), JSON.stringify({ minLevel: 99 }));
    const f = join(dir, "doc.md");
    writeFileSync(f, "# T\n\n## Alpha\n");
    const r = run([f]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/mdsec:/);
    expect(r.stderr).toMatch(/minLevel|\.mdsec\.json/);
  });
});
