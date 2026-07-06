# Release process and `--version` design

Date: 2026-07-05
Status: approved

## Goal

Establish a normal release process for mdsec (private GitHub repo,
GitHub releases) and add `mdsec --version`, which reports the release
tag when running a released build and an exact `git describe`-style
version otherwise.

## Context

- mdsec is a TypeScript/Node CLI. Compiled `dist/` is committed
  because pre-commit installs the package from a git clone.
- Consumption modes: (a) as a pre-commit hook, (b) run directly from
  a checkout (`npm run mdsec` / tsx). No npm registry publishing.
- No git tags or CI exist yet.

## 1. Versioning scheme

Semver tags of the form `vX.Y.Z` (e.g. `v0.2.0`). The `version` field
in `package.json` is kept in lockstep with the latest tag by the
release script.

## 2. `--version` flag

Add `-V, --version` to `cli.ts`. Output format: `mdsec <version>`,
where `<version>` always carries a leading `v`.

Resolution order:

1. **Live git describe.** Walk up from the CLI's own installed
   directory (not the process cwd) looking for a `.git` entry. If
   found, run `git describe --tags --always --dirty` in that
   directory. At an exact tag this prints `v0.2.0`; between releases
   `v0.2.0-3-ga1b2c3d`; with uncommitted changes a `-dirty` suffix;
   before any tag exists, a bare commit hash.
2. **Install-time stamp.** If no `.git` is found, read a generated
   stamp file (`dist/version-stamp.json`) if present, and print the
   version recorded there.
3. **package.json fallback.** Otherwise print the package's own
   `package.json` version, prefixed with `v` (e.g. `v0.2.0`).

If step 1 or 2 yields a bare commit hash (no tags reachable), print it
as-is without a `v` prefix.

### Install-time version stamp

pre-commit clones the repo (with `.git` and tags) into its cache, then
builds the hook environment via `npm install` against that clone. npm
runs the package's `prepare` lifecycle script *in the source clone*,
where git metadata is available. We exploit this:

- A `prepare` script runs `git describe --tags --always --dirty` and
  writes the result to `dist/version-stamp.json`.
- If git is unavailable or the directory is not a git repo (e.g.
  installing from a plain tarball), the script writes nothing and
  exits 0 — resolution falls through to `package.json`.
- `dist/version-stamp.json` is gitignored; it is a build artifact of
  installation, never committed.

This means an install pinned to a non-tag commit reports the exact
rev (e.g. `v0.2.0-3-ga1b2c3d`), not a stale release number. If a
clone somehow lacks tags, `--always` degrades the output to a bare
commit hash — still distinguishable from a release.

`prepare` also runs on a plain `npm install` in the checkout; that is
harmless (it just refreshes the stamp).

## 3. Local release command

`npm run release -- <patch|minor|major>` runs a small script
(`scripts/release.sh`) that:

1. Refuses to run unless on `main`, with a clean working tree, and up
   to date with `origin/main`.
2. Runs the test suite and `npm run build`; if the committed `dist/`
   changed, commits the refreshed `dist/`.
3. Runs `npm version <bump>`, which bumps `package.json`, commits, and
   creates the `vX.Y.Z` tag in one step.
4. Pushes `main` and the new tag to origin.

The script performs no GitHub API calls; everything after the push is
CI's job.

## 4. GitHub Actions

Two workflows:

- **`.github/workflows/release.yml`** — triggered on `v*` tag push:
  checkout, `npm ci`, run tests, verify the committed `dist/` matches
  a fresh build (protects pre-commit consumers from a stale `dist/`),
  then create the GitHub release with auto-generated release notes
  (`gh release create --generate-notes` or the equivalent action).
- **`.github/workflows/ci.yml`** — run tests on pushes and PRs to
  `main`.

Private-repo GitHub Actions usage stays well within the free plan's
included minutes.

## 5. Error handling

- `--version` never fails: any error in git invocation or stamp
  reading falls through to the next resolution step.
- The release script aborts with a clear message on any precondition
  failure (wrong branch, dirty tree, behind origin, failing tests).
- The release workflow fails loudly (no release created) if tests fail
  or `dist/` is stale.

## 6. Testing

- Unit tests for the version-resolution logic: exact tag, ahead of
  tag, dirty, stamp-file path, package.json fallback, bare-hash
  formatting.
- CLI test: `mdsec --version` output matches
  `^mdsec (v\d+\.\d+\.\d+(-\d+-g[0-9a-f]+)?(-dirty)?|[0-9a-f]+(-dirty)?)$`.
- The prepare-stamp script gets a test that runs it in a temp git repo
  and asserts the stamp contents, and one that runs it outside a git
  repo and asserts no stamp and exit 0.
