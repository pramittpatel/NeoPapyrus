"use client";
import { useEffect, useMemo, useState } from "react";
import Combobox from "@/components/Combobox";
import ErrorNote from "@/components/ErrorNote";
import { Bookmark, External, Folder } from "@/components/Icons";
import Topbar from "@/components/Topbar";
import { loadSaved, toggleSaved } from "@/lib/store";
import { useCollections } from "@/lib/useCollections";

type Paper = {
  file: string; title: string | null; authors: string[]; year: string | null; family: string | null; url: string | null;
  oneLine: string | null; method: string | null; keyFinding: string | null; limitations: string | null;
};

export default function Library() {
  const collections = useCollections();
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [collection, setCollection] = useState("all");
  const [onlySaved, setOnlySaved] = useState(false);
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<string[]>([]);

  const load = () => {
    setErr(null);
    fetch("/api/library").then((r) => r.json()).then((d) => (d.error ? setErr(d.error) : setPapers(d.papers))).catch(() => setErr("Could not load the library. Check your connection and try again."));
  };
  useEffect(() => { load(); setSaved(loadSaved()); }, []);

  const savedCount = (papers ?? []).filter((p) => saved.includes(p.file)).length;
  const shown = useMemo(() => {
    const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
    return (papers ?? []).filter((p) => {
      if (collection !== "all" && p.family !== collection) return false;
      if (onlySaved && !saved.includes(p.file)) return false;
      const hay = [p.title, ...p.authors, p.year, p.family, p.oneLine].filter(Boolean).join(" ").toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [papers, collection, onlySaved, text, saved]);

  return (
    <>
      <Topbar />
      <main className="page">
        <h1>My library</h1>
        <p className="lede">Every paper the assistant can cite. Summaries are model-written from each paper&apos;s opening pages, so check the paper before relying on them.</p>

        <div className="toolbar">
          <input className="search-input" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Filter by title, author, year or topic…" aria-label="Filter papers" />
          <Combobox variant="field" label="Collection" icon={<Folder size={14} />} options={collections} value={collection} onChange={setCollection} searchPlaceholder="Search collections…" />
          <div className="seg" role="group" aria-label="Show">
            <button aria-pressed={!onlySaved} onClick={() => setOnlySaved(false)}>All</button>
            <button aria-pressed={onlySaved} onClick={() => setOnlySaved(true)}>Saved ({savedCount})</button>
          </div>
        </div>

        {err && <ErrorNote message={err} onRetry={load} />}
        {!papers && !err && <div className="skeleton" aria-busy="true"><i style={{ height: 120 }} /><i style={{ height: 120 }} /></div>}
        {papers && <p className="count">{shown.length} of {papers.length} papers</p>}
        {papers && shown.length === 0 && <p className="muted">{onlySaved && savedCount === 0 ? "You haven't saved any papers yet. Use the bookmark on a paper to save it." : "No papers match these filters."}</p>}

        <div className="cards">
          {shown.map((p) => {
            const isSaved = saved.includes(p.file);
            return (
              <article key={p.file} className="lib-card">
                <div className="lib-top">
                  {p.family && <span className="tag">{p.family}</span>}
                  <button className="icon-btn sm" aria-pressed={isSaved} title={isSaved ? "Saved" : "Save paper"} aria-label={isSaved ? "Remove from saved" : "Save paper"} onClick={() => setSaved(toggleSaved(p.file))}>
                    <Bookmark size={16} stroke={isSaved ? "var(--accent)" : "currentColor"} />
                  </button>
                </div>
                <h2>{p.title ?? p.file}</h2>
                <div className="by">{[p.authors.length > 3 ? `${p.authors.slice(0, 3).join(", ")}, et al.` : p.authors.join(", "), p.year].filter(Boolean).join(" · ")}</div>
                {p.oneLine && <p>{p.oneLine}</p>}
                <dl>
                  {p.method && <><dt>Method</dt><dd>{p.method}</dd></>}
                  {p.keyFinding && <><dt>Finding</dt><dd>{p.keyFinding}</dd></>}
                  {p.limitations && <><dt>Limits</dt><dd>{p.limitations}</dd></>}
                </dl>
                <div className="btn-row">
                  <a className="btn" href={`/api/pdf?file=${encodeURIComponent(p.file)}`} target="_blank" rel="noreferrer"><External size={14} />Open PDF</a>
                  {p.url && <a className="btn" href={p.url} target="_blank" rel="noreferrer"><External size={14} />Open on arXiv</a>}
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </>
  );
}
