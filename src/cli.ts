#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { runDocument, type RunOptions } from "./run.js";

const HELP = `Usage: mdsec [options] [FILE]

Renumber Markdown sections, update internal links, regenerate TOC.
Reads stdin (or FILE) and writes stdout unless --write.

Options:
  -w, --write               modify FILE in place
      --check               exit 1 if changes would be made; writes nothing
      --strict              with --check, warnings also cause exit 1
      --min-level N         lowest heading level to number (default: inferred)
      --max-level N         highest heading level to number (default: 6)
      --toc-depth N         heading depth included in the TOC
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
  "toc-depth": { type: "string" },
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
if (positionals.length > 1) fail("at most one FILE argument");
const file = positionals[0] && positionals[0] !== "-" ? positionals[0] : null;
if (values.write && !file) fail("--write requires a FILE argument");

const config = loadConfig(file ? dirname(resolve(file)) : process.cwd());
const num = (v: string | undefined, name: string): number | undefined => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 6) fail(`${name} must be 1-6`);
  return n;
};
const opts: RunOptions = {
  minLevel: num(values["min-level"], "--min-level") ?? config.minLevel,
  maxLevel: num(values["max-level"], "--max-level") ?? config.maxLevel,
  tocDepth: num(values["toc-depth"], "--toc-depth") ?? config.tocDepth,
  linkTextPattern: values["link-text-pattern"] ?? config.linkTextPattern,
};

let source: string;
try {
  source = file ? readFileSync(file, "utf8") : readFileSync(0, "utf8");
} catch (e) {
  fail(`cannot read ${file ?? "stdin"}: ${(e as Error).message}`);
}
const result = runDocument(source, opts);

for (const w of result.warnings) process.stderr.write(`mdsec: warning: ${w}\n`);

if (values.verbose) {
  for (const e of result.edits) {
    process.stderr.write(
      `mdsec: edit @${e.start}-${e.end}: ${JSON.stringify(e.replacement)}\n`,
    );
  }
}

if (values.check) {
  const failWarn = values.strict && result.warnings.length > 0;
  process.exit(result.changed || failWarn ? 1 : 0);
}

if (values.write) {
  if (result.changed) writeFileSync(file!, result.output);
} else {
  process.stdout.write(result.output);
}
