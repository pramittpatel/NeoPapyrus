import { complete, contextBlock, fail, logQuestion, readQuestion, retrieve, serverError } from "@/lib/rag";

const RULES =
  "Answer ONLY from the excerpts. Quote or paraphrase briefly. Do not use bracketed citation numbers. " +
  "If the excerpts do not address the question, say so. Be concise (under 120 words).";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const question = readQuestion(body.question);
  const { a, b } = body as { a?: string; b?: string };
  if (!question || !a || !b) return fail("Pick two papers and enter a question.");
  if (a === b) return fail("Pick two different papers.");
  try {
    const [ha, hb] = await Promise.all([retrieve(question, 4, a), retrieve(question, 4, b)]);
    const [argA, argB] = await Promise.all([
      complete(`You are the advocate for paper A. ${RULES}\nExcerpts:\n${contextBlock(ha)}\nQuestion: ${question}`),
      complete(`You are the advocate for paper B. ${RULES}\nExcerpts:\n${contextBlock(hb)}\nQuestion: ${question}`),
    ]);
    const verdict = await complete(
      "You are the judge. State where A and B agree and where they disagree, using only these arguments. Do not use bracketed numbers. " +
        `Do not add facts. If they do not actually conflict, say so.\nQuestion: ${question}\nA: ${argA}\nB: ${argB}`,
    );
    await logQuestion("Debate", question, [...ha, ...hb]);
    return Response.json({ a: { arg: argA, sources: ha }, b: { arg: argB, sources: hb }, verdict });
  } catch (e) {
    return serverError(e);
  }
}
