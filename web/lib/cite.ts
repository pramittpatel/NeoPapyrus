import { splitFile, type CitationParts, type CiteStyle, type PaperResult, type Segment } from "./format";

export type { CitationParts, Segment } from "./format";

/** Names arrive as printed on the paper; fix "Holger R. ROTH" style casing. */
export function tidy(name: string) {
  return name.split(/\s+/).map((t) => (t.length > 1 && t === t.toUpperCase() ? t[0] + t.slice(1).toLowerCase() : t)).join(" ");
}
const PARTICLES = new Set(["de", "la", "le", "da", "di", "do", "del", "der", "den", "van", "von", "bin", "ibn", "al", "el", "du", "dos", "das", "ten", "ter"]);

type Name = { first: string; last: string; initials: string };

function parts(name: string): Name {
  const clean = tidy(name.trim());
  const comma = clean.indexOf(",");
  let first: string[], last: string[];
  if (comma > 0) { // already "Surname, Given"
    last = [clean.slice(0, comma).trim()];
    first = clean.slice(comma + 1).trim().split(/\s+/).filter(Boolean);
  } else {
    first = clean.split(/\s+/);
    last = [first.pop() ?? ""];
    while (first.length > 1 && PARTICLES.has(first[first.length - 1].toLowerCase())) last.unshift(first.pop()!);
  }
  // "Jean-Pierre" -> "J.-P."
  const initials = first.map((x) => x.split("-").filter(Boolean).map((s) => s[0] + ".").join("-")).join(" ");
  return { first: first.join(" "), last: last.join(" "), initials };
}

/** First author's surname, normalised for sorting ("María de la Cruz" -> "de la cruz"). */
export function sortSurname(authors: string[] | undefined) {
  const a = (authors ?? []).find((x) => x.trim());
  return a ? parts(a).last.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() : "";
}

export type CiteInput = { authors: string[]; year: string; title: string; arxivId: string; venue?: string };
export type CitationSet = { citations: Record<CiteStyle, string>; citationParts: CitationParts; inText: Record<CiteStyle, string> };

const yearOf = (y: string | undefined) => { const t = (y ?? "").trim(); return t && t.toLowerCase() !== "n.d." ? t : ""; };
const endDot = (s: string) => (/[.?!]$/.test(s) ? s : `${s}.`);
const ascii = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const STOP = new Set(["a", "an", "the", "on", "of", "in", "for", "to", "and", "with", "is", "are", "do", "does", "can"]);
const bibEsc = (s: string) => s.replace(/(?<!\\)([&%#_])/g, "\\$1");

/** Join segments into plain text. */
export const plain = (segs: Segment[]) => segs.map((s) => s.text).join("");

/** Segment builder that merges neighbours with the same styling. */
function seg() {
  const out: Segment[] = [];
  const add = (text: string, italic = false) => {
    if (!text) return add;
    const last = out[out.length - 1];
    if (last && !!last.italic === italic) last.text += text;
    else out.push(italic ? { text, italic } : { text });
    return add;
  };
  return { out, add };
}

function baseKey(m: CiteInput) {
  const a = m.authors.filter((x) => x.trim());
  const who = a.length ? ascii(parts(a[0]).last) : "";
  const word = m.title.split(/\s+/).map(ascii).find((w) => w && !STOP.has(w)) ?? "";
  return `${who || "paper"}${yearOf(m.year)}${word}`;
}

const shortTitle = (t: string) => {
  const w = t.replace(/[.:?!].*$/, "").split(/\s+/).filter(Boolean);
  return w.slice(0, 4).join(" ") + (w.length > 4 ? "…" : "");
};

/**
 * APA 7 / MLA 9 / BibTeX for one paper, as styled segments plus plain strings and in-text citations.
 * `peers` (all papers in the same answer, including this one at `index`) makes BibTeX keys unique: colliding keys get a, b, ...
 */
export function buildCitations(m: CiteInput, peers?: CiteInput[], index?: number): CitationSet {
  const a = m.authors.filter((x) => x.trim()).map(parts);
  const y = yearOf(m.year);
  const title = m.title.trim().replace(/\s+/g, " ").replace(/\.$/, "") || "Untitled";
  const id = m.arxivId.trim().replace(/v\d+$/, "");
  const venue = (m.venue ?? "").trim();
  const preprint = /^(arxiv|corr)\b/i.test(venue) || (!!id && !venue);
  const journal = preprint ? "" : venue;
  const doi = id ? `https://doi.org/10.48550/arXiv.${id}` : "";

  // ---- APA 7
  const apaName = (p: Name) => (p.initials ? `${p.last}, ${p.initials}` : p.last);
  const n = a.map(apaName);
  const apaWho = n.length === 0 ? "" : n.length === 1 ? n[0] : n.length === 2 ? `${n[0]}, & ${n[1]}`
    : n.length <= 20 ? `${n.slice(0, -1).join(", ")}, & ${n[n.length - 1]}` : `${n.slice(0, 19).join(", ")}, . . . ${n[n.length - 1]}`;
  const apa = seg();
  const apaDate = `(${y || "n.d."}).`;
  const apaTitle = () => {
    if (journal) apa.add(endDot(title));
    else { apa.add(title, true); apa.add(preprint ? " [Preprint]." : /[?!]$/.test(title) ? "" : "."); }
  };
  const apaSource = () => {
    if (journal) apa.add(" ")(journal, true)(".");
    else if (preprint) apa.add(` arXiv.${doi ? ` ${doi}` : ""}`);
  };
  if (apaWho) { apa.add(`${endDot(apaWho)} ${apaDate} `); apaTitle(); }
  else { apaTitle(); apa.add(` ${apaDate}`); }
  apaSource();

  // ---- MLA 9
  const full = (p: Name) => [p.first, p.last].filter(Boolean).join(" ");
  const inv = (p: Name) => (p.first ? `${p.last}, ${p.first}` : p.last);
  const mlaWho = a.length === 0 ? "" : a.length === 1 ? inv(a[0]) : a.length === 2 ? `${inv(a[0])}, and ${full(a[1])}` : `${inv(a[0])}, et al`;
  const mla = seg();
  if (mlaWho) mla.add(`${endDot(mlaWho)} `);
  if (journal || preprint) {
    mla.add(`“${/[?!]$/.test(title) ? title : `${title}.`}” `);
    mla.add(journal || "arXiv", true);
    mla.add(`${y ? `, ${y}` : ""}${preprint && doi ? `, ${doi}` : ""}.`);
  } else {
    mla.add(title, true)(/[?!]$/.test(title) ? "" : ".");
    if (y) mla.add(` ${y}.`);
  }

  // ---- BibTeX
  let key = baseKey(m);
  if (peers && index !== undefined && index >= 0) {
    const keys = peers.map(baseKey);
    if (keys.filter((k) => k === key).length > 1) key += String.fromCharCode(97 + keys.slice(0, index).filter((k) => k === key).length);
  }
  const author = a.map((p) => bibEsc(p.first ? `${p.last}, ${p.first}` : p.last)).join(" and ");
  const fields: [string, string][] = [["title", bibEsc(title)]];
  if (author) fields.push(["author", author]);
  if (journal) fields.push(["journal", bibEsc(journal)]);
  if (y) fields.push(["year", y]);
  if (preprint && id) fields.push(["eprint", id], ["archivePrefix", "arXiv"], ["doi", `10.48550/arXiv.${id}`]);
  const w = Math.max(...fields.map((f) => f[0].length));
  const bib = `@${journal ? "article" : "misc"}{${key},\n${fields.map(([k, v]) => `  ${k.padEnd(w)} = {${v}}`).join(",\n")}\n}`;

  // ---- in-text
  const last = a.map((p) => p.last);
  const yy = y || "n.d.";
  const short = `“${shortTitle(title)}`;
  const inText: Record<CiteStyle, string> = {
    APA: last.length === 0 ? `(${short},” ${yy})` : last.length === 1 ? `(${last[0]}, ${yy})` : last.length === 2 ? `(${last[0]} & ${last[1]}, ${yy})` : `(${last[0]} et al., ${yy})`,
    MLA: last.length === 0 ? `(${short}”)` : last.length === 1 ? `(${last[0]})` : last.length === 2 ? `(${last[0]} and ${last[1]})` : `(${last[0]} et al.)`,
    BibTeX: `\\cite{${key}}`,
  };

  const citationParts: CitationParts = { APA: apa.out, MLA: mla.out, BibTeX: [{ text: bib }] };
  return {
    citationParts,
    inText,
    citations: { APA: plain(apa.out), MLA: plain(mla.out), BibTeX: bib },
  };
}

/** Rebuild the citation input from a stored result (old cached results lack citationParts/inText). */
function inputOf(p: PaperResult): CiteInput {
  const fromUrl = /arxiv\.org\/abs\/(.+)$/.exec(p.url ?? "")?.[1] ?? "";
  const fromFile = splitFile(p.file ?? "").id;
  const arxivId = fromUrl || (/^(\d{4}\.\d{4,5}|[a-z-]+[_/]\d{7})(v\d+)?$/.test(fromFile) ? fromFile.replace("_", "/") : "");
  return { authors: p.authors ?? [], year: p.year ?? "", title: p.title ?? "", arxivId, venue: p.venue ?? "" };
}

/** The citation set for a stored paper: stored fields if present, else rebuilt, else the plain strings. */
export function citationOf(p: PaperResult, peers?: PaperResult[]): CitationSet {
  if (p.citationParts && p.inText) return { citations: p.citations, citationParts: p.citationParts, inText: p.inText };
  try {
    return buildCitations(inputOf(p), peers?.map(inputOf), peers?.indexOf(p));
  } catch {
    const c = p.citations ?? { APA: p.title, MLA: p.title, BibTeX: "" };
    const who = sortSurname(p.authors) ? tidy(p.authors[0]).split(/\s+/).pop() : p.title;
    return {
      citations: c,
      citationParts: { APA: [{ text: c.APA }], MLA: [{ text: c.MLA }], BibTeX: [{ text: c.BibTeX }] },
      inText: { APA: `(${who}, ${p.year || "n.d."})`, MLA: `(${who})`, BibTeX: `\\cite{${/^@\w+\{([^,]+),/.exec(c.BibTeX)?.[1] ?? "paper"}}` },
    };
  }
}
