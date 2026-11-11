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
  sin_foto?: string;      // menores · retiro · portal · antigua · no-disponible
  oculto?: boolean;
  capturado: string;
};

// El sitio se vuelve a compilar con cada captura, así que "hoy" es el día de la compilación.
export const DIAS_EN_SITIO = 60;

const archivos = import.meta.glob<Aviso[]>("../data/avisos/*.json", { eager: true, import: "default" });

export function avisosRecientes(municipio?: string, hoy = hoyEnMonterrey()): Aviso[] {
  const desde = sumarDias(hoy, -DIAS_EN_SITIO);
  return Object.values(archivos)
    .flat()
    .filter((a) => !a.oculto && a.fecha >= desde && (!municipio || a.municipio === municipio))
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
