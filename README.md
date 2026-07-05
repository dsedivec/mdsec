# mdsec

Renumber Markdown section headings (`1.`, `1.1`, `Appendix A.`, ...), keep internal
links and a table of contents in sync as you reorder or edit.

## What it does

- Numbers headings within a chosen level range (`1.`, `1.1`, `1.1.1`, ...).
- Detects and letters "Appendix" sections separately (`Appendix A.`, `A.1`, ...).
- Rewrites internal links whose fragment or text refers to a renumbered
  section — both exact anchor matches and "fuzzy" text like `[section 3.1]`
  or `[§3]`.
- Regenerates a table of contents between `<!-- toc -->` / `<!-- /toc -->`
  markers.
- Leaves headings inside blockquotes and code blocks untouched.
- Is idempotent: running it twice produces the same output as running it once.

## Install

```sh
npm install && npm run build
```

## Usage

```sh
# print renumbered document to stdout
npm run mdsec -- doc.md

# rewrite the file in place
npm run mdsec -- -w doc.md

# CI / pre-commit: fail if the file would change, without writing
npm run mdsec -- --check doc.md
```

Example pre-commit hook:

```sh
npm run mdsec -- --check "$file" || {
  echo "run: mdsec -w $file"
  exit 1
}
```

Other flags: `--min-level N` (default: inferred — level 1 if the document has
a title in front matter or more than one H1, else level 2), `--max-level N`
(default: 6), `--number-style none|top|all` (trailing periods: `18.1` /
`18.` with `18.1` / `18.1.`; default `top`), `--toc-depth N`,
`--link-text-pattern REGEX` (capture group 1 =
the number in custom link text), `--strict` (with `--check`, also fail on
warnings), `-v` verbose warnings.

## Config file

An `.mdsec.json` file (searched upward from the target file's directory) can
set defaults for any of `minLevel`, `maxLevel`, `numberStyle`, `tocDepth`,
`tocTitle`, `linkTextPattern`;
CLI flags override it.

## Title inference and appendices

The numbered range starts at H1 when the document has YAML front matter with
a `title` key, or more than one top-level H1 (treating the H1s as untitled
sections); otherwise it starts at H2, treating a single H1 as the document
title. A top-level heading starting with "Appendix" switches into appendix
mode: subsequent top-level sections are lettered (`Appendix A.`, `Appendix
B.`, ...) instead of numbered, and their sub-levels use the letter (`A.1`,
`A.1.1`).

## Table of contents

Add a placeholder anywhere in the document:

```markdown
<!-- toc -->
<!-- /toc -->
```

`mdsec` replaces everything between the markers with an unnumbered "Table of
Contents" heading (at the top numbered level) followed by a nested list of
links to each numbered heading (down to `--toc-depth`, default: `maxLevel`).
Use `--toc-title TEXT` to change the heading text, or `--no-toc-title`
(config: `"tocTitle": false`) to omit it.

## pre-commit / prek hook

This repository is a [pre-commit](https://pre-commit.com)-compatible hook
source (works with [prek](https://github.com/j178/prek) too). In your
project's `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: git@github.com:dsedivec/mdsec.git
    rev: <commit-or-tag>
    hooks:
      - id: mdsec
```

The `mdsec` hook rewrites staged Markdown files in place (the commit fails
so you can restage the changes); use `id: mdsec-check` instead for a
verify-only hook that never modifies files.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
