/**
 * Title status from GeoEstate Land Registry (LandCheck Advanced): the registered parcels at the report's point and
 * near it, in the registries that publish a public lookup. Asked service to service with the platform key; what comes
 * back is only what each registry's public lookup shows. Kept in the report exactly as it was when issued.
 */
import { config } from "./config";

export interface RegisteredParcel {
  registry: string; pin: string; status: string; area_sqm: number; land_use: string; locality: string;
  title: { title_no: string; kind: string; starts_on: string | null; ends_on: string | null } | null;
  encumbrances: { kind: string; count: number }[]; dealings_pending: number; holders: { name: string; share: string }[] | null;
  lookup_url?: string; distance_m?: number;
}
export type TitleStatus =
  | { ok: true; checked_at: string; registries_searched: number; at: RegisteredParcel[]; near: RegisteredParcel[]; near_within_m: number }
  | { ok: false; checked_at: string; reason: string };

export const titleConfigured = () => !!(config.landApi() && config.landPlatformKey());

export async function titleStatus(lat: number, lng: number, timeoutMs = 8000): Promise<TitleStatus> {
  const checked_at = new Date().toISOString();
  try {
    const r = await fetch(`${config.landApi()}/platform/title-status?lat=${lat}&lng=${lng}`, {
      headers: { "X-Platform-Key": config.landPlatformKey(), accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store",
    });
    if (!r.ok) {
      console.error("LandCheck: Land Registry title status", r.status, await r.text().catch(() => ""));
      return { ok: false, checked_at, reason: "GeoEstate Land Registry could not be asked at the time of this report." };
    }
    const b = await r.json();
    return { ok: true, checked_at: b.checked_at ?? checked_at, registries_searched: b.registries_searched ?? 0, at: b.at ?? [], near: b.near ?? [],
      near_within_m: b.near_within_m ?? 50 };
  } catch (e) {
    console.error("LandCheck: Land Registry unreachable", e);
    return { ok: false, checked_at, reason: "GeoEstate Land Registry could not be reached at the time of this report." };
  }
}
