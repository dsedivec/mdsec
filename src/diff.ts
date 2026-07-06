const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const CONTEXT = 3;
// Sentinel appended to a final line that lacks a trailing newline, so
// "a" vs "a\n" compare unequal and we know where to print the marker.
const NO_EOL = "\x00";

interface Op {
  tag: " " | "-" | "+";
  text: string;
}

function toLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  else lines[lines.length - 1] += NO_EOL;
  return lines;
}

// Ops for the whole file pair: common prefix/suffix are trimmed first so
// the O(n*m) LCS table only covers the changed middle.
function diffOps(a: string[], b: string[]): Op[] {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (
    suf < a.length - pre &&
    suf < b.length - pre &&
    a[a.length - 1 - suf] === b[b.length - 1 - suf]
  )
    suf++;
  const am = a.slice(pre, a.length - suf);
  const bm = b.slice(pre, b.length - suf);

  const n = am.length;
  const m = bm.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        am[i] === bm[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: Op[] = [];
  for (let k = 0; k < pre; k++) ops.push({ tag: " ", text: a[k] });
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (am[i] === bm[j]) {
      ops.push({ tag: " ", text: am[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ tag: "-", text: am[i++] });
    } else {
      ops.push({ tag: "+", text: bm[j++] });
    }
  }
  while (i < n) ops.push({ tag: "-", text: am[i++] });
  while (j < m) ops.push({ tag: "+", text: bm[j++] });
  for (let k = a.length - suf; k < a.length; k++)
    ops.push({ tag: " ", text: a[k] });
  return ops;
}

export function unifiedDiff(
  oldText: string,
  newText: string,
  label: string,
  color: boolean,
): string {
  if (oldText === newText) return "";
  const ops = diffOps(toLines(oldText), toLines(newText));

  // Group changed op indices into hunks; a gap of unchanged lines wider
  // than 2*CONTEXT separates hunks (narrower means contexts overlap or
  // touch, so the hunks merge).
  const changed: number[] = [];
  ops.forEach((op, idx) => {
    if (op.tag !== " ") changed.push(idx);
  });
  const groups: { from: number; to: number }[] = [];
  for (const c of changed) {
    const last = groups[groups.length - 1];
    if (last && c - last.to <= 2 * CONTEXT + 1) last.to = c;
    else groups.push({ from: c, to: c });
  }

  const paint = (code: string, line: string) =>
    color ? `${code}${line}${RESET}` : line;
  const out: string[] = [
    paint(RED, `--- ${label}`),
    paint(GREEN, `+++ ${label} (mdsec)`),
  ];

  // Line numbers each op starts at (1-based; "-"/" " advance old,
  // "+"/" " advance new).
  const oldLineAt: number[] = [];
  const newLineAt: number[] = [];
  let ol = 1;
  let nl = 1;
  for (const op of ops) {
    oldLineAt.push(ol);
    newLineAt.push(nl);
    if (op.tag !== "+") ol++;
    if (op.tag !== "-") nl++;
  }

  for (const g of groups) {
    const from = Math.max(0, g.from - CONTEXT);
    const to = Math.min(ops.length - 1, g.to + CONTEXT);
    let oldLen = 0;
    let newLen = 0;
    for (let k = from; k <= to; k++) {
      if (ops[k].tag !== "+") oldLen++;
      if (ops[k].tag !== "-") newLen++;
    }
    out.push(
      paint(
        CYAN,
        `@@ -${oldLineAt[from]},${oldLen} +${newLineAt[from]},${newLen} @@`,
      ),
    );
    for (let k = from; k <= to; k++) {
      const op = ops[k];
      const noEol = op.text.endsWith(NO_EOL);
      const text = noEol ? op.text.slice(0, -1) : op.text;
      const line = `${op.tag}${text}`;
      if (op.tag === "-") out.push(paint(RED, line));
      else if (op.tag === "+") out.push(paint(GREEN, line));
      else out.push(line);
      if (noEol) out.push("\\ No newline at end of file");
    }
  }
  return out.join("\n") + "\n";
}
