import type { APIRoute, GetStaticPaths } from "astro";
import { eventosPublicados, type Evento } from "../../lib/eventos";
import { archivoIcs } from "../../lib/agenda.js";

// Un archivo de calendario por evento: /agenda/<dirección-de-la-nota>.ics
export const getStaticPaths = (async () => {
  return (await eventosPublicados()).map((evento) => ({ params: { slug: evento.id }, props: { evento } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props, site }) => {
  const { evento } = props as { evento: Evento };
  const { data } = evento.nota;
  const url = new URL(`/articles/${evento.id}`, site).href;
  const cuerpo = archivoIcs({
    uid: `${evento.id}@${new URL(site!).host}`,
    titulo: data.titulo,
    inicio: evento.inicio,
    fin: evento.fin,
    cuando: data.evento!.fecha,
    lugar: data.evento!.lugar,
    fuente: data.fuente.url,
    url,
    marca: data.publicado,
  });
  return new Response(cuerpo, { headers: { "Content-Type": "text/calendar; charset=utf-8" } });
};
