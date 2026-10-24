"use client";
import { useState } from "react";
import Combobox from "@/components/Combobox";
import ErrorNote from "@/components/ErrorNote";
import { Folder, Send } from "@/components/Icons";
import Rich from "@/components/Rich";
import Topbar from "@/components/Topbar";
import { useFlash } from "@/lib/hooks";
import { useCollections } from "@/lib/useCollections";

type Source = { file: string; chunk_id: number; chunk: string; title: string };

const SECTION = /^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(Agree|Disagree|Open gaps)\s*:?\s*(?:\*\*)?\s*:?\s*$/i;
const clean = (t: string) => t.replace(/^#+\s*/gm, "").replace(/\s+/g, " ").trim();

export default function Gaps() {
  const collections = useCollections();
  const [collection, setCollection] = useState("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<{ answer: string; sources: Source[] } | null>(null);
  const [flash, goTo] = useFlash("gap-source");

  async function go() {
    if (busy || !q.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/gaps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, collection }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Something went wrong.");
      setRes(d);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const text = res?.answer.split("\n").map((l) => (SECTION.test(l) ? `### ${l.match(SECTION)![1]}` : l)).join("\n") ?? "";

  return (
    <>
      <Topbar>
        <Combobox label="Collection" prefix="Collection:" icon={<Folder size={14} />} align="end" options={collections}
          value={collection} onChange={setCollection} searchPlaceholder="Search collections…" />
      </Topbar>
      <main className="page">
        <h1>Research gaps</h1>
        <p className="lede">Pick a topic to see where the papers agree, where they disagree, and what is still open.</p>

        <form className="composer row" onSubmit={(e) => { e.preventDefault(); go(); }}>
          <label htmlFor="gq" className="sr-only">Topic</label>
          <input id="gq" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder="Reliability of language models in healthcare" />
          <button type="submit" className="send" aria-label="Find gaps" disabled={busy || !q.trim()}><Send size={16} /></button>
        </form>

        {busy && <p className="muted" aria-live="polite">Reading the papers… this takes a few seconds.</p>}
        {err && <ErrorNote message={err} onRetry={go} />}
        {res && (
          <>
            <section className="card article"><Rich text={text} onCite={goTo} /></section>
            <section className="sources" aria-label="Sources">
              <h2 className="eyebrow">Sources</h2>
              <ol>
                {res.sources.map((s, i) => (
                  <li key={`${s.file}-${s.chunk_id}`} id={`gap-source-${i + 1}`} className={flash === i + 1 ? "flash" : undefined}>
                    <span className="cite block">{i + 1}</span>
                    <span className="c"><b>{s.title}</b><br />{clean(s.chunk).slice(0, 200)}{clean(s.chunk).length > 200 ? "…" : ""}</span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </main>
    </>
  );
}
