import GithubSlugger from "github-slugger";
import type { DocModel, Section } from "./model.js";
import type { Edit } from "./edits.js";
import { formatPrefix } from "./number.js";

export function newHeadingText(s: Section): string {
  if (!s.newPath) return s.oldText;
  const prefix = formatPrefix(s.newPath, { appendixTop: s.isAppendix });
  return `${prefix} ${s.bareTitle}`;
}

export function renumberEdits(model: DocModel): Edit[] {
  const edits: Edit[] = [];
  for (const s of model.sections) {
    if (!s.newPath) continue;
    const prefix = formatPrefix(s.newPath, { appendixTop: s.isAppendix });
    edits.push({
      start: s.textStart,
      end: s.prefixEnd ?? s.textStart,
      replacement: `${prefix} `,
    });
  }
  return edits;
}

export function computeNewAnchors(model: DocModel): Map<Section, string> {
  const slugger = new GithubSlugger();
  const map = new Map<Section, string>();
  for (const s of model.sections) {
    const text = s.inBlockquote ? s.oldText : newHeadingText(s);
    map.set(s, slugger.slug(text));
  }
  return map;
}
