"use client";
import { useEffect, useState } from "react";

export default function SignedOut() {
  const [p, setP] = useState<URLSearchParams | null>(null);
  useEffect(() => setP(new URLSearchParams(window.location.search)), []);
  const bye = p?.get("bye"), why = p?.get("reason");
  return (
    <main className="verify">
      <div className="card">
        <img src="/geoestate-logo.png" alt="GeoEstate" width={56} height={56} />
        <h1>{bye ? "You have signed out of LandCheck" : "LandCheck"}</h1>
        {why ? <p role="alert">{why}</p> : <p className="muted">{bye ? "Your Geohub account stays signed in." : "Sign in with the account you use for Geohub."}</p>}
        <p><a className="btn-solid btn-link" href="/api/auth/sign-in?next=/">Sign in with GeoEstate</a> <a href="/" style={{ marginLeft: 12 }}>Back to the map</a></p>
      </div>
    </main>
  );
}
