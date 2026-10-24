"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import ErrorNote from "@/components/ErrorNote";
import { External, Star } from "@/components/Icons";
import Topbar from "@/components/Topbar";
import { clearRecentPapers, librarySnapshot, loadFavorites, loadRecentPapers, subscribeLibrary, toggleFavorite, type RecentPaper } from "@/lib/store";
import styles from "./library.module.css";

type Paper = {
  file: string; title: string | null; authors: string[]; year: string | null; family: string | null; source: string | null; venue: string | null; url: string | null;
  oneLine: string | null; method: string | null; keyFinding: string | null; limitations: string | null;
};
type View = "recent" | "favorites";
type Row = { paper: Paper; seen?: RecentPaper };

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [["minute", 60], ["hour", 3600], ["day", 86400], ["week", 604800], ["month", 2629800], ["year", 31557600]];
function ago(at: number, now: number) {
  const s = Math.min(0, Math.round((at - now) / 1000));
  if (Math.abs(s) < 45) return "just now";
  let unit = UNITS[0];
  for (const u of UNITS) if (Math.abs(s) >= u[1]) unit = u;
  return rtf.format(Math.round(s / unit[1]), unit[0]);
}
// Ticks every 15s; the snapshot is bucketed so it's stable between ticks (ago() clamps future times to "just now").
const CLOCK_STEP = 15_000;
const subscribeClock = (cb: () => void) => { const t = setInterval(cb, CLOCK_STEP); return () => clearInterval(t); };
const clockSnapshot = () => Math.ceil(Date.now() / CLOCK_STEP) * CLOCK_STEP;
const truncate = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export default function Library() {
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setView] = useState<View | null>(null); // null = not chosen yet, use the default
  const [text, setText] = useState("");
  const now = useSyncExternalStore(subscribeClock, clockSnapshot, () => 0); // client-only clock for "5 minutes ago"

  // Favorites and recents live in this browser's localStorage; null on the server / before hydration.
  const snap = useSyncExternalStore(subscribeLibrary, librarySnapshot, () => null);
  const { recent, favs } = useMemo(() => (snap === null ? { recent: null, favs: [] as string[] } : { recent: loadRecentPapers(), favs: loadFavorites() }), [snap]);

  const load = useCallback(() => {
    fetch("/api/library").then((r) => r.json()).then((d) => (d.error ? setErr(d.error) : setPapers(d.papers))).catch(() => setErr("Could not load your library. Check your connection and try again."));
  }, []);
  const retry = () => setErr(null); // the effect below refetches
  // Paper details come from the full catalogue; only fetch once there is something to show.
  const needPapers = (recent?.length ?? 0) > 0 || favs.length > 0;
  useEffect(() => { if (needPapers && !papers && !err) load(); }, [needPapers, papers, err, load]);
  // Default to Recent, unless it's empty and Favorites isn't.
  const view: View = picked ?? (recent?.length === 0 && favs.length > 0 ? "favorites" : "recent");

  const byFile = useMemo(() => new Map((papers ?? []).map((p) => [p.file, p])), [papers]);
  const recentRows = useMemo<Row[]>(() => (recent ?? []).flatMap((seen) => { const paper = byFile.get(seen.file); return paper ? [{ paper, seen }] : []; }), [recent, byFile]);
  const favRows = useMemo<Row[]>(() => favs.flatMap((f) => { const paper = byFile.get(f); return paper ? [{ paper }] : []; })
    .sort((a, b) => (a.paper.title ?? a.paper.file).localeCompare(b.paper.title ?? b.paper.file, "en", { sensitivity: "base" })), [favs, byFile]);

  // Before the catalogue loads, count what's stored; afterwards, count what can actually be shown.
  const recentCount = papers ? recentRows.length : (recent?.length ?? 0);
  const favCount = papers ? favRows.length : favs.length;
  const rows = view === "recent" ? recentRows : favRows;
  const total = view === "recent" ? recentCount : favCount;

  const shown = useMemo(() => {
    const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return rows;
    return rows.filter(({ paper: p, seen }) => {
      const hay = [p.title, ...p.authors, p.year, p.family, p.venue, p.oneLine, seen?.question].filter(Boolean).join(" ").toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [rows, text]);

  const onClear = () => { if (window.confirm("Clear your recent papers? Favorites are kept.")) clearRecentPapers(); };
  const loading = needPapers && !papers && !err;

  return (
    <>
      <Topbar />
      <main className="page">
        <h1>My library</h1>
        <p className="lede">Papers you&apos;ve opened or that answers cited, and the ones you starred.</p>

        <div className={styles.toolbar}>
          <div className="seg" role="group" aria-label="Show">
            <button aria-pressed={view === "recent"} onClick={() => setView("recent")}>Recent ({recentCount})</button>
            <button aria-pressed={view === "favorites"} onClick={() => setView("favorites")}>Favorites ({favCount})</button>
          </div>
          {total > 0 && (
            <input className="search-input" type="search" value={text} onChange={(e) => setText(e.target.value)}
              placeholder={view === "recent" ? "Filter recent papers…" : "Filter favorites…"} aria-label={view === "recent" ? "Filter recent papers" : "Filter favorites"} />
          )}
          {view === "recent" && (recent?.length ?? 0) > 0 && <button className={`ghost ${styles.clear}`} onClick={onClear}>Clear recent</button>}
        </div>

        {err && <ErrorNote message={err} onRetry={retry} />}
        {loading && <div className="skeleton" aria-busy="true"><i style={{ height: 120 }} /><i style={{ height: 120 }} /></div>}

        {recent && !loading && !err && total === 0 && (
          <div className={styles.empty}>
            {view === "recent" ? (
              <>
                <p className="muted">Papers you open or that answers cite will show up here. Ask a question to get started.</p>
                <Link className="btn dark" href="/">Ask a question</Link>
              </>
            ) : (
              <p className="muted">Star a paper to keep it here.</p>
            )}
          </div>
        )}
        {papers && total > 0 && (text.trim()
          ? <p className="count">{shown.length} of {total} papers</p>
          : <p className="count">{total} {total === 1 ? "paper" : "papers"}{view === "recent" ? ", most recent first" : ", A to Z"}</p>)}
        {papers && total > 0 && shown.length === 0 && <p className="muted">No papers match &ldquo;{text.trim()}&rdquo;.</p>}

        <div className="cards">
          {shown.map(({ paper: p, seen }) => {
            const fav = favs.includes(p.file);
            return (
              <article key={p.file} className="lib-card">
                <div className="lib-top">
                  {p.family ? <span className="tag">{p.family}</span> : <span />}
                  <button className="icon-btn sm" aria-pressed={fav} title={fav ? "Remove from favorites" : "Add to favorites"} aria-label={fav ? "Remove from favorites" : "Add to favorites"} onClick={() => toggleFavorite(p.file)}>
                    <Star size={16} filled={fav} stroke={fav ? "var(--accent)" : "currentColor"} />
                  </button>
                </div>
                {seen && (
                  <div className={styles.seen} title={seen.question ? `${seen.via === "cited" ? "Cited in" : "Viewed from"}: ${seen.question}` : undefined}>
                    {seen.via === "cited" && seen.question
                      ? <>Cited in: <q>{truncate(seen.question)}</q> · {ago(seen.at, now)}</>
                      : <>Viewed {ago(seen.at, now)}</>}
                  </div>
                )}
                <h2>{p.title ?? p.file}</h2>
                <div className="by">{[p.authors.length > 3 ? `${p.authors.slice(0, 3).join(", ")}, et al.` : p.authors.join(", "), p.venue, p.year && !p.venue?.includes(p.year) ? p.year : null].filter(Boolean).join(" · ")}</div>
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
