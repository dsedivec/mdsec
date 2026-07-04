import { computeNewAnchors } from "./renumber.js";
import { formatPrefix } from "./number.js";
const OPEN_MARKER = "<!-- toc -->";
const CLOSE_MARKER = "<!-- /toc -->";
export function findTocRegion(model, source, warnings = []) {
    let open = null;
    let close = null;
    let combined = null;
    for (const node of model.tree.children) {
        if (node.type !== "html")
            continue;
        const v = node.value.trim();
        if (v === OPEN_MARKER && !open) {
            open = node;
        }
        else if (v === CLOSE_MARKER && open && !close) {
            close = node;
        }
        else if (!open &&
            !close &&
            v.startsWith(OPEN_MARKER) &&
            v.endsWith(CLOSE_MARKER)) {
            combined = node;
        }
    }
    if (combined) {
        return {
            start: combined.position.start.offset + OPEN_MARKER.length,
            end: combined.position.end.offset - CLOSE_MARKER.length,
        };
    }
    else if (open && close) {
        return {
            start: open.position.end.offset,
            end: close.position.start.offset,
        };
    }
    else if (open && !close) {
        warnings.push("found <!-- toc --> without matching <!-- /toc -->; skipping TOC");
        return null;
    }
    return null;
}
export function tocEdits(model, source, opts = {}) {
    const warnings = [];
    const region = findTocRegion(model, source, warnings);
    if (!region) {
        return { edits: [], warnings, region: null };
    }
    const { start, end } = region;
    const maxTocLevel = model.minLevel + (opts.tocDepth ?? model.maxLevel - model.minLevel + 1) - 1;
    const anchors = computeNewAnchors(model);
    const lines = [];
    for (const s of model.sections) {
        if (!s.newPath || s.inBlockquote || s.level > maxTocLevel)
            continue;
        const indent = "  ".repeat(s.level - model.minLevel);
        const escapedTitle = s.bareTitle.replace(/[\\\[\]]/g, "\\$&");
        const label = `${formatPrefix(s.newPath, { appendixTop: s.isAppendix })} ${escapedTitle}`;
        lines.push(`${indent}- [${label}](#${anchors.get(s)})`);
    }
    return {
        edits: [{ start, end, replacement: `\n${lines.join("\n")}\n` }],
        warnings,
        region,
    };
}
