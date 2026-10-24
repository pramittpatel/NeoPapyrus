"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Book, Plus, Search, SidebarLeft, Spark } from "./Icons";
import { answerHref } from "@/lib/links";
import { loadRecent, RECENT_EVENT, type Recent } from "@/lib/store";

const Ctx = createContext<{ open: boolean; toggle: () => void }>({ open: false, toggle: () => {} });
export const useShell = () => useContext(Ctx);

export function SidebarButton() {
  const { toggle, open } = useShell();
  return (
    <button className="icon-btn" aria-label="Toggle sidebar" aria-expanded={open} onClick={toggle}>
      <SidebarLeft />
    </button>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);
  const path = usePathname();
  const toggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    const refresh = () => setRecent(loadRecent());
    refresh();
    window.addEventListener(RECENT_EVENT, refresh);
    return () => window.removeEventListener(RECENT_EVENT, refresh);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const nav = [
    { href: "/", label: "New question", icon: <Plus size={16} /> },
    { href: "/library", label: "My library", icon: <Book size={16} /> },
    { href: "/debate", label: "Paper debate", icon: <Spark size={16} /> },
    { href: "/gaps", label: "Research gaps", icon: <Search size={16} /> },
  ];

  return (
    <Ctx.Provider value={{ open, toggle }}>
      <div className="shell">
        {open && <button className="scrim" aria-label="Close sidebar" onClick={toggle} />}
        <aside className={`sidebar${open ? " open" : ""}`} aria-label="Sidebar" inert={!open}>
          <div className="sidebar-brand">NeoPapyrus</div>
          <nav className="sidebar-nav" aria-label="Main">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} aria-current={path === n.href || (n.href === "/" && path.startsWith("/answer")) ? "page" : undefined}>{n.icon}{n.label}</Link>
            ))}
          </nav>
          {recent.length > 0 && (
            <>
              <div className="eyebrow pad">Recent</div>
              <ul className="recent">
                {recent.map((r) => (
                  <li key={r.id}><Link href={answerHref(r.question, { deep: r.deep, c: r.collection })} onClick={() => setOpen(false)}>{r.question}</Link></li>
                ))}
              </ul>
            </>
          )}
        </aside>
        <div className="shell-main">{children}</div>
      </div>
    </Ctx.Provider>
  );
}
