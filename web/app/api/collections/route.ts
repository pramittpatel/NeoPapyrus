import { paperMeta, serverError } from "@/lib/rag";

export async function GET() {
  try {
    const counts = new Map<string, number>();
    for (const m of Object.values(await paperMeta())) counts.set(m.family, (counts.get(m.family) ?? 0) + 1);
    const collections = [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return Response.json({ total: Object.keys(await paperMeta()).length, collections });
  } catch (e) {
    return serverError(e);
  }
}
