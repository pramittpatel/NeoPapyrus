"use client";
import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";
import { EXPLAIN_LEVELS, type ExplainLevel } from "@/lib/format";
import styles from "./LevelSlider.module.css";

const KEY = "pc:level";
const LAST = EXPLAIN_LEVELS.length - 1;

export const DEFAULT_LEVEL: ExplainLevel = "Undergrad";
export const isLevel = (v: unknown): v is ExplainLevel => EXPLAIN_LEVELS.includes(v as ExplainLevel);
export const parseLevel = (v: string | null | undefined): ExplainLevel => (isLevel(v) ? v : DEFAULT_LEVEL);

/** The reader's explanation level, persisted per browser. */
export function loadLevel(): ExplainLevel {
  try { return parseLevel(localStorage.getItem(KEY)); } catch { return DEFAULT_LEVEL; }
}
export function saveLevel(v: ExplainLevel) {
  try { localStorage.setItem(KEY, v); } catch { /* storage unavailable */ }
}

const LABEL: Record<ExplainLevel, string> = { "High-schooler": "High school", Undergrad: "Undergrad", PhD: "PhD" };
const NOTE: Record<ExplainLevel, string> = {
  "High-schooler": "Plain words, every technical term explained.",
  Undergrad: "Standard terms; specialised ones explained.",
  PhD: "Technical detail: methods, metrics and limits.",
};

const Cap = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 9l10-5 10 5-10 5z" /><path d="M6 11.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.5" /><path d="M22 9v5" />
  </svg>
);

type Props = { value: ExplainLevel; onChange: (v: ExplainLevel) => void; compact?: boolean };

/** Three-stop slider: click a stop, drag the thumb (snaps), or use the arrow keys. */
export default function LevelSlider({ value, onChange, compact }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  // Optimistic value: parents may update `value` asynchronously (e.g. via navigation); show the choice until they do.
  const [pending, setPending] = useState<{ from: ExplainLevel; to: ExplainLevel } | null>(null);
  const current = pending && pending.from === value ? pending.to : value;
  const committed = Math.max(0, EXPLAIN_LEVELS.indexOf(current));
  const idx = drag ?? committed;
  const shown = EXPLAIN_LEVELS[idx];

  const commit = (i: number) => {
    const next = EXPLAIN_LEVELS[Math.min(LAST, Math.max(0, i))];
    if (next === current) return;
    setPending({ from: value, to: next });
    onChange(next);
  };

  // Nearest stop to a pointer x. Stops sit at the thumb centres, inset by half a thumb + the track padding.
  const stopAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return committed;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const inset = parseFloat(cs.getPropertyValue("--thumb-w")) / 2 + parseFloat(cs.getPropertyValue("--pad"));
    const ratio = (clientX - r.left - inset) / Math.max(1, r.width - inset * 2);
    return Math.min(LAST, Math.max(0, Math.round(ratio * LAST)));
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(stopAt(e.clientX));
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    const i = stopAt(e.clientX);
    if (i !== drag) setDrag(i);
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    const i = stopAt(e.clientX);
    setDrag(null);
    commit(i);
  };
  const onCancel = () => setDrag(null);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 };
    let next: number | null = null;
    if (e.key in moves) next = committed + moves[e.key];
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = LAST;
    if (next === null) return;
    e.preventDefault();
    commit(next);
  };

  return (
    <div className={`${styles.root}${compact ? ` ${styles.compact}` : ""}`}>
      <div className={styles.head} aria-hidden="true">
        <div className={styles.text}>
          <b className={styles.value}>{LABEL[shown as ExplainLevel] ?? shown}</b>
          <span className={styles.caption}>Explanation level</span>
        </div>
        <span className={styles.headIcon}><Cap size={16} /></span>
      </div>
      <div
        ref={trackRef}
        className={`${styles.track}${drag !== null ? ` ${styles.dragging}` : ""}`}
        style={{ "--i": idx, "--n": LAST } as CSSProperties}
        role="slider"
        tabIndex={0}
        aria-label="Explanation level"
        aria-valuemin={0}
        aria-valuemax={LAST}
        aria-valuenow={committed}
        aria-valuetext={current}
        aria-orientation="horizontal"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onLostPointerCapture={onCancel}
        onKeyDown={onKey}
      >
        <span className={styles.fill} aria-hidden="true" />
        {EXPLAIN_LEVELS.map((l, i) => (
          <span key={l} className={`${styles.dot}${i < idx ? ` ${styles.on}` : ""}`} style={{ "--s": i } as CSSProperties} aria-hidden="true" />
        ))}
        <span className={styles.thumb} aria-hidden="true" />
      </div>
      <div className={styles.stops} aria-hidden="true">
        {EXPLAIN_LEVELS.map((l, i) => (
          <button key={l} type="button" tabIndex={-1} className={i === idx ? styles.stopOn : undefined} onClick={() => commit(i)}>{LABEL[l]}</button>
        ))}
      </div>
      <p className={styles.note}>{NOTE[shown as ExplainLevel] ?? ""}</p>
    </div>
  );
}

type BadgeProps = { value: ExplainLevel; onChange: (v: ExplainLevel) => void; align?: "start" | "end"; side?: "above" | "below" | "auto" };

/** Composer pill (like a chat app's model picker) that opens the slider in a popover. Changes apply immediately. */
export function LevelBadge({ value, onChange, align = "end", side = "above" }: BadgeProps) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const openPop = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (side !== "auto") setAbove(side === "above");
    else if (r) { const below = window.innerHeight - r.bottom; setAbove(below < 160 && r.top > below); }
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    popRef.current?.querySelector<HTMLElement>("[role=slider]")?.focus();
    const onDown = (e: globalThis.PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const onPopKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
  };
  // Tabbing out of the popover closes it.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (open && e.relatedTarget && !wrapRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
  };

  return (
    <div ref={wrapRef} className={styles.badgeWrap} onBlur={onBlur}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.badge}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Explanation level: ${LABEL[value]}`}
        title="Explanation level"
        onClick={() => (open ? close(false) : openPop())}
        onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); openPop(); } }}
      >
        <span className={styles.badgeIcon}><Cap size={14} /></span>
        <span className={styles.badgeText}>{LABEL[value]}</span>
      </button>
      {open && (
        <div ref={popRef} role="dialog" aria-label="Explanation level" onKeyDown={onPopKey}
          className={`${styles.pop} ${align === "end" ? styles.popEnd : styles.popStart}${above ? ` ${styles.popAbove}` : ""}`}>
          <LevelSlider value={value} onChange={onChange} />
        </div>
      )}
    </div>
  );
}
