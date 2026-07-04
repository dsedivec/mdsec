import { buildModel } from "./model.js";
import { renumberEdits } from "./renumber.js";
import { applyEdits } from "./edits.js";
import { linkEdits } from "./links.js";
import { tocEdits } from "./toc.js";

export interface RunOptions {
  minLevel?: number;
  maxLevel?: number;
  tocDepth?: number;
  linkTextPattern?: string;
}

export interface RunResult {
  output: string;
  warnings: string[];
  changed: boolean;
}

export function runDocument(source: string, opts: RunOptions): RunResult {
  const model = buildModel(source, opts);
  const toc = tocEdits(model, source, { tocDepth: opts.tocDepth });
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
  };
}
