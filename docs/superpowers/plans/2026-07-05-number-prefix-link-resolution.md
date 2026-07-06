# Number-Prefix Link Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a heading's title changes but its written number doesn't, mdsec resolves dangling internal links by matching the link fragment's number prefix against the number currently written in each heading, and rewrites them to the new anchor.

**Architecture:** One new resolution step inside `resolve()` in `src/links.ts`, ordered after the exact-anchor and bare-title matches and before the Dice-similarity fallback. The section's "old number" is parsed from `Section.oldText` with the existing `parsePrefix()` from `src/number.ts`; the fragment's number token is captured by the same regex that already strips number prefixes for the bare-title match.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), vitest. Run tests with `npx vitest run` from the repo root.

**Spec:** `docs/superpowers/specs/2026-07-05-number-prefix-link-resolution-design.md`

## Global Constraints

- Resolution order in `resolve()`: exact old-anchor → bare-title slug → **number-prefix (new)** → Dice similarity → unresolved warning.
- Ambiguity (two sections sharing the fragment's old number) warns `ambiguous internal link "#…"; left unchanged` and does not resolve.
- Success warning text: `matched "#<frag>" -> "<bareTitle>" by section number`.
- Fragments with no number token skip the new step entirely (existing behavior preserved, including the "lone leading article letter" case).
- Idempotency: running mdsec twice must equal running it once (fixtures suite enforces this).

---

### Task 1: Number-prefix resolution in `resolve()`

**Files:**
- Modify: `src/links.ts` (module-level regex near line 7; `resolve()` at lines 98–139)
- Test: `test/links.test.ts`

**Interfaces:**
- Consumes: `parsePrefix(title: string): { path: string[]; rest: string; isAppendixForm: boolean } | null` from `src/number.ts`; `Section.oldText` from `src/model.ts`.
- Produces: no new exports; `resolve()` behavior change only.

- [ ] **Step 1: Write the failing tests**

Append a new `describe` block to `test/links.test.ts`:

```ts
describe("number-prefix link resolution (renamed headings)", () => {
  it("resolves a link to a renamed heading via its unchanged number", () => {
    const src =
      "# T\n\n## 1. Alpha\n\n## 2. Message Format\n\nSee [section 2](#2-common-message-envelope).\n";
    const r = runDocument(src, {});
    expect(r.output).toBe(
      "# T\n\n## 1. Alpha\n\n## 2. Message Format\n\nSee [section 2](#2-message-format).\n",
    );
    expect(r.warnings.some((w) => /by section number/.test(w))).toBe(true);
  });
  it("resolves via the old number even when the same run renumbers the section", () => {
    const src =
      "# T\n\n## 1. Alpha\n\n## New Thing\n\n## 2. Message Format\n\nSee [section 2](#2-common-message-envelope).\n";
    const r = runDocument(src, {});
    expect(r.output).toBe(
      "# T\n\n## 1. Alpha\n\n## 2. New Thing\n\n## 3. Message Format\n\nSee [section 3](#3-message-format).\n",
    );
  });
  it("warns and leaves the link when two headings share the old number", () => {
    const src = "# T\n\n## 2. Foo\n\n## 2. Bar\n\n[x](#2-baz)\n";
    const r = runDocument(src, {});
    expect(r.output).toContain("(#2-baz)");
    expect(r.warnings.some((w) => /ambiguous/i.test(w))).toBe(true);
  });
  it("resolves lettered appendix sub-section fragments", () => {
    const src =
      "# T\n\n## Appendix B. Backups\n\n### B.1 Data Restore\n\n[B.1](#b1-restore)\n";
    const r = runDocument(src, {});
    expect(r.output).toContain("[A.1](#a1-data-restore)");
  });
  it("resolves top-level appendix fragments", () => {
    const src = "# T\n\n## Appendix B. Storage\n\n[x](#appendix-b-backups)\n";
    const r = runDocument(src, {});
    expect(r.output).toContain("(#appendix-a-storage)");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/links.test.ts`
Expected: the 5 new tests FAIL (links left unchanged / `unresolved internal link` warnings); all pre-existing tests PASS.

- [ ] **Step 3: Implement the resolution step**

In `src/links.ts`, add the import (top of file):

```ts
import { formatNumber, parsePrefix } from "./number.js";
```

(replacing the existing `import { formatNumber } from "./number.js";`)

Add at module level, replacing nothing (place near `DEFAULT_TEXT_RE`):

```ts
// Leading section-number token in an anchor fragment: "5-", "31-" (from
// "3.1"), "b1-" (from "B.1"), "appendix-b-". Same shapes the bare-title
// strip below recognizes; group 1 is the token without its trailing "-".
const NUMBER_TOKEN_RE =
  /^(appendix-[a-z]+|(?:[a-z]+(?=\d)|\d+)[a-z0-9]*(?:-\d+)*)-/;

// The number currently written in a section's heading, in anchor-slug form
// ("3.1 Foo" -> "31", "Appendix B. X" -> "appendix-b"), or null if the
// heading carries no number.
function oldNumberSlug(s: Section): string | null {
  const p = parsePrefix(s.oldText);
  if (!p) return null;
  const joined = p.path.join("").toLowerCase();
  return p.isAppendixForm ? `appendix-${joined}` : joined;
}
```

In `resolve()`, replace the `stripped` computation (currently
`const stripped = frag.replace(/^(?:appendix-[a-z]+-|(?:[a-z]+(?=\d)|\d+)[a-z0-9]*(?:-\d+)*-)/, "");`)
with:

```ts
  const tokenMatch = frag.match(NUMBER_TOKEN_RE);
  const stripped = tokenMatch ? frag.slice(tokenMatch[0].length) : frag;
```

Then insert the new step between the bare-title block (ends with the
`if (titleMatches.length > 1)` return) and the `// 3) similarity` block,
renumbering that comment to `// 4)`:

```ts
  // 3) number-prefix match: trust the number currently written in a heading
  // when the title was renamed out from under the link.
  if (tokenMatch) {
    const token = tokenMatch[1].startsWith("appendix-")
      ? tokenMatch[1]
      : tokenMatch[1].replace(/-/g, "");
    const numberMatches = candidates.filter((s) => oldNumberSlug(s) === token);
    if (numberMatches.length === 1) {
      warnings.push(
        `matched "#${frag}" -> "${numberMatches[0].bareTitle}" by section number`,
      );
      return numberMatches[0];
    }
    if (numberMatches.length > 1) {
      warnings.push(`ambiguous internal link "#${frag}"; left unchanged`);
      return null;
    }
  }
```

- [ ] **Step 4: Run the links tests**

Run: `npx vitest run test/links.test.ts`
Expected: the 5 new tests PASS. One pre-existing test FAILS:
`fuzzy link resolution > resolves when heading title was edited slightly` —
fragment `#1-alpha-setting` now resolves by section number (step 3) before
the Dice fallback (step 4), so the warning is no longer `fuzzy-matched`.
The resolution target and output are unchanged; only the warning text moved.

- [ ] **Step 5: Update that test's warning expectation**

In `test/links.test.ts`, in `"resolves when heading title was edited slightly"`, change:

```ts
    expect(r.warnings.some((w) => /fuzzy/i.test(w))).toBe(true);
```

to:

```ts
    expect(r.warnings.some((w) => /by section number/.test(w))).toBe(true);
```

- [ ] **Step 6: Run the full suite (includes idempotency fixtures)**

Run: `npx vitest run`
Expected: all tests PASS. If a fixture test fails because a fixture document
contains a numbered dangling link that now resolves, inspect the fixture —
the new resolution is the intended behavior, so update the fixture's expected
output to match, not the code.

- [ ] **Step 7: Commit**

```bash
git add src/links.ts test/links.test.ts
git commit -m "Resolve links to renamed headings via their section number"
```

---

### Task 2: Document the behavior in the README

**Files:**
- Modify: `README.md` (the "What it does" bullet list, lines 8–16)

**Interfaces:**
- Consumes: behavior implemented in Task 1.
- Produces: documentation only.

- [ ] **Step 1: Update the link-rewriting bullet**

In `README.md`, change:

```markdown
- Rewrites internal links whose fragment or text refers to a renumbered
  section — both exact anchor matches and "fuzzy" text like `[section 3.1]`
  or `[§3]`.
```

to:

```markdown
- Rewrites internal links whose fragment or text refers to a renumbered
  section — both exact anchor matches and "fuzzy" text like `[section 3.1]`
  or `[§3]`. Links broken by retitling a heading are repaired via the
  section number: if you rename "5. Common Message Envelope" to
  "5. Message Format", links to `#5-common-message-envelope` are rewritten
  to the section's new anchor (with a warning; ambiguous duplicate numbers
  are left unchanged).
```

- [ ] **Step 2: Sanity-check the claim against the implementation**

Run: `printf '# T\n\n## 1. Alpha\n\n## 2. Message Format\n\n[section 2](#2-common-message-envelope)\n' > /tmp/mdsec-demo.md && npm run --silent mdsec -- /tmp/mdsec-demo.md; rm /tmp/mdsec-demo.md`
Expected: output contains `[section 2](#2-message-format)` and a stderr
warning containing `by section number`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document renamed-heading link repair in README"
```
