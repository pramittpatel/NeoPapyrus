type Scope = { deep?: boolean; c?: string };

const params = (q: string, { deep, c }: Scope, extra: Record<string, string> = {}) => {
  const sp = new URLSearchParams({ q, ...extra });
  if (deep) sp.set("deep", "1");
  if (c && c !== "all") sp.set("c", c);
  return sp.toString();
};

export const answerHref = (q: string, scope: Scope = {}) => `/answer?${params(q, scope)}`;
export const sourceHref = (n: number, q: string, scope: Scope = {}) => `/answer/source?${params(q, scope, { n: String(n) })}`;
