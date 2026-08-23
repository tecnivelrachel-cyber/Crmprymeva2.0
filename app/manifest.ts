import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TecNivel CRM",
    short_name: "TecNivel",
    description: "Gestão comercial e atendimento da TecNível",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#17304F",
    background_color: "#F7F9FC",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
