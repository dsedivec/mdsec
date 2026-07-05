import GithubSlugger from "github-slugger";
import { formatPrefix } from "./number.js";
export function newHeadingText(s, style) {
    if (!s.newPath)
        return s.oldText;
    const prefix = formatPrefix(s.newPath, { appendixTop: s.isAppendix, style });
    return `${prefix} ${s.bareTitle}`;
}
export function renumberEdits(model) {
    const edits = [];
    for (const s of model.sections) {
        if (!s.newPath)
            continue;
        const prefix = formatPrefix(s.newPath, {
            appendixTop: s.isAppendix,
            style: model.numberStyle,
        });
        edits.push({
            start: s.textStart,
            end: s.prefixEnd ?? s.textStart,
            replacement: `${prefix} `,
        });
    }
    return edits;
}
export function computeNewAnchors(model) {
    const slugger = new GithubSlugger();
    const map = new Map();
    for (const s of model.sections) {
        const text = s.inBlockquote ? s.oldText : newHeadingText(s, model.numberStyle);
        map.set(s, slugger.slug(text));
    }
    return map;
}
