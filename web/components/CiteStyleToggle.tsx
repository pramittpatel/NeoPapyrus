"use client";
import { CITE_STYLES, type CiteStyle } from "@/lib/format";

export default function CiteStyleToggle({ value, onChange }: { value: CiteStyle; onChange: (s: CiteStyle) => void }) {
  return (
    <div className="seg" role="group" aria-label="Citation style">
      {CITE_STYLES.map((s) => <button key={s} aria-pressed={s === value} onClick={() => onChange(s)}>{s}</button>)}
    </div>
  );
}
