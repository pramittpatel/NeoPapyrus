import { citationOf } from "@/lib/cite";
import type { CiteStyle, PaperResult } from "@/lib/format";
import s from "./Citation.module.css";

/** One reference in the chosen style: italic runs as <em>, BibTeX as a line-preserving monospace block. Text only, never HTML. */
export default function Citation({ paper, style, peers }: { paper: PaperResult; style: CiteStyle; peers?: PaperResult[] }) {
  const parts = citationOf(paper, peers).citationParts[style];
  if (style === "BibTeX") return <code className={s.bib}>{parts.map((x) => x.text).join("")}</code>;
  return <span className={s.ref}>{parts.map((x, i) => (x.italic ? <em key={i}>{x.text}</em> : <span key={i}>{x.text}</span>))}</span>;
}
