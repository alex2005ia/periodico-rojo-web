// Agenda de eventos: cálculos de fechas y archivo de calendario (.ics).
// JavaScript simple (sin Astro) para usarlo en la compilación, en el navegador y en las pruebas.
// Las fechas de los eventos son días sin hora (AAAA-MM-DD) en la hora de Nuevo León.

const ZONA = "America/Monterrey";
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Fecha de hoy (AAAA-MM-DD) en Nuevo León. */
export function hoyEnMonterrey(instante = new Date()) {
  // en-CA escribe las fechas como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(instante);
}

/** Suma días a una fecha AAAA-MM-DD sin pasar por la hora local del equipo. */
export function sumarDias(iso, dias) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Último día del evento: `fin` si existe; si no, el mismo día de inicio. */
export const ultimoDia = (evento) => evento.fin ?? evento.inicio;

/**
 * Cuándo ocurre un evento respecto a `hoy`:
 * "pasado", "hoy" (empieza hoy), "en-curso" (empezó antes y sigue), "manana" o "proximo".
 */
export function estadoEvento(evento, hoy) {
  const fin = ultimoDia(evento);
  if (fin < hoy) return "pasado";
  if (evento.inicio === hoy) return "hoy";
  if (evento.inicio < hoy) return "en-curso";
  if (evento.inicio === sumarDias(hoy, 1)) return "manana";
  return "proximo";
}

export const ETIQUETA_ESTADO = { hoy: "Hoy", "en-curso": "En curso", manana: "Mañana", proximo: "", pasado: "Ya pasó" };

/** Rango corto para la columna de fecha: "15 nov", "1–2 nov", "30 oct – 2 nov", "30 dic 2026 – 2 ene 2027". */
export function rangoCorto(inicio, fin = inicio) {
  const [a1, m1, d1] = inicio.split("-").map(Number);
  const [a2, m2, d2] = fin.split("-").map(Number);
  const mes = (m) => MESES_CORTOS[m - 1];
  if (inicio === fin) return `${d1} ${mes(m1)}`;
  if (a1 !== a2) return `${d1} ${mes(m1)} ${a1} – ${d2} ${mes(m2)} ${a2}`;
  if (m1 !== m2) return `${d1} ${mes(m1)} – ${d2} ${mes(m2)}`;
  return `${d1}–${d2} ${mes(m1)}`;
}

/** Orden de la agenda: primero el que empieza antes; a igual inicio, el que termina antes; luego por dirección. */
export function compararEventos(a, b) {
  return a.inicio.localeCompare(b.inicio) || ultimoDia(a).localeCompare(ultimoDia(b)) || a.id.localeCompare(b.id);
}

// ---------- Archivo de calendario (RFC 5545) ----------

// Texto de una propiedad: se escapan la diagonal invertida, el punto y coma, la coma y los saltos de línea.
function escaparTexto(texto) {
  return String(texto).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Las líneas de más de 75 bytes se doblan: se cortan y la continuación empieza con un espacio.
// Se cuenta en bytes UTF-8 y nunca se parte una letra acentuada.
function doblarLinea(linea) {
  const partes = [];
  let actual = "";
  let bytes = 0;
  for (const caracter of linea) {
    const n = new TextEncoder().encode(caracter).length;
    const limite = partes.length === 0 ? 75 : 74; // la continuación ya ocupa un byte con el espacio
    if (bytes + n > limite) {
      partes.push(actual);
      actual = "";
      bytes = 0;
    }
    actual += caracter;
    bytes += n;
  }
  partes.push(actual);
  return partes.join("\r\n ");
}

const fechaIcs = (iso) => iso.replaceAll("-", "");
const instanteIcs = (fecha) => fecha.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * Archivo .ics de un evento de día completo (sin hora: las horas van en la descripción, como las da el comunicado).
 * `marca` es el instante que se declara como creación (DTSTAMP); se usa la publicación de la nota para que
 * el archivo sea siempre igual al compilar.
 */
export function archivoIcs({ uid, titulo, inicio, fin, cuando, lugar, fuente, url, marca }) {
  const descripcion = [
    `Cuándo: ${cuando}`,
    lugar ? `Dónde: ${lugar}` : null,
    `Confirma en la fuente oficial antes de asistir: ${fuente}`,
    `Nota de Periódico Rojo: ${url}`,
  ].filter(Boolean).join("\n");

  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Periodico Rojo//Agenda//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${instanteIcs(marca)}`,
    `DTSTART;VALUE=DATE:${fechaIcs(inicio)}`,
    // En eventos de día completo el final es exclusivo: el día siguiente al último.
    `DTEND;VALUE=DATE:${fechaIcs(sumarDias(fin ?? inicio, 1))}`,
    `SUMMARY:${escaparTexto(titulo)}`,
    lugar ? `LOCATION:${escaparTexto(lugar)}` : null,
    `DESCRIPTION:${escaparTexto(descripcion)}`,
    `URL:${url}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return lineas.map(doblarLinea).join("\r\n") + "\r\n";
}
