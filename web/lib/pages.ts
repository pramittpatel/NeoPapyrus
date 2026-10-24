import { query } from "./snowflake";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cache = new Map<string, Promise<string[]>>();

function pagesOf(file: string) {
  let p = cache.get(file);
  if (!p) {
    p = query<{ TEXT: string }>("SELECT text FROM paper_pages WHERE file = ? ORDER BY page", [file])
      .then((rows) => rows.map((r) => norm(r.TEXT ?? "")))
      .catch(() => (cache.delete(file), []));
    cache.set(file, p);
  }
  return p;
}

/** 1-based PDF page that contains the start of a retrieved chunk, or null if it can't be matched. */
export async function locatePage(file: string, chunk: string): Promise<number | null> {
  const pages = await pagesOf(file);
  const text = norm(chunk);
  for (const len of [160, 80, 40]) {
    const snippet = text.slice(0, len);
    if (snippet.length < 20) break;
    const i = pages.findIndex((p) => p.includes(snippet));
    if (i >= 0) return i + 1;
  }
  return null;
}
