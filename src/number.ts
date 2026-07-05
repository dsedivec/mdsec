export type NumberPath = string[];

/**
 * Trailing-period style for heading number prefixes:
 * "none" -> 18, 18.1, 18.1.1; "top" -> 18., 18.1, 18.1.1;
 * "all" -> 18., 18.1., 18.1.1.
 */
export type NumberStyle = "none" | "top" | "all";

export function formatNumber(path: NumberPath): string {
  return path.join(".");
}

export function formatPrefix(
  path: NumberPath,
  opts: { appendixTop: boolean; style?: NumberStyle },
): string {
  const style = opts.style ?? "top";
  const dot =
    style === "all" || (style === "top" && path.length === 1) ? "." : "";
  if (opts.appendixTop) return `Appendix ${path[0]}${dot}`;
  return `${path.join(".")}${dot}`;
}

export function letterFor(n: number): string {
  let s = "";
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

// Dotted letter form is case-insensitive ("Appendix a. x"); the dotless
// form (numberStyle "none") requires uppercase so ordinary words after
// "Appendix" ("Appendix on Formats") are not mistaken for a letter.
const APPENDIX_RE = /^[Aa]ppendix\s+(?:([A-Za-z]+)\.|([A-Z]+)(?=\s))\s+(.*)$/;
const PREFIX_RE = /^([A-Z]+|\d+)((?:\.\d+)*)\.?\s+(.*)$/;

export function parsePrefix(
  title: string,
): { path: NumberPath; rest: string; isAppendixForm: boolean } | null {
  const a = title.match(APPENDIX_RE);
  if (a) {
    const letter = (a[1] ?? a[2]).toUpperCase();
    return { path: [letter], rest: a[3], isAppendixForm: true };
  }
  const m = title.match(PREFIX_RE);
  if (!m) return null;
  // Reject "Appendix on Formats"-style: a bare word is not matched by the
  // regex anyway; but reject single letters followed by no dot-number and
  // no trailing dot, e.g. "A Title" is a normal title, not prefix "A".
  if (/^[A-Z]+$/i.test(m[1]) && m[2] === "" && !title.startsWith(`${m[1]}.`)) return null;
  const path = [m[1], ...m[2].split(".").filter(Boolean)];
  return { path, rest: m[3], isAppendixForm: false };
}
