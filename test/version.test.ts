import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveVersion } from "../src/version.js";

function makePackageRoot(version = "9.9.9"): string {
  const dir = mkdtempSync(join(tmpdir(), "mdsec-ver-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "mdsec", version }),
  );
  return dir;
}

function git(dir: string, ...args: string[]): void {
  execFileSync("git", args, { cwd: dir, stdio: "ignore" });
}

function makeGitRepo(dir: string): void {
  git(dir, "init");
  git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-m", "one");
}

describe("resolveVersion", () => {
  it("returns the exact tag when HEAD is tagged", () => {
    const dir = makePackageRoot();
    makeGitRepo(dir);
    git(dir, "tag", "v1.2.3");
    expect(resolveVersion(dir)).toBe("v1.2.3");
  });

  it("returns tag-N-ghash form when ahead of the tag", () => {
    const dir = makePackageRoot();
    makeGitRepo(dir);
    git(dir, "tag", "v1.2.3");
    git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "--allow-empty", "-m", "two");
    expect(resolveVersion(dir)).toMatch(/^v1\.2\.3-1-g[0-9a-f]+$/);
  });

  it("returns a bare hash when the repo has no tags", () => {
    const dir = makePackageRoot();
    makeGitRepo(dir);
    expect(resolveVersion(dir)).toMatch(/^[0-9a-f]{4,40}$/);
  });

  it("appends -dirty when the tree has uncommitted tracked changes", () => {
    const dir = makePackageRoot();
    makeGitRepo(dir);
    git(dir, "tag", "v1.2.3");
    git(dir, "add", "package.json");
    expect(resolveVersion(dir)).toBe("v1.2.3-dirty");
  });

  it("uses the stamp file when there is no .git", () => {
    const dir = makePackageRoot();
    mkdirSync(join(dir, "dist"));
    writeFileSync(
      join(dir, "dist", "version-stamp.json"),
      JSON.stringify({ version: "v0.2.0-3-ga1b2c3d" }),
    );
    expect(resolveVersion(dir)).toBe("v0.2.0-3-ga1b2c3d");
  });

  it("falls back to package.json with a v prefix", () => {
    const dir = makePackageRoot("9.9.9");
    expect(resolveVersion(dir)).toBe("v9.9.9");
  });

  it("falls through to package.json when the stamp is malformed", () => {
    const dir = makePackageRoot("9.9.9");
    mkdirSync(join(dir, "dist"));
    writeFileSync(join(dir, "dist", "version-stamp.json"), "not json");
    expect(resolveVersion(dir)).toBe("v9.9.9");
  });

  it("returns 'unknown' when nothing is available", () => {
    const dir = mkdtempSync(join(tmpdir(), "mdsec-ver-"));
    expect(resolveVersion(dir)).toBe("unknown");
  });
});
