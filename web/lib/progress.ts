/**
 * Optional progress streaming for slow route handlers.
 *
 * A route wraps its body in `withProgress(req, async (stage) => { ...; return Response.json(...) })` and calls
 * `stage(id, label)` at the moment each real step starts. Without `Accept: application/x-ndjson` the wrapped Response is
 * returned unchanged. With it, the client gets a 200 newline-delimited JSON stream:
 *   {"type":"stage","id":"...","label":"..."}   one per step, as it starts
 *   {"type":"result","data":<the JSON the route would have returned>}   or   {"type":"error","error":"<message>"}
 * plus {"type":"ping"} every 15s as a keep-alive: Cloudflare (the dev tunnel) drops streams that sit idle ~100s,
 * and a single Snowflake step can take longer than that when the warehouse is busy. Clients ignore unknown types.
 */
export type Stage = (id: string, label: string) => void;
export type ProgressEvent =
  | { type: "stage"; id: string; label: string }
  | { type: "result"; data: unknown }
  | { type: "error"; error: string }
  | { type: "ping" };

export const NDJSON = "application/x-ndjson";

export const wantsProgress = (req: Request) => (req.headers.get("accept") ?? "").includes(NDJSON);

const FALLBACK_ERROR = "The request to Snowflake failed. Try again in a moment.";
const KEEPALIVE_MS = 15_000;

export async function withProgress(req: Request, run: (stage: Stage) => Promise<Response>): Promise<Response> {
  if (!wantsProgress(req)) return run(() => {});

  const enc = new TextEncoder();
  let open = true;
  let keepalive: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ProgressEvent) => {
        if (!open) return;
        try { controller.enqueue(enc.encode(JSON.stringify(e) + "\n")); } catch { open = false; } // client went away
      };
      keepalive = setInterval(() => send({ type: "ping" }), KEEPALIVE_MS);
      try {
        const res = await run((id, label) => send({ type: "stage", id, label }));
        const data = await res.json().catch(() => null);
        if (res.ok && data !== null) send({ type: "result", data });
        else send({ type: "error", error: (data as { error?: string } | null)?.error ?? FALLBACK_ERROR });
      } catch (e) {
        console.error(e);
        send({ type: "error", error: FALLBACK_ERROR });
      }
      clearInterval(keepalive);
      if (open) { open = false; try { controller.close(); } catch {} }
    },
    cancel() { open = false; clearInterval(keepalive); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": `${NDJSON}; charset=utf-8`,
      // no-transform keeps compression layers (Next, Cloudflare) from holding chunks back.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
