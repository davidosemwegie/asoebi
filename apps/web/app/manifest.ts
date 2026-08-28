import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Aso Circle",
    short_name: "Aso Circle",
    description: "Plan, share, and coordinate event looks with Aso Circle.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F5F0E8",
    theme_color: "#321727",
    categories: ["lifestyle", "shopping", "productivity"],
    icons: [
      {
        src: "/aso-circle-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/aso-circle-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
