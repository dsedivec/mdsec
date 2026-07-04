import { buildModel } from "./model.js";
import { renumberEdits } from "./renumber.js";
import { applyEdits } from "./edits.js";

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
  const edits = [...renumberEdits(model)];
  const output = applyEdits(source, edits);
  return { output, warnings: model.warnings, changed: output !== source };
}
