import { citationOf, sortSurname, type CitationSet } from "./cite";
import type { AnswerResult, CiteStyle, PaperResult, Segment } from "./format";

type Copy = { text: string; html: string };
type Block =
  | { kind: "h"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ol" | "ul"; items: string[] };

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Inline styles survive paste into Word and Google Docs (class names and <style> blocks do not).
const FONT = "font-family:'Times New Roman',serif;font-size:12pt";
const MONO = "font-family:Consolas,'Courier New',monospace;font-size:10pt;white-space:pre-wrap";
const HANGING = `margin:0 0 0 0.5in;text-indent:-0.5in;line-height:200%;${FONT}`;
const HEADING: Record<CiteStyle, string> = { APA: "References", MLA: "Works Cited", BibTeX: "" };

function inline(s: string) {
  return escapeHtml(s)
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "<b>$1</b>")
    .replace(/(?<![*\w])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![*\w])/g, "<i>$1</i>");
}
const unmark = (s: string) => s.replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "$1").replace(/(?<![*\w])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![*\w])/g, "$1");

function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const last = blocks[blocks.length - 1];
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    const ul = /^[-*•]\s+(.*)$/.exec(line);
    if (!line) blocks.push({ kind: "p", text: "" });
    else if (heading) blocks.push({ kind: "h", text: heading[1] });
    else if (ol || ul) {
      const kind = ol ? "ol" : "ul", item = (ol ?? ul)![1];
      if (last?.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else if (last?.kind === "p" && last.text) last.text += " " + line;
    else if (last?.kind === "p") last.text = line;
    else blocks.push({ kind: "p", text: line });
  }
  return blocks.filter((b) => b.kind !== "p" || b.text);
}

/** Answer body in manuscript style: APA/MLA double-spaced with 0.5in first-line indents, BibTeX single-spaced. */
function bodyHtml(src: string, style: CiteStyle) {
  const paper = style !== "BibTeX";
  const line = paper ? "line-height:200%" : "line-height:115%";
  const gap = paper ? "margin:0" : "margin:0 0 10pt 0";
  return parseBlocks(src).map((b) => {
    if (b.kind === "h") return `<p style="${gap};${line};${FONT}"><b>${inline(b.text)}</b></p>`;
    if (b.kind === "p") return `<p style="${gap};${line};${FONT}${paper ? ";text-indent:0.5in" : ""}">${inline(b.text)}</p>`;
    return `<${b.kind} style="${gap};padding-left:0.5in;${line};${FONT}">${b.items.map((i) => `<li style="${line};${FONT}">${inline(i)}</li>`).join("")}</${b.kind}>`;
  }).join("\n");
}

function bodyText(src: string) {
  return parseBlocks(src).map((b) => {
    if (b.kind === "h") return unmark(b.text);
    if (b.kind === "p") return unmark(b.text);
    return b.items.map((i, n) => (b.kind === "ol" ? `${n + 1}. ${unmark(i)}` : `- ${unmark(i)}`)).join("\n");
  }).join("\n\n");
}

const segHtml = (segs: Segment[]) => segs.map((s) => (s.italic ? `<i>${escapeHtml(s.text)}</i>` : escapeHtml(s.text))).join("");

type Entry = { p: PaperResult; c: CitationSet };

/** Citations for a whole answer (stored, or rebuilt for old cached results); APA/MLA sorted by surname, year, title. */
function entries(papers: PaperResult[], style: CiteStyle): Entry[] {
  const list = papers.map((p) => ({ p, c: citationOf(p, papers) }));
  if (style === "BibTeX") return list;
  const cmp = (x: string, y: string) => x.localeCompare(y, "en", { sensitivity: "base" });
  const key = (e: Entry) => sortSurname(e.p.authors) || (e.p.title ?? "").toLowerCase();
  // Same first author: single-author works first, then by the co-authors' surnames (APA 7 §9.46, MLA 9 §5.124).
  const solo = (e: Entry) => ((e.p.authors ?? []).length > 1 ? 1 : 0);
  const coauthors = (e: Entry) => (e.p.authors ?? []).slice(1).map((x) => sortSurname([x])).join(" ");
  const year = (e: Entry) => (/^\d{4}/.test(e.p.year ?? "") ? e.p.year : "0000"); // n.d. sorts first
  return list.sort((a, b) =>
    cmp(key(a), key(b)) || solo(a) - solo(b) || cmp(coauthors(a), coauthors(b)) || year(a).localeCompare(year(b)) ||
    cmp(a.c.citations[style], b.c.citations[style]));
}

function refList(list: Entry[], style: CiteStyle): Copy {
  if (style === "BibTeX") {
    const bib = list.map((e) => e.c.citations.BibTeX).join("\n\n");
    return { text: bib + "\n", html: `<pre style="${MONO}">${escapeHtml(bib)}</pre>` };
  }
  const head = `<p style="margin:0;text-align:center;line-height:200%;${FONT}">${style === "APA" ? `<b>${HEADING.APA}</b>` : HEADING.MLA}</p>`;
  return {
    text: [HEADING[style], ...list.map((e) => e.c.citations[style])].join("\n\n") + "\n",
    html: [head, ...list.map((e) => `<p style="${HANGING}">${segHtml(e.c.citationParts[style])}</p>`)].join("\n"),
  };
}

const wrap = (html: string) => `<meta charset="utf-8"><div>${html}</div>`;

/** `[1]`, `[1, 3]` and runs like `[1][2]` -> one in-text citation for the style. */
const MARKERS = /\[\d+(?:\s*,\s*\d+)*\](?:\s*\[\d+(?:\s*,\s*\d+)*\])*/g;

function withInText(src: string, papers: PaperResult[], style: CiteStyle) {
  const byN = new Map(papers.map((p) => [p.n, citationOf(p, papers).inText[style]]));
  return src.replace(MARKERS, (run) => {
    const cites = [...new Set((run.match(/\d+/g) ?? []).map(Number))].map((n) => byN.get(n)).filter((c): c is string => !!c);
    if (!cites.length) return "";
    if (style === "BibTeX") return `\\cite{${cites.map((c) => /^\\cite\{(.*)\}$/.exec(c)?.[1] ?? c).join(",")}}`;
    const inner = [...new Set(cites.map((c) => c.replace(/^\((.*)\)$/, "$1")))];
    if (style === "APA") inner.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })); // APA orders multiple works alphabetically
    return `(${inner.join("; ")})`;
  });
}

/** "Copy answer": in-text citations in the chosen style, then the reference list. */
export function buildAnswerCopy(res: AnswerResult, style: CiteStyle): Copy {
  const body = withInText(res.answer, res.papers, style);
  const refs = res.papers.length > 0 ? refList(entries(res.papers, style), style) : null;
  const line = style === "BibTeX" ? "line-height:115%" : "line-height:200%";
  const html = [
    `<p style="margin:0;text-align:center;${line};${FONT}"><b>${escapeHtml(res.title)}</b></p>`,
    bodyHtml(body, style),
    refs && (style === "BibTeX" ? refs.html : `<p style="margin:0;line-height:200%;${FONT}">&nbsp;</p>\n${refs.html}`),
  ].filter(Boolean).join("\n");
  const text = [res.title, bodyText(body), refs?.text.trimEnd()].filter(Boolean).join("\n\n");
  return { text, html: wrap(html) };
}

/** "Copy references": a style-correct reference list (no [n] numbering). BibTeX copies as a valid .bib. */
export function buildCitationsCopy(papers: PaperResult[], style: CiteStyle): Copy {
  const r = refList(entries(papers, style), style);
  return { text: r.text.trimEnd(), html: wrap(r.html) };
}

/** One reference with its style's formatting (hanging indent + italics, or a BibTeX block). */
export function buildSingleCitationCopy(p: PaperResult, style: CiteStyle, peers?: PaperResult[]): Copy {
  const c = citationOf(p, peers);
  if (style === "BibTeX") return { text: c.citations.BibTeX, html: wrap(`<pre style="${MONO}">${escapeHtml(c.citations.BibTeX)}</pre>`) };
  return { text: c.citations[style], html: wrap(`<p style="${HANGING}">${segHtml(c.citationParts[style])}</p>`) };
}

// ---- RTF (opens in Word, Pages, LibreOffice and Google Docs with the formatting intact)

/** Escape for RTF: \ { } and every non-ASCII char as \uN\'3f (UTF-16 code units, signed; Word's own form). */
function rtfEsc(s: string) {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === "\\" || ch === "{" || ch === "}") out += "\\" + ch;
    else if (ch === "\n") out += "\\line ";
    else if (ch === "\t") out += "\\tab ";
    else if (code < 0x20) continue;
    else if (code < 0x80) out += ch;
    else for (let i = 0; i < ch.length; i++) { const u = ch.charCodeAt(i); out += `\\u${u > 32767 ? u - 65536 : u}\\'3f`; } // \'3f = "?" fallback; unambiguous unlike a bare "?"
  }
  return out;
}

const rtfSegs = (segs: Segment[]) => segs.map((s) => (s.italic ? `{\\i ${rtfEsc(s.text)}}` : rtfEsc(s.text))).join("");

function rtfDoc(list: Entry[], style: "APA" | "MLA") {
  const head = style === "APA" ? `{\\b ${HEADING.APA}}` : HEADING.MLA;
  return [
    "{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1",
    "{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}}",
    "\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440\\widowctrl",
    `\\pard\\plain\\qc\\sl480\\slmult1\\sb0\\sa0\\f0\\fs24 ${head}\\par`,
    ...list.map((e) => `\\pard\\plain\\ql\\fi-720\\li720\\sl480\\slmult1\\sb0\\sa0\\f0\\fs24 ${rtfSegs(e.c.citationParts[style])}\\par`),
    "}",
  ].join("\n") + "\n";
}

/** "Download citations": BibTeX -> references.bib; APA/MLA -> RTF reference list (hanging indent, double spacing, 12pt Times). */
export function buildCitationFile(papers: PaperResult[], style: CiteStyle): { name: string; mime: string; body: string } {
  const list = entries(papers, style);
  if (style === "BibTeX") return { name: "references.bib", mime: "application/x-bibtex", body: refList(list, style).text };
  return { name: `references-${style.toLowerCase()}.rtf`, mime: "application/rtf", body: rtfDoc(list, style) };
}
