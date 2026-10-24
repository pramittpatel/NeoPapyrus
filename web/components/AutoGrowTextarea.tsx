"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, type KeyboardEvent, type TextareaHTMLAttributes } from "react";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & {
  value: string;
  /** Enter (without Shift, outside IME composition) calls this instead of inserting a newline. */
  onEnter?: () => void;
  maxRows?: number;
};

/** One-line textarea that grows with its content up to `maxRows`, then scrolls internally. */
export default function AutoGrowTextarea({ value, onEnter, maxRows = 10, onKeyDown, style, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const max = line * maxRows + pad + border;
    el.style.height = "auto";
    const full = el.scrollHeight + border;
    el.style.height = `${Math.min(full, max)}px`;
    el.style.overflowY = full > max + 1 ? "auto" : "hidden";
  }, [maxRows]);

  useLayoutEffect(fit, [value, fit]);
  useEffect(() => {
    window.addEventListener("resize", fit);
    document.fonts?.ready.then(fit).catch(() => {});
    return () => window.removeEventListener("resize", fit);
  }, [fit]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || !onEnter) return;
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onEnter(); }
  };

  return <textarea ref={ref} rows={1} value={value} onKeyDown={onKey} style={{ resize: "none", ...style }} {...rest} />;
}
