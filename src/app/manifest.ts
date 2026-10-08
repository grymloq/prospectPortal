import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Swedish 40k National Team",
    short_name: "Team Sweden",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#102749",
    icons: [{ src: "/icon.png", type: "image/png", sizes: "150x150" }],
  };
}
