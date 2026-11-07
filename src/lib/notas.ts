import { getCollection, type CollectionEntry } from "astro:content";

export type Nota = CollectionEntry<"articulos">;

// Más recientes primero: por publicación, luego por fecha del comunicado y, al final, por dirección
// para que el orden sea siempre el mismo.
export function ordenar(notas: Nota[]): Nota[] {
  return [...notas].sort(
    (a, b) =>
      b.data.publicado.getTime() - a.data.publicado.getTime() ||
      b.data.fecha_original.localeCompare(a.data.fecha_original) ||
      a.id.localeCompare(b.id),
  );
}

export async function notasPublicadas(): Promise<Nota[]> {
  return ordenar(await getCollection("articulos", ({ data }) => !data.borrador));
}
