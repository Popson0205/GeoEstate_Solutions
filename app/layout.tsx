import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GeoEstate LandCheck — Osogbo",
  description: "Spatial intelligence for land, property and development in Osogbo.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
