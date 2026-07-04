export interface Edit {
  start: number;
  end: number;
  replacement: string;
}

export function applyEdits(source: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) {
      throw new Error(
        `overlapping edits at ${sorted[i - 1].start}-${sorted[i - 1].end} and ${sorted[i].start}-${sorted[i].end}`,
      );
    }
  }
  let out = source;
  for (const e of [...sorted].reverse()) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  }
  return out;
}
