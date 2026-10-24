"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./Combobox.module.css";

export type ComboOption = { value: string; label: string; hint?: string };

type Props = {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  prefix?: string;
  icon?: ReactNode;
  variant?: "inline" | "field";
  searchPlaceholder?: string;
  emptyText?: string;
  align?: "start" | "end";
  disabled?: boolean;
};

export default function Combobox({
  options,
  value,
  onChange,
  label,
  prefix,
  icon,
  variant = "inline",
  searchPlaceholder = "Search…",
  emptyText = "No matches",
  align = "start",
  disabled,
}: Props) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [above, setAbove] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return options;
    return options.filter((o) => {
      const hay = `${o.label} ${o.hint ?? ""}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [options, query]);

  const openMenu = () => {
    if (disabled) return;
    const idx = options.findIndex((o) => o.value === value);
    setQuery("");
    setActive(Math.max(idx, 0));
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      setAbove(below < 340 && rect.top > below);
    }
    setOpen(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const select = (o: ComboOption) => {
    onChange(o.value);
    close(true);
  };

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active, filtered]);

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openMenu();
    }
  };

  const onInputKey = (e: KeyboardEvent) => {
    const n = filtered.length;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (n) setActive((active + 1) % n);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (n) setActive((active - 1 + n) % n);
        break;
      case "Home":
      case "End":
        if (query) break; // let the caret move inside the search text
        e.preventDefault();
        setActive(e.key === "Home" ? 0 : Math.max(n - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filtered[active]) select(filtered[active]);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case "Tab":
        close(true);
        break;
    }
  };

  const activeId = filtered[active] ? `${uid}-opt-${active}` : undefined;

  return (
    <div ref={wrapRef} className={`${styles.wrap} ${variant === "field" ? styles.wrapField : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${variant === "field" ? styles.field : styles.inline}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${selected?.label ?? value}`}
        disabled={disabled}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onTriggerKey}
      >
        {icon}
        <span className={styles.text}>
          {prefix ? `${prefix} ` : ""}
          {selected?.label ?? value}
        </span>
        <svg className={styles.chevron} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className={`${styles.pop} ${align === "end" ? styles.end : styles.start} ${above ? styles.above : ""}`}>
          <input
            ref={inputRef}
            className={styles.search}
            type="text"
            role="combobox"
            aria-label={label}
            aria-controls={listId}
            aria-expanded="true"
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            placeholder={searchPlaceholder}
            value={query}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
          />
          <ul ref={listRef} id={listId} role="listbox" aria-label={label} className={styles.list}>
            {filtered.map((o, i) => (
              <li
                key={o.value}
                id={`${uid}-opt-${i}`}
                role="option"
                aria-selected={o.value === value}
                className={`${styles.option} ${i === active ? styles.active : ""}`}
                onPointerMove={() => i !== active && setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(o)}
              >
                <span className={styles.optText}>
                  <span className={styles.optLabel}>{o.label}</span>
                  {o.hint && <span className={styles.hint}>{o.hint}</span>}
                </span>
                {o.value === value && (
                  <svg className={styles.check} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </li>
            ))}
          </ul>
          {!filtered.length && <div className={styles.empty}>{emptyText}</div>}
        </div>
      )}
    </div>
  );
}
