import type { CiteStyle } from "./format";

/** Names arrive as printed on the paper; fix "Holger R. ROTH" style casing. */
export function tidy(name: string) {
  return name.split(/\s+/).map((t) => (t.length > 1 && t === t.toUpperCase() ? t[0] + t.slice(1).toLowerCase() : t)).join(" ");
}
function parts(name: string) {
  const t = tidy(name).split(/\s+/);
  const last = t.pop() ?? "";
  return { first: t.join(" "), last, initials: t.map((x) => x[0] + ".").join(" ") };
}

export function buildCitations(m: { authors: string[]; year: string; title: string; arxivId: string }): Record<CiteStyle, string> {
  const a = m.authors.map(parts);
  const id = m.arxivId ? `arXiv:${m.arxivId.replace(/v\d+$/, "")}` : "";
  const apaName = (p: ReturnType<typeof parts>) => `${p.last}, ${p.initials}`.trim();
  let apaAuthors = "";
  if (a.length === 1) apaAuthors = apaName(a[0]);
  else if (a.length === 2) apaAuthors = `${apaName(a[0])}, & ${apaName(a[1])}`;
  else if (a.length > 2 && a.length <= 20) apaAuthors = a.slice(0, -1).map(apaName).join(", ") + `, & ${apaName(a[a.length - 1])}`;
  else if (a.length > 20) apaAuthors = a.slice(0, 19).map(apaName).join(", ") + ", ... " + apaName(a[a.length - 1]);
  const sentence = m.title.replace(/\.$/, "");
  let mlaAuthors = "";
  if (a.length === 1) mlaAuthors = `${a[0].last}, ${a[0].first}`;
  else if (a.length === 2) mlaAuthors = `${a[0].last}, ${a[0].first}, and ${a[1].first} ${a[1].last}`;
  else if (a.length > 2) mlaAuthors = `${a[0].last}, ${a[0].first}, et al`;
  const key = `${(a[0]?.last ?? "paper").toLowerCase().replace(/[^a-z]/g, "")}${m.year}${(m.title.split(/\s+/)[0] ?? "").toLowerCase().replace(/[^a-z]/g, "")}`;
  return {
    APA: `${apaAuthors} (${m.year}). ${sentence}. ${id}`.replace(/\s+\.$/, "."),
    MLA: `${mlaAuthors}. “${sentence}.” arXiv, ${m.year}${id ? `, ${id}` : ""}.`,
    BibTeX: `@article{${key}, title={${m.title}}, author={${m.authors.map(tidy).join(" and ")}}, journal={${id || "arXiv"}}, year={${m.year}}}`,
  };
}
