# `--diff` Option Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `-d, --diff` to mdsec: print a unified diff of pending changes instead of applying them, exiting like `--check`.

**Architecture:** A new pure module `src/diff.ts` implements a line-level LCS unified diff (no new dependencies). `src/cli.ts` gains the flag, passes `source` and `result.output` (both already in hand in `processOne`) to the differ, and reuses the existing `--check` exit-code path. Color is decided in `cli.ts` (TTY + `NO_COLOR`), keeping `diff.ts` environment-free.

**Tech Stack:** TypeScript (ESM, `node:` builtins only), vitest.

**Spec:** `docs/superpowers/specs/2026-07-05-diff-option-design.md`

## Global Constraints

- No new npm dependencies.
- `--diff` implies check semantics: writes nothing; exit 1 if any file would change (with `--strict`, warnings also cause exit 1), else 0; usage/IO errors exit 2.
- `--diff --write` is rejected: exit 2.
- Diff headers: `--- <label>` and `+++ <label> (mdsec)`; stdin's label is `(stdin)`.
- Hunks: `@@ -<start>,<len> +<start>,<len> @@`, 3 lines of context, hunks whose context would overlap or touch are merged.
- Missing trailing newline → `\ No newline at end of file` after the affected line (GNU diff behavior).
- Color only when `process.stdout.isTTY` is truthy AND `NO_COLOR` is unset or empty: `-`/`---` red (`\x1b[31m`), `+`/`+++` green (`\x1b[32m`), `@@` cyan (`\x1b[36m`), context uncolored.
- `dist/` is committed: any `src/` change requires `npm run build` and committing `dist/` in the same commit.

---

### Task 1: Unified diff engine

**Files:**
- Create: `src/diff.ts`
- Test: `test/diff.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `unifiedDiff(oldText: string, newText: string, label: string, color: boolean): string` — returns `""` when texts are equal; otherwise a complete unified diff ending in `\n`. Task 2 calls it from the CLI.

- [ ] **Step 1: Write the failing tests**

Create `test/diff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { unifiedDiff } from "../src/diff.js";

const lines = (...ls: string[]) => ls.join("\n") + "\n";

describe("unifiedDiff", () => {
  it("returns empty string for identical inputs", () => {
    expect(unifiedDiff("a\nb\n", "a\nb\n", "f.md", false)).toBe("");
    expect(unifiedDiff("", "", "f.md", false)).toBe("");
  });

  it("emits one hunk with correct numbers for a single-line change", () => {
    const oldT = lines("l1", "l2", "l3", "l4", "l5", "l6", "l7");
    const newT = lines("l1", "l2", "l3", "L4", "l5", "l6", "l7");
    expect(unifiedDiff(oldT, newT, "doc.md", false)).toBe(
      [
        "--- doc.md",
        "+++ doc.md (mdsec)",
        "@@ -1,7 +1,7 @@",
        " l1",
        " l2",
        " l3",
        "-l4",
        "+L4",
        " l5",
        " l6",
        " l7",
        "",
      ].join("\n"),
    );
  });

  it("emits two hunks for changes far apart", () => {
    const old10 = Array.from({ length: 20 }, (_, i) => `l${i + 1}`);
    const neu = [...old10];
    neu[1] = "L2";
    neu[17] = "L18";
    const out = unifiedDiff(
      old10.join("\n") + "\n",
      neu.join("\n") + "\n",
      "doc.md",
      false,
    );
    expect(out.match(/^@@ /gm)).toHaveLength(2);
    expect(out).toContain("@@ -1,5 +1,5 @@");
    expect(out).toContain("@@ -15,6 +15,6 @@");
  });

  it("merges hunks whose context would touch", () => {
    const old10 = Array.from({ length: 12 }, (_, i) => `l${i + 1}`);
    const neu = [...old10];
    neu[2] = "L3";
    neu[8] = "L9"; // gap of 5 unchanged lines (< 2*3+1) => one hunk
    const out = unifiedDiff(
      old10.join("\n") + "\n",
      neu.join("\n") + "\n",
      "doc.md",
      false,
    );
    expect(out.match(/^@@ /gm)).toHaveLength(1);
  });

  it("truncates context at the first and last lines", () => {
    const oldT = lines("a", "b");
    const newT = lines("A", "b");
    const out = unifiedDiff(oldT, newT, "doc.md", false);
    expect(out).toContain("@@ -1,2 +1,2 @@");
    const oldT2 = lines("a", "b");
    const newT2 = lines("a", "B");
    expect(unifiedDiff(oldT2, newT2, "doc.md", false)).toContain(
      "@@ -1,2 +1,2 @@",
    );
  });

  it("handles insertions and deletions, not just replacements", () => {
    const out = unifiedDiff(lines("a", "b"), lines("a", "x", "b"), "f", false);
    expect(out).toContain("+x");
    expect(out).not.toContain("-a");
    const out2 = unifiedDiff(lines("a", "x", "b"), lines("a", "b"), "f", false);
    expect(out2).toContain("-x");
  });

  it("marks a missing trailing newline on the old side", () => {
    const out = unifiedDiff("a\nb", "a\nB\n", "f", false);
    expect(out).toContain("-b\n\\ No newline at end of file\n");
    expect(out).toContain("+B\n");
  });

  it("marks a missing trailing newline on the new side", () => {
    const out = unifiedDiff("a\nb\n", "a\nb", "f", false);
    expect(out).toContain("-b\n");
    expect(out).toContain("+b\n\\ No newline at end of file\n");
  });

  it("colors -/+/@@ lines when color is true and none when false", () => {
    const oldT = lines("a", "b");
    const newT = lines("a", "B");
    const colored = unifiedDiff(oldT, newT, "f", true);
    expect(colored).toContain("\x1b[31m-b\x1b[0m");
    expect(colored).toContain("\x1b[32m+B\x1b[0m");
    expect(colored).toContain("\x1b[36m@@ -1,2 +1,2 @@\x1b[0m");
    expect(colored).toContain("\x1b[31m--- f\x1b[0m");
    expect(colored).toContain("\x1b[32m+++ f (mdsec)\x1b[0m");
    expect(unifiedDiff(oldT, newT, "f", false)).not.toContain("\x1b[");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/diff.test.ts`
Expected: FAIL — cannot resolve `../src/diff.js`.

- [ ] **Step 3: Implement `src/diff.ts`**

```ts
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const CONTEXT = 3;
// Sentinel appended to a final line that lacks a trailing newline, so
// "a" vs "a\n" compare unequal and we know where to print the marker.
const NO_EOL = "\x00";

interface Op {
  tag: " " | "-" | "+";
  text: string;
}

function toLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  else lines[lines.length - 1] += NO_EOL;
  return lines;
}

// Ops for the whole file pair: common prefix/suffix are trimmed first so
// the O(n*m) LCS table only covers the changed middle.
function diffOps(a: string[], b: string[]): Op[] {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (
    suf < a.length - pre &&
    suf < b.length - pre &&
    a[a.length - 1 - suf] === b[b.length - 1 - suf]
  )
    suf++;
  const am = a.slice(pre, a.length - suf);
  const bm = b.slice(pre, b.length - suf);

  const n = am.length;
  const m = bm.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        am[i] === bm[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: Op[] = [];
  for (let k = 0; k < pre; k++) ops.push({ tag: " ", text: a[k] });
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (am[i] === bm[j]) {
      ops.push({ tag: " ", text: am[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ tag: "-", text: am[i++] });
    } else {
      ops.push({ tag: "+", text: bm[j++] });
    }
  }
  while (i < n) ops.push({ tag: "-", text: am[i++] });
  while (j < m) ops.push({ tag: "+", text: bm[j++] });
  for (let k = a.length - suf; k < a.length; k++)
    ops.push({ tag: " ", text: a[k] });
  return ops;
}

export function unifiedDiff(
  oldText: string,
  newText: string,
  label: string,
  color: boolean,
): string {
  if (oldText === newText) return "";
  const ops = diffOps(toLines(oldText), toLines(newText));

  // Group changed op indices into hunks; a gap of unchanged lines wider
  // than 2*CONTEXT separates hunks (narrower means contexts overlap or
  // touch, so the hunks merge).
  const changed: number[] = [];
  ops.forEach((op, idx) => {
    if (op.tag !== " ") changed.push(idx);
  });
  const groups: { from: number; to: number }[] = [];
  for (const c of changed) {
    const last = groups[groups.length - 1];
    if (last && c - last.to <= 2 * CONTEXT) last.to = c;
    else groups.push({ from: c, to: c });
  }

  const paint = (code: string, line: string) =>
    color ? `${code}${line}${RESET}` : line;
  const out: string[] = [
    paint(RED, `--- ${label}`),
    paint(GREEN, `+++ ${label} (mdsec)`),
  ];

  // Line numbers each op starts at (1-based; "-"/" " advance old,
  // "+"/" " advance new).
  const oldLineAt: number[] = [];
  const newLineAt: number[] = [];
  let ol = 1;
  let nl = 1;
  for (const op of ops) {
    oldLineAt.push(ol);
    newLineAt.push(nl);
    if (op.tag !== "+") ol++;
    if (op.tag !== "-") nl++;
  }

  for (const g of groups) {
    const from = Math.max(0, g.from - CONTEXT);
    const to = Math.min(ops.length - 1, g.to + CONTEXT);
    let oldLen = 0;
    let newLen = 0;
    for (let k = from; k <= to; k++) {
      if (ops[k].tag !== "+") oldLen++;
      if (ops[k].tag !== "-") newLen++;
    }
    out.push(
      paint(
        CYAN,
        `@@ -${oldLineAt[from]},${oldLen} +${newLineAt[from]},${newLen} @@`,
      ),
    );
    for (let k = from; k <= to; k++) {
      const op = ops[k];
      const noEol = op.text.endsWith(NO_EOL);
      const text = noEol ? op.text.slice(0, -1) : op.text;
      const line = `${op.tag}${text}`;
      if (op.tag === "-") out.push(paint(RED, line));
      else if (op.tag === "+") out.push(paint(GREEN, line));
      else out.push(line);
      if (noEol) out.push("\\ No newline at end of file");
    }
  }
  return out.join("\n") + "\n";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/diff.test.ts`
Expected: all 9 tests PASS.

- [ ] **Step 5: Run the full suite, then commit**

Run: `npm test`
Expected: PASS (94 existing + 9 new).

```bash
git add src/diff.ts test/diff.test.ts
git commit -m "Add dependency-free unified diff engine"
```

(Do not rebuild dist in this commit; Task 2 rebuilds once when the CLI
starts importing this module.)

---

### Task 2: CLI `-d, --diff` flag, docs, dist

**Files:**
- Modify: `src/cli.ts` (HELP ~line 13-27, `cliOptions` ~line 92-106, validation after parse ~line 124-127, `processOne` ~line 155-184, final exit ~line 192-194)
- Modify: `README.md` (options list; `--check` description)
- Modify: `dist/*` (rebuild)
- Test: `test/cli.test.ts` (append tests)

**Interfaces:**
- Consumes: `unifiedDiff(oldText: string, newText: string, label: string, color: boolean): string` from `src/diff.ts` (Task 1).
- Produces: user-facing `-d, --diff` behavior; nothing downstream.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe("cli", ...)` block in `test/cli.test.ts`:

```ts
  it("--diff prints a unified diff and exits 1 when changes are pending", () => {
    for (const flag of ["--diff", "-d"]) {
      const r = run([flag], "# T\n\n## Alpha\n");
      expect(r.status).toBe(1);
      expect(r.stdout).toContain("--- (stdin)");
      expect(r.stdout).toContain("+++ (stdin) (mdsec)");
      expect(r.stdout).toContain("-## Alpha");
      expect(r.stdout).toContain("+## 1. Alpha");
      expect(r.stdout).toMatch(/^@@ /m);
      expect(r.stdout).not.toContain("\x1b[");
    }
  });

  it("--diff exits 0 with empty stdout when nothing would change", () => {
    const r = run(["--diff"], "# T\n\n## 1. Alpha\n");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });

  it("--diff with multiple files shows only the dirty file's diff", () => {
    const dir = mkdtempSync(join(tmpdir(), "mdsec-"));
    const a = join(dir, "a.md");
    const b = join(dir, "b.md");
    writeFileSync(a, "# T\n\n## 1. Alpha\n");
    writeFileSync(b, "# T\n\n## Beta\n");
    const r = run(["--diff", a, b]);
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain(`--- ${a}`);
    expect(r.stdout).toContain(`--- ${b}`);
    expect(readFileSync(b, "utf8")).toBe("# T\n\n## Beta\n"); // untouched
  });

  it("--diff --write is rejected with exit 2", () => {
    const dir = mkdtempSync(join(tmpdir(), "mdsec-"));
    const f = join(dir, "doc.md");
    writeFileSync(f, "# T\n\n## Alpha\n");
    const r = run(["--diff", "--write", f]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--diff.*--write|--write.*--diff/);
  });

  it("--check --diff still prints the diff", () => {
    const r = run(["--check", "--diff"], "# T\n\n## Alpha\n");
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("-## Alpha");
  });

  it("--diff --strict exits 1 on warnings even without changes", () => {
    const r = run(["--diff", "--strict"], "# T\n\n## 1. Alpha\n\n[x](#zzzz-qqqq)\n");
    expect(r.status).toBe(1);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/cli.test.ts -t "--diff"`
Expected: FAIL — exit status 2 (unknown option `--diff`).

- [ ] **Step 3: Implement the flag**

In `src/cli.ts`:

Add to imports:

```ts
import { unifiedDiff } from "./diff.js";
```

Add to `cliOptions` (after the `strict` entry):

```ts
  diff: { type: "boolean", short: "d" },
```

Add to HELP, after the `--strict` line:

```
  -d, --diff                print a unified diff of pending changes;
                            exits like --check
```

After the existing `if (values.write && files.length === 0)` validation:

```ts
if (values.diff && values.write) fail("--diff cannot be combined with --write");
```

Change the multiple-files validation to accept `--diff`:

```ts
if (files.length > 1 && !values.write && !values.check && !values.diff)
  fail("multiple FILE arguments require --write, --check, or --diff");
```

(Also update the HELP line "Multiple FILEs are allowed with --write or
--check." to "Multiple FILEs are allowed with --write, --check, or
--diff.")

Compute the color decision once, near the top of the file (after
`fail`):

```ts
const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
```

In `processOne`, replace the final output block:

```ts
  if (values.diff) {
    // Before the --check return so "--check --diff" still prints the diff.
    if (result.changed) {
      process.stdout.write(
        unifiedDiff(source, result.output, file ?? "(stdin)", useColor),
      );
    }
    return;
  }
  if (values.check) return;
  if (values.write) {
    if (result.changed) writeFileSync(file!, result.output);
  } else {
    process.stdout.write(result.output);
  }
```

Change the final exit logic to treat `--diff` like `--check`:

```ts
if (values.check || values.diff) {
  process.exit(anyChanged || (values.strict && anyWarned) ? 1 : 0);
}
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests PASS (including Task 1's and the 6 new CLI tests).

- [ ] **Step 5: Sanity-check color by hand**

Run: `printf '# T\n\n## Alpha\n' | npm run mdsec --silent -- --diff | cat -v | head -5`
Expected: no `^[` escapes (piped output is uncolored). This is the
inverse case (TTY coloring) of the test suite's non-TTY assertion; full
TTY verification isn't scriptable here, so eyeball `--diff` in your own
terminal after landing if you want to see the colors.

- [ ] **Step 6: Update README**

In `README.md`: add to the options list, after `--strict` (match the
list's existing formatting):

```markdown
- `-d`, `--diff` (print a unified diff of pending changes; exits like `--check`)
```

Extend the `--check` option's description with: "use `--diff` to see
the pending changes."

- [ ] **Step 7: Rebuild dist and commit**

```bash
npm run build
git add src/cli.ts test/cli.test.ts README.md dist
git commit -m "Add -d/--diff flag showing pending changes as a unified diff"
```
