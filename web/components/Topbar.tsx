"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Back, Plus } from "./Icons";
import { SidebarButton } from "./Shell";

/** The one header used by every page. `back` is "history" (falls back to Home) or a path; `title` may be text or breadcrumbs. */
export default function Topbar({
  title, back, newQuestion = true, ruled = true, children,
}: { title?: ReactNode; back?: "history" | string; newQuestion?: boolean; ruled?: boolean; children?: ReactNode }) {
  const router = useRouter();
  return (
    <header className={`topbar${ruled ? " ruled" : ""}`}>
      <SidebarButton />
      {back === "history" && (
        <button className="icon-btn" aria-label="Back" onClick={() => (history.length > 1 ? router.back() : router.push("/"))}><Back /></button>
      )}
      {back && back !== "history" && <Link className="icon-btn" href={back} aria-label="Back"><Back /></Link>}
      {newQuestion && <Link className="icon-btn" href="/" aria-label="New question"><Plus /></Link>}
      {typeof title === "string" ? <div className="title-sm">{title}</div> : title}
      <div className="grow" />
      {children}
    </header>
  );
}
