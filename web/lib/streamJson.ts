"use client";
import type { ProgressEvent } from "./progress";

export type StageEvent = { id: string; label: string };

const GENERIC = "Something went wrong. Try again in a moment.";

/**
 * POST JSON and follow the server's progress stream (see lib/progress.ts).
 * Calls `onStage` as each real step starts; resolves with the final result, rejects with the server's error message.
 * Falls back to a plain JSON response if the server (or a proxy) didn't stream.
 */
export async function postWithProgress<T>(url: string, body: unknown, onStage: (s: StageEvent) => void, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify(body),
    signal,
  });

  if (!(r.headers.get("content-type") ?? "").includes("application/x-ndjson") || !r.body) {
    const d = await r.json().catch(() => null);
    if (!r.ok || !d) throw new Error((d as { error?: string } | null)?.error ?? GENERIC);
    return d as T;
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  // Returns the outcome once a terminal event arrives; stage events are reported as they come.
  const handle = (line: string): { data: T } | null => {
    if (!line.trim()) return null;
    let e: ProgressEvent;
    try { e = JSON.parse(line) as ProgressEvent; } catch { return null; }
    if (e.type === "stage") { onStage({ id: e.id, label: e.label }); return null; }
    if (e.type === "error") throw new Error(e.error || GENERIC);
    if (e.type === "result") return { data: e.data as T };
    return null; // keep-alive pings and anything newer
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      buf += decoder.decode(value, { stream: !done });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const out = handle(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
        if (out) return out.data;
      }
      if (done) {
        const out = handle(buf);
        if (out) return out.data;
        throw new Error("The connection closed before the result arrived. Try again.");
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}
