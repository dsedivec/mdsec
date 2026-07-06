# `--diff` option design

Date: 2026-07-05
Status: approved

## Goal

Add `-d, --diff` to mdsec: print a unified diff of the changes mdsec
would make, without writing anything. Motivation: `--check` exits 0/1
with no output, so there is no way to see *what* would change.

## 1. CLI semantics

- New boolean flag `-d, --diff`.
- `--diff` implies check semantics: no files are written, and the
  process exit code is exactly `--check`'s (1 if any file would
  change, 0 otherwise, 2 on usage/IO errors; `--strict` makes
  warnings also produce exit 1).
- stdout carries a unified diff per changed file, concatenated in
  argument order. Unchanged files produce no output.
- Valid: `--diff` with FILE(s) or stdin; with `--check` (redundant,
  harmless); with `--strict`; with multiple FILEs (multi-file already
  allowed for `--check`; `--diff` alone with multiple FILEs is also
  allowed).
- `--diff --write` is rejected with the usual exit-2 usage error.
- Stdin input is labeled `(stdin)` in diff headers.
- Warnings and `--verbose` edit reports go to stderr, unchanged.

## 2. Diff engine

New module `src/diff.ts`, no new dependencies:

```ts
export function unifiedDiff(
  oldText: string,
  newText: string,
  label: string,
  color: boolean,
): string;
```

- Returns `""` when the texts are equal.
- Line-level Myers/LCS diff (~70 lines).
- Standard unified format:
  - Headers: `--- <label>` and `+++ <label> (mdsec)`.
  - Hunks: `@@ -<start>,<len> +<start>,<len> @@` with 3 lines of
    context; hunks whose context would overlap or touch are merged.
  - A file lacking a trailing newline gets
    `\ No newline at end of file` after the affected line, matching
    GNU diff.
- Rationale for in-house over alternatives: the `diff` npm package
  adds supply-chain surface for one narrow need; shelling out to
  `diff`/`git diff --no-index` adds an external binary dependency.
  The input is always two versions of the same modest Markdown file,
  so a simple line-level LCS is sufficient.

## 3. Color

- When `color` is true: ANSI SGR coloring — deletions (`-` lines and
  the `---` header) red, additions (`+` lines and `+++`) green, hunk
  headers (`@@`) cyan, context lines uncolored.
- `cli.ts` decides the flag: color iff `process.stdout.isTTY` is
  truthy AND the `NO_COLOR` environment variable is unset or empty.
  `diff.ts` itself is pure (no environment access), keeping it
  testable.

## 4. CLI wiring

In `src/cli.ts`:

- Add `diff: { type: "boolean", short: "d" }` to `cliOptions`; add
  `-d, --diff` to HELP: "print a unified diff of pending changes;
  exits like --check".
- Reject `--diff --write` (exit 2).
- In `processOne`: when `values.diff` and `result.changed`, write
  `unifiedDiff(source, result.output, file ?? "(stdin)", useColor)`
  to stdout. Existing `anyChanged`/`anyWarned` bookkeeping is shared.
- Final exit logic treats `values.diff` like `values.check`.
- `dist/` rebuilt and committed (pre-commit consumers).

## 5. Error handling

- Unreadable file, bad flags: existing exit-2 paths, unchanged.
- `unifiedDiff` is pure and total for string inputs; no error paths.

## 6. Testing

Unit tests (`test/diff.test.ts`):
- identical inputs → `""`;
- single-line change → one hunk with correct `@@` numbers;
- two changes far apart → two hunks;
- changes at the first and at the last line (context truncation);
- nearby changes → merged into one hunk;
- missing trailing newline on either side → `\ No newline at end of
  file` marker;
- `color: true` wraps `-`/`+`/`@@` lines in the expected SGR codes;
  `color: false` output contains no escape bytes.

CLI tests (`test/cli.test.ts`):
- `--diff` on a dirty file: exit 1, stdout contains `--- `/`+++ `/
  `@@` and the expected `-`/`+` lines;
- `--diff` on a clean file: exit 0, empty stdout;
- `--diff` with two files where one is dirty: exit 1, only the dirty
  file's diff appears;
- `--diff --write`: exit 2 with a usage error on stderr;
- piped output (the test harness is never a TTY) contains no ANSI
  escapes;
- `-d` short form works.

## 7. Documentation

- README options list gains `-d, --diff`.
- README `--check` description gains a pointer: "use `--diff` to see
  the pending changes."
