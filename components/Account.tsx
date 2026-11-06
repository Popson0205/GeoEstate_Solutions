"use client";
import { useEffect, useRef, useState } from "react";
import { api, allowanceText, signInUrl, type AppTile, type Me, type Usage } from "@/lib/client/api";

const WHAT: Record<string, string> = { hub: "Field data, maps and dashboards", land: "Parcels, titles and transfers",
  check: "Location and due-diligence reports", farm: "Crop monitoring from satellite and drone" };

/** Signed in: who, the organization's allowance, the GeoEstate app switcher and sign-out. Signed out: "Sign in". */
export default function Account({ me, usage, loading }: { me: Me | null; usage: Usage | null; loading?: boolean }) {
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<AppTile[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (me) void api<AppTile[]>("/api/apps").then(setApps, () => setApps([])); }, [me]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", away); window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc); };
  }, [open]);
  if (loading) return <div className="acct-slot" />;
  if (!me) return <a className="acct-signin" href={signInUrl()}>Sign in</a>;
  const signOut = async () => { await api("/api/auth/sign-out", { method: "POST" }).catch(() => undefined); window.location.assign("/signed-out?bye=1"); };
  return (
    <div className="acct" ref={ref}>
      <button type="button" className="acct-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="acct-avatar" aria-hidden="true">{me.name.slice(0, 1).toUpperCase()}</span>
        <span className="acct-name">{me.name}<small>{me.org_name ?? "GeoEstate staff"}</small></span>
      </button>
      {open && (
        <div className="acct-pop" role="menu" aria-label="Account">
          <div className="acct-head"><strong>{me.org_name}</strong><span>{me.product?.plan_name}{me.product && me.product.status !== "active" ? ` · ${me.product.status_name}` : ""}</span>
            {usage && <span className="acct-usage">{allowanceText(usage)}</span>}</div>
          <a role="menuitem" className="acct-item" href="/reports">Your organization's reports</a>
          {apps.filter((a) => !a.current).length > 0 && <div className="acct-sub">GeoEstate apps</div>}
          {apps.filter((a) => !a.current).map((a) => a.url
            ? <a key={a.product} role="menuitem" className="acct-item" href={a.url} target="_blank" rel="noopener"><strong>{a.name}</strong><span>{WHAT[a.product] ?? ""}</span></a>
            : <div key={a.product} className="acct-item is-off"><strong>{a.name}</strong><span>{WHAT[a.product] ?? ""}</span></div>)}
          <button type="button" role="menuitem" className="acct-item acct-out" onClick={signOut}>Sign out</button>
        </div>
      )}
    </div>
  );
}
