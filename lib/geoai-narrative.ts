// Turns the numbers from lib/geoai.ts into a briefing note. The model only words what is in the JSON; it computes nothing.
// Env: ANTHROPIC_API_KEY (optional; without it a deterministic template is used). ANTHROPIC_MODEL (default claude-sonnet-5-5).
export type Narrative = { text: string; source: "ai" | "template"; error?: string };

const n = (v: number) => (Math.round(v * 10) / 10).toLocaleString("en-NG");
const plural = (k: number, one: string, many = one + "s") => `${k} ${k === 1 ? one : many}`;

export function templateNarrative(a: any): string {
  const f = a.flood, t = a.terrain, as = a.assets, r = a.roads;
  const tot = as.schools.total + as.health.total + as.markets.total, ex = as.schools.high + as.health.high + as.markets.high;
  const p: string[] = [];
  p.push(`${a.name} covers about ${n(a.areaKm2)} km². In the terrain-based model, ${n(f.exposedPct)}% of the area (${n(f.exposedKm2)} km²) falls in High flood susceptibility zones (low-lying ground close to streams, plus mapped water bodies) and a further ${n(f.moderatePct)}% in Moderate zones. Mean slope is ${t.meanSlopeDeg ?? "n/a"}°, and ${n(t.flatPct)}% of the area is nearly flat (under 2°), where water drains slowly.`);
  if (a.rank) p.push(`On the combined exposure index (area, facilities and roads) it ranks ${a.rank.position} of ${a.rank.of} Osun LGAs, where 1 is the most exposed.`);
  p.push(tot
    ? `Of the ${tot} schools, health facilities and markets in the dataset for this area, ${ex} sit in High zones: ${plural(as.schools.high, "school")}, ${plural(as.health.high, "health facility", "health facilities")} and ${plural(as.markets.high, "market")}. A further ${as.schools.moderate + as.health.moderate + as.markets.moderate} are in Moderate zones.`
    : `No schools, health facilities or markets from the project dataset were found in this area, which may reflect gaps in the data rather than their absence.`);
  p.push(`Of roughly ${r.totalKm} km of mapped roads, ${n(r.exposedKm)} km run through High zones, including ${n(r.majorExposedKm)} km of the ${r.majorKm} km of trunk, primary and secondary roads.`);
  if (a.safeSites?.length) p.push(`${plural(a.safeSites.length, "candidate site")} outside flood-susceptible ground, with gentle slope and road access, ${a.safeSites.length === 1 ? "was" : "were"} identified for further assessment; they are shown on the map.`);
  p.push(`Suggested next steps: (1) verify on the ground the High-zone facilities listed in the report; (2) check drainage on the flood-prone road sections; (3) treat candidate sites as leads only, to be confirmed by survey.`);
  p.push(`This is terrain-based susceptibility from satellite elevation data, not a flood-risk forecast. It does not include rainfall, drainage works, or local flood history, and the facility data is incomplete.`);
  return p.join("\n\n");
}

export async function narrate(a: any, useAi: boolean): Promise<Narrative> {
  const fallback = templateNarrative(a);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!useAi || !key) return { text: fallback, source: "template" };
  const facts = {
    area: a.name, areaKm2: a.areaKm2, flood: a.flood, terrain: a.terrain, assets: a.assets, roads: a.roads, rank: a.rank,
    exposedAssetsHighZone: { count: a.exposedAssets.highCount, examples: a.exposedAssets.high.slice(0, 8).map((x: any) => `${x.name} (${x.type})`) },
    candidateSites: a.safeSites?.length ?? 0,
  };
  const system = "You write short briefing notes for Nigerian state and local government officials from a terrain-based flood susceptibility analysis. " +
    "Use ONLY the figures in the JSON provided. Never invent numbers, place names, causes, past events or engineering specifics. " +
    "Say 'flood susceptibility' (terrain-based); never say 'flood risk', 'will flood' or 'safe to build'. " +
    "Note briefly that the facility dataset is incomplete and that rainfall, drainage works and flood history are not modelled. " +
    "Write 220-300 words in plain English: three short paragraphs, then exactly three bullet points starting with '- ' that are verification or planning checks. No headings, no markdown other than those bullets.";
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: ctl.signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 800, system, messages: [{ role: "user", content: JSON.stringify(facts) }] }),
    });
    const j: any = await r.json().catch(() => null);
    if (!r.ok) return { text: fallback, source: "template", error: `${r.status} ${j?.error?.message || ""}`.trim() };
    const text = (j?.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    return text ? { text, source: "ai" } : { text: fallback, source: "template", error: "empty response" };
  } catch (e) { return { text: fallback, source: "template", error: (e as Error).message }; }
  finally { clearTimeout(t); }
}
