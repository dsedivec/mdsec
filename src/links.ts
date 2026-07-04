import type { DocModel, Section } from "./model.js";
import type { Edit } from "./edits.js";
import { computeNewAnchors } from "./renumber.js";
import { formatNumber } from "./number.js";

const DEFAULT_TEXT_RE =
  /(§\s*|\bsections?\s+)([A-Za-z]+(?:\.\d+)*|\d+(?:\.\d+)*)|^(\d+(?:\.\d+)*)(?=[\s.):]|$)/;

interface LinkNode {
  type: string;
  url: string;
  position: { start: { offset: number }; end: { offset: number } };
  children?: any[];
}

export function linkEdits(
  model: DocModel,
  source: string,
  opts: { linkTextPattern?: string } = {},
): { edits: Edit[]; warnings: string[] } {
  const edits: Edit[] = [];
  const warnings: string[] = [];
  const newAnchors = computeNewAnchors(model);
  const byOldAnchor = new Map<string, Section>();
  for (const s of model.sections) {
    if (!s.inBlockquote) byOldAnchor.set(s.oldAnchor, s);
  }
  const textRe = opts.linkTextPattern
    ? new RegExp(opts.linkTextPattern)
    : DEFAULT_TEXT_RE;

  const links: LinkNode[] = [];
  (function visit(node: any) {
    if (
      (node.type === "link" || node.type === "image" || node.type === "definition") &&
      typeof node.url === "string" &&
      node.url.startsWith("#")
    ) {
      links.push(node);
    }
    for (const c of node.children ?? []) visit(c);
  })(model.tree);

  for (const node of links) {
    const frag = node.url.slice(1);
    const target = resolve(frag, byOldAnchor, model, warnings);
    if (!target) continue;

    const newAnchor = newAnchors.get(target)!;
    if (newAnchor !== frag) {
      const span = findFragmentSpan(source, node, frag);
      edits.push({ start: span.start, end: span.end, replacement: `#${newAnchor}` });
    }

    // Link text rewriting: inline links with a numbered target only.
    if (node.type === "link" && target.newPath && node.children?.length) {
      const first = node.children[0];
      if (first.type === "text") {
        const m = first.value.match(textRe);
        const token = m ? (m[2] ?? m[3] ?? m[1]) : null;
        if (m && token) {
          const tokenIdx = m.index! + m[0].indexOf(token);
          const start = first.position.start.offset + tokenIdx;
          const replacement = formatNumber(target.newPath);
          if (token !== replacement) {
            edits.push({ start, end: start + token.length, replacement });
          }
        }
      }
    }
  }
  return { edits, warnings };
}

function resolve(
  frag: string,
  byOldAnchor: Map<string, Section>,
  model: DocModel,
  warnings: string[],
): Section | null {
  const s = byOldAnchor.get(frag);
  if (s) return s;
  warnings.push(`unresolved internal link "#${frag}"`);
  return null;
}

function findFragmentSpan(
  source: string,
  node: LinkNode,
  frag: string,
): { start: number; end: number } {
  const from = node.position.start.offset;
  const to = node.position.end.offset;
  const needle = `#${frag}`;
  const idx =
    node.type === "definition"
      ? source.indexOf(needle, from)
      : source.lastIndexOf(needle, to);
  if (idx < from) throw new Error(`cannot locate "${needle}" in source for link at ${from}`);
  return { start: idx, end: idx + needle.length };
}
