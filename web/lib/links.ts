import type { ExplainLevel } from "./format";

type Scope = { deep?: boolean; c?: string; level?: ExplainLevel };

const params = (q: string, { deep, c, level }: Scope, extra: Record<string, string> = {}) => {
  const sp = new URLSearchParams({ q, ...extra });
  if (deep) sp.set("deep", "1");
  if (c && c !== "all") sp.set("c", c);
  if (level && level !== "Undergrad") sp.set("l", level);
  return sp.toString();
};

export const answerHref = (q: string, scope: Scope = {}) => `/answer?${params(q, scope)}`;
export const sourceHref = (n: number, q: string, scope: Scope = {}) => `/answer/source?${params(q, scope, { n: String(n) })}`;
