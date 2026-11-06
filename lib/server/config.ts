/** LandCheck's settings, from the environment. */
const env = (k: string, d = "") => (process.env[k] ?? d).trim();

export const config = {
  appUrl: () => env("APP_URL", "http://localhost:3000").replace(/\/$/, ""),
  geohubUrl: () => env("GEOHUB_URL", "http://localhost:5173").replace(/\/$/, ""),
  geohubApi: () => env("GEOHUB_API", "http://localhost:8000").replace(/\/$/, ""),
  idClient: () => env("ID_CLIENT", "check"),
  idSecret: () => env("ID_SECRET"),
  databaseUrl: () => env("DATABASE_URL"),
  cookieSecure: () => env("APP_URL", "").startsWith("https://"),
};
