export type Stance = "supports" | "partial" | "unclear";
export type CiteStyle = "APA" | "MLA" | "BibTeX";
export const CITE_STYLES: CiteStyle[] = ["APA", "MLA", "BibTeX"];

export type PaperResult = {
  n: number;
  file: string;
  title: string;
  authors: string[];
  authorLine: string;
  year: string;
  venue: string;
  url: string;
  family: string;
  stance: Stance;
  subq: string;
  query: string;
  rank: string;
  where: string;
  page: number | null;
  summary: string;
  passage: string;
  usedIn: string;
  citations: Record<CiteStyle, string>;
};

export type AnswerResult = {
  id: string;
  question: string;
  collection: string;
  title: string;
  answer: string;
  stats: { papers: number; passages: number; cited: number };
  papers: PaperResult[];
  alts: { name: string; why: string }[];
  yearRange: string;
};

/** "2309.11295v2_CPLLM_Clinical.pdf" -> { id: "2309.11295v2", rest: "CPLLM Clinical" } */
export function splitFile(file: string) {
  const base = file.replace(/\.pdf$/i, "");
  const i = base.indexOf("_");
  return { id: i > 0 ? base.slice(0, i) : "", rest: (i > 0 ? base.slice(i + 1) : base).replace(/_/g, " ") };
}

export const STANCE_LABEL: Record<Stance, string> = { supports: "Supports", partial: "Partial", unclear: "Unclear" };

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
