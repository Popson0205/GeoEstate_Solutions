/**
 * Sign in with GeoEstate ID (Geohub), on the server side of a Next.js app: the TypeScript twin of Geohub's
 * clients/python/geoestate_id.py.
 *
 *   const gid = new GeoEstateID({ geohub, api, clientId: "check", clientSecret });
 *   redirect(gid.authorizeUrl(redirectUri, state, verifier));      // "Sign in": off to Geohub
 *   const tokens = await gid.exchange(code, redirectUri, verifier);  // back at redirectUri
 *   const me = await gid.verify(tokens.access_token);               // who, which organization, what licence
 *
 * The access token (15 minutes) is checked with Geohub's public key, fetched once and cached.
 */
import { createHash, randomBytes } from "node:crypto";
import { createLocalJWKSet, decodeProtectedHeader, errors as joseErrors, jwtVerify, type JSONWebKeySet } from "jose";

export type Role = "owner" | "admin" | "member" | "collector" | "viewer";
export type LicenceStatus = "demo" | "active" | "grace" | "expired" | "suspended";
export interface Claims {
  sub: string; email: string; name: string; mfa?: boolean;
  org: { id: string; name: string; slug: string; role: Role } | null;
  product: { id: string; plan: string; plan_name: string; licence_kind: string; status: LicenceStatus; status_name: string;
    subscription_ends: string | null; grace_ends: string | null; features: string[]; limits: Record<string, number | null> } | null;
  staff_role: string | null; aud: string; iss: string; exp: number; typ: string;
}
export interface Tokens { access_token: string; refresh_token: string; expires_in: number; token_type: string; user: Claims }
export interface AppTile { product: string; name: string; status: string; status_name: string; url: string | null; current: boolean }

export class GeoEstateIDError extends Error {
  constructor(message: string, public status = 401, public code = "invalid_token") { super(message); }
}

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export class GeoEstateID {
  geohub: string; api: string; clientId: string; clientSecret?: string;
  private keys: ReturnType<typeof createLocalJWKSet> | null = null;
  private keyIds = new Set<string>();
  private keysAt = 0;
  constructor(o: { geohub: string; api: string; clientId: string; clientSecret?: string; fetch?: typeof fetch; keyTtlMs?: number }) {
    this.geohub = o.geohub.replace(/\/$/, ""); this.api = o.api.replace(/\/$/, ""); this.clientId = o.clientId; this.clientSecret = o.clientSecret || undefined;
    if (o.fetch) this.http = o.fetch;
    if (o.keyTtlMs) this.keyTtlMs = o.keyTtlMs;
  }
  http: typeof fetch = (...a) => fetch(...a);
  keyTtlMs = 3600_000;

  // ---- signing in ----
  static newVerifier() { return b64url(randomBytes(48)); }
  static newState() { return b64url(randomBytes(24)); }
  static challenge(verifier: string) { return b64url(createHash("sha256").update(verifier).digest()); }

  authorizeUrl(redirectUri: string, state: string, verifier: string): string {
    const q = new URLSearchParams({ client_id: this.clientId, redirect_uri: redirectUri, state, code_challenge: GeoEstateID.challenge(verifier),
      code_challenge_method: "S256" });
    return `${this.geohub}/id/authorize?${q}`;
  }

  private async post<T>(path: string, data: Record<string, string>): Promise<T> {
    const body = new URLSearchParams({ client_id: this.clientId, ...(this.clientSecret ? { client_secret: this.clientSecret } : {}), ...data });
    const r = await this.http(`${this.api}/id/${path}`, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } });
    const p = await r.json().catch(() => ({}));
    if (!r.ok) throw new GeoEstateIDError(p.detail || `Geohub answered ${r.status}`, r.status, p.code || "error");
    return p as T;
  }
  exchange(code: string, redirectUri: string, verifier: string) {
    return this.post<Tokens>("token", { grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier });
  }
  refresh(refreshToken: string) { return this.post<Tokens>("token", { grant_type: "refresh_token", refresh_token: refreshToken }); }
  async signOut(refreshToken: string) { await this.post("revoke", { token: refreshToken }); }

  async apps(accessToken: string): Promise<AppTile[]> {
    const r = await this.http(`${this.api}/id/apps`, { headers: { authorization: `Bearer ${accessToken}` } });
    const p = await r.json().catch(() => ({}));
    if (!r.ok) throw new GeoEstateIDError(p.detail || "Geohub refused", r.status);
    return p as AppTile[];
  }

  // ---- checking an access token ----
  private async keySet(kid: string | undefined) {
    if (!this.keys || !kid || !this.keyIds.has(kid) || Date.now() - this.keysAt > this.keyTtlMs) {
      const r = await this.http(`${this.api}/id/jwks`);
      if (!r.ok) throw new GeoEstateIDError(`Geohub's keys are unavailable (${r.status}).`, 503, "geohub_unavailable");
      const jwks = (await r.json()) as JSONWebKeySet;
      this.keys = createLocalJWKSet(jwks); this.keyIds = new Set(jwks.keys.map((k) => k.kid ?? "")); this.keysAt = Date.now();
    }
    if (kid && !this.keyIds.has(kid)) throw new GeoEstateIDError("The token was signed with a key Geohub does not publish.");
    return this.keys!;
  }

  async verify(accessToken: string): Promise<Claims> {
    let kid: string | undefined;
    try { kid = decodeProtectedHeader(accessToken).kid; } catch { throw new GeoEstateIDError("That is not a token."); }
    const keys = await this.keySet(kid);
    try {
      const { payload } = await jwtVerify(accessToken, keys, { algorithms: ["EdDSA"], audience: this.clientId, issuer: this.geohub });
      if (payload.typ !== "geoestate-id") throw new GeoEstateIDError("That token is not a GeoEstate ID access token.");
      return payload as unknown as Claims;
    } catch (e) {
      if (e instanceof GeoEstateIDError) throw e;
      if (e instanceof joseErrors.JWTExpired) throw new GeoEstateIDError("The sign-in has expired.", 401, "token_expired");
      throw new GeoEstateIDError(`That token is not valid (${(e as Error).message}).`);
    }
  }

  /** Expired licences are read-only, suspended ones closed: the same rule as Geohub's own. */
  static canWrite(c: Claims): boolean { return !!c.product && ["demo", "active", "grace"].includes(c.product.status); }
}
