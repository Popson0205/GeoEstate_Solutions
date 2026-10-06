export type LandCheckResult = {
  lat: number;
  lng: number;
  place: string;
  score: number;
  accessibility: number;
  infrastructure: number;
  development: number;
  environment: number;
  nearestRoad: string;
  nearestSchool: string;
  nearestHospital: string;
  landCover: string;
  elevation: string;
  slope: string;
  slopeDeg?: number | null;
  educationCount?: number | null;
  educationNearby?: { name: string; kind: string; d: number }[];
  source?: string;
};

export function demoLandCheck(lat: number, lng: number): LandCheckResult {
  // Demo scoring only. Replace each value with provider-backed analysis
  // once the OSM / DEM / land-cover adapters are connected.
  const seed = Math.abs(Math.sin(lat * 71.13 + lng * 19.73));
  const accessibility = Math.round(72 + seed * 20);
  const infrastructure = Math.round(68 + seed * 22);
  const development = Math.round(70 + (1 - seed) * 25);
  const environment = Math.round(62 + seed * 25);
  const score = Math.round(
    accessibility * 0.28 +
    infrastructure * 0.24 +
    development * 0.26 +
    environment * 0.22
  );

  return {
    lat, lng,
    place: "Osogbo, Osun State",
    score,
    accessibility,
    infrastructure,
    development,
    environment,
    nearestRoad: `${Math.max(65, Math.round(80 + seed * 260))} m`,
    nearestSchool: `${(0.4 + seed * 0.8).toFixed(1)} km`,
    nearestHospital: `${(1.0 + seed * 1.2).toFixed(1)} km`,
    landCover: seed > 0.52 ? "Built area" : "Mixed built / vegetation",
    elevation: `${Math.round(300 + seed * 65)} m`,
    slope: `${(1.2 + seed * 4.2).toFixed(1)}°`
  };
}
