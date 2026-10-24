"use client";
import { useEffect, useState } from "react";
import type { ComboOption } from "@/components/Combobox";

type Data = { total: number; collections: { value: string; name: string; count: number }[] };
let cached: Promise<Data> | null = null;

/** Collections (team papers, arXiv papers, topics) with paper counts; "all" is always first. */
export function useCollectionData(): Data | null {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    cached ??= fetch("/api/collections").then((r) => r.json()).catch(() => ((cached = null), { total: 0, collections: [] }));
    cached.then(setData);
  }, []);
  return data;
}

export function useCollections(): ComboOption[] {
  const data = useCollectionData();
  const plural = (n: number) => `${n} ${n === 1 ? "paper" : "papers"}`;
  return [
    { value: "all", label: "All sources", hint: data ? plural(data.total) : undefined },
    ...(data?.collections ?? []).map((c) => ({ value: c.value, label: c.name, hint: plural(c.count) })),
  ];
}
