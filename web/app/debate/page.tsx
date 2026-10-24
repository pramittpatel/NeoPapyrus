"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import AutoGrowTextarea from "@/components/AutoGrowTextarea";
import Combobox, { type ComboOption } from "@/components/Combobox";
import ErrorNote from "@/components/ErrorNote";
import Link from "next/link";
import { Check, Search, Send, Spark } from "@/components/Icons";
import { FadeIn, ProgressSteps, Skeleton, SkeletonCard, SkeletonText, Spinner, mergeSteps, type Step } from "@/components/Loading";
import Topbar from "@/components/Topbar";
import { useTitle } from "@/lib/hooks";
import { answerHref } from "@/lib/links";
import { postWithProgress } from "@/lib/streamJson";

type Paper = { file: string; title: string | null; authors: string[]; year: string | null };
type Side = { file: string; title: string; year: string; venue: string; arg: string; auto: boolean; why: string };
type Topic = { title: string; why: string };
type Ruling = { agree: string[]; disagree: string[]; recency: string; gaps: string[]; topics: Topic[] };
type Result = { a: Side; b: Side; ruling: Ruling };

const AUTO = "auto";
const AUTO_A: ComboOption = { value: AUTO, label: "Auto: best match", hint: "The paper that best answers your question" };
const AUTO_B: ComboOption = { value: AUTO, label: "Auto: strongest counterpoint", hint: "The paper whose evidence most challenges Paper A" };
const DEBATE_HINT = "Snowflake is busy — a debate can take a few minutes.";

/** The steps /api/debate reports, in order, for this choice of sides. */
const debatePlan = (a: string, b: string): Step[] => [
  { id: "read-a", label: a === AUTO ? "Finding the best paper for the question" : "Reading Paper A" },
  { id: "argue-a", label: "Paper A is arguing" },
  { id: "read-b", label: b === AUTO ? "Finding the strongest counterpoint" : "Reading Paper B" },
  { id: "argue-b", label: "Paper B is responding" },
  { id: "judge", label: "Judging, finding gaps and research topics" },
];

export default function Debate() {
  useTitle("Paper debate");
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [a, setA] = useState(AUTO);
  const [b, setB] = useState(AUTO);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [plan, setPlan] = useState<Step[]>([]);
  const [stages, setStages] = useState<Step[]>([]);
  const [run, setRun] = useState(0);

  useEffect(() => {
    fetch("/api/library").then((r) => r.json()).then((d) => (d.error ? setErr(d.error) : setPapers(d.papers)))
      .catch(() => setErr("Could not load the paper list. Check your connection and reload."));
  }, []);

  const options = useMemo(() => (papers ?? []).map((p) => ({
    value: p.file, label: p.title ?? p.file, hint: [p.authors[0] ? `${p.authors[0]}${p.authors.length > 1 ? " et al." : ""}` : "", p.year].filter(Boolean).join(" · "),
  })), [papers]);
  const searchPapers = useCallback(async (term: string, signal: AbortSignal) => {
    const r = await fetch(`/api/papers/search?q=${encodeURIComponent(term)}`, { signal });
    const d = (await r.json()) as { results?: { file: string; title: string; snippet: string }[] };
    return (d.results ?? []).map((x) => ({ value: x.file, label: x.title, hint: x.snippet }));
  }, []);
  const same = a !== AUTO && a === b;
  const ready = !busy && !same && !!q.trim();

  async function go() {
    if (!ready) return;
    setBusy(true); setErr(null); setRes(null);
    setPlan(debatePlan(a, b)); setStages([]); setRun((n) => n + 1);
    try {
      const d = await postWithProgress<Result>("/api/debate", { a, b, question: q }, (s) => setStages((prev) => [...prev.filter((x) => x.id !== s.id), s]));
      setRes(d);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const year = (s: Side) => Number(s.year) || 0;
  const card = (label: "A" | "B", s: Side, other: Side) => (
    <section className="card side">
      <div className="side-head">
        <span className="side-label">Paper {label}</span>
        <span className={`year-badge${s.year ? "" : " unknown"}`} title="Publication year">{s.year || "Year unknown"}</span>
        {year(s) > 0 && year(other) > 0 && year(s) > year(other) && <span className="newer-badge">Newer by {year(s) - year(other)} {year(s) - year(other) === 1 ? "year" : "years"}</span>}
      </div>
      <h2 className="side-title">{s.title}</h2>
      {s.venue && <div className="by">{s.venue}</div>}
      {s.auto && <div className="pick-note"><Spark size={12} />Chosen automatically{s.why ? `: ${s.why}` : ""}</div>}
      <p className="side-arg">{s.arg}</p>
    </section>
  );

  return (
    <>
      <Topbar />
      <main className="page">
        <h1>Paper debate</h1>
        <p className="lede">Ask a question and pick a paper. The opposing side is found automatically: the paper whose evidence most challenges the first. You can choose either side yourself.</p>

        <form className="composer row" onSubmit={(e) => { e.preventDefault(); go(); }}>
          <label htmlFor="dq" className="sr-only">Debate question</label>
          <AutoGrowTextarea id="dq" value={q} onChange={(e) => setQ(e.target.value)} onEnter={go} maxLength={500} disabled={busy} placeholder="Is synthetic data a good basis for clinical language models?" />
          <button type="submit" className="send" aria-label={busy ? "Debating…" : "Start debate"} aria-busy={busy} disabled={!ready}>
            {busy ? <Spinner size={16} /> : <Send size={16} />}
          </button>
        </form>

        <div className="field-row">
          <div className="field"><span aria-hidden="true">Paper A</span>
            <Combobox variant="field" label="Paper A" options={[AUTO_A, ...options]} value={a} onChange={setA} searchPlaceholder="Search by title, author or a topic…" aiSearch={searchPapers} disabled={busy} loading={!papers && !err} />
          </div>
          <div className="field"><span aria-hidden="true">Paper B</span>
            <Combobox variant="field" label="Paper B" options={[AUTO_B, ...options]} value={b} onChange={setB} searchPlaceholder="Search by title, author or a topic…" aiSearch={searchPapers} disabled={busy} loading={!papers && !err} />
          </div>
        </div>
        {same && <p className="muted" role="status">Pick two different papers, or set Paper B to automatic.</p>}

        {busy && (
          <>
            <div className="card debate-progress">
              <ProgressSteps key={run} label="Debate progress" steps={mergeSteps(plan, stages)} current={stages.at(-1)?.id ?? null} hint={DEBATE_HINT} />
            </div>
            <div className="debate" aria-busy="true" aria-label="Debate, loading">
              {(["A", "B"] as const).map((side) => (
                <SkeletonCard key={side} className="card side" chip={false} title="82%" meta="34%" lines={0}>
                  <div className="side-head" style={{ order: -1 }}><span className="side-label">Paper {side}</span><Skeleton width={44} height={20} radius={999} /></div>
                  <span style={{ marginTop: 4 }}><SkeletonText lines={6} height={12} gap={10} /></span>
                </SkeletonCard>
              ))}
              <div className="card ruling" aria-hidden="true">
                <h2>Ruling</h2>
                <div className="ruling-cols">
                  {["Where they agree", "Where they disagree"].map((h) => (
                    <div key={h}><h3 className="eyebrow">{h}</h3><SkeletonText lines={3} height={12} gap={10} last="74%" /></div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
        {err && <ErrorNote message={err} onRetry={go} />}
        {res && (
          <FadeIn key={run} className="debate">
            {card("A", res.a, res.b)}
            {card("B", res.b, res.a)}

            <section className="card ruling">
              <h2>Ruling</h2>
              <div className="ruling-cols">
                <div>
                  <h3 className="eyebrow">Where they agree</h3>
                  {res.ruling.agree.length ? <ul className="ruling-list agree">{res.ruling.agree.map((x) => <li key={x}><Check size={13} />{x}</li>)}</ul> : <p className="muted">No shared position.</p>}
                </div>
                <div>
                  <h3 className="eyebrow">Where they disagree</h3>
                  {res.ruling.disagree.length ? <ul className="ruling-list disagree">{res.ruling.disagree.map((x) => <li key={x}><span className="vs">≠</span>{x}</li>)}</ul> : <p className="muted">They don&apos;t really conflict on this question.</p>}
                </div>
              </div>
              {res.ruling.recency && (
                <div className="recency">
                  <span className="year-badge">A · {res.a.year || "?"}</span><span className="year-badge">B · {res.b.year || "?"}</span>
                  <p>{res.ruling.recency}</p>
                </div>
              )}
            </section>

            {res.ruling.gaps.length > 0 && (
              <section className="card gaps-card">
                <h2>Gaps in the research</h2>
                <p className="muted">What this question needs that neither paper establishes.</p>
                <ul className="gap-list">{res.ruling.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
              </section>
            )}

            {res.ruling.topics.length > 0 && (
              <section className="topics">
                <h2 className="eyebrow">Potential research topics</h2>
                <div className="topic-grid">
                  {res.ruling.topics.map((t) => (
                    <article key={t.title} className="topic">
                      <b>{t.title}</b>
                      <span>{t.why}</span>
                      <Link className="btn sm" href={answerHref(t.title)}><Search size={13} />Ask about this</Link>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </FadeIn>
        )}
      </main>
    </>
  );
}
