import { notasPublicadas, type Nota } from "./notas";
import { compararEventos, hoyEnMonterrey, ultimoDia } from "./agenda.js";

// Un evento de la agenda es una nota publicada que trae el campo "evento".
export type Evento = {
  id: string;            // dirección de la nota
  inicio: string;        // AAAA-MM-DD
  fin?: string;
  nota: Nota;
};

export async function eventosPublicados(municipio?: string): Promise<Evento[]> {
  const notas = await notasPublicadas();
  return notas
    .filter((n) => n.data.evento && (!municipio || n.data.municipio === municipio))
    .map((n) => ({ id: n.id, inicio: n.data.evento!.inicio, fin: n.data.evento!.fin, nota: n }))
    .sort(compararEventos);
}

// Al compilar se separan los que ya pasaron. El sitio se compila sólo al publicar, así que en el
// navegador se vuelve a revisar con la fecha del día (un evento próximo puede haber pasado desde entonces).
export function separar(eventos: Evento[], hoy = hoyEnMonterrey()) {
  const proximos = eventos.filter((e) => ultimoDia(e) >= hoy);
  // Los pasados, del más reciente al más antiguo.
  const pasados = eventos.filter((e) => ultimoDia(e) < hoy).reverse();
  return { proximos, pasados };
}
