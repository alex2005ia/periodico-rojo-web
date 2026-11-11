// Texto completo de un comunicado, para redactar la nota a partir de él.
// Las funciones "de*" son puras (respuesta del portal → texto); textoDelComunicado decide qué pedir a cada portal.
import { textoPlano } from "../avisos/lectores.js";

/** HTML → texto con un párrafo por línea. */
export function parrafos(html) {
  const conSaltos = String(html ?? "")
    .replace(/<(script|style|svg|figure|figcaption)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n");
  return conSaltos
    .split("\n")
    .map((l) => textoPlano(l))
    .filter((l) => l.length > 1)
    .join("\n\n");
}

const entre = (html, inicio, fin = "</article>") => {
  const i = html.search(inicio);
  if (i < 0) return null;
  const j = html.indexOf(fin, i);
  return html.slice(i, j < 0 ? undefined : j);
};

export const deMonterrey = (html) => parrafos(entre(html, /<article class="bp-body"/));
export const deGuadalupe = (html) => parrafos(entre(html, /<article class="[^"]*blog-content/));

/** Escobedo publica varias notas en la página del día: se toma la que lleva la foto del aviso. */
export function deEscobedo(html, clave) {
  const numero = clave.split("#")[1];
  const bloques = html.split('<div class="entry event col-12">').slice(1);
  const bloque = bloques.find((b) => numero && b.includes(numero)) ?? (bloques.length === 1 ? bloques[0] : null);
  return bloque ? parrafos(entre(bloque, /<div class="entry-content">/, "</div>")) : null;
}

/** WordPress: el contenido viene en content.rendered. */
export const deWordPress = (json) => parrafos(JSON.parse(json)[0]?.content?.rendered);

const slugDe = (url) => new URL(url).pathname.split("/").filter(Boolean).pop();

/** Devuelve el texto del comunicado, o null si el portal no lo ofrece. */
export async function textoDelComunicado(aviso, descargar) {
  switch (aviso.municipio) {
    case "monterrey": return deMonterrey(await descargar(aviso.url));
    case "guadalupe": return deGuadalupe(await descargar(aviso.url));
    case "escobedo": return deEscobedo(await descargar(aviso.url), aviso.clave);
    case "garcia": return deWordPress(await descargar(`https://garcia.gob.mx/wp-json/wp/v2/posts?slug=${slugDe(aviso.url)}`));
    case "san-pedro": return deWordPress(await descargar(`https://blog.sanpedro.gob.mx/wp-json/wp/v2/news?slug=${slugDe(aviso.url)}`));
    default: return null; // San Nicolás: no se ha ubicado un servicio con el texto completo
  }
}
