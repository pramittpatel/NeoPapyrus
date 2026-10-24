"use client";
import { useEffect, useState } from "react";
import type { ComboOption } from "@/components/Combobox";

type Data = { total: number; collections: { name: string; count: number }[] };
let cached: Promise<Data> | null = null;

/** Topic collections (with paper counts) for scoping a search; "all" is always first. */
export function useCollections(): ComboOption[] {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    cached ??= fetch("/api/collections").then((r) => r.json()).catch(() => ((cached = null), { total: 0, collections: [] }));
    cached.then(setData);
  }, []);
  const plural = (n: number) => `${n} ${n === 1 ? "paper" : "papers"}`;
  return [
    { value: "all", label: "All sources", hint: data ? plural(data.total) : undefined },
    ...(data?.collections ?? []).map((c) => ({ value: c.name, label: c.name, hint: plural(c.count) })),
  ];
}
