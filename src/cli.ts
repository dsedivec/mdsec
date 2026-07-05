#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { runDocument, type RunOptions } from "./run.js";

const HELP = `Usage: mdsec [options] [FILE...]

Renumber Markdown sections, update internal links, regenerate TOC.
Reads stdin (or FILE) and writes stdout unless --write.
Multiple FILEs are allowed with --write or --check.

Options:
  -w, --write               modify FILE in place
      --check               exit 1 if changes would be made; writes nothing
      --strict              with --check, warnings also cause exit 1
      --min-level N         lowest heading level to number (default: inferred)
      --max-level N         highest heading level to number (default: 6)
      --number-style S      trailing periods: none (18.1), top (18. and
                            18.1; default), all (18.1.)
      --toc-depth N         heading depth included in the TOC
      --toc-title TEXT      heading above the TOC (default: Table of Contents)
      --no-toc-title        omit the TOC heading
      --link-text-pattern R regex for numbered link text (capture 1 = number)
  -v, --verbose             report warnings verbosely
  -h, --help                show this help
`;

function fail(msg: string): never {
  process.stderr.write(`mdsec: ${msg}\n`);
  process.exit(2);
}

function validateLevel(v: unknown, name: string, source: string): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 6) fail(`${name} must be 1-6 (in ${source})`);
  return n;
}

function validateNumberStyle(
  v: unknown,
  source: string,
): "none" | "top" | "all" | undefined {
  if (v === undefined) return undefined;
  if (v === "none" || v === "top" || v === "all") return v;
  fail(`numberStyle must be "none", "top", or "all" (in ${source})`);
}

function loadConfig(startDir: string): Partial<RunOptions> {
  let dir = resolve(startDir);
  for (;;) {
    const p = join(dir, ".mdsec.json");
    if (existsSync(p)) {
      let parsed: Partial<RunOptions>;
      try {
        parsed = JSON.parse(readFileSync(p, "utf8"));
      } catch (e) {
        fail(`bad config ${p}: ${(e as Error).message}`);
      }
      if ("minLevel" in parsed)
        parsed.minLevel = validateLevel(parsed.minLevel, "minLevel", p);
      if ("maxLevel" in parsed)
        parsed.maxLevel = validateLevel(parsed.maxLevel, "maxLevel", p);
      if ("tocDepth" in parsed)
        parsed.tocDepth = validateLevel(parsed.tocDepth, "tocDepth", p);
      if ("numberStyle" in parsed)
        parsed.numberStyle = validateNumberStyle(parsed.numberStyle, p);
      if (
        "tocTitle" in parsed &&
        parsed.tocTitle !== undefined &&
        parsed.tocTitle !== false &&
        typeof parsed.tocTitle !== "string"
      ) {
        fail(`tocTitle must be a string or false (in ${p})`);
      }
      if (
        "linkTextPattern" in parsed &&
        parsed.linkTextPattern !== undefined &&
        typeof parsed.linkTextPattern !== "string"
      ) {
        fail(`linkTextPattern must be a string (in ${p})`);
      }
      return parsed;
    }
    const parent = dirname(dir);
    if (parent === dir) return {};
    dir = parent;
  }
}

const cliOptions = {
  write: { type: "boolean", short: "w" },
  check: { type: "boolean" },
  strict: { type: "boolean" },
  "min-level": { type: "string" },
  "max-level": { type: "string" },
  "number-style": { type: "string" },
  "toc-depth": { type: "string" },
  "toc-title": { type: "string" },
  "no-toc-title": { type: "boolean" },
  "link-text-pattern": { type: "string" },
  verbose: { type: "boolean", short: "v" },
  help: { type: "boolean", short: "h" },
} as const;

let values: ReturnType<typeof parseArgs<{ options: typeof cliOptions; allowPositionals: true }>>["values"];
let positionals: ReturnType<
  typeof parseArgs<{ options: typeof cliOptions; allowPositionals: true }>
>["positionals"];
try {
  ({ values, positionals } = parseArgs({
    options: cliOptions,
    allowPositionals: true,
  }));
} catch (e) {
  fail((e as Error).message);
}

if (values.help) {
  process.stdout.write(HELP);
  process.exit(0);
}
const files = positionals.filter((p) => p !== "-");
if (values.write && files.length === 0) fail("--write requires a FILE argument");
if (files.length > 1 && !values.write && !values.check)
  fail("multiple FILE arguments require --write or --check");

const num = (v: string | undefined, name: string): number | undefined => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 6) fail(`${name} must be 1-6`);
  return n;
};

function optionsFor(file: string | null): RunOptions {
  const config = loadConfig(file ? dirname(resolve(file)) : process.cwd());
  return {
    minLevel: num(values["min-level"], "--min-level") ?? config.minLevel,
    maxLevel: num(values["max-level"], "--max-level") ?? config.maxLevel,
    numberStyle:
      validateNumberStyle(values["number-style"], "--number-style") ??
      config.numberStyle,
    tocDepth: num(values["toc-depth"], "--toc-depth") ?? config.tocDepth,
    tocTitle: values["no-toc-title"]
      ? false
      : values["toc-title"] ?? config.tocTitle,
    linkTextPattern: values["link-text-pattern"] ?? config.linkTextPattern,
  };
}

let anyChanged = false;
let anyWarned = false;

function processOne(file: string | null): void {
  let source: string;
  try {
    source = file ? readFileSync(file, "utf8") : readFileSync(0, "utf8");
  } catch (e) {
    fail(`cannot read ${file ?? "stdin"}: ${(e as Error).message}`);
  }
  const result = runDocument(source, optionsFor(file));
  const where = file ? `${file}: ` : "";

  for (const w of result.warnings)
    process.stderr.write(`mdsec: warning: ${where}${w}\n`);
  anyWarned ||= result.warnings.length > 0;
  anyChanged ||= result.changed;

  if (values.verbose) {
    for (const e of result.edits) {
      process.stderr.write(
        `mdsec: edit ${where}@${e.start}-${e.end}: ${JSON.stringify(e.replacement)}\n`,
      );
    }
  }

  if (values.check) return;
  if (values.write) {
    if (result.changed) writeFileSync(file!, result.output);
  } else {
    process.stdout.write(result.output);
  }
}

if (files.length === 0) {
  processOne(null);
} else {
  for (const f of files) processOne(f);
}

if (values.check) {
  process.exit(anyChanged || (values.strict && anyWarned) ? 1 : 0);
}
