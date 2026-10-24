"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CiteStyle } from "./format";
import { loadStyle, saveStyle } from "./store";

/** Citation style shared across pages; persisted. */
export function useCiteStyle(): [CiteStyle, (s: CiteStyle) => void] {
  const [style, setStyle] = useState<CiteStyle>("APA");
  useEffect(() => { setStyle(loadStyle()); }, []);
  return [style, useCallback((s: CiteStyle) => { setStyle(s); saveStyle(s); }, [])];
}

/** copy(text) -> `copied` is true for 1.5s; failures (insecure origin, denied permission) leave it false. */
export function useCopy(): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = useCallback(async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch { return; }
    setCopied(true); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1500);
  }, []);
  return [copied, copy];
}

/** Scroll to `#${prefix}-${n}` and highlight it briefly. */
export function useFlash(prefix: string): [number | null, (n: number) => void] {
  const [flash, setFlash] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const go = useCallback((n: number) => {
    const el = document.getElementById(`${prefix}-${n}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setFlash(n); clearTimeout(timer.current); timer.current = setTimeout(() => setFlash(null), 1800);
  }, [prefix]);
  return [flash, go];
}

export function useTitle(title: string) {
  useEffect(() => { document.title = title ? `${title} · Research Paper Assistant` : "Research Paper Assistant"; }, [title]);
}
