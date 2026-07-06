import GithubSlugger from "github-slugger";
import { computeNewAnchors } from "./renumber.js";
import { formatNumber, parsePrefix } from "./number.js";
const DEFAULT_TEXT_RE = /(§\s*|\bsections?\s+)([A-Z]+(?:\.\d+)+|[A-Z]+(?=[\s.):]|$)|\d+(?:\.\d+)*)|^([A-Za-z]+\.\d+(?:\.\d+)*|\d+(?:\.\d+)*)(?=[\s.):]|$)/;
// Leading section-number token in an anchor fragment: "5-", "31-" (from
// "3.1"), "b1-" (from "B.1"), "appendix-b-". Same shapes the bare-title
// strip below recognizes; group 1 is the token without its trailing "-".
const NUMBER_TOKEN_RE = /^(appendix-[a-z]+|(?:[a-z]+(?=\d)|\d+)[a-z0-9]*(?:-\d+)*)-/;
// The number currently written in a section's heading, in anchor-slug form
// ("3.1 Foo" -> "31", "Appendix B. X" -> "appendix-b"), or null if the
// heading carries no number.
function oldNumberSlug(s) {
    const p = parsePrefix(s.oldText);
    if (!p)
        return null;
    const joined = p.path.join("").toLowerCase();
    return p.isAppendixForm ? `appendix-${joined}` : joined;
}
export function linkEdits(model, source, opts = {}) {
    const edits = [];
    const warnings = [];
    const excludeRanges = opts.excludeRanges ?? [];
    const isExcluded = (offset) => excludeRanges.some((r) => offset >= r.start && offset < r.end);
    const newAnchors = computeNewAnchors(model);
    const byOldAnchor = new Map();
    for (const s of model.sections) {
        if (!s.inBlockquote)
            byOldAnchor.set(s.oldAnchor, s);
    }
    const textRe = opts.linkTextPattern
        ? new RegExp(opts.linkTextPattern)
        : DEFAULT_TEXT_RE;
    const links = [];
    (function visit(node) {
        if ((node.type === "link" || node.type === "image" || node.type === "definition") &&
            typeof node.url === "string" &&
            node.url.startsWith("#")) {
            links.push(node);
        }
        for (const c of node.children ?? [])
            visit(c);
    })(model.tree);
    for (const node of links) {
        if (isExcluded(node.position.start.offset))
            continue;
        const frag = node.url.slice(1);
        const target = resolve(frag, byOldAnchor, model, warnings);
        if (!target)
            continue;
        const newAnchor = newAnchors.get(target);
        if (newAnchor !== frag) {
            const span = findFragmentSpan(source, node, frag);
            edits.push({ start: span.start, end: span.end, replacement: `#${newAnchor}` });
        }
        // Link text rewriting: inline links with a numbered target only.
        if (node.type === "link" && target.newPath && node.children?.length) {
            const first = node.children[0];
            if (first.type === "text") {
                const m = first.value.match(textRe);
                const token = m ? (m[2] ?? m[3] ?? m[1]) : null;
                if (m && token) {
                    const tokenIdx = m.index + m[0].indexOf(token);
                    const start = first.position.start.offset + tokenIdx;
                    const replacement = formatNumber(target.newPath);
                    if (token !== replacement) {
                        edits.push({ start, end: start + token.length, replacement });
                    }
                }
            }
        }
    }
    return { edits, warnings };
}
function bigrams(s) {
    const out = new Set();
    for (let i = 0; i < s.length - 1; i++)
        out.add(s.slice(i, i + 2));
    return out;
}
function dice(a, b) {
    const A = bigrams(a);
    const B = bigrams(b);
    if (A.size === 0 || B.size === 0)
        return a === b ? 1 : 0;
    let inter = 0;
    for (const g of A)
        if (B.has(g))
            inter++;
    return (2 * inter) / (A.size + B.size);
}
function resolve(frag, byOldAnchor, model, warnings) {
    const exact = byOldAnchor.get(frag);
    if (exact)
        return exact;
    const candidates = model.sections.filter((s) => !s.inBlockquote);
    // 2) bare-title slug match (fragment may or may not carry a number token)
    const tokenMatch = frag.match(NUMBER_TOKEN_RE);
    const stripped = tokenMatch ? frag.slice(tokenMatch[0].length) : frag;
    const titleMatches = candidates.filter((s) => {
        const slug = new GithubSlugger().slug(s.bareTitle);
        return slug === frag || slug === stripped;
    });
    if (titleMatches.length === 1)
        return titleMatches[0];
    if (titleMatches.length > 1) {
        warnings.push(`ambiguous internal link "#${frag}"; left unchanged`);
        return null;
    }
    // 3) number-prefix match: trust the number currently written in a heading
    // when the title was renamed out from under the link.
    if (tokenMatch) {
        const token = tokenMatch[1].startsWith("appendix-")
            ? tokenMatch[1]
            : tokenMatch[1].replace(/-/g, "");
        const numberMatches = candidates.filter((s) => oldNumberSlug(s) === token);
        if (numberMatches.length === 1) {
            warnings.push(`matched "#${frag}" -> "${numberMatches[0].bareTitle}" by section number`);
            return numberMatches[0];
        }
        if (numberMatches.length > 1) {
            warnings.push(`ambiguous internal link "#${frag}"; left unchanged`);
            return null;
        }
    }
    // 4) similarity on old anchors
    const scored = candidates
        .map((s) => ({ s, score: dice(frag, s.oldAnchor) }))
        .sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best && best.score >= 0.8) {
        if (scored[1] && scored[1].score >= 0.8 && best.score - scored[1].score < 0.05) {
            warnings.push(`ambiguous internal link "#${frag}"; left unchanged`);
            return null;
        }
        warnings.push(`fuzzy-matched "#${frag}" -> "${best.s.bareTitle}"`);
        return best.s;
    }
    warnings.push(`unresolved internal link "#${frag}"`);
    return null;
}
function findFragmentSpan(source, node, frag) {
    const from = node.position.start.offset;
    const to = node.position.end.offset;
    const needle = `#${frag}`;
    const idx = node.type === "definition"
        ? source.indexOf(needle, from)
        : source.lastIndexOf(needle, to);
    if (idx < from)
        throw new Error(`cannot locate "${needle}" in source for link at ${from}`);
    return { start: idx, end: idx + needle.length };
}
