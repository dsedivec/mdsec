# Release Process and `--version` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `mdsec --version` (release tag when on a release, exact git-describe output otherwise) and a tag-push-driven GitHub release process with a local `npm run release` helper.

**Architecture:** A new `src/version.ts` module resolves the version at runtime: live `git describe` when the package root is a git checkout, else an install-time stamp file written by an npm `prepare` script (which runs inside pre-commit's git clone before npm packs the files), else `package.json`. Releases are cut locally by `scripts/release.sh` (bump + tag + push via `npm version`) and published by a GitHub Actions workflow on tag push.

**Tech Stack:** TypeScript (Node 22+, ESM, `node:` builtins only in src), vitest, bash, GitHub Actions, `gh` CLI in CI.

**Spec:** `docs/superpowers/specs/2026-07-05-release-process-design.md`

## Global Constraints

- Version output format is exactly `mdsec <version>\n`; `<version>` is `git describe --tags --always --dirty` output verbatim (tags already carry the `v`), or `v` + package.json version in the final fallback. A bare commit hash (no tags reachable) is printed without a `v` prefix.
- Tags/releases v0.1.0–v0.3.0 already exist; `package.json` must be synced to `0.3.0` before any `npm version` bump.
- `dist/` is committed (pre-commit consumers install from a git clone); any change to `src/` requires `npm run build` and committing `dist/`.
- `dist/version-stamp.json` is a build artifact: gitignored, but MUST be included in npm packs (hence the `.npmignore` in Task 3 — npm ignores `.gitignore` when `.npmignore` exists).
- `--version` must never throw: every resolution step falls through on error.
- Refinement over the spec's "walk up" wording: only the package root is checked for `.git` (not ancestor directories), so a copy installed under someone else's git repo (e.g. `node_modules` inside a dotfiles repo) can't report the wrong repo's version.

---

### Task 0: Sync package.json version to the latest existing tag

**Files:**
- Modify: `package.json` (version field only)

**Interfaces:**
- Produces: `package.json` version `0.3.0`, matching the latest tag `v0.3.0`, so `npm version <bump>` in Task 5 creates non-conflicting tags.

- [ ] **Step 1: Set the version**

Run: `npm pkg set version=0.3.0`

- [ ] **Step 2: Verify**

Run: `node -p "require('./package.json').version"`
Expected: `0.3.0`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "Sync package.json version to latest release tag v0.3.0"
```

---

### Task 1: Version resolution module

**Files:**
- Create: `src/version.ts`
- Test: `test/version.test.ts`

**Interfaces:**
- Produces: `resolveVersion(packageRoot: string): string` — `packageRoot` is the directory containing `package.json`. Never throws. Task 2 calls it from the CLI.

- [ ] **Step 1: Write the failing tests**

Create `test/version.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/version.test.ts`
Expected: FAIL — cannot resolve `../src/version.js`.

- [ ] **Step 3: Implement `src/version.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/version.test.ts`
Expected: all 8 tests PASS.

- [ ] **Step 5: Run the full suite, then commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/version.ts test/version.test.ts
git commit -m "Add runtime version resolution (git describe / stamp / package.json)"
```

---

### Task 2: `-V, --version` CLI flag

**Files:**
- Modify: `src/cli.ts` (HELP text ~line 7-27, `cliOptions` ~line 92-105, flag handling after the `values.help` block ~line 120-123)
- Modify: `dist/*` (rebuild output)
- Test: `test/cli.test.ts` (append one test)

**Interfaces:**
- Consumes: `resolveVersion(packageRoot: string): string` from `src/version.ts` (Task 1).
- Produces: `mdsec --version` / `mdsec -V` prints `mdsec <version>\n` to stdout and exits 0, before any file/stdin processing.

- [ ] **Step 1: Write the failing test**

Append inside the `describe("cli", ...)` block in `test/cli.test.ts`:

```ts
  it("--version prints mdsec plus a git-describe or vX.Y.Z version", () => {
    for (const flag of ["--version", "-V"]) {
      const r = run([flag]);
      expect(r.status).toBe(0);
      // Run from this checkout, resolution uses live git describe; tags
      // exist, so expect the tag-based forms (or a bare hash fallback).
      expect(r.stdout).toMatch(
        /^mdsec (v\d+\.\d+\.\d+(-\d+-g[0-9a-f]+)?(-dirty)?|[0-9a-f]{4,40}(-dirty)?)\n$/,
      );
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/cli.test.ts -t "prints mdsec plus"`
Expected: FAIL — exit status 2 (unknown option `--version`).

- [ ] **Step 3: Implement the flag**

In `src/cli.ts`:

Add to imports:

```ts
import { fileURLToPath } from "node:url";
import { resolveVersion } from "./version.js";
```

Add to `cliOptions` (after the `verbose` entry):

```ts
  version: { type: "boolean", short: "V" },
```

After the `if (values.help) { ... }` block:

```ts
if (values.version) {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  process.stdout.write(`mdsec ${resolveVersion(packageRoot)}\n`);
  process.exit(0);
}
```

(`import.meta.url` is `src/cli.ts` under tsx and `dist/cli.js` when compiled; both are one level below the package root, so `..` is correct in both.)

Add to `HELP`, after the `-v, --verbose` line:

```
  -V, --version             show version and exit
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS, including the new `--version` test.

- [ ] **Step 5: Rebuild dist and commit**

```bash
npm run build
git add src/cli.ts test/cli.test.ts dist
git commit -m "Add -V/--version flag"
```

---

### Task 3: Install-time version stamp (`prepare` script)

**Files:**
- Create: `scripts/write-version-stamp.js`
- Create: `.npmignore`
- Modify: `package.json` (add `prepare` script)
- Modify: `.gitignore` (ignore the stamp)
- Test: `test/version-stamp.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `dist/version-stamp.json` with shape `{"version": "<git describe output>"}`, written whenever npm runs `prepare` in a git clone (pre-commit env build, `npm install` from git or from the checkout). `resolveVersion` (Task 1) already reads this path.

- [ ] **Step 1: Write the failing tests**

Create `test/version-stamp.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/version-stamp.test.ts`
Expected: FAIL — `scripts/write-version-stamp.js` does not exist.

- [ ] **Step 3: Implement the stamp script**

Create `scripts/write-version-stamp.js`:

```js
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
```

- [ ] **Step 4: Wire up `prepare`, `.npmignore`, `.gitignore`**

Run: `npm pkg set scripts.prepare="node scripts/write-version-stamp.js"`

Create `.npmignore` — REQUIRED: without it, npm packing obeys `.gitignore`, which is about to ignore the stamp file, and the stamp would silently be dropped from installs:

```
docs/
test/
scripts/release.sh
.pre-commit-hooks.yaml
.superpowers/
.claude/
*.tsbuildinfo
vitest.config.ts
```

Append to `.gitignore`:

```
dist/version-stamp.json
```

- [ ] **Step 5: Run tests, verify packing end to end**

Run: `npm test`
Expected: PASS.

Run: `npm pack --dry-run 2>&1 | grep -E "version-stamp|dist/cli"`
Expected: both `dist/version-stamp.json` and `dist/cli.js` are listed (prepare ran and the stamp was packed).

- [ ] **Step 6: Commit**

```bash
git add scripts/write-version-stamp.js test/version-stamp.test.ts .npmignore .gitignore package.json
git commit -m "Stamp exact version at install time via npm prepare"
```

---

### Task 4: Local release script

**Files:**
- Create: `scripts/release.sh` (mode 755)
- Modify: `package.json` (add `release` script)

**Interfaces:**
- Consumes: nothing from other tasks (but Task 5's workflow is what turns the pushed tag into a GitHub release).
- Produces: `npm run release -- <patch|minor|major>` — bumps package.json, tags `vX.Y.Z`, pushes main + tag.

- [ ] **Step 1: Write the script**

Create `scripts/release.sh`:

```bash
#!/usr/bin/env bash
# Cut a release: verify preconditions, test, build, bump, tag, push.
# The GitHub release itself is created by CI on the tag push
# (.github/workflows/release.yml).
set -euo pipefail

die() { echo "release: $*" >&2; exit 1; }

bump="${1:-}"
case "$bump" in
  patch|minor|major) ;;
  *) die "usage: npm run release -- <patch|minor|major>" ;;
esac

cd "$(dirname "$0")/.."

[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || die "must be on main"
[ -z "$(git status --porcelain)" ] || die "working tree is dirty"
git fetch origin main --tags
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] \
  || die "main is not in sync with origin/main"

npm test
npm run build
if ! git diff --quiet -- dist; then
  git add dist
  git commit -m "Rebuild dist for release"
fi

# npm version: bumps package.json, commits "vX.Y.Z", tags vX.Y.Z.
npm version "$bump" -m "Release v%s"
git push origin main --follow-tags

echo "release: pushed $(git describe --tags --exact-match)." \
  "CI will create the GitHub release."
```

Run: `chmod +x scripts/release.sh`

- [ ] **Step 2: Add the npm script**

Run: `npm pkg set scripts.release="scripts/release.sh"`

- [ ] **Step 3: Test the failure paths (do NOT run a real release)**

```bash
npm run release 2>&1 | tail -1          # no bump argument
npm run release -- bogus 2>&1 | tail -1 # bad bump argument
git checkout -b release-script-test
npm run release -- patch 2>&1 | tail -1 # wrong branch
git checkout main && git branch -D release-script-test
```

Expected: each prints a `release: ...` error (usage / usage / "must be on main") and exits non-zero. No tag is created (`git tag` output unchanged).

- [ ] **Step 4: Commit**

```bash
git add scripts/release.sh package.json
git commit -m "Add npm run release script (bump, tag, push)"
```

---

### Task 5: GitHub Actions workflows

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`

**Interfaces:**
- Consumes: the `v*` tags pushed by `scripts/release.sh` (Task 4); the committed-dist convention.
- Produces: a GitHub release with auto-generated notes for every pushed `v*` tag; test runs on every push/PR to main.

- [ ] **Step 1: Write `ci.yml`**

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
```

- [ ] **Step 2: Write `release.yml`**

Create `.github/workflows/release.yml`:

```yaml
name: Release
on:
  push:
    tags: ["v*"]
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - name: Verify committed dist matches a fresh build
        run: |
          npm run build
          git diff --exit-code -- dist \
            || { echo "::error::committed dist/ is stale; run npm run build and commit" ; exit 1; }
      - name: Create GitHub release
        run: gh release create "$GITHUB_REF_NAME" --generate-notes
        env:
          GH_TOKEN: ${{ github.token }}
```

(The dist-freshness check is unaffected by the `prepare` stamp: `dist/version-stamp.json` is gitignored, and `git diff` only reports tracked files.)

- [ ] **Step 3: Validate syntax locally**

Run: `node -e "const y=require('yaml'); for (const f of ['.github/workflows/ci.yml','.github/workflows/release.yml']) y.parse(require('fs').readFileSync(f,'utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit and push, verify CI runs**

```bash
git add .github
git commit -m "Add CI and tag-driven release workflows"
git push origin main
```

Run: `gh run watch --exit-status` (or `gh run list --limit 1` and check status)
Expected: the CI workflow completes successfully.

---

### Task 6: Documentation and first scripted release

**Files:**
- Modify: `README.md` (add a Releasing section and document `--version`)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Document in README**

Add `-V, --version` to the README's options list (match the HELP wording: `show version and exit`), and append a section:

```markdown
## Releasing

Releases are cut from `main` with:

    npm run release -- <patch|minor|major>

The script verifies a clean, up-to-date `main`, runs the tests,
rebuilds `dist/` (committing it if changed), bumps `package.json`,
tags `vX.Y.Z`, and pushes. GitHub Actions then creates the GitHub
release with auto-generated notes.

`mdsec --version` reports `git describe` output when run from a
checkout, the exact revision stamped at install time (pre-commit /
npm-from-git installs), or `v` + the package.json version as a last
resort.
```

- [ ] **Step 2: Commit and push**

```bash
git add README.md
git commit -m "Document --version and the release process"
git push origin main
```

- [ ] **Step 3: Cut the first scripted release (with user approval)**

CHECKPOINT: ask the user before running. Then:

Run: `npm run release -- minor`
Expected: pushes `v0.4.0`; then `gh run watch --exit-status` shows the Release workflow succeeding and `gh release view v0.4.0` shows the new release with generated notes.

- [ ] **Step 4: Verify --version end to end**

```bash
git pull --tags
npm run mdsec -- --version
```

Expected: `mdsec v0.4.0` (checkout exactly at the tag → bare tag, no suffix).
