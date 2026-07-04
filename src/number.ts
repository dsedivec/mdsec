export type NumberPath = string[];

export function formatNumber(path: NumberPath): string {
  return path.join(".");
}

export function formatPrefix(path: NumberPath, opts: { appendixTop: boolean }): string {
  if (opts.appendixTop) return `Appendix ${path[0]}.`;
  return path.length === 1 ? `${path[0]}.` : path.join(".");
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

const APPENDIX_RE = /^Appendix\s+([A-Z]+)\.\s+(.*)$/i;
const PREFIX_RE = /^([A-Z]+|\d+)((?:\.\d+)*)\.?\s+(.*)$/;

export function parsePrefix(
  title: string,
): { path: NumberPath; rest: string; isAppendixForm: boolean } | null {
  const a = title.match(APPENDIX_RE);
  if (a) return { path: [a[1].toUpperCase()], rest: a[2], isAppendixForm: true };
  const m = title.match(PREFIX_RE);
  if (!m) return null;
  // Reject "Appendix on Formats"-style: a bare word is not matched by the
  // regex anyway; but reject single letters followed by no dot-number and
  // no trailing dot, e.g. "A Title" is a normal title, not prefix "A".
  if (/^[A-Z]+$/i.test(m[1]) && m[2] === "" && !title.startsWith(`${m[1]}.`)) return null;
  const path = [m[1], ...m[2].split(".").filter(Boolean)];
  return { path, rest: m[3], isAppendixForm: false };
}
