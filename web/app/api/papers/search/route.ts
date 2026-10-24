import { paperMeta, retrieve, serverError } from "@/lib/rag";

const clean = (t: string) => t.replace(/^#+\s*/gm, "").replace(/[|*_`>]+/g, " ").replace(/\s+/g, " ").trim();

/** Snippet of `text` around the first query word it contains. */
function snippet(text: string, q: string) {
  const t = clean(text);
  const lower = t.toLowerCase();
  const word = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2).find((w) => lower.includes(w));
  const at = word ? lower.indexOf(word) : 0;
  const start = Math.max(0, at - 40);
  const s = t.slice(start, start + 110).replace(/^\S*\s/, start ? "" : "$&").trim();
  return `${start ? "…" : ""}${s}${start + 110 < t.length ? "…" : ""}`;
}

/** Papers whose text matches a term (Cortex Search), best first. Used by the paper pickers. */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2 || q.length > 200) return Response.json({ results: [] });
  try {
    const [hits, meta] = await Promise.all([retrieve(q, 10), paperMeta()]);
    const seen = new Map<string, string>();
    for (const h of hits) if (!seen.has(h.file) && meta[h.file]) seen.set(h.file, h.chunk);
    const results = [...seen].slice(0, 6).map(([file, chunk]) => ({ file, title: meta[file].title, snippet: snippet(chunk, q) }));
    return Response.json({ results });
  } catch (e) {
    return serverError(e);
  }
}
