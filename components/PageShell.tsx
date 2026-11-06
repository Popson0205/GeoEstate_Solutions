"use client";
import type { ReactNode } from "react";
import Account from "@/components/Account";
import { licenceNotice, useMe, type Me, type Usage } from "@/lib/client/api";

/** The LandCheck pages other than the map: the top bar, the licence notice, and the page. */
export default function PageShell({ children, title }: { title?: string; children: (s: { me: Me | null; usage: Usage | null; loading: boolean; reload: () => void }) => ReactNode }) {
  const s = useMe();
  const notice = licenceNotice(s.me);
  return (
    <div className="page">
      <header className="geo-topbar">
        <a className="brand" href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <img src="/geoestate-logo.png" alt="" width={36} height={36} style={{ borderRadius: 8 }} />
          <div className="brand-copy"><div className="brand-name">GEOESTATE</div><div className="brand-sub">LANDCHECK</div></div>
        </a>
        <nav className="page-nav" aria-label="Sections"><a href="/">Map</a>{s.me && <a href="/reports">Reports</a>}</nav>
        <Account me={s.me} usage={s.usage} loading={s.loading} />
      </header>
      {notice && <div className={`notice notice-${notice.tone}`} role="status">{notice.text}</div>}
      <main className="page-main">{title && <h1 className="page-title">{title}</h1>}{children(s)}</main>
    </div>
  );
}
