"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import AutoGrowTextarea from "@/components/AutoGrowTextarea";
import Combobox, { type ComboOption } from "@/components/Combobox";
import ErrorNote from "@/components/ErrorNote";
import { Send, Spark } from "@/components/Icons";
import Topbar from "@/components/Topbar";
import { useTitle } from "@/lib/hooks";

type Paper = { file: string; title: string | null; authors: string[]; year: string | null };
type Side = { file: string; title: string; arg: string; auto: boolean; why: string };
type Result = { a: Side; b: Side; verdict: string };

const AUTO = "auto";
const AUTO_A: ComboOption = { value: AUTO, label: "Auto: best match", hint: "The paper that best answers your question" };
const AUTO_B: ComboOption = { value: AUTO, label: "Auto: strongest counterpoint", hint: "The paper whose evidence most challenges Paper A" };

export default function Debate() {
  useTitle("Paper debate");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [a, setA] = useState(AUTO);
  const [b, setB] = useState(AUTO);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);

  useEffect(() => {
    fetch("/api/library").then((r) => r.json()).then((d) => (d.error ? setErr(d.error) : setPapers(d.papers)))
      .catch(() => setErr("Could not load the paper list. Check your connection and reload."));
  }, []);

  const options = useMemo(() => papers.map((p) => ({
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
    try {
      const r = await fetch("/api/debate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a, b, question: q }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Something went wrong.");
      setRes(d);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const status = b === AUTO
    ? a === AUTO ? "Finding the best paper for the question, then the paper that most challenges it…" : "Paper A is arguing, then the strongest counterpoint is being found…"
    : "Both papers are arguing their side…";

  const card = (label: "A" | "B", s: Side) => (
    <section className="card">
      <h2 className="cap">{label} · {s.title}</h2>
      {s.auto && <div className="pick-note"><Spark size={12} />Chosen automatically{s.why ? `: ${s.why}` : ""}</div>}
      <p>{s.arg}</p>
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
          <AutoGrowTextarea id="dq" value={q} onChange={(e) => setQ(e.target.value)} onEnter={go} maxLength={500} placeholder="Is synthetic data a good basis for clinical language models?" />
          <button type="submit" className="send" aria-label="Start debate" disabled={!ready}><Send size={16} /></button>
        </form>

        <div className="field-row">
          <div className="field"><span aria-hidden="true">Paper A</span>
            <Combobox variant="field" label="Paper A" options={[AUTO_A, ...options]} value={a} onChange={setA} searchPlaceholder="Search by title, author or a topic…" aiSearch={searchPapers} />
          </div>
          <div className="field"><span aria-hidden="true">Paper B</span>
            <Combobox variant="field" label="Paper B" options={[AUTO_B, ...options]} value={b} onChange={setB} searchPlaceholder="Search by title, author or a topic…" aiSearch={searchPapers} />
          </div>
        </div>
        {same && <p className="muted" role="status">Pick two different papers, or set Paper B to automatic.</p>}

        {busy && <p className="muted" aria-live="polite">{status}</p>}
        {err && <ErrorNote message={err} onRetry={go} />}
        {res && (
          <div className="debate">
            {card("A", res.a)}
            {card("B", res.b)}
            <section className="card ruling"><h2 className="cap">Ruling</h2><p>{res.verdict}</p></section>
          </div>
        )}
      </main>
    </>
  );
}
