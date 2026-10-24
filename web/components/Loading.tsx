"use client";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Check } from "./Icons";
import styles from "./Loading.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ---------------- Spinner ---------------- */

/** Rotating ring in currentColor. Decorative unless `label` is given. Static (still a gapped ring) under reduced motion. */
export function Spinner({ size = 14, label, className }: { size?: 12 | 14 | 16 | 20; label?: string; className?: string }) {
  return (
    <span
      className={cx(styles.spinner, styles[`s${size}`], className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    />
  );
}

/** One-line status: spinner while busy, green check when done. */
export function StatusLine({ done = false, children, live = false }: { done?: boolean; children: ReactNode; live?: boolean }) {
  return (
    <div className={styles.status} {...(live ? { role: "status" } : {})}>
      {done ? <span className={styles.check}><Check size={14} /></span> : <Spinner size={14} />}
      <span>{children}</span>
    </div>
  );
}

/* ---------------- Skeleton ---------------- */

type Len = number | string;
const len = (v: Len | undefined) => (typeof v === "number" ? `${v}px` : v);

/** A shimmering placeholder block. */
export function Skeleton({ width, height, radius, style, className }: { width?: Len; height?: Len; radius?: Len; style?: CSSProperties; className?: string }) {
  return <span aria-hidden="true" className={cx(styles.sk, className)} style={{ width: len(width) ?? "100%", height: len(height), borderRadius: len(radius), ...style }} />;
}

const WIDTHS = ["100%", "96%", "92%", "98%", "88%", "94%"];
/** Paragraph placeholder: `lines` bars, the last one short. */
export function SkeletonText({ lines = 4, last = "62%", height = 14, gap }: { lines?: number; last?: Len; height?: number; gap?: number }) {
  return (
    <span aria-hidden="true" className={styles.lines} style={gap !== undefined ? { gap } : undefined}>
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} height={height} width={i === lines - 1 && lines > 1 ? last : WIDTHS[i % WIDTHS.length]} />)}
    </span>
  );
}

/** Row placeholder: a small square (citation chip / icon) beside two lines. */
export function SkeletonRow({ lead = 20, title = "72%", sub = "44%", className, style }: { lead?: number; title?: Len; sub?: Len | null; className?: string; style?: CSSProperties }) {
  return (
    <div aria-hidden="true" className={cx(styles.row, className)} style={{ alignItems: "flex-start", ...style }}>
      <Skeleton width={lead} height={lead} radius={lead > 24 ? 10 : 6} />
      <span className={styles.grow}>
        <Skeleton width={title} height={13} />
        {sub !== null && <Skeleton width={sub} height={11} />}
      </span>
    </div>
  );
}

/**
 * Card placeholder using the caller's real card class (e.g. "card side", "lib-card") so it has the final size and padding:
 * an optional chip row, a title bar, a meta line and some text lines.
 */
export function SkeletonCard({ className = "card", chip = true, title = "70%", meta = "40%", lines = 3, children, style }: {
  className?: string; chip?: boolean; title?: Len | null; meta?: Len | null; lines?: number; children?: ReactNode; style?: CSSProperties;
}) {
  return (
    <div aria-hidden="true" className={className} style={style}>
      {chip && <Skeleton width={72} height={20} radius={999} />}
      {title !== null && <Skeleton width={title} height={18} />}
      {meta !== null && <Skeleton width={meta} height={12} />}
      {lines > 0 && <SkeletonText lines={lines} height={12} gap={9} />}
      {children}
    </div>
  );
}

/* ---------------- ProgressSteps ---------------- */

export type Step = { id: string; label: string };

const secs = (ms: number) => Math.max(0, Math.floor(ms / 1000));
const fmt = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`);

/**
 * Vertical list of the steps of a slow request. `steps` is the planned order; `current` is the id of the step the server
 * last reported (null before the first report, which shows the first step as running). Done steps get a check and how long
 * they took, the current step a spinner and a live seconds counter, later steps a muted dot.
 * `hint` appears once the whole run has taken `hintAfter` seconds.
 */
export function ProgressSteps({ steps, current, hint, hintAfter = 20, label = "Progress" }: {
  steps: Step[]; current: string | null; hint?: ReactNode; hintAfter?: number; label?: string;
}) {
  const cur = current ?? steps[0]?.id ?? null;
  const idx = Math.max(0, steps.findIndex((s) => s.id === cur));
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  const [marks, setMarks] = useState<Record<string, number>>({});
  // Note when each step was first reported (state adjusted during render, React's pattern for reacting to a prop change).
  if (cur && marks[cur] === undefined) setMarks((m) => (m[cur] !== undefined ? m : { ...m, [cur]: Date.now() }));

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const total = secs(now - start);
  const endOf = (i: number) => {
    const later = steps.slice(i + 1).map((s) => marks[s.id]).filter((x): x is number => !!x);
    return later.length ? Math.min(...later) : undefined;
  };
  const curLabel = steps[idx]?.label ?? "";
  const showHint = !!hint && total >= hintAfter;

  return (
    <div className={styles.steps}>
      <p className="sr-only" role="status" aria-live="polite">{curLabel ? `${curLabel}…` : ""}{showHint && typeof hint === "string" ? ` ${hint}` : ""}</p>
      <ol className={styles.list} aria-label={label}>
        {steps.map((s, i) => {
          const state = i < idx ? "done" : i === idx ? "current" : "pending";
          const began = marks[s.id];
          const end = endOf(i);
          const took = state === "done" && began && end ? secs(end - began) : null;
          const running = state === "current" ? (began ? secs(now - began) : 0) : null;
          return (
            <li key={s.id} className={cx(styles.step, styles[state])} aria-current={state === "current" ? "step" : undefined}>
              <span className={styles.icon}>
                {state === "done" ? <span className={styles.check}><Check size={14} /></span> : state === "current" ? <Spinner size={14} /> : <span className={styles.dot} />}
              </span>
              <span className={styles.label}>
                {s.label}
                <span className="sr-only">{state === "done" ? " (done)" : state === "current" ? " (in progress)" : " (waiting)"}</span>
              </span>
              {running !== null && <span className={styles.time} aria-hidden="true">{fmt(running)}</span>}
              {took !== null && <span className={styles.time} aria-hidden="true">{took ? fmt(took) : "<1s"}</span>}
            </li>
          );
        })}
      </ol>
      {showHint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}

/** Merge the planned steps with the stages the server actually reported (server labels win; unplanned stages are appended). */
export function mergeSteps(plan: Step[], seen: Step[]): Step[] {
  const out = plan.map((p) => seen.find((s) => s.id === p.id) ?? p);
  for (const s of seen) if (!out.some((o) => o.id === s.id)) out.push(s);
  return out;
}

/* ---------------- FadeIn ---------------- */

/** Fades + rises (6px, 220ms) its content in on mount. `stack` lays children out in a column with that gap. */
export function FadeIn({ children, className, stack, as: Tag = "div", ...rest }: {
  children: ReactNode; className?: string; stack?: number; as?: "div" | "section" | "article";
} & { "aria-label"?: string }) {
  return (
    <Tag className={cx(styles.fade, className)} style={stack !== undefined ? { display: "flex", flexDirection: "column", gap: stack } : undefined} {...rest}>
      {children}
    </Tag>
  );
}

export const BUSY_HINT = "Snowflake is busy — this can take a minute or two.";
