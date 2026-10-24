"use client";
import { useEffect, useMemo, useState } from "react";
import Combobox from "@/components/Combobox";
import ErrorNote from "@/components/ErrorNote";
import { Send } from "@/components/Icons";
import Topbar from "@/components/Topbar";

type Paper = { file: string; title: string | null; authors: string[]; year: string | null };
type Result = { a: { arg: string }; b: { arg: string }; verdict: string; aTitle: string; bTitle: string };

export default function Debate() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);

  useEffect(() => {
    fetch("/api/library").then((r) => r.json()).then((d) => {
      if (d.error) return setErr(d.error);
      setPapers(d.papers); setA(d.papers[0]?.file ?? ""); setB(d.papers[1]?.file ?? "");
    }).catch(() => setErr("Could not load the paper list. Check your connection and reload."));
  }, []);

  const options = useMemo(() => papers.map((p) => ({
    value: p.file, label: p.title ?? p.file, hint: [p.authors[0] ? `${p.authors[0]}${p.authors.length > 1 ? " et al." : ""}` : "", p.year].filter(Boolean).join(" · "),
  })), [papers]);
  const nameOf = (file: string) => options.find((o) => o.value === file)?.label ?? file;
  const same = !!a && a === b;

  async function go() {
    if (busy || same || !q.trim()) return;
    setBusy(true); setErr(null); setRes(null);
    try {
      const r = await fetch("/api/debate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a, b, question: q }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Something went wrong.");
      setRes({ ...d, aTitle: nameOf(a), bTitle: nameOf(b) });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <Topbar />
      <main className="page">
        <h1>Paper debate</h1>
        <p className="lede">Pick two papers and a question. Each paper argues its side using only its own text, then a ruling weighs them.</p>

        <div className="field-row">
          <div className="field"><span aria-hidden="true">Paper A</span><Combobox variant="field" label="Paper A" options={options} value={a} onChange={setA} searchPlaceholder="Search papers by title or author…" /></div>
          <div className="field"><span aria-hidden="true">Paper B</span><Combobox variant="field" label="Paper B" options={options} value={b} onChange={setB} searchPlaceholder="Search papers by title or author…" /></div>
        </div>
        {same && <p className="muted" role="status">Pick two different papers.</p>}

        <form className="composer row" onSubmit={(e) => { e.preventDefault(); go(); }}>
          <label htmlFor="dq" className="sr-only">Debate question</label>
          <input id="dq" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder="Is synthetic data a good basis for clinical language models?" />
          <button type="submit" className="send" aria-label="Start debate" disabled={busy || same || !q.trim() || !a || !b}><Send size={16} /></button>
        </form>

        {busy && <p className="muted" aria-live="polite">In session…</p>}
        {err && <ErrorNote message={err} onRetry={go} />}
        {res && (
          <div className="debate">
            <section className="card"><h2 className="cap">A · {res.aTitle}</h2><p>{res.a.arg}</p></section>
            <section className="card"><h2 className="cap">B · {res.bTitle}</h2><p>{res.b.arg}</p></section>
            <section className="card ruling"><h2 className="cap">Ruling</h2><p>{res.verdict}</p></section>
          </div>
        )}
      </main>
    </>
  );
}
