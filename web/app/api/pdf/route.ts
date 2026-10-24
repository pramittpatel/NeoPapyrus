import { paperMeta } from "@/lib/rag";
import { query } from "@/lib/snowflake";

/** Streams a paper's PDF from the Snowflake stage. Only files listed in paper_meta can be requested. */
export async function GET(req: Request) {
  const file = new URL(req.url).searchParams.get("file") ?? "";
  if (!/^[^'"\\/\u0000-\u001f]+\.pdf$/i.test(file) || !(file in (await paperMeta()))) return new Response("Paper not found", { status: 404 });
  try {
    // GET_PRESIGNED_URL needs a constant path, so it is inlined; the name is in paper_meta and has no quotes, slashes or control characters.
    const rows = await query<{ U: string }>(`SELECT GET_PRESIGNED_URL(@PAPERCOURT.PUBLIC.papers, '${file}', 300) AS u`);
    const range = req.headers.get("range");
    const upstream = await fetch(rows[0].U, range ? { headers: { Range: range } } : undefined);
    if (!upstream.ok || !upstream.body) return new Response("PDF unavailable", { status: 502 });
    const headers = new Headers({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file.replace(/[^\w.-]+/g, "_")}"`,
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
    });
    for (const h of ["content-length", "content-range"]) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (e) {
    console.error(e);
    return new Response("PDF unavailable", { status: 502 });
  }
}
