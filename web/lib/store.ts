"use client";
import type { AnswerResult, CiteStyle } from "./format";

const RESULT = "pc:result";
const RECENT = "pc:recent";
const SAVED = "pc:saved";
const STYLE = "pc:style";

const read = <T,>(k: string, fallback: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export type Recent = { id: string; question: string; collection: string; deep: boolean; sources: number };
export const RECENT_EVENT = "pc:recent";

export function saveResult(r: AnswerResult, deep: boolean) {
  write(RESULT, { ...r, deep });
  const entry: Recent = { id: r.id, question: r.question, collection: r.collection, deep, sources: r.papers.length };
  const same = (x: Recent) => x.question === entry.question && x.collection === entry.collection && !!x.deep === deep;
  write(RECENT, [entry, ...read<Recent[]>(RECENT, []).filter((x) => !same(x))].slice(0, 8));
  window.dispatchEvent(new Event(RECENT_EVENT));
}
export const loadResult = () => read<(AnswerResult & { deep?: boolean }) | null>(RESULT, null);
export const loadRecent = () => read<Recent[]>(RECENT, []);
export const loadSaved = () => read<string[]>(SAVED, []);
export const toggleSaved = (file: string) => {
  const cur = loadSaved();
  const next = cur.includes(file) ? cur.filter((f) => f !== file) : [...cur, file];
  write(SAVED, next);
  return next;
};
export const loadStyle = () => read<CiteStyle>(STYLE, "APA");
export const saveStyle = (s: CiteStyle) => write(STYLE, s);
