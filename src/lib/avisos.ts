// Avisos municipales: comunicados oficiales capturados automáticamente (scripts/avisos/capturar.js).
// Se muestran tal como los publicó cada municipio: título, fecha, foto con crédito y enlace al original.
import { hoyEnMonterrey, sumarDias } from "./agenda.js";

export type Aviso = {
  id: string;
  municipio: string;
  titulo: string;
  fecha: string;          // AAAA-MM-DD, la del comunicado
  url: string;            // comunicado original
  foto: string | null;    // /avisos/<id>.webp
  foto_ancho?: number;
  foto_alto?: number;
  foto_original: string | null;
  sin_foto?: string;      // menores · menores-ia · retiro · portal · antigua · no-disponible
  nota?: { slug?: string; estado: string; motivo?: string; motivos?: string[] }; // opción B
  oculto?: boolean;
  capturado: string;
};

// El sitio se vuelve a compilar con cada captura, así que "hoy" es el día de la compilación.
export const DIAS_EN_SITIO = 60;

const archivos = import.meta.glob<Aviso[]>("../data/avisos/*.json", { eager: true, import: "default" });

/** `sinNota`: ids de notas publicadas; los comunicados que ya tienen nota no se repiten (portada y municipios). */
export function avisosRecientes(municipio?: string, { sinNota }: { sinNota?: Set<string> } = {}, hoy = hoyEnMonterrey()): Aviso[] {
  const desde = sumarDias(hoy, -DIAS_EN_SITIO);
  return Object.values(archivos)
    .flat()
    .filter((a) => !a.oculto && a.fecha >= desde && (!municipio || a.municipio === municipio))
    .filter((a) => !sinNota || !(a.nota?.slug && sinNota.has(a.nota.slug)))
    .sort((x, y) => y.fecha.localeCompare(x.fecha) || y.capturado.localeCompare(x.capturado));
}

export const EMISORES: Record<string, string> = {
  monterrey: "Gobierno de Monterrey",
  guadalupe: "Gobierno de Guadalupe",
  escobedo: "Gobierno de General Escobedo",
  garcia: "Gobierno de García",
  "san-pedro": "Gobierno de San Pedro Garza García",
  "san-nicolas": "Gobierno de San Nicolás de los Garza",
};
