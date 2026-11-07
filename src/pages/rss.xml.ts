import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { notasPublicadas } from "../lib/notas";
import { nombreCategoria, nombreMunicipio, SITIO } from "../lib/sitio";

export async function GET(context: APIContext) {
  const notas = await notasPublicadas();
  return rss({
    title: "Periódico Rojo",
    description: SITIO.descripcion,
    site: context.site!,
    customData: "<language>es-mx</language>",
    items: notas.map((n) => ({
      title: n.data.titulo,
      description: n.data.descripcion,
      pubDate: n.data.publicado,
      link: `/articles/${n.id}/`,
      categories: [nombreMunicipio(n.data.municipio), nombreCategoria(n.data.categoria)],
    })),
  });
}
