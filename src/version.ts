import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Resolve mdsec's version. packageRoot is the directory containing
 * package.json. Resolution order:
 *   1. `git describe --tags --always --dirty` if packageRoot is a git
 *      checkout (only packageRoot itself is checked for .git, so an
 *      install nested inside an unrelated repo never reports that
 *      repo's version).
 *   2. dist/version-stamp.json, written by scripts/write-version-stamp.js
 *      at npm-install time (the pre-commit / npm-from-git case).
 *   3. package.json's version, with a "v" prefix.
 * Never throws; each step falls through on any error.
 */
export function resolveVersion(packageRoot: string): string {
  if (existsSync(join(packageRoot, ".git"))) {
    try {
      return execFileSync(
        "git",
        ["describe", "--tags", "--always", "--dirty"],
        { cwd: packageRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
    } catch {
      // fall through
    }
  }
  try {
    const stamp = JSON.parse(
      readFileSync(join(packageRoot, "dist", "version-stamp.json"), "utf8"),
    );
    if (typeof stamp.version === "string" && stamp.version !== "") {
      return stamp.version;
    }
  } catch {
    // fall through
  }
  try {
    const pkg = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf8"),
    );
    if (typeof pkg.version === "string" && pkg.version !== "") {
      return `v${pkg.version}`;
    }
  } catch {
    // fall through
  }
  return "unknown";
}
