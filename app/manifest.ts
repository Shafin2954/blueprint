import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const base = process.env.BASE_PATH?.replace(/\/$/, "") ?? "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Blueprint — a thinking board",
    short_name: "Blueprint",
    description:
      "Collect evidence, say how sure you are, link it up, and let the board point out where your reasoning doesn't hold.",
    id: `${base}/`,
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    orientation: "any",
    background_color: "#0b335f",
    theme_color: "#0b335f",
    categories: ["productivity", "education"],
    icons: [
      { src: `${base}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${base}/icons/icon-512.png`, sizes: "512x512", type: "image/png" },
      { src: `${base}/icons/maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
