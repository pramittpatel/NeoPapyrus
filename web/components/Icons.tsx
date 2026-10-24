import type { ReactNode } from "react";

function Svg({ size = 18, sw = 1.8, stroke = "currentColor", children }: { size?: number; sw?: number; stroke?: string; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} aria-hidden="true">
      {children}
    </svg>
  );
}
type P = { size?: number; sw?: number; stroke?: string };

export const SidebarLeft = (p: P) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></Svg>;
export const SidebarRight = (p: P) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M15 4v16" /></Svg>;
export const Back = (p: P) => <Svg {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Svg>;
export const Plus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const Book = (p: P) => <Svg {...p}><path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z" /><path d="M8 7h6" /></Svg>;
export const Folder = (p: P) => <Svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Svg>;
export const Lines = (p: P) => <Svg {...p}><path d="M7 4h10M7 12h10M7 20h10" /></Svg>;
export const ChevronRight = (p: P) => <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>;
export const Search = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></Svg>;
export const Send = (p: P) => <Svg {...p} sw={2}><path d="M12 19V5M6 11l6-6 6 6" /></Svg>;
export const Spark = (p: P) => <Svg {...p} sw={2}><path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" /></Svg>;
export const Table = (p: P) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></Svg>;
export const Graph = (p: P) => <Svg {...p}><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="8" r="2.5" /><circle cx="10" cy="18" r="2.5" /><path d="M8.3 7l7.4.8M7 8.3l2.2 7.4M16.6 10.2l-5 6" /></Svg>;
export const Copy = (p: P) => <Svg {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Svg>;
export const Download = (p: P) => <Svg {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Svg>;
export const Refresh = (p: P) => <Svg {...p}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" /></Svg>;
export const Close = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const External = (p: P) => <Svg {...p} sw={2}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h10" /></Svg>;
export const Bookmark = (p: P) => <Svg {...p} sw={2}><path d="M5 4h14v17l-7-4-7 4z" /></Svg>;
export const Check = (p: P) => <Svg {...p} sw={2.4}><path d="M5 12l5 5 9-10" /></Svg>;
export const Minus = (p: P) => <Svg {...p} sw={2}><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></Svg>;
