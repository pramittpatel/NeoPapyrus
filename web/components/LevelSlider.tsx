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
      <div className={styles.text} aria-hidden="true">
        <b className={styles.value}>{shown}</b>
        <span className={styles.caption}>Explanation level</span>
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
        aria-label={`Explanation level: ${value}`}
        onClick={() => (open ? close(false) : openPop())}
        onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); openPop(); } }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" />
        </svg>
        <span className={styles.badgeText}><span className={styles.badgeValue}>{value}</span><span className={styles.badgeHint}> level</span></span>
        <svg className={styles.chevron} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
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
