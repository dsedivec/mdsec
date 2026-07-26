export function formatNumber(path) {
    return path.join(".");
}
export function formatPrefix(path, opts) {
    const style = opts.style ?? "top";
    const dot = style === "all" || (style === "top" && path.length === 1) ? "." : "";
    if (opts.appendixTop)
        return `Appendix ${path[0]}${dot}`;
    return `${path.join(".")}${dot}`;
}
export function letterFor(n) {
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
// 1: leading token, 2: ".2.3" sub-numbers, 3: trailing period, 4: rest.
const PREFIX_RE = /^([A-Z]+|\d+)((?:\.\d+)*)(\.?)\s+(.*)$/;
export function parsePrefix(title, opts = {}) {
    const style = opts.style ?? "top";
    const a = title.match(APPENDIX_RE);
    if (a) {
        const letter = (a[1] ?? a[2]).toUpperCase();
        return { path: [letter], rest: a[3], isAppendixForm: true };
    }
    const m = title.match(PREFIX_RE);
    if (!m)
        return null;
    const [, head, subNumbers, trailingDot, rest] = m;
    const bare = subNumbers === "" && trailingDot === "";
    // Reject "Appendix on Formats"-style: a bare word is not matched by the
    // regex anyway; but reject single letters followed by no dot-number and
    // no trailing dot, e.g. "A Title" is a normal title, not prefix "A".
    if (/^[A-Z]+$/i.test(head) && bare)
        return null;
    // A bare digit run ("2024 Roadmap", "10 Things I Learned") is only
    // something we emit under numberStyle "none"; under the dotted styles the
    // leading digits are far likelier to be part of the real title, and
    // stripping them silently deletes content. Only trust the bare form when
    // the configured style could have produced it.
    if (/^\d+$/.test(head) && bare && style !== "none")
        return null;
    const path = [head, ...subNumbers.split(".").filter(Boolean)];
    return { path, rest, isAppendixForm: false };
}
