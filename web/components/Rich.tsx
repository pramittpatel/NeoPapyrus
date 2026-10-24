import type { ReactNode } from "react";

const TOKEN = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[\d+(?:\s*,\s*\d+)*\])/g;

function Inline({ text, onCite }: { text: string; onCite: (n: number) => void }) {
  return (
    <>
      {text.split(TOKEN).map((part, i) => {
        if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("*") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
        if (/^\[\d/.test(part)) {
          return part.slice(1, -1).split(",").map((n, j) => (
            <button key={`${i}-${j}`} className="cite" onClick={() => onCite(Number(n))} aria-label={`Go to source ${n.trim()}`}>{n.trim()}</button>
          ));
        }
        return part;
      })}
    </>
  );
}

/** Renders model markdown (paragraphs, numbered and bullet lists, bold, italics) with [n] citation chips. */
export default function Rich({ text, onCite }: { text: string; onCite: (n: number) => void }) {
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    out.push(<Tag key={out.length}>{list.items.map((t, i) => <li key={i}><Inline text={t} onCite={onCite} /></li>)}</Tag>);
    list = null;
  };
  for (const line of text.split("\n")) {
    const num = line.match(/^\s*\d+[.)]\s+(.*)/);
    const bul = line.match(/^\s*[*-]\s+(.*)/);
    const item = num ?? bul;
    if (item) {
      const ordered = !!num;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push(item[1]);
    } else {
      flush();
      const h = line.match(/^#{1,6}\s+(.*)/);
      if (h) out.push(<h3 key={out.length}><Inline text={h[1]} onCite={onCite} /></h3>);
      else if (line.trim()) out.push(<p key={out.length}><Inline text={line.trim()} onCite={onCite} /></p>);
    }
  }
  flush();
  return <>{out}</>;
}
