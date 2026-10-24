import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NeoPapyrus",
    short_name: "NeoPapyrus",
    description: "Ask research papers a question and get answers that cite the exact passages behind them.",
    start_url: "/",
    display: "standalone",
    background_color: "#F3F3F5",
    theme_color: "#4F46C8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
