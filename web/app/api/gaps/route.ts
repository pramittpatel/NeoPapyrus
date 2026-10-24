import { complete, contextBlock, fail, logQuestion, paperMeta, readQuestion, retrieve, scopeFor, serverError } from "@/lib/rag";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const topic = readQuestion(body.question);
  if (!topic) return fail("Enter a topic of up to 500 characters.");
  try {
    const meta = await paperMeta();
    const hits = await retrieve(topic, 10, await scopeFor(body.collection));
    const answer = await complete(
      "From the numbered excerpts only, write three short sections titled exactly: Agree, Disagree, Open gaps. " +
        "Cite [n] on every point. Do not invent anything.\n\n" + contextBlock(hits),
    );
    await logQuestion("Gaps", topic, hits);
    const sources = hits.map((h) => ({ ...h, title: meta[h.file]?.title ?? h.file }));
    return Response.json({ answer, sources });
  } catch (e) {
    return serverError(e);
  }
}
