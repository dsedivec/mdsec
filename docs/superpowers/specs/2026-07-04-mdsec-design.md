# mdsec — Markdown section numbering, link, and TOC updater

**Status:** Approved design (brainstormed 2026-07-04)

## Problem

Maintaining section numbers in Markdown by hand is error-prone: rearranging sections breaks the numbering, breaks internal links (GitHub Flavored Markdown derives heading anchors from the full heading text, number included), and stales any table of contents. GitHub does not support explicit anchors on headings, so short numbered references ("see section 2.3") must track the auto-generated anchors.

`mdsec` renumbers headings, rewrites internal links and numbered link text, and regenerates a marker-delimited TOC — **without reformatting any other part of the document**.

## Non-goals

- Any reformatting or normalization of Markdown outside the edited spans.
- Numbering or altering headings inside code blocks (not headings) or blockquotes (quoted content).
- Supporting non-GFM anchor schemes in v1.

## Approach

Node + TypeScript CLI. Parse with `unified` + `remark-parse` + `remark-gfm` + `remark-frontmatter` (YAML); the mdast tree is used read-only for its byte-offset positions. The document is never serialized from the AST — edits are collected as `{start, end, replacement}` spans and spliced into the original text in descending-offset order. Anchors are computed with `github-slugger` to match GitHub exactly, including duplicate `-1`/`-2` suffixes.

### Pipeline

1. **Parse** source → mdast.
2. **Section model.** Walk headings in the configured level range (default H2–H6). Per heading: current number prefix (`^(\d+(\.\d+)*)\.?\s+`), bare title, old anchor (slugger run over headings in document order), new hierarchical number from document order.
3. **Plan edits:**
   - **Headings:** insert/update number prefix only; title text untouched. Setext headings supported.
   - **Internal links** (`#frag` in inline links/images and link-reference definitions): resolve fragment → heading by exact old-anchor match, then fuzzy fallback (bare-title slug match, then title similarity above a threshold). Unresolvable or ambiguous links produce a stderr warning and are left unchanged. Resolved links get the fragment rewritten to the new anchor.
   - **Link text:** if it matches the numbered-reference pattern (default covers `section 2.3`, `§2.3`, and leading `2.3 …`; overridable regex), the number is updated to the target's new number. Plain-title link text is left alone.
   - **TOC:** content between `<!-- toc -->` and `<!-- /toc -->` is regenerated as a nested bulleted list of numbered links (configurable depth). No markers → no TOC.
4. **Apply edits**; write stdout (default) or in place (`--write`).

### Blockquote rule

Headings inside blockquotes are never modified, never numbered, excluded from the TOC, and not link-rewrite targets — but they **are** fed to the slugger, because GitHub renders them as real headings with anchors, so duplicate-slug suffixes of real headings must account for them.

### Title inference (default min level)

Unless `--min-level` is given explicitly, the minimum numbering level is inferred:

- YAML front matter with a `title:` attribute → the title lives in front matter, so **all H1s are numbered** top-level sections (min level 1).
- No front-matter title, but **multiple H1s** → no single plausible document title; H1s are numbered (min level 1).
- No front-matter title and exactly **one H1** → it is the document title; numbering starts at H2 (min level 2).

### Numbering rules

- Hierarchical dotted numbers, configurable min/max heading level (default: inferred min level, see above; max 6).
- Numbers restart when levels pop (…2.3.1 → 3.).
- Skipped levels (H2 → H4) number as if the missing level had one implicit entry; a warning is emitted.
- **Idempotence invariant:** running the tool on its own output is a no-op.

### Appendices

- A top-level section (at the inferred min level) whose title begins with the word `Appendix` (case-insensitive) starts appendix mode: it and all subsequent top-level sections are lettered `A`, `B`, `C`… (then `AA`…), with subsections `A.1`, `A.1.1`, etc.
- Rendered as `## Appendix A. Title` at the top level (letter follows the word "Appendix"); subsections use the plain prefix form (`### A.1 Title`).
- A non-appendix-titled top-level section appearing after an appendix is still lettered, with a warning (appendices are expected to come last).
- The number-prefix regex accepts lettered components (`^([A-Z]+(\.\d+)*)\.?\s+` and the `Appendix X.` form) so re-runs strip and recompute correctly; link-fragment and link-text rewriting (`section A.2`, `§A.1.3`, leading `A.1 …`) work identically to numeric sections.

## CLI

```
mdsec [options] [FILE]
```

- No FILE or `-`: stdin → stdout filter. With FILE: stdout unless `--write`/`-w` (in place).
- `--min-level N`, `--max-level N` — numbering range (default: min inferred from front-matter title / H1 count, max 6).
- `--toc-depth N` — TOC depth (default: numbering range).
- `--link-text-pattern REGEX` — override numbered-reference pattern.
- `--check` — exit nonzero if changes would be made; writes nothing.
- `--strict` — warnings also fail `--check`.
- `--verbose` — report each edit and fuzzy resolution.
- Optional `.mdsec.json` discovered upward from the file's directory; flags win.

## Testing

- Vitest fixture pairs (`test/fixtures/<case>/input.md` → `expected.md`): initial numbering, renumber after move, anchor rewrite, link-text rewrite variants, fuzzy matching, TOC generate/update, code-block safety, setext headings, duplicate slugs, blockquote exclusion + slug dedup, title inference (front-matter title, single H1, multiple H1s), appendices (lettering, `Appendix A.` rendering, links into appendices, re-run idempotence).
- Idempotence property test across all fixtures.
- Slug tests cross-checked against GitHub's actual behavior for tricky titles (punctuation, emoji, duplicates).
