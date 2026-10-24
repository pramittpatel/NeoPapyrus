import { SOURCE_LABEL, type PaperSource } from "@/lib/format";
import { paperMeta, serverError } from "@/lib/rag";

export async function GET() {
  try {
    const all = Object.values(await paperMeta());
    const tally = (key: (m: (typeof all)[number]) => string) => {
      const counts = new Map<string, number>();
      for (const m of all) counts.set(key(m), (counts.get(key(m)) ?? 0) + 1);
      return counts;
    };
    const sources = [...tally((m) => m.source)].map(([s, count]) => ({ value: `src:${s}`, name: SOURCE_LABEL[s as PaperSource], count }))
      .sort((a, b) => (a.value === "src:team" ? -1 : b.value === "src:team" ? 1 : 0));
    const topics = [...tally((m) => m.family)].map(([name, count]) => ({ value: name, name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return Response.json({ total: all.length, collections: [...sources, ...topics] });
  } catch (e) {
    return serverError(e);
  }
}
