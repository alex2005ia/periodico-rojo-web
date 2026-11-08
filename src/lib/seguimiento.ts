// Sección de proyectos y catálogo de fuentes (rescatados del sitio publicado el 07-11-2026).
import { getCollection, getEntry, type CollectionEntry } from "astro:content";

export const TEMAS = ["Obras y servicios", "Planeación urbana", "Energía", "Industria", "Logística"] as const;

// Qué tanto acredita el último hito. Una declaración no es una confirmación.
export const ESTADOS_EXPEDIENTE = ["Anuncio documentado", "Avance reportado", "Concluido según la fuente",
  "Suspendido según la fuente", "Sin novedades"] as const;

export const BASES = ["Declaración oficial", "Documento oficial", "Verificación propia"] as const;

export const TEXTOS = {
  proyectos_intro: "Consulta qué se ha informado, revisa la evidencia y encuentra lo que todavía falta por confirmar.",
  proyectos_aviso: "Actualización manual. Cada ficha muestra el último hito documentado, no una confirmación del estado actual del proyecto.",
  guardados: "Los guardados permanecen en este navegador y pueden perderse si borras sus datos. No se sincronizan entre dispositivos ni activan notificaciones.",
  expediente_aviso: "La revisión comprueba lo que dice el documento. Una declaración oficial no acredita por sí sola un permiso, financiamiento o conclusión de obra. El estado puede haber cambiado después de la última fuente registrada.",
  pendiente_aviso: "No disponer de un dato no significa que sea cero, que el requisito no aplique o que no exista riesgo.",
  fuentes_intro: "Consulta quién publica la información, qué hemos comprobado y qué condiciones siguen pendientes.",
  fuentes_aviso: "Este catálogo corresponde a la sección de proyectos. El cotejo de un comunicado no certifica todo el portal. La incorporación de documentos es manual y no implica una vigilancia continua de las fuentes.",
};

export type Proyecto = CollectionEntry<"proyectos">;
export type Fuente = CollectionEntry<"fuentes">;

// Más reciente primero; a igual fecha, por dirección para que el orden sea estable.
export async function proyectosPublicados(): Promise<Proyecto[]> {
  const lista = await getCollection("proyectos", ({ data }) => !data.borrador);
  return lista.sort((a, b) => b.data.fecha_fuente.localeCompare(a.data.fecha_fuente) || a.id.localeCompare(b.id));
}

export async function fuentesDe(p: Proyecto): Promise<Fuente[]> {
  const salida: Fuente[] = [];
  for (const ref of p.data.fuentes) {
    const f = await getEntry(ref);
    if (!f) throw new Error(`El proyecto ${p.id} cita la fuente "${ref.id}", que no existe en src/content/fuentes.`);
    salida.push(f);
  }
  return salida;
}

export async function notaDe(p: Proyecto) {
  if (!p.data.nota_relacionada) return undefined;
  const n = await getEntry(p.data.nota_relacionada);
  if (!n) throw new Error(`El proyecto ${p.id} enlaza la nota "${p.data.nota_relacionada.id}", que no existe.`);
  return n.data.borrador ? undefined : n;
}

export async function proyectosDeFuente(id: string): Promise<Proyecto[]> {
  return (await proyectosPublicados()).filter((p) => p.data.fuentes.some((r) => r.id === id));
}

export async function proyectoDeNota(idNota: string): Promise<Proyecto | undefined> {
  return (await proyectosPublicados()).find((p) => p.data.nota_relacionada?.id === idNota);
}

// Revisa referencias cruzadas al compilar: si algo no cuadra, la compilación se detiene.
export async function verificarReferencias(): Promise<void> {
  for (const p of await proyectosPublicados()) {
    await fuentesDe(p);
    await notaDe(p);
  }
}
