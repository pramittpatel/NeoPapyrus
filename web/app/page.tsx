"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import Combobox from "@/components/Combobox";
import { Book, Folder, Lines, Search, Send } from "@/components/Icons";
import Topbar from "@/components/Topbar";
import { CITE_STYLES, type CiteStyle } from "@/lib/format";
import { useCiteStyle } from "@/lib/hooks";
import { answerHref } from "@/lib/links";
import { loadRecent, type Recent } from "@/lib/store";
import { useCollections } from "@/lib/useCollections";

const EXAMPLES = [
  "Can large language models be used for clinical prediction?",
  "Is synthetic data a good basis for clinical language models?",
  "How do medical language models hallucinate?",
];
const STYLE_OPTIONS = CITE_STYLES.map((s) => ({ value: s, label: s }));

export default function Home() {
  const router = useRouter();
  const collections = useCollections();
  const [q, setQ] = useState("");
  const [deep, setDeep] = useState(false);
  const [collection, setCollection] = useState("all");
  const [style, setStyle] = useCiteStyle();
  const [recent, setRecent] = useState<Recent | null>(null);

  useEffect(() => { setRecent(loadRecent()[0] ?? null); }, []);

  const go = (question: string) => {
    const t = question.trim();
    if (!t) return;
    router.push(answerHref(t, { deep, c: collection }));
  };
  const submit = (e: FormEvent) => { e.preventDefault(); go(q); };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); go(q); }
  };

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
              options={collections} value={collection} onChange={setCollection} searchPlaceholder="Search collections…" />
            <Combobox label="Citation style" prefix="Cite:" icon={<Lines size={14} />} align="end"
              options={STYLE_OPTIONS} value={style} onChange={(v) => setStyle(v as CiteStyle)} />
          </div>

          <form className="composer" onSubmit={submit}>
            <label htmlFor="ask" className="sr-only">Ask a research question</label>
            <textarea id="ask" rows={2} maxLength={500} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
              placeholder="Ask a research question…" autoFocus />
            <div className="composer-bar">
              <button type="button" className="chip-btn" aria-pressed={deep} onClick={() => setDeep((d) => !d)}
                title="Run more searches and read more passages">
                <Search size={14} />Deep search
              </button>
              <div className="grow" />
              <button type="submit" className="send" aria-label="Send" disabled={!q.trim()}><Send size={16} /></button>
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
