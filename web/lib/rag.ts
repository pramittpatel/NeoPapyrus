import { tidy } from "./cite";
import { matchesCollection, type PaperSource } from "./format";
import { query } from "./snowflake";

export const MODEL = process.env.CORTEX_MODEL ?? "llama3.3-70b";
const SERVICE = "PAPERCOURT.PUBLIC.papers_search";

export type Hit = { file: string; chunk_id: number; chunk: string };

export const RULES =
  "Answer ONLY from the numbered excerpts. Cite every claim like [1]. " +
  "If the excerpts don't contain the answer, say so. Be concise.";

/** `files` restricts the search to those papers (a single file or several). */
export async function retrieve(question: string, limit = 6, files?: string | string[]): Promise<Hit[]> {
  const req: Record<string, unknown> = {
    query: question,
    columns: ["file", "chunk_id", "chunk"],
    limit,
  };
  const list = typeof files === "string" ? [files] : files;
  if (list?.length) req.filter = list.length === 1 ? { "@eq": { file: list[0] } } : { "@or": list.map((file) => ({ "@eq": { file } })) };
  const rows = await query<{ R: string }>(
    "SELECT SNOWFLAKE.CORTEX.SEARCH_PREVIEW(?, ?) AS r",
    [SERVICE, JSON.stringify(req)],
  );
  return JSON.parse(rows[0].R).results as Hit[];
}

export async function complete(prompt: string): Promise<string> {
  const rows = await query<{ R: string }>("SELECT AI_COMPLETE(?, ?) AS r", [MODEL, prompt]);
  const raw = rows[0].R;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "string" ? parsed : raw;
  } catch {
    return raw;
  }
}

export function contextBlock(hits: Hit[]) {
  return hits.map((h, i) => `[${i + 1}] (${h.file})\n${h.chunk}`).join("\n\n");
}

export async function logQuestion(tab: string, question: string, hits: Hit[]) {
  const papers = JSON.stringify([...new Set(hits.map((h) => h.file))].sort());
  await query(
    "INSERT INTO question_log(tab, question, model, papers) SELECT ?, ?, ?, PARSE_JSON(?)",
    [tab, question, MODEL, papers],
  ).catch(() => {});
}

export function readQuestion(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 && v.length <= 500 ? v.trim() : null;
}

export function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function serverError(e: unknown) {
  console.error(e);
  return fail("The request to Snowflake failed. Try again in a moment.", 502);
}


export type Meta = {
  file: string; title: string; authors: string[]; family: string;
  arxivId: string; year: string; venue: string; url: string; source: PaperSource;
};

let metaCache: Promise<Record<string, Meta>> | null = null;
let metaAt = 0;
const META_TTL = 5 * 60_000; // pick up newly ingested papers without a restart

/** file -> citation metadata. Title/authors/topic come from paper_meta; id, year and url are derived from the arXiv filename. */
export function paperMeta() {
  if (Date.now() - metaAt > META_TTL) { metaCache = null; metaAt = Date.now(); }
  metaCache ??= query<{ FILE: string; META: unknown }>("SELECT file, meta FROM paper_meta")
    .then((rows) => {
      const out: Record<string, Meta> = {};
      for (const r of rows) {
        const m = (typeof r.META === "string" ? JSON.parse(r.META) : r.META ?? {}) as Record<string, unknown>;
        const arxiv = /^(?:\d{4}\.\d{4,5}|[a-z-]+_\d{7})v\d+(?=_)/.exec(r.FILE)?.[0] ?? "";
        const arxivId = arxiv.replace("_", "/");
        const yy = /^(\d{2})\d{2}\./.exec(arxiv)?.[1];
        const metaYear = typeof m.year === "string" && /^\d{4}$/.test(m.year.trim()) ? m.year.trim() : "";
        const year = metaYear || (yy ? String(2000 + Number(yy)) : "");
        const fallback = r.FILE.replace(/\.pdf$/i, "").split("_").slice(arxiv ? 1 : 0).join(" ");
        const venue = typeof m.venue === "string" && m.venue.trim() ? m.venue.trim() : arxiv ? `arXiv${year ? ` ${year}` : ""}` : "";
        out[r.FILE] = {
          file: r.FILE,
          title: typeof m.title === "string" && m.title ? m.title : fallback,
          authors: Array.isArray(m.authors) ? (m.authors as string[]).filter((x) => typeof x === "string").map(tidy) : [],
          family: typeof m.family === "string" && m.family ? m.family : "Uncategorized",
          arxivId, year, venue,
          url: arxivId ? `https://arxiv.org/abs/${arxivId.replace(/v\d+$/, "")}` : "",
          source: m.source === "team" || m.source === "arxiv" ? m.source : arxiv ? "arxiv" : "team",
        };
      }
      return out;
    })
    .catch(() => ((metaCache = null), {}));
  return metaCache;
}

/** Ask the model for JSON; tolerate fences and chatter. Returns null if nothing parses. */
export async function completeJson<T>(prompt: string): Promise<T | null> {
  const text = (await complete(prompt)).replace(/```(?:json)?/g, "");
  const start = text.search(/[\[{]/);
  if (start < 0) return null;
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  try { return JSON.parse(text.slice(start, end + 1)) as T; } catch { return null; }
}

/** Files in a collection ("all" -> undefined, meaning no filter). */
export async function scopeFor(collection: unknown): Promise<string[] | undefined> {
  if (typeof collection !== "string" || collection === "all") return undefined;
  return Object.values(await paperMeta()).filter((m) => matchesCollection(m, collection)).map((m) => m.file);
}
