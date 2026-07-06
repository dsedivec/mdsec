#!/usr/bin/env node
// Runs as npm's `prepare` script. When installing from a git clone
// (pre-commit's hook env build, `npm install <git url>`), this runs in
// the clone — where .git and tags exist — before npm packs the files,
// so the packed copy carries an exact version even without .git.
// Outside a git repo (plain tarball install) it exits 0 silently and
// mdsec --version falls back to package.json.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
try {
  const version = execFileSync(
    "git",
    ["describe", "--tags", "--always", "--dirty"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ).trim();
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(
    join(root, "dist", "version-stamp.json"),
    JSON.stringify({ version }) + "\n",
  );
} catch {
  process.exit(0);
}
