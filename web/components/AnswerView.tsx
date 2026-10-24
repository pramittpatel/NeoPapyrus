"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import Citation from "./Citation";
import AutoGrowTextarea from "./AutoGrowTextarea";
import CiteStyleToggle from "./CiteStyleToggle";
import Combobox from "./Combobox";
import ErrorNote from "./ErrorNote";
import { LevelBadge, parseLevel, saveLevel } from "./LevelSlider";
import { BUSY_HINT, FadeIn, ProgressSteps, Skeleton, SkeletonRow, SkeletonText, Spinner, StatusLine, mergeSteps, type Step } from "./Loading";
import { Book, Check, ChevronRight, Close, Copy, Download, Folder, Graph, Refresh, Send, SidebarRight, Table } from "./Icons";
import Rich from "./Rich";
import Topbar from "./Topbar";
import { buildAnswerCopy, buildCitationFile, buildCitationsCopy } from "@/lib/copyFormat";
import { csvCell, download } from "@/lib/download";
import { STANCE_LABEL, type AnswerResult } from "@/lib/format";
import { useCiteStyle, useCopy, useFlash, useTitle } from "@/lib/hooks";
import { answerHref, sourceHref } from "@/lib/links";
import { loadResult, saveResult } from "@/lib/store";
import { postWithProgress } from "@/lib/streamJson";
import { useCollectionOptions } from "@/lib/useCollections";

// The steps /api/ask reports, in order; the server's labels (e.g. the number of searches) replace these as they arrive.
const ASK_STEPS: Step[] = [
  { id: "decompose", label: "Splitting your question" },
  { id: "retrieve", label: "Searching the papers" },
  { id: "write", label: "Writing the answer" },
  { id: "check", label: "Checking each cited source" },
];

export default function AnswerView() {
  const router = useRouter();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const deep = params.get("deep") === "1";
  const collection = params.get("c") ?? "all";
  const level = parseLevel(params.get("l"));
  const { options: collections, loading: collectionsLoading } = useCollectionOptions();
  const [style, setStyle] = useCiteStyle();
  const [copied, copy] = useCopy();
  const [copiedRefs, copyRefs] = useCopy();
  const [flash, goToSource] = useFlash("source");

  const [res, setRes] = useState<AnswerResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stages, setStages] = useState<Step[]>([]);
  const [nonce, setNonce] = useState(0);
  const [panel, setPanel] = useState(true);
  const [artifact, setArtifact] = useState<"matrix" | "map">("matrix");
  const [follow, setFollow] = useState("");

  useTitle(res?.title ?? q);

  useEffect(() => {
    if (!q) { router.replace("/"); return; }
    const cached = loadResult();
    if (nonce === 0 && cached && cached.question === q && (cached.collection ?? "all") === collection && !!cached.deep === deep && (cached.level ?? "Undergrad") === level) {
      setRes(cached); setErr(null); return;
    }
    const ctl = new AbortController();
    setRes(null); setErr(null); setStages([]);
    postWithProgress<AnswerResult>("/api/ask", { question: q, deep, collection, level }, (s) => setStages((prev) => [...prev.filter((x) => x.id !== s.id), s]), ctl.signal)
      .then((d) => { saveResult(d, deep); setRes(d); })
      .catch((e: Error) => { if (e.name !== "AbortError") setErr(e.message); });
    return () => ctl.abort();
  }, [q, deep, collection, level, nonce, router]);

  const scope = { deep, c: collection, level };
  const changeLevel = (v: typeof level) => { saveLevel(v); router.push(answerHref(q, { ...scope, level: v })); };
  const sendFollow = () => {
    const t = follow.trim();
    if (t) { setFollow(""); router.push(answerHref(t, scope)); }
  };
  const ask = (e: FormEvent) => { e.preventDefault(); sendFollow(); };
  const exportCitations = () => {
    if (!res) return;
    const f = buildCitationFile(res.papers, style);
    download(f.name, f.body, f.mime);
  };
  const exportCsv = () => {
    if (!res) return;
    const head = ["#", "Title", "Authors", "Year", "Venue", "Topic", "Stance", "URL"];
    const rows = res.papers.map((p) => [p.n, p.title, p.authors.join("; "), p.year, p.venue, p.family, STANCE_LABEL[p.stance], p.url].map((c) => csvCell(String(c))).join(","));
    download("evidence-matrix.csv", [head.map(csvCell).join(","), ...rows].join("\n"), "text/csv");
  };

  const loading = !res && !err;
  const hasPapers = !!res && res.papers.length > 0;
  const runKey = `${q}|${deep}|${collection}|${level}|${nonce}`;
  const families = res ? [...new Set(res.papers.map((p) => p.family))] : [];

  return (
    <>
      <Topbar back="history" title={q}>
        <Combobox label="Collection" prefix="Collection:" icon={<Folder size={14} />} align="end" options={collections}
          value={collection} onChange={(c) => router.push(answerHref(q, { ...scope, c }))} searchPlaceholder="Search collections…" loading={collectionsLoading} />
        {(hasPapers || loading) && <button className="icon-btn" aria-label="Toggle artifact panel" aria-pressed={panel} onClick={() => setPanel((p) => !p)}><SidebarRight /></button>}
      </Topbar>

      <div className="answer-wrap">
        <main className="answer-main">
          <div className="col">
            {err && <ErrorNote message={err} onRetry={() => setNonce((n) => n + 1)} />}

            {loading && (
              <div className="answer-loading">
                <div className="article">
                  <ProgressSteps key={runKey} label="Answer progress" steps={mergeSteps(ASK_STEPS, stages)} current={stages.at(-1)?.id ?? null} hint={BUSY_HINT} />
                  <div className="article" aria-busy="true" aria-label="Answer, loading" style={{ marginTop: 6 }}>
                    <Skeleton width="46%" height={22} />
                    <SkeletonText lines={5} gap={11} />
                  </div>
                </div>
                <div className="artifacts" aria-hidden="true">
                  {[0, 1].map((i) => (
                    <div key={i} className="artifact sk-artifact">
                      <Skeleton width={40} height={40} radius={10} />
                      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}><Skeleton width="52%" height={13} /><Skeleton width="38%" height={11} /></span>
                    </div>
                  ))}
                </div>
                <div className="sources" aria-hidden="true">
                  <div className="sources-head"><Skeleton width={64} height={12} /><Skeleton width={150} height={28} radius={8} /></div>
                  <ol>{[0, 1, 2].map((i) => <li key={i}><SkeletonRow title={["86%", "78%", "82%"][i]} sub={["58%", "64%", "46%"][i]} style={{ flex: 1 }} /></li>)}</ol>
                </div>
              </div>
            )}

            {res && (
              <FadeIn key={res.id} stack={24}>
                <article className="article">
                  <StatusLine done>
                    Searched {res.stats.papers} {res.stats.papers === 1 ? "paper" : "papers"} · read {res.stats.passages} passages · cited {res.stats.cited}
                  </StatusLine>
                  <h1>{res.title}</h1>
                  <Rich text={res.answer} onCite={goToSource} />
                </article>

                {hasPapers && (
                  <>
                    <div className="artifacts">
                      <button className="artifact" aria-pressed={panel && artifact === "matrix"} onClick={() => { setArtifact("matrix"); setPanel(true); }}>
                        <span className="ic"><Table /></span>
                        <span><b>Evidence matrix</b><small>Table · {res.papers.length} papers{panel && artifact === "matrix" ? " · open" : ""}</small></span>
                      </button>
                      <button className="artifact" aria-pressed={panel && artifact === "map"} onClick={() => { setArtifact("map"); setPanel(true); }}>
                        <span className="ic"><Graph /></span>
                        <span><b>Topic map</b><small>Diagram · {families.length} {families.length === 1 ? "topic" : "topics"}{panel && artifact === "map" ? " · open" : ""}</small></span>
                      </button>
                    </div>

                    <section aria-label="Sources" className="sources">
                      <div className="sources-head">
                        <h2 className="eyebrow">Sources</h2>
                        <CiteStyleToggle value={style} onChange={setStyle} />
                      </div>
                      <ol>
                        {res.papers.map((p) => (
                          <li key={p.file} id={`source-${p.n}`} className={flash === p.n ? "flash" : undefined}>
                            <span className="cite block">{p.n}</span>
                            <span className={`c${style === "BibTeX" ? " mono" : ""}`}><Citation paper={p} style={style} peers={res.papers} /></span>
                            <Link className="why" href={sourceHref(p.n, q, scope)}>Why this?</Link>
                          </li>
                        ))}
                      </ol>
                    </section>
                  </>
                )}

                <div className="actions">
                  <button className="icon-btn sm" title="Copy answer" aria-label="Copy answer" onClick={() => copy(buildAnswerCopy(res, style))}>
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                  {hasPapers && (
                    <button className="icon-btn sm" title="Copy references" aria-label="Copy references" onClick={() => copyRefs(buildCitationsCopy(res.papers, style))}>
                      {copiedRefs ? <Check size={16} /> : <Book size={16} />}
                    </button>
                  )}
                  {hasPapers && <button className="icon-btn sm" title={style === "BibTeX" ? "Download citations (.bib)" : `Download reference list (${style}, .rtf for Word/Docs)`} aria-label="Download citations" onClick={exportCitations}><Download size={16} /></button>}
                  <button className="icon-btn sm" title="Regenerate answer" aria-label="Regenerate answer" onClick={() => setNonce((n) => n + 1)}><Refresh size={16} /></button>
                </div>
              </FadeIn>
            )}
          </div>

          <div className="follow">
            <form className="composer row" onSubmit={ask}>
              <label htmlFor="followup" className="sr-only">Ask another question</label>
              <AutoGrowTextarea id="followup" value={follow} onChange={(e) => setFollow(e.target.value)} onEnter={sendFollow} maxLength={500} placeholder="Ask another question…" />
              <LevelBadge value={level} onChange={changeLevel} />
              <button type="submit" className="send" aria-label={loading ? "Answering…" : "Send"} aria-busy={loading} disabled={loading || !follow.trim()}>
                {loading ? <Spinner size={16} /> : <Send size={16} />}
              </button>
            </form>
            <div className="meta-row">
              <span>Preprints from arXiv</span>
              {res?.yearRange && <span>{res.yearRange}</span>}
            </div>
          </div>
        </main>

        {loading && panel && (
          <aside className="panel" aria-label="Artifact panel" aria-busy="true">
            <div className="panel-head">
              <div>
                <b>Evidence matrix</b>
                <small>Artifact · waiting for sources</small>
              </div>
              <button className="icon-btn sm" aria-label="Close panel" onClick={() => setPanel(false)}><Close size={16} /></button>
            </div>
            <div className="panel-note">Each cited paper will appear here with its topic and how strongly it supports the answer.</div>
            <div className="rows" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="row-card">
                  <SkeletonRow title={["84%", "70%", "90%", "76%"][i]} sub={["56%", "48%", "62%", "40%"][i]} />
                  <div className="row-tags"><Skeleton width={96} height={20} radius={6} /><Skeleton width={64} height={20} radius={6} /></div>
                </div>
              ))}
            </div>
          </aside>
        )}

        {hasPapers && panel && (
          <aside className="panel" aria-label="Artifact panel">
            <div className="panel-head">
              <div>
                <b>{artifact === "matrix" ? "Evidence matrix" : "Topic map"}</b>
                <small>Artifact · generated from {res.papers.length} sources</small>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {artifact === "matrix" && <button className="icon-btn sm" title="Download as CSV" aria-label="Download as CSV" onClick={exportCsv}><Download size={16} /></button>}
                <button className="icon-btn sm" aria-label="Close panel" onClick={() => setPanel(false)}><Close size={16} /></button>
              </div>
            </div>
            <div className="panel-note">
              {artifact === "matrix" ? "Click any row to see why the assistant picked that paper and which passage it used." : "Cited papers grouped by topic. Click a paper to see why it was chosen."}
            </div>
            {artifact === "matrix" ? (
              <div className="rows">
                {res.papers.map((p) => (
                  <Link key={p.file} href={sourceHref(p.n, q, scope)} className={`row-card${flash === p.n ? " flash" : ""}`}>
                    <div className="row-top">
                      <span className="cite block">{p.n}</span>
                      <div className="t"><b>{p.title}</b><small>{[p.authorLine, p.venue].filter(Boolean).join(" · ")}</small></div>
                      <ChevronRight size={16} stroke="#62626B" />
                    </div>
                    <div className="row-tags"><span className="tag">{p.family}</span><span className={`tag ${p.stance}`}>{STANCE_LABEL[p.stance]}</span></div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="map">
                {families.map((f) => (
                  <div key={f} className="map-group">
                    <h3>{f}</h3>
                    {res.papers.filter((p) => p.family === f).map((p) => (
                      <Link key={p.file} href={sourceHref(p.n, q, scope)}><span className="cite block">{p.n}</span>{p.title}</Link>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>
    </>
  );
}
