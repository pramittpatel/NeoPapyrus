"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Citation from "./Citation";
import CiteStyleToggle from "./CiteStyleToggle";
import { Check, Copy, External, Minus, Star } from "./Icons";
import { parseLevel } from "./LevelSlider";
import { FadeIn, Skeleton, SkeletonRow, SkeletonText, Spinner } from "./Loading";
import Topbar from "./Topbar";
import { buildSingleCitationCopy } from "@/lib/copyFormat";
import { STANCE_LABEL, type AnswerResult } from "@/lib/format";
import { useCiteStyle, useCopy, useTitle } from "@/lib/hooks";
import { answerHref, sourceHref } from "@/lib/links";
import { loadFavorites, loadResult, recordPapers, toggleFavorite } from "@/lib/store";

export default function SourceView() {
  const router = useRouter();
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";
  const scope = { deep: sp.get("deep") === "1", c: sp.get("c") ?? "all", level: parseLevel(sp.get("l")) };
  const n = Number(sp.get("n") ?? 1);

  const [res, setRes] = useState<AnswerResult | null | undefined>(undefined);
  const [style, setStyle] = useCiteStyle();
  const [saved, setSaved] = useState<string[]>([]);
  const [copied, copy] = useCopy();
  const [pdfReady, setPdfReady] = useState<string | null>(null); // key of the PDF whose iframe has loaded

  useEffect(() => {
    setSaved(loadFavorites());
    const cached = loadResult();
    const same = cached && cached.question === q && (cached.collection ?? "all") === scope.c && !!cached.deep === scope.deep && (cached.level ?? "Undergrad") === scope.level;
    if (same) setRes(cached);
    else { setRes(null); router.replace(q ? answerHref(q, scope) : "/"); } // answer isn't cached in this browser: re-run it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, scope.c, scope.deep, scope.level, router]);

  const p = res?.papers.find((x) => x.n === n) ?? res?.papers[0];
  useTitle(p?.title ?? "");
  useEffect(() => { if (p?.file) recordPapers([{ file: p.file, via: "viewed", question: q || undefined }]); }, [p?.file]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!res || !p) return <SourceSkeleton back={q ? answerHref(q, scope) : "/"} />;

  const back = answerHref(q, scope);
  const pdf = `/api/pdf?file=${encodeURIComponent(p.file)}`;
  const isSaved = saved.includes(p.file);
  const pdfKey = `${p.file}-${p.page}`;
  const pdfLoading = pdfReady !== pdfKey;

  return (
    <>
      <Topbar back={back} newQuestion={false} title={
        <nav aria-label="Breadcrumb" className="crumbs">
          <Link href={back}>{res.question}</Link><span className="sep" aria-hidden="true">/</span>
          <span className="here">Source {p.n}</span>
        </nav>
      } />

      <div className="why-wrap">
        <aside className="rail" aria-label="Sources in this answer">
          <div className="eyebrow">{res.papers.length} sources cited</div>
          {res.papers.map((x) => (
            <button key={x.file} aria-current={x.n === p.n} onClick={() => router.replace(sourceHref(x.n, q, scope))}>
              <span className="cite block">{x.n}</span>
              <span className="nm"><b>{x.title}</b><small>{[x.authors[0] ? `${x.authors[0].split(" ").pop()}${x.authors.length > 1 ? " et al." : ""}` : "", x.year].filter(Boolean).join(" · ")}</small></span>
            </button>
          ))}
        </aside>

        <main className="why-main">
          <FadeIn className="why-col wide">
            <section className="card">
              <div><span className="tag">{p.family}</span></div>
              <h1>{p.title}</h1>
              <div className="by">{[p.authorLine, p.venue].filter(Boolean).join(" · ")}</div>
              <div className="btn-row">
                {p.url && <a className="btn dark" href={p.url} target="_blank" rel="noreferrer"><External size={14} />Open on arXiv</a>}
                <button className="btn" aria-pressed={isSaved} title={isSaved ? "Remove from favorites" : "Add to favorites"} onClick={() => setSaved(toggleFavorite(p.file))}><Star size={14} filled={isSaved} />{isSaved ? "Favorited" : "Add to favorites"}</button>
              </div>
            </section>

            <div className="why-grid">
              <div className="why-left">
                <section className="card" style={{ gap: 18 }}>
                  <div className="card-head">
                    <h2>Why this paper was chosen</h2>
                    <span className={`good ${p.stance}`}><Check size={12} />Evidence: {STANCE_LABEL[p.stance].toLowerCase()}</span>
                  </div>
                  <ol className="steps">
                    <li><span className="step-n">1</span><div className="step-b"><b>Matched a sub-question</b><p>Your question was split into parts. This paper answers: <em>“{p.subq}”</em></p></div></li>
                    <li>
                      <span className="step-n">2</span>
                      <div className="step-b"><b>How it was found</b>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 13 }}>
                          <span className="query">{p.query}</span><span style={{ color: "var(--muted)", padding: "3px 0" }}>{p.rank}</span>
                        </div>
                      </div>
                    </li>
                    <li>
                      <span className="step-n">3</span>
                      <div className="step-b"><b>Passage it relied on</b>
                        <div className="quote">
                          <small>{p.where} · summarized</small>
                          <p>{p.summary || "No summary was returned for this passage."}</p>
                          <details><summary>Show exact text</summary><p>{p.passage}</p></details>
                        </div>
                      </div>
                    </li>
                    <li>
                      <span className="step-n">4</span>
                      <div className="step-b"><b>Where it supports the answer</b>
                        <p>{p.usedIn ? <>Answer: “{p.usedIn}” <span className="cite">{p.n}</span></> : "This paper was retrieved but no sentence in the answer is attributed to it."}</p>
                      </div>
                    </li>
                  </ol>
                </section>

                {res.alts.length > 0 && (
                  <section className="card">
                    <h2>Retrieved but not used</h2>
                    {res.alts.map((a) => (
                      <div key={a.name} className="alt"><Minus size={16} /><div><b>{a.name}</b><span>{a.why}</span></div></div>
                    ))}
                  </section>
                )}

                <section className="card">
                  <div className="card-head">
                    <h2>Cite this paper</h2>
                    <CiteStyleToggle value={style} onChange={setStyle} />
                  </div>
                  <div className="cite-box">
                    <div className="txt"><Citation paper={p} style={style} peers={res.papers} /></div>
                    <button title="Copy citation" aria-label="Copy citation" onClick={() => copy(buildSingleCitationCopy(p, style, res.papers))}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
                  </div>
                </section>
              </div>

              <section className="pdf-pane" aria-label="Paper PDF">
                <div className="pdf-bar">
                  <span>{p.page ? <><b>Opened to page {p.page}</b> · where this passage appears</> : <><b>Opened to the first page</b> · couldn&apos;t locate the passage</>}</span>
                  <a className="btn sm" href={`${pdf}${p.page ? `#page=${p.page}` : ""}`} target="_blank" rel="noreferrer"><External size={13} />Open PDF</a>
                </div>
                <div className="pdf-body" aria-busy={pdfLoading}>
                  <iframe key={pdfKey} className={pdfLoading ? undefined : "ready"} title={`PDF: ${p.title}`} src={`${pdf}#page=${p.page ?? 1}&zoom=page-width`} onLoad={() => setPdfReady(pdfKey)} />
                  {pdfLoading && <div className="pdf-loading" role="status"><Spinner size={20} />Loading PDF…</div>}
                </div>
              </section>
            </div>
          </FadeIn>
        </main>
      </div>
    </>
  );
}

/** Placeholder with the page's real layout while the cached answer is read (or the answer is being re-run). */
function SourceSkeleton({ back }: { back: string }) {
  return (
    <>
      <Topbar back={back} newQuestion={false} title={<div className="crumbs" aria-hidden="true"><Skeleton width={180} height={13} /><span className="sep">/</span><Skeleton width={64} height={13} /></div>} />
      <div className="why-wrap" aria-busy="true" aria-label="Source, loading">
        <aside className="rail" aria-hidden="true">
          <div className="eyebrow"><Skeleton width={110} height={12} /></div>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonRow key={i} title={["90%", "76%", "84%", "70%"][i]} sub="40%" style={{ padding: 10, border: `1px solid ${i ? "transparent" : "var(--line)"}`, borderRadius: 12, background: i ? undefined : "var(--surface)" }} />
          ))}
        </aside>
        <main className="why-main">
          <div className="why-col wide">
            <section className="card" aria-hidden="true">
              <Skeleton width={96} height={20} radius={6} />
              <Skeleton width="78%" height={26} />
              <Skeleton width="46%" height={14} />
              <div className="btn-row"><Skeleton width={132} height={36} radius={10} /><Skeleton width={144} height={36} radius={10} /></div>
            </section>
            <div className="why-grid">
              <div className="why-left">
                <section className="card" style={{ gap: 18 }} aria-hidden="true">
                  <div className="card-head"><Skeleton width="52%" height={18} /><Skeleton width={120} height={24} radius={999} /></div>
                  {[3, 2, 4, 2].map((n, i) => (
                    <div key={i} style={{ display: "flex", gap: 14 }}>
                      <Skeleton width={26} height={26} radius={999} />
                      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}><Skeleton width="44%" height={14} /><SkeletonText lines={n} height={12} gap={8} /></span>
                    </div>
                  ))}
                </section>
              </div>
              <section className="pdf-pane" aria-label="Paper PDF">
                <div className="pdf-bar"><Skeleton width={220} height={13} /><Skeleton width={92} height={30} radius={10} /></div>
                <div className="pdf-body"><div className="pdf-loading" role="status"><Spinner size={20} />Loading PDF…</div></div>
              </section>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
