import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../scripts/write-version-stamp.js", import.meta.url),
);
// The script derives the package root as ".." from its own directory,
// so run a COPY of it from a scripts/ subdirectory of each temp root.
function runStampIn(root: string) {
  const scriptsDir = join(root, "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  const copied = join(scriptsDir, "write-version-stamp.js");
  writeFileSync(copied, readFileSync(script));
  return spawnSync("node", [copied], { encoding: "utf8" });
}

function git(dir: string, ...args: string[]): void {
  execFileSync("git", args, { cwd: dir, stdio: "ignore" });
}

describe("write-version-stamp", () => {
  it("writes a stamp with git describe output in a tagged repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "mdsec-stamp-"));
    git(dir, "init");
    git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-m", "one");
    git(dir, "tag", "v2.0.0");
    const r = runStampIn(dir);
    expect(r.status).toBe(0);
    const stamp = JSON.parse(
      readFileSync(join(dir, "dist", "version-stamp.json"), "utf8"),
    );
    expect(stamp.version).toBe("v2.0.0");
  });

  it("exits 0 and writes nothing outside a git repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "mdsec-stamp-"));
    const r = runStampIn(dir);
    expect(r.status).toBe(0);
    expect(existsSync(join(dir, "dist", "version-stamp.json"))).toBe(false);
  });
});
