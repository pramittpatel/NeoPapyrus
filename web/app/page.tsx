"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import AutoGrowTextarea from "@/components/AutoGrowTextarea";
import Combobox from "@/components/Combobox";
import { DEFAULT_LEVEL, LevelBadge, loadLevel, saveLevel } from "@/components/LevelSlider";
import { Book, Folder, Lines, Search, Send } from "@/components/Icons";
import { Spinner } from "@/components/Loading";
import Topbar from "@/components/Topbar";
import { CITE_STYLES, type CiteStyle, type ExplainLevel } from "@/lib/format";
import { useCiteStyle } from "@/lib/hooks";
import { answerHref } from "@/lib/links";
import { loadRecent, type Recent } from "@/lib/store";
import { useCollectionData, useCollectionOptions } from "@/lib/useCollections";

const EXAMPLES = [
  "Can large language models be used for clinical prediction?",
  "Is synthetic data a good basis for clinical language models?",
  "How do medical language models hallucinate?",
];
const STYLE_OPTIONS = CITE_STYLES.map((s) => ({ value: s, label: s }));

export default function Home() {
  const router = useRouter();
  const { options: collections, loading: collectionsLoading } = useCollectionOptions();
  const collectionData = useCollectionData();
  const picked = useRef(false);
  const [q, setQ] = useState("");
  const [deep, setDeep] = useState(false);
  const [collection, setCollection] = useState("all");
  const [style, setStyle] = useCiteStyle();
  const [level, setLevel] = useState<ExplainLevel>(DEFAULT_LEVEL);
  const [recent, setRecent] = useState<Recent | null>(null);
  const [going, setGoing] = useState(false); // navigating to the answer page

  // Also runs when the page is shown again (back navigation keeps this page's state), so the send button resets.
  useEffect(() => { setRecent(loadRecent()[0] ?? null); setLevel(loadLevel()); setGoing(false); }, []);
  // The team's own papers are the base corpus: preselect them unless the user already chose something else.
  useEffect(() => {
    if (!picked.current && collectionData?.collections.some((c) => c.value === "src:team")) setCollection("src:team");
  }, [collectionData]);

  const go = (question: string) => {
    const t = question.trim();
    if (!t || going) return;
    setGoing(true);
    router.push(answerHref(t, { deep, c: collection, level }));
  };
  const submit = (e: FormEvent) => { e.preventDefault(); go(q); };

  return (
    <>
      <Topbar ruled={false} newQuestion={false}>
        <Link href="/library" className="ghost"><Book size={15} />My library</Link>
      </Topbar>

      <main className="home">
        <div className="home-inner">
          <h1>What are you researching?</h1>

          <div className="options">
            <Combobox label="Collection" prefix="Collection:" icon={<Folder size={14} />} align="end"
              options={collections} value={collection} onChange={(c) => { picked.current = true; setCollection(c); }} searchPlaceholder="Search collections…" loading={collectionsLoading} />
            <Combobox label="Citation style" prefix="Cite:" icon={<Lines size={14} />} align="end"
              options={STYLE_OPTIONS} value={style} onChange={(v) => setStyle(v as CiteStyle)} />
          </div>

          <form className="composer" onSubmit={submit}>
            <label htmlFor="ask" className="sr-only">Ask a research question</label>
            <AutoGrowTextarea id="ask" maxLength={500} value={q} onChange={(e) => setQ(e.target.value)} onEnter={() => go(q)}
              placeholder="Ask a research question…" autoFocus />
            <div className="composer-bar">
              <button type="button" className="chip-btn" aria-pressed={deep} onClick={() => setDeep((d) => !d)}
                title="Run more searches and read more passages">
                <Search size={14} />Deep search
              </button>
              <div className="grow" />
              <LevelBadge value={level} onChange={(v) => { setLevel(v); saveLevel(v); }} />
              <button type="submit" className="send" aria-label={going ? "Opening answer…" : "Send"} aria-busy={going} disabled={going || !q.trim()}>
                {going ? <Spinner size={16} /> : <Send size={16} />}
              </button>
            </div>
          </form>

          <div className="suggest">
            {EXAMPLES.map((x) => <button key={x} type="button" onClick={() => go(x)}>{x}</button>)}
          </div>
        </div>
      </main>

      {recent && (
        <div className="recent-pill">
          <Link href={answerHref(recent.question, { deep: recent.deep, c: recent.collection })}>
            <span className="dot" aria-hidden="true" />
            <span className="t">Recent: {recent.question} · {recent.sources} {recent.sources === 1 ? "source" : "sources"}</span>
          </Link>
        </div>
      )}
    </>
  );
}
