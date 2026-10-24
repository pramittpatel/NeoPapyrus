import { buildCitations } from "@/lib/cite";
import { locatePage } from "@/lib/pages";
import { ordinal, splitFile, type AnswerResult, type PaperResult, type Stance } from "@/lib/format";
import {
  complete, completeJson, fail, logQuestion, paperMeta, readQuestion, retrieve, serverError, type Hit, type Meta,
} from "@/lib/rag";

type SubQ = { question: string; query: string };
type Found = { file: string; subIdx: number; rank: number; of: number; chunks: Hit[] };

const CITE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
const clean = (t: string) => t.replace(/^#+\s*/gm, "").replace(/\n{3,}/g, "\n\n").trim();
const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n).replace(/\s+\S*$/, "") + "…" : t);

async function decompose(question: string, count: number): Promise<SubQ[]> {
  const parts = await completeJson<SubQ[]>(
    `Break this research question into ${count} narrower sub-questions, each a specific part of what is asked. ` +
      "Keep the question's own key terms (domain, task, method); never ask for definitions of basic terms. " +
      `For each, give a keyword search query (3-6 words). Reply with ONLY a JSON array like [{"question":"...","query":"..."}].\n\nQuestion: ${question}`,
  );
  const ok = (parts ?? []).filter((p) => p && typeof p.question === "string" && typeof p.query === "string").slice(0, count);
  return [{ question, query: question }, ...ok];
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const question = readQuestion(body.question);
  if (!question) return fail("Enter a question of up to 500 characters.");
  const deep = body.deep === true;
  try {
    const [meta, subqs] = await Promise.all([paperMeta(), decompose(question, deep ? 3 : 2)]);
    const collection = typeof body.collection === "string" && body.collection !== "all" ? body.collection : "all";
    const scope = collection === "all" ? undefined : Object.values(meta).filter((m) => m.family === collection).map((m) => m.file);
    if (scope && scope.length === 0) return fail("That collection has no papers. Pick another collection.");

    // Search each sub-question separately, then merge papers by best rank.
    const lists = await Promise.all(subqs.map((s) => retrieve(s.query, deep ? 10 : 6, scope)));
    const found = new Map<string, Found>();
    const order: { file: string; subIdx: number; rank: number; of: number }[] = [];
    lists.forEach((hits, subIdx) => {
      const seen: string[] = [];
      hits.forEach((h) => { if (!seen.includes(h.file)) seen.push(h.file); });
      seen.forEach((file, rank) => order.push({ file, subIdx, rank, of: seen.length }));
    });
    order.sort((a, b) => a.rank - b.rank || a.subIdx - b.subIdx);
    for (const o of order) if (!found.has(o.file)) found.set(o.file, { ...o, chunks: [] });
    lists.forEach((hits) => hits.forEach((h) => {
      const f = found.get(h.file)!;
      if (f.chunks.length < 2 && !f.chunks.some((c) => c.chunk_id === h.chunk_id)) f.chunks.push(h);
    }));
    const ranked = [...found.values()];
    const candidates = ranked.slice(0, 6);
    const passages = lists.reduce((n, l) => n + l.length, 0);

    const label = (f: Found): Meta =>
      meta[f.file] ?? { file: f.file, title: splitFile(f.file).rest, authors: [], family: "Uncategorized", arxivId: "", year: "", venue: "arXiv", url: "" };
    const context = candidates.map((f, i) => {
      const m = label(f);
      return `[${i + 1}] ${m.title}${m.year ? ` (${m.year})` : ""}\n${f.chunks.map((c) => clean(c.chunk)).join("\n---\n")}`;
    }).join("\n\n");

    const raw = await complete(
      "You are a research assistant. Use ONLY the numbered sources below. Format exactly:\n" +
        "Line 1: '# ' then a headline of at most 8 words stating what the sources show.\n" +
        "Then one short intro paragraph. If the sources fall into distinct groups, a numbered list where each item starts " +
        "with a **bold lead.** and then one or two sentences. Finish with a line starting '**Short answer:**'.\n" +
        "Cite every claim with its source number like [1] or [1, 3]. Use only numbers that appear below. " +
        "If the sources do not answer the question, say so plainly. Under 220 words.\n\n" +
        `Sources:\n${context}\n\nQuestion: ${question}`,
    );

    // Keep only papers the answer actually cites, renumbered in order of first use.
    const used: number[] = [];
    for (const m of raw.matchAll(CITE)) for (const x of m[1].split(",")) {
      const n = Number(x.trim());
      if (n >= 1 && n <= candidates.length && !used.includes(n)) used.push(n);
    }
    const remap = new Map(used.map((old, i) => [old, i + 1]));
    const renumbered = raw.replace(CITE, (_s, g: string) => {
      const ns = g.split(",").map((x) => remap.get(Number(x.trim()))).filter((x): x is number => !!x);
      return ns.length ? `[${ns.join(", ")}]` : "";
    });
    const lines = renumbered.trim().split("\n");
    const hasTitle = /^#\s+/.test(lines[0]);
    const title = hasTitle ? lines[0].replace(/^#\s+/, "").trim() : "Answer";
    const answer = (hasTitle ? lines.slice(1) : lines).join("\n").trim();

    const citedFound = used.map((old) => candidates[old - 1]);
    const unused = [...candidates.filter((_, i) => !used.includes(i + 1)), ...ranked.slice(6)].slice(0, 3);
    const sentenceFor = (n: number) => {
      const sentences = answer.replace(/\n+/g, " ").split(/(?<=[.!?])\s+/);
      const hit = sentences.find((s) => [...s.matchAll(CITE)].some((m) => m[1].split(",").some((x) => Number(x.trim()) === n)));
      return hit ? clip(hit.replace(CITE, "").replace(/\*\*/g, "").replace(/\s+([.,])/g, "$1").trim(), 220) : "";
    };

    const [analyses, alts] = await Promise.all([
      Promise.all(citedFound.map(async (f) => {
        const ex = f.chunks.map((c) => clean(c.chunk)).join("\n---\n");
        const r = await completeJson<{ stance?: string; summary?: string }>(
          'Reply with ONLY JSON {"stance":"supports|partial|unclear","summary":"..."}. "summary" is one sentence ' +
            "(max 35 words) saying what this passage states that is relevant to the question; use only the passage. " +
            '"stance" is whether the passage supports a direct answer, partly addresses it, or is unclear.\n' +
            `Question: ${question}\nPassage from "${label(f).title}":\n${ex}`,
        );
        const stance: Stance = r?.stance === "supports" || r?.stance === "partial" ? r.stance : "unclear";
        return { stance, summary: typeof r?.summary === "string" ? r.summary : "" };
      })),
      Promise.all(unused.map(async (f) => ({
        name: label(f).title,
        why: clip((await complete(
          "In one sentence (max 30 words), say why this paper is less useful for answering the question than the cited " +
            "papers, using only the passage. Do not invent details.\n" +
            `Question: ${question}\nPassage:\n${f.chunks.map((c) => clean(c.chunk)).join("\n---\n")}`,
        )).replace(/^"|"$/g, "").trim(), 240),
      }))),
    ]);

    const pageNums = await Promise.all(citedFound.map((f) => locatePage(f.file, f.chunks[0].chunk)));
    const papers: PaperResult[] = citedFound.map((f, i) => {
      const m = label(f);
      const sub = subqs[f.subIdx];
      const first = f.chunks[0];
      const authors = m.authors ?? [];
      const authorLine = authors.length > 3 ? `${authors.slice(0, 3).join(", ")}, et al.` : authors.join(", ");
      return {
        n: i + 1, file: f.file, title: m.title, authors, authorLine, year: m.year ?? "", venue: m.venue ?? "arXiv",
        url: m.url ?? "", family: m.family ?? "Uncategorized",
        stance: analyses[i].stance, subq: sub.question, query: sub.query,
        rank: `Ranked ${ordinal(f.rank + 1)} of ${f.of} papers for this search`,
        where: pageNums[i] ? `Page ${pageNums[i]}` : "Passage", page: pageNums[i],
        summary: analyses[i].summary, passage: clip(clean(first.chunk), 900),
        usedIn: sentenceFor(i + 1),
        citations: buildCitations({ authors, year: m.year ?? "n.d.", title: m.title, arxivId: m.arxivId ?? "" }),
      };
    });

    const years = papers.map((p) => Number(p.year)).filter(Boolean);
    const result: AnswerResult = {
      id: crypto.randomUUID(), question, collection, title, answer,
      stats: { papers: found.size, passages, cited: papers.length },
      papers, alts,
      yearRange: years.length ? (Math.min(...years) === Math.max(...years) ? String(years[0]) : `${Math.min(...years)}–${Math.max(...years)}`) : "",
    };
    await logQuestion("Ask", question, candidates.flatMap((f) => f.chunks));
    return Response.json(result);
  } catch (e) {
    return serverError(e);
  }
}
