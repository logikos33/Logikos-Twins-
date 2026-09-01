import type { MetadataRoute } from "next";

/**
 * PWA mínimo do piloto: instalável no celular, tela cheia, identidade LOGIKOS
 * (grafite + ciano). O ícone SVG cobre os tamanhos; PNGs rasterizados só se um
 * alvo real reclamar.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Logikos Twins",
    short_name: "Twins",
    description: "Mapa 3D do seu espaço a partir de um vídeo do celular",
    start_url: "/new",
    display: "standalone",
    background_color: "#15161c",
    theme_color: "#15161c",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
