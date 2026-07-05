# Number-prefix internal link resolution

Date: 2026-07-05
Status: approved

## Problem

When a heading's title changes but its written number does not (e.g.
"5. Common Message Envelope" → "5. Message Format"), internal links to the
old anchor (`#5-common-message-envelope`) no longer resolve. mdsec currently
reports `unresolved internal link` and leaves them broken. Neither the
bare-title slug match nor the Dice-similarity fallback can bridge a full
title rename — the information isn't in the text.

## Insight

The heading text itself records history: until mdsec renumbers, each heading
still carries the number it had when the links were written. A link
fragment's leading number token can therefore be matched against the number
*currently written* in each heading (the section's old number), even when
the same run is about to renumber that section. This holds as long as mdsec
runs between editing sessions, which the pre-commit hook enforces.

## Design

A new resolution step inside `resolve()` in `src/links.ts`. Resolution
order becomes:

1. Exact old-anchor match (unchanged)
2. Bare-title slug match (unchanged)
3. **New: number-prefix match**
4. Dice-similarity fallback (unchanged)
5. `unresolved internal link` warning (unchanged)

### Number-prefix match

- Parse a leading number/letter token from the fragment: `5-…`, `3-1-…`,
  `appendix-b-…`, `b-2-…` — the same shapes the existing `stripped` regex
  recognizes. Derive both the token and the stripped remainder from one
  shared parse.
- Compare the token against each candidate section's *old* number (the
  number currently written in its heading, already in the model). Candidates
  exclude blockquoted sections, as elsewhere.
- Exactly one match → resolve to that section. The existing rewrite
  machinery emits its *new* anchor and updates numbered link text.
- More than one match (hand-typed duplicate number) → warn
  `ambiguous internal link "#…"; left unchanged`.
- No number token in the fragment → skip this step; fall through to fuzzy
  matching as today.

### Warnings and strict mode

When the rule fires, emit a warning styled like the existing fuzzy one:

    matched "#5-common-message-envelope" -> "5. Message Format" by section number

Existing behavior already covers the rest: every still-unresolved link warns,
and `--strict` turns warnings into a failing exit (`src/cli.ts`). So with
`-w` the fix is applied; with `--check --strict` CI reports that it happened.
If the fired-rule warning proves noisy it can later be gated behind `-v`.

### Edge cases

- Links in excluded ranges (TOC) and blockquoted sections keep their current
  treatment.
- Idempotent: after rewriting, the link matches exactly on the next run and
  the rule never fires.
- A fragment whose number token matches one section but whose remaining slug
  exactly matches a different section's bare title cannot reach step 3 —
  step 2 catches it first.

## Testing

New cases in `test/links.test.ts`:

- Rename with same number resolves and rewrites the anchor.
- Rename plus concurrent renumbering (section inserted before it) resolves
  via the old number and emits the new number's anchor and link text.
- Duplicate old numbers → ambiguous warning, link unchanged.
- Appendix-letter fragments (`#appendix-b-…`, `#b-2-…`).
- Fragments without a number token are unaffected.
- Idempotency via the fixtures suite.

## Rejected alternatives

- **Process of elimination + fuzzy matching:** sections legitimately have
  zero inbound links, so elimination barely narrows candidates, and a full
  title rename leaves no textual signal for fuzzy matching.
- **Git-history diffing:** most accurate for unnumbered headings, but
  couples mdsec to git, fails on stdin/untracked files, and adds complexity
  the number-prefix rule already covers for numbered headings.
- **Interactive prompting:** poor fit for batch/pre-commit use;
  warn-and-leave-unchanged remains the fallback.
