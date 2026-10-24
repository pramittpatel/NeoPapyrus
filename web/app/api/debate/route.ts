import { withProgress, type Stage } from "@/lib/progress";
import { complete, completeJson, contextBlock, fail, logQuestion, paperMeta, readQuestion, retrieve, serverError, type Hit } from "@/lib/rag";

const RULES =
  "Answer ONLY from the excerpts. Quote or paraphrase briefly. Do not use bracketed citation numbers. " +
  "If the excerpts do not address the question, say so. Be concise (under 120 words).";
const AUTO = "auto";

type Topic = { title: string; why: string };
type Ruling = { agree: string[]; disagree: string[]; recency: string; gaps: string[]; topics: Topic[] };

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

type Paper = { title: string; year: string };
const dated = (p: Paper) => `"${p.title}" (${p.year || "year unknown"})`;

const argue = (side: "A" | "B", paper: Paper, hits: Hit[], question: string, opponent?: { paper: Paper; arg: string }) =>
  complete(
    `You are the advocate for paper ${side}, ${dated(paper)}. ${RULES}\n` +
      (opponent
        ? `Paper A, ${dated(opponent.paper)}, argued: ${opponent.arg}\nRespond from your paper's evidence: lead with where it disagrees with, qualifies or adds caveats to Paper A; then what it adds. ` +
          "If one paper is clearly newer, you may note what that means for the evidence. If your paper actually agrees, say so plainly.\n"
        : "") +
      `Excerpts:\n${contextBlock(hits)}\nQuestion: ${question}`,
  );

/**
 * Body: { question, a, b } where a/b are a paper file or "auto".
 * Auto A = the paper that best answers the question; auto B = the paper whose evidence most challenges A's argument.
 */
export const POST = (req: Request) => withProgress(req, (stage) => debate(req, stage));

async function debate(req: Request, stage: Stage) {
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
    const paperOf = (f: string): Paper => ({ title: titleOf(f), year: meta[f]?.year ?? "" });

    let fileA = a;
    let whyA = "";
    stage("read-a", a === AUTO ? "Finding the best paper for the question" : "Reading Paper A");
    if (a === AUTO) {
      const best = byPaper(await retrieve(question, 12), b === AUTO ? [] : [b])[0];
      if (!best) return fail("No paper in the library addresses this question. Try rephrasing it.");
      fileA = best[0];
      whyA = "Best match for the question.";
    }
    const ha = await retrieve(question, 4, fileA);
    stage("argue-a", "Paper A is arguing");
    const argA = await argue("A", paperOf(fileA), ha, question);

    let fileB = b;
    let whyB = "";
    stage("read-b", b === AUTO ? "Finding the strongest counterpoint" : "Reading Paper B");
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
    stage("argue-b", "Paper B is responding");
    const argB = await argue("B", paperOf(fileB), hb, question, { paper: paperOf(fileA), arg: argA });

    stage("judge", "Judging, finding gaps and research topics");
    const excerpts = (hs: Hit[]) => hs.map((h) => h.chunk.slice(0, 700)).join("\n---\n");
    const raw = await completeJson<Partial<Ruling>>(
      "You are the judge of a debate between two research papers. Use ONLY the arguments and excerpts below; do not add facts. " +
        "Reply with ONLY JSON with these keys:\n" +
        '"agree": up to 3 short points both papers support; "disagree": up to 3 short points where they conflict (empty if they do not really conflict); ' +
        '"recency": one sentence on how the publication years affect the weight of each side (newer evidence, older baseline, or unknown years); ' +
        '"gaps": 2-4 specific things the question needs that NEITHER paper establishes (missing populations, outcomes, settings, study designs, follow-up, comparisons); ' +
        '"topics": 2-3 research studies that would close those gaps, each {"title": a specific study title naming the population, the intervention or model, the comparison and the outcome, 8-16 words (e.g. "Multicentre trial of LLM-assisted discharge follow-up versus usual care on 90-day readmissions"), "why": one sentence naming the gap it closes}.\n\n' +
        `Question: ${question}\nPaper A ${dated(paperOf(fileA))} argued: ${argA}\nPaper B ${dated(paperOf(fileB))} argued: ${argB}\n\n` +
        `Excerpts from A:\n${excerpts(ha)}\n\nExcerpts from B:\n${excerpts(hb)}`,
    );
    const list = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, n) : []);
    const ruling: Ruling = {
      agree: list(raw?.agree, 3),
      disagree: list(raw?.disagree, 3),
      recency: typeof raw?.recency === "string" ? raw.recency : "",
      gaps: list(raw?.gaps, 4),
      topics: (Array.isArray(raw?.topics) ? raw.topics : [])
        .filter((t): t is Topic => !!t && typeof t.title === "string" && typeof t.why === "string")
        .slice(0, 3),
    };
    if (!ruling.agree.length && !ruling.disagree.length) return fail("The judge's ruling could not be read. Try again.", 502);
    await logQuestion("Debate", question, [...ha, ...hb]);
    return Response.json({
      a: { file: fileA, ...paperOf(fileA), venue: meta[fileA]?.venue ?? "", arg: argA, auto: a === AUTO, why: whyA },
      b: { file: fileB, ...paperOf(fileB), venue: meta[fileB]?.venue ?? "", arg: argB, auto: b === AUTO, why: whyB },
      ruling,
    });
  } catch (e) {
    return serverError(e);
  }
}
