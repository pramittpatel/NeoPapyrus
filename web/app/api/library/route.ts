import { query } from "@/lib/snowflake";
import { paperMeta, serverError } from "@/lib/rag";

type Row = { FILE: string; CARD: string | Record<string, string> | null };

export async function GET() {
  try {
    const [rows, meta] = await Promise.all([query<Row>("SELECT file, card FROM paper_cards ORDER BY file"), paperMeta()]);
    const papers = rows.map((r) => {
      const card: Record<string, string> = typeof r.CARD === "string" ? JSON.parse(r.CARD) : (r.CARD ?? {});
      const m = meta[r.FILE];
      return {
        file: r.FILE, title: m?.title ?? card.title ?? null, authors: m?.authors ?? [], year: m?.year ?? null,
        family: m?.family ?? null, source: m?.source ?? null, venue: m?.venue ?? null, url: m?.url ?? null,
        oneLine: card.one_line ?? null, method: card.method ?? null, keyFinding: card.key_finding ?? null, limitations: card.limitations ?? null,
      };
    });
    return Response.json({ papers });
  } catch (e) {
    return serverError(e);
  }
}
