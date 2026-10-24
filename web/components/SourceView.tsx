"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import CiteStyleToggle from "./CiteStyleToggle";
import { Bookmark, Check, Copy, External, Minus } from "./Icons";
import Topbar from "./Topbar";
import { STANCE_LABEL, type AnswerResult } from "@/lib/format";
import { useCiteStyle, useCopy, useTitle } from "@/lib/hooks";
import { answerHref, sourceHref } from "@/lib/links";
import { loadResult, loadSaved, toggleSaved } from "@/lib/store";

export default function SourceView() {
  const router = useRouter();
  const sp = useSearchParams();
  const q = sp.get("q") ?? "";
  const scope = { deep: sp.get("deep") === "1", c: sp.get("c") ?? "all" };
  const n = Number(sp.get("n") ?? 1);

  const [res, setRes] = useState<AnswerResult | null | undefined>(undefined);
  const [style, setStyle] = useCiteStyle();
  const [saved, setSaved] = useState<string[]>([]);
  const [copied, copy] = useCopy();

  useEffect(() => {
    setSaved(loadSaved());
    const cached = loadResult();
    const same = cached && cached.question === q && (cached.collection ?? "all") === scope.c && !!cached.deep === scope.deep;
    if (same) setRes(cached);
    else { setRes(null); router.replace(q ? answerHref(q, scope) : "/"); } // answer isn't cached in this browser: re-run it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, scope.c, scope.deep, router]);

  const p = res?.papers.find((x) => x.n === n) ?? res?.papers[0];
  useTitle(p?.title ?? "");
  if (!res || !p) return null;

  const back = answerHref(q, scope);
  const pdf = `/api/pdf?file=${encodeURIComponent(p.file)}`;
  const isSaved = saved.includes(p.file);

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
          <div className="why-col wide">
            <section className="card">
              <div><span className="tag">{p.family}</span></div>
              <h1>{p.title}</h1>
              <div className="by">{[p.authorLine, p.venue].filter(Boolean).join(" · ")}</div>
              <div className="btn-row">
                {p.url && <a className="btn dark" href={p.url} target="_blank" rel="noreferrer"><External size={14} />Open on arXiv</a>}
                <button className="btn" aria-pressed={isSaved} onClick={() => setSaved(toggleSaved(p.file))}><Bookmark size={14} />{isSaved ? "Saved" : "Save paper"}</button>
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
                    <div className="txt">{p.citations[style]}</div>
                    <button title="Copy citation" aria-label="Copy citation" onClick={() => copy(p.citations[style])}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
                  </div>
                </section>
              </div>

              <section className="pdf-pane" aria-label="Paper PDF">
                <div className="pdf-bar">
                  <span>{p.page ? <><b>Opened to page {p.page}</b> · where this passage appears</> : <><b>Opened to the first page</b> · couldn&apos;t locate the passage</>}</span>
                  <a className="btn sm" href={`${pdf}${p.page ? `#page=${p.page}` : ""}`} target="_blank" rel="noreferrer"><External size={13} />Open PDF</a>
                </div>
                <iframe key={`${p.file}-${p.page}`} title={`PDF: ${p.title}`} src={`${pdf}#page=${p.page ?? 1}&zoom=page-width`} />
              </section>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
