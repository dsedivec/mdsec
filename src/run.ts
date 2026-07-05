import { buildModel } from "./model.js";
import { renumberEdits } from "./renumber.js";
import { applyEdits, type Edit } from "./edits.js";
import { linkEdits } from "./links.js";
import { tocEdits } from "./toc.js";
import type { NumberStyle } from "./number.js";

export interface RunOptions {
  minLevel?: number;
  maxLevel?: number;
  /** Trailing-period style: "none" (18.1), "top" (18. / 18.1), "all" (18.1.). */
  numberStyle?: NumberStyle;
  tocDepth?: number;
  /** Heading generated above the TOC list; false disables it. */
  tocTitle?: string | false;
  linkTextPattern?: string;
}

export interface RunResult {
  output: string;
  warnings: string[];
  changed: boolean;
  /** All edits applied to produce `output`, in application order. */
  edits: Edit[];
}

export function runDocument(source: string, opts: RunOptions): RunResult {
  const model = buildModel(source, opts);
  const toc = tocEdits(model, source, {
    tocDepth: opts.tocDepth,
    tocTitle: opts.tocTitle,
  });
  const links = linkEdits(model, source, {
    linkTextPattern: opts.linkTextPattern,
    excludeRanges: toc.region ? [toc.region] : [],
  });
  const edits = [...renumberEdits(model), ...links.edits, ...toc.edits];
  const output = applyEdits(source, edits);
  return {
    output,
    warnings: [...model.warnings, ...links.warnings, ...toc.warnings],
    changed: output !== source,
    edits,
  };
}
