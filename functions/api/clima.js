// Función de Cloudflare Pages: GET /api/clima?municipio=monterrey
// Pide el pronóstico a MET Norway y lo guarda en la caché de Cloudflare para no repetir la consulta
// (MET pide identificarse, respetar Expires y no consultar de más). Plan gratuito: 100 000 solicitudes al día.
import { MUNICIPIOS_CLIMA, transformar, urlMet } from "../../src/lib/clima-met.js";

const AGENTE = "PeriodicoRojo/1.0 (+https://periodico-rojo-web.pages.dev/about)";
const json = (cuerpo, status = 200, segundos = 0) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": segundos ? `public, max-age=${segundos}` : "no-store",
    },
  });

export async function onRequestGet({ request, waitUntil }) {
  const municipio = new URL(request.url).searchParams.get("municipio") ?? "";
  if (!Object.hasOwn(MUNICIPIOS_CLIMA, municipio)) {
    return json({ error: "Selecciona un municipio de la cobertura." }, 400);
  }
  const fuente = urlMet(municipio);
  const cache = globalThis.caches?.default;
  const llave = new Request(fuente);
  let respuesta = cache ? await cache.match(llave) : undefined;
  if (!respuesta) {
    try {
      respuesta = await fetch(fuente, { headers: { "user-agent": AGENTE, accept: "application/json" } });
    } catch {
      return json({ error: "No se pudo consultar el pronóstico. Intenta más tarde." }, 502);
    }
    if (!respuesta.ok) return json({ error: "La fuente del pronóstico no respondió. Intenta más tarde." }, 502);
    // Se guarda hasta su Expires (mínimo 10 minutos, máximo 1 hora).
    const expira = Date.parse(respuesta.headers.get("expires") ?? "") || Date.now();
    const segundos = Math.min(3600, Math.max(600, Math.round((expira - Date.now()) / 1000)));
    const copia = new Response(respuesta.clone().body, respuesta);
    copia.headers.set("cache-control", `public, max-age=${segundos}`);
    if (cache) waitUntil(cache.put(llave, copia));
  }
  try {
    return json(transformar(await respuesta.json(), municipio), 200, 300);
  } catch {
    return json({ error: "El pronóstico llegó incompleto. Intenta más tarde." }, 502);
  }
}
