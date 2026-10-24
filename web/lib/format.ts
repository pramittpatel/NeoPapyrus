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
  /** Styled reference (italic runs). Absent on results cached before it existed: use citationOf() from lib/cite. */
  citationParts?: CitationParts;
  /** In-text citation per style: "(Shoham & Rappoport, 2023)", "(Shoham and Rappoport)", "\cite{key}". */
  inText?: Record<CiteStyle, string>;
};

/** A run of citation text; italic where the style requires it (journal, preprint title). */
export type Segment = { text: string; italic?: boolean };
export type CitationParts = Record<CiteStyle, Segment[]>;

export type AnswerResult = {
  id: string;
  question: string;
  collection: string;
  level: ExplainLevel;
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

export type PaperSource = "team" | "arxiv";

/** Collections are either a source ("src:team", "src:arxiv") or a topic family; "all" matches everything. */
export function matchesCollection(p: { family: string | null; source: PaperSource | string | null }, collection: string) {
  if (collection === "all") return true;
  if (collection.startsWith("src:")) return p.source === collection.slice(4);
  return p.family === collection;
}

export const SOURCE_LABEL: Record<PaperSource, string> = { team: "Team papers", arxiv: "arXiv papers" };

export const EXPLAIN_LEVELS = ["High-schooler", "Undergrad", "PhD"] as const;
export type ExplainLevel = (typeof EXPLAIN_LEVELS)[number];
