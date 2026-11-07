// Fechas en español de México y en la hora de Nuevo León.
// Una fecha sin hora (AAAA-MM-DD) se muestra tal cual: no se convierte a medianoche UTC,
// porque eso la correría al día anterior en México.

const ZONA = "America/Monterrey";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function fechaSinHora(iso: string): string {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

function partes(instante: Date) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA, year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(instante);
  const v = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return {
    anio: Number(v("year")), mes: Number(v("month")), dia: Number(v("day")),
    hora: v("hour"), minuto: v("minute"), periodo: v("dayPeriod").toLowerCase(),
  };
}

export function fechaHora(instante: Date): string {
  const p = partes(instante);
  const periodo = p.periodo === "am" ? "a.m." : "p.m.";
  return `${p.dia} de ${MESES[p.mes - 1]} de ${p.anio} a las ${p.hora}:${p.minuto} ${periodo}`;
}

export function soloFecha(instante: Date): string {
  const p = partes(instante);
  return `${p.dia} de ${MESES[p.mes - 1]} de ${p.anio}`;
}
