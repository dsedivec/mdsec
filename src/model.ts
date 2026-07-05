import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import { toString as mdToString } from "mdast-util-to-string";
import GithubSlugger from "github-slugger";
import { parse as parseYaml } from "yaml";
import type { Root, Heading } from "mdast";
import { parsePrefix, letterFor, type NumberStyle } from "./number.js";
import { findTocRegion } from "./toc.js";

export interface Section {
  level: number;
  bareTitle: string;
  oldText: string;
  oldAnchor: string;
  newPath: string[] | null;
  isAppendix: boolean;
  inBlockquote: boolean;
  textStart: number;
  textEnd: number;
  prefixEnd: number | null;
}

export interface DocModel {
  tree: Root;
  sections: Section[];
  minLevel: number;
  maxLevel: number;
  numberStyle: NumberStyle;
  warnings: string[];
}

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ["yaml"]);

export function buildModel(
  source: string,
  opts: { minLevel?: number; maxLevel?: number; numberStyle?: NumberStyle },
): DocModel {
  const tree = processor.parse(source) as Root;
  const warnings: string[] = [];

  // Collect headings with blockquote ancestry.
  const found: { node: Heading; inBlockquote: boolean }[] = [];
  (function visit(node: any, inBq: boolean) {
    if (node.type === "heading") found.push({ node, inBlockquote: inBq });
    const bq = inBq || node.type === "blockquote";
    for (const child of node.children ?? []) visit(child, bq);
  })(tree, false);

  // Frontmatter title?
  let fmTitle = false;
  const first = tree.children[0] as any;
  if (first?.type === "yaml") {
    try {
      const data = parseYaml(first.value);
      fmTitle = data != null && typeof data === "object" && "title" in data;
    } catch {
      warnings.push("could not parse YAML front matter");
    }
  }

  const h1Count = found.filter((f) => !f.inBlockquote && f.node.depth === 1).length;
  const minLevel = opts.minLevel ?? (fmTitle || h1Count > 1 ? 1 : 2);
  const maxLevel = opts.maxLevel ?? 6;

  // Headings inside the TOC marker region (e.g. a generated "Table of
  // Contents" title) are machine-managed: they keep their anchor for
  // GitHub parity but are never numbered.
  const tocRegion = findTocRegion({ tree }, source);

  const slugger = new GithubSlugger();
  const sections: Section[] = [];
  // counters[i] is the count at level minLevel+i
  const counters: number[] = [];
  let appendixMode = false;
  let prevDepthIdx = -1;

  for (const { node, inBlockquote } of found) {
    const oldText = mdToString(node);
    const oldAnchor = slugger.slug(oldText);
    const firstChild: any = node.children[0];
    const lastChild: any = node.children[node.children.length - 1];
    const textStart = firstChild?.position?.start?.offset ?? node.position!.end.offset!;
    const textEnd = lastChild?.position?.end?.offset ?? textStart;

    const parsed = parsePrefix(oldText);
    const bareTitle = parsed ? parsed.rest : oldText;

    let newPath: string[] | null = null;
    let isAppendix = false;

    const nodeStart = node.position?.start?.offset ?? 0;
    const inTocRegion =
      tocRegion !== null && nodeStart >= tocRegion.start && nodeStart < tocRegion.end;
    const numberable =
      !inBlockquote &&
      !inTocRegion &&
      node.depth >= minLevel &&
      node.depth <= maxLevel &&
      oldText.length > 0;

    if (numberable) {
      const idx = node.depth - minLevel;
      if (prevDepthIdx >= 0 && idx > prevDepthIdx + 1) {
        warnings.push(`skipped heading level before "${bareTitle}" (H${node.depth})`);
        for (let i = prevDepthIdx + 1; i < idx; i++) counters[i] = counters[i] ?? 1;
      }
      if (idx === 0) {
        const titleSaysAppendix = /^appendix\b/i.test(bareTitle) || parsed?.isAppendixForm;
        if (titleSaysAppendix && !appendixMode) {
          appendixMode = true;
          counters[0] = 0;
        } else if (appendixMode && !titleSaysAppendix) {
          warnings.push(`non-appendix section "${bareTitle}" after appendices; lettering anyway`);
        }
        isAppendix = appendixMode;
      }
      counters[idx] = (counters[idx] ?? 0) + 1;
      counters.length = idx + 1;
      newPath = counters.map((c, i) =>
        i === 0 && appendixMode ? letterFor(c) : String(c),
      );
      prevDepthIdx = idx;
    } else if (oldText.length === 0 && !inBlockquote) {
      warnings.push(`empty heading at offset ${node.position?.start?.offset}; skipped`);
    }

    // Appendix bare titles keep/lose the word "Appendix": strip a leading
    // "Appendix" word from bareTitle for top-level appendix sections so
    // "Appendix Backups" -> prefix "Appendix A." + title "Backups".
    let finalBare = bareTitle;
    if (isAppendix && /^appendix\s+/i.test(finalBare)) {
      finalBare = finalBare.replace(/^appendix\s+/i, "");
    }

    let prefixEnd: number | null = null;
    if (finalBare !== oldText) {
      const prefixLen = oldText.length - finalBare.length;
      const candidateEnd = textStart + prefixLen;
      const firstChildIsPlainText = firstChild?.type === "text";
      const rawSlice = source.slice(textStart, candidateEnd);
      const strippedSlice = oldText.slice(0, prefixLen);
      if (firstChildIsPlainText && rawSlice === strippedSlice) {
        prefixEnd = candidateEnd;
      } else {
        finalBare = oldText;
        warnings.push(`formatted markup around section number in "${oldText}"; not stripping it`);
      }
    }

    sections.push({
      level: node.depth,
      bareTitle: finalBare,
      oldText,
      oldAnchor,
      newPath,
      isAppendix,
      inBlockquote,
      textStart,
      textEnd,
      prefixEnd,
    });
  }

  return {
    tree,
    sections,
    minLevel,
    maxLevel,
    numberStyle: opts.numberStyle ?? "top",
    warnings,
  };
}
