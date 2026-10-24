import { complete, completeJson, contextBlock, fail, logQuestion, paperMeta, readQuestion, retrieve, serverError, type Hit } from "@/lib/rag";

const RULES =
  "Answer ONLY from the excerpts. Quote or paraphrase briefly. Do not use bracketed citation numbers. " +
  "If the excerpts do not address the question, say so. Be concise (under 120 words).";
const AUTO = "auto";

/** Distinct papers in rank order, with up to two passages each. */
function byPaper(hits: Hit[], exclude: string[]) {
  const out = new Map<string, Hit[]>();
  for (const h of hits) {
    if (exclude.includes(h.file)) continue;
    const list = out.get(h.file) ?? [];
    if (list.length < 2) out.set(h.file, [...list, h]);
  }
  return [...out];
}

const argue = (side: "A" | "B", hits: Hit[], question: string, opponent?: string) =>
  complete(
    `You are the advocate for paper ${side}. ${RULES}\n` +
      (opponent
        ? `Paper A argued: ${opponent}\nRespond from your paper's evidence: lead with where it disagrees with, qualifies or adds caveats to Paper A; then what it adds. If your paper actually agrees, say so plainly.\n`
        : "") +
      `Excerpts:\n${contextBlock(hits)}\nQuestion: ${question}`,
  );

/**
 * Body: { question, a, b } where a/b are a paper file or "auto".
 * Auto A = the paper that best answers the question; auto B = the paper whose evidence most challenges A's argument.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const question = readQuestion(body.question);
  const a = typeof body.a === "string" ? body.a : AUTO;
  const b = typeof body.b === "string" ? body.b : AUTO;
  if (!question) return fail("Enter a question of up to 500 characters.");
  if (a !== AUTO && a === b) return fail("Pick two different papers, or set Paper B to automatic.");
  try {
    const meta = await paperMeta();
    for (const f of [a, b]) if (f !== AUTO && !meta[f]) return fail("One of the selected papers is no longer in the library. Pick it again.");
    const titleOf = (f: string) => meta[f]?.title ?? f;

    let fileA = a;
    let whyA = "";
    if (a === AUTO) {
      const best = byPaper(await retrieve(question, 12), b === AUTO ? [] : [b])[0];
      if (!best) return fail("No paper in the library addresses this question. Try rephrasing it.");
      fileA = best[0];
      whyA = "Best match for the question.";
    }
    const ha = await retrieve(question, 4, fileA);
    const argA = await argue("A", ha, question);

    let fileB = b;
    let whyB = "";
    if (b === AUTO) {
      const pool = byPaper(await retrieve(question, 25), [fileA]).slice(0, 5);
      if (!pool.length) return fail("No other paper addresses this question, so there is nothing to debate. Pick Paper B manually.");
      const pick = await completeJson<{ pick?: number; reason?: string }>(
        "Paper A argued the position below. Choose the candidate paper whose evidence most directly challenges, contradicts " +
          "or qualifies Paper A on this question. If none disagree, choose the one with the most different perspective. " +
          'Reply with ONLY JSON {"pick": <candidate number>, "reason": "<one sentence, max 25 words, on how it differs from A>"}.\n\n' +
          `Question: ${question}\nPaper A (${titleOf(fileA)}) argued: ${argA}\n\nCandidates:\n` +
          pool.map(([f, hs], i) => `[${i + 1}] ${titleOf(f)}\n${hs.map((h) => h.chunk.slice(0, 900)).join("\n---\n")}`).join("\n\n"),
      );
      const n = typeof pick?.pick === "number" && pick.pick >= 1 && pick.pick <= pool.length ? pick.pick : 1;
      fileB = pool[n - 1][0];
      whyB = typeof pick?.reason === "string" && pick.reason ? pick.reason : "Strongest available counterpoint to Paper A.";
    }
    const hb = await retrieve(question, 4, fileB);
    const argB = await argue("B", hb, question, argA);

    const verdict = await complete(
      "You are the judge. State where A and B agree and where they disagree, using only these arguments. Do not use bracketed numbers. " +
        `Do not add facts. If they do not actually conflict, say so.\nQuestion: ${question}\nA: ${argA}\nB: ${argB}`,
    );
    await logQuestion("Debate", question, [...ha, ...hb]);
    return Response.json({
      a: { file: fileA, title: titleOf(fileA), arg: argA, auto: a === AUTO, why: whyA },
      b: { file: fileB, title: titleOf(fileB), arg: argB, auto: b === AUTO, why: whyB },
      verdict,
    });
  } catch (e) {
    return serverError(e);
  }
}
