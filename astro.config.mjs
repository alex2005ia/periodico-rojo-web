// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Dirección pública del sitio. Se usa en el RSS, el sitemap y los enlaces para compartir.
// Al cambiar de dominio, se define SITE_URL en Cloudflare Pages sin tocar el código.
const SITE = process.env.SITE_URL ?? "https://periodico-rojo-web.vercel.app";

export default defineConfig({
  site: SITE,
  trailingSlash: "ignore",
  integrations: [sitemap()],
  image: {
    // Sólo se procesan imágenes locales (src/assets); no se descargan imágenes de terceros al compilar.
    domains: [],
  },
});
