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

export function saveResult(r: AnswerResult, deep: boolean, ..._rest: unknown[]) {
  void _rest;
  write(RESULT, { ...r, deep });
  const entry: Recent = { id: r.id, question: r.question, collection: r.collection, deep, sources: r.papers.length };
  const same = (x: Recent) => x.question === entry.question && x.collection === entry.collection && !!x.deep === deep;
  write(RECENT, [entry, ...read<Recent[]>(RECENT, []).filter((x) => !same(x))].slice(0, 8));
  window.dispatchEvent(new Event(RECENT_EVENT));
  // Every paper an answer cites goes into "My library > Recent".
  recordPapers((r.papers ?? []).map((p) => ({ file: p.file, via: "cited" as const, question: r.question })));
}
export const loadResult = () => read<(AnswerResult & { deep?: boolean }) | null>(RESULT, null);
export const loadRecent = () => read<Recent[]>(RECENT, []);

/* ---- My library: favorites + recently seen papers ---- */

/** Fired on window whenever favorites or recent papers change. */
export const LIBRARY_EVENT = "pc:library";
const notifyLibrary = () => { try { window.dispatchEvent(new Event(LIBRARY_EVENT)); } catch {} };

// Favorites keep the original "pc:saved" key so earlier saves survive the rename.
export const loadFavorites = () => read<string[]>(SAVED, []);
export const isFavorite = (file: string) => loadFavorites().includes(file);
export const toggleFavorite = (file: string) => {
  const cur = loadFavorites();
  const next = cur.includes(file) ? cur.filter((f) => f !== file) : [...cur, file];
  write(SAVED, next);
  notifyLibrary();
  return next;
};
/** @deprecated use loadFavorites */
export const loadSaved = loadFavorites;
/** @deprecated use toggleFavorite */
export const toggleSaved = toggleFavorite;

const RECENT_PAPERS = "pc:recentPapers";
const RECENT_PAPERS_MAX = 40;
export type RecentPaper = { file: string; at: number; via: "viewed" | "cited"; question?: string };

export const loadRecentPapers = () => read<RecentPaper[]>(RECENT_PAPERS, []);
/** Record papers as recently seen: newest first, one entry per file (latest wins), capped. */
export function recordPapers(entries: (Omit<RecentPaper, "at"> & { at?: number })[]) {
  if (!entries.length) return;
  const now = Date.now();
  const fresh: RecentPaper[] = [];
  for (const e of entries) {
    if (!e.file || fresh.some((x) => x.file === e.file)) continue;
    fresh.push({ file: e.file, at: e.at ?? now, via: e.via, ...(e.question ? { question: e.question } : {}) });
  }
  const keep = loadRecentPapers().filter((x) => !fresh.some((f) => f.file === x.file));
  write(RECENT_PAPERS, [...fresh, ...keep].slice(0, RECENT_PAPERS_MAX));
  notifyLibrary();
}
export const clearRecentPapers = () => { write(RECENT_PAPERS, []); notifyLibrary(); };

/** useSyncExternalStore helpers: re-render when favorites/recent papers change in this tab or another. */
export function subscribeLibrary(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (!e.key || e.key === SAVED || e.key === RECENT_PAPERS) cb(); };
  window.addEventListener(LIBRARY_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(LIBRARY_EVENT, cb); window.removeEventListener("storage", onStorage); };
}
/** A cheap, comparable snapshot string; parse with loadRecentPapers()/loadFavorites(). */
export const librarySnapshot = () => {
  try { return `${localStorage.getItem(RECENT_PAPERS) ?? ""}\n${localStorage.getItem(SAVED) ?? ""}`; } catch { return "\n"; }
};
export const loadStyle = () => read<CiteStyle>(STYLE, "APA");
export const saveStyle = (s: CiteStyle) => write(STYLE, s);
