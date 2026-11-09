// El tiempo por municipio con datos de MET Norway (Locationforecast 2.0 compact, licencia CC BY 4.0).
// Módulo sin dependencias: lo usan la función de Cloudflare (functions/api/clima.js) y las pruebas.
// Responde con la misma forma que la función del sitio anterior: current, days y periods.

export const ZONA = "America/Monterrey"; // hora de Nuevo León (sin horario de verano)

// Referencia: cabecera municipal, con dos decimales (MET pide no más de cuatro).
export const MUNICIPIOS_CLIMA = {
  garcia: { name: "García", latitude: 25.81, longitude: -100.59 },
  "san-nicolas": { name: "San Nicolás de los Garza", latitude: 25.75, longitude: -100.3 },
  monterrey: { name: "Monterrey", latitude: 25.68, longitude: -100.32 },
  escobedo: { name: "General Escobedo", latitude: 25.8, longitude: -100.32 },
  "san-pedro": { name: "San Pedro Garza García", latitude: 25.66, longitude: -100.4 },
  guadalupe: { name: "Guadalupe", latitude: 25.68, longitude: -100.26 },
};

// Gravedad para elegir el cielo de un día: gana el más severo de sus horas de luz.
const CIELOS = [
  [/thunder/, 9, "Tormenta eléctrica", "⛈"],
  [/snow/, 8, "Nieve", "❄"],
  [/sleet/, 7, "Aguanieve", "🌨"],
  [/^heavyrain/, 6, "Lluvia intensa", "🌧"],
  [/^rain/, 5, "Lluvia prevista", "🌧"],
  [/^lightrain/, 4, "Lluvia ligera", "🌦"],
  [/^fog/, 3, "Niebla", "🌫"],
  [/^cloudy/, 2, "Nublado", "☁"],
  [/^partlycloudy/, 1, "Parcialmente nublado", "⛅"],
  [/^fair/, 1, "Poco nublado", "🌤"],
  [/^clearsky/, 0, "Despejado", "☀"],
];

export function condicion(symbol) {
  if (!symbol) return { label: "Sin dato del cielo", icon: "·", rank: -1 };
  const base = symbol.replace(/_(day|night|polartwilight)$/, "");
  const noche = symbol.endsWith("_night");
  for (const [rx, rank, label, icon] of CIELOS) {
    if (rx.test(base)) {
      const i = noche && rank === 0 ? "🌙" : icon;
      return { label, icon: i, rank };
    }
  }
  return { label: "Sin dato del cielo", icon: "·", rank: -1 };
}

// Salida y puesta del sol (algoritmo simplificado de la NOAA) para saber si una hora es de día o de noche.
const rad = Math.PI / 180;
export function sol(lat, lon, fechaIso) {
  const d = new Date(fechaIso + "T12:00:00Z");
  const n = Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
  const g = (2 * Math.PI / 365) * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = Math.acos(Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl)) / rad;
  const base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return { salida: base + (720 - 4 * (lon + ha) - eq) * 60000, puesta: base + (720 - 4 * (lon - ha) - eq) * 60000 };
}

// Lluvia en palabras (para quien no piensa en milímetros). Se mide por hora: un bloque de 6 h se divide entre 6.
export const LLUVIAS = ["Sin lluvia", "Chispea", "Lluvia ligera", "Lluvia", "Lluvia fuerte", "Tormenta eléctrica"];
export const LLUVIAS_DIA = ["Sin lluvia", "Chispeo ocasional", "Lluvia ligera", "Lluvia", "Lluvia fuerte", "Tormentas"];
export function nivelLluvia(mm, horas, symbol = "") {
  if (/thunder/.test(symbol)) return 5;
  const porHora = mm / horas;
  if (porHora >= 4) return 4;
  if (porHora >= 1) return 3;
  if (porHora >= 0.3) return 2;
  if (porHora > 0 || /rain|sleet|snow/.test(symbol)) return 1;
  return 0;
}

const fechaLocal = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });
const horaLocal = new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "2-digit", hourCycle: "h23" });

export const diaLocal = (iso) => fechaLocal.format(new Date(iso));
const hora = (iso) => Number(horaLocal.format(new Date(iso)));
const r1 = (x) => Math.round(x * 10) / 10;
const sinCondicion = ({ rank, ...resto }) => resto;

/** Convierte la respuesta de MET Norway al formato del sitio. `ahora` es un Date. */
export function transformar(met, municipio, ahora = new Date(), dias = 7) {
  const lugar = MUNICIPIOS_CLIMA[municipio];
  const serie = met?.properties?.timeseries;
  if (!lugar || !Array.isArray(serie) || serie.length === 0) throw new Error("respuesta de MET sin pronóstico");

  // Cada entrada vale desde su hora hasta la siguiente (1 h al principio, 6 h después).
  const periodos = [];
  for (let i = 0; i < serie.length; i++) {
    const e = serie[i];
    const det = e.data?.instant?.details ?? {};
    if (typeof det.air_temperature !== "number") continue;
    const siguiente = serie[i + 1] ? new Date(serie[i + 1].time) : null;
    const horas = siguiente ? Math.round((siguiente - new Date(e.time)) / 3600000) : 6;
    const bloque = horas <= 1 ? e.data.next_1_hours : e.data.next_6_hours ?? e.data.next_1_hours;
    if (!bloque) continue; // la última entrada de MET no trae intervalo
    const symbol = bloque.summary?.symbol_code ?? "";
    const ph = horas <= 1 ? 1 : 6;
    const mm = r1(bloque.details?.precipitation_amount ?? 0);
    // El cielo se juzga a la mitad del intervalo: en un bloque de 6 h, a las 3 h.
    const medio = new Date(e.time).getTime() + (ph * 3600000) / 2;
    const s0 = sol(lugar.latitude, lugar.longitude, diaLocal(new Date(medio).toISOString()));
    const esDia = medio >= s0.salida && medio < s0.puesta;
    const h = hora(new Date(medio).toISOString());
    const nivel = nivelLluvia(mm, ph, symbol);
    periodos.push({
      time: e.time,
      temperature: r1(det.air_temperature),
      wind: r1((det.wind_speed ?? 0) * 3.6), // m/s → km/h
      condition: condicion(symbol),
      periodHours: ph,
      precipitation: mm,
      sky: symbol.replace(/_(day|night|polartwilight)$/, ""),
      isDay: esDia,
      phase: esDia ? (h < 12 ? "mañana" : "tarde") : (medio < s0.salida ? "madrugada" : "noche"),
      rain: { level: nivel, label: LLUVIAS[nivel] },
    });
  }
  // Desde el intervalo en curso: lo que ya pasó no se muestra.
  const vigentes = periodos.filter((p) => new Date(p.time).getTime() + p.periodHours * 3600000 > ahora.getTime());
  if (vigentes.length === 0) throw new Error("el pronóstico de MET ya venció");

  const hoy = diaLocal(ahora.toISOString());
  const porDia = new Map();
  for (const p of vigentes) {
    const d = diaLocal(p.time);
    if (!porDia.has(d)) porDia.set(d, []);
    porDia.get(d).push(p);
  }
  const days = [...porDia.entries()].slice(0, dias).map(([date, ps], i, todos) => {
    const lluvia = r1(ps.reduce((s, p) => s + p.precipitation, 0));
    // Si se prevé lluvia en el día, manda la hora más severa; si no, la más severa con luz de día.
    const luz = ps.filter((p) => hora(p.time) >= 6 && hora(p.time) < 20);
    const base = lluvia >= 0.5 || luz.length === 0 ? ps : luz;
    const cielo = base.reduce((a, b) => (b.condition.rank > a.condition.rank ? b : a)).condition;
    const ultimo = ps[ps.length - 1];
    const cubreHasta = new Date(ultimo.time).getTime() + ultimo.periodHours * 3600000;
    const finDelDia = diaLocal(new Date(cubreHasta - 1).toISOString()) === date && i === todos.length - 1;
    const nivel = Math.max(...ps.map((p) => p.rain.level));
    const s1 = sol(lugar.latitude, lugar.longitude, date);
    return {
      date,
      sunrise: new Date(s1.salida).toISOString(),
      sunset: new Date(s1.puesta).toISOString(),
      rain: { level: nivel, label: LLUVIAS_DIA[nivel] },
      sky: [...ps].sort((a, b) => b.condition.rank - a.condition.rank)[0].sky,
      minimum: Math.min(...ps.map((p) => p.temperature)),
      maximum: Math.max(...ps.map((p) => p.temperature)),
      precipitation: lluvia,
      partial: date === hoy || finDelDia,
      condition: sinCondicion(cielo),
    };
  });
  const primero = vigentes[0];
  return {
    municipality: municipio,
    name: lugar.name,
    latitude: lugar.latitude,
    longitude: lugar.longitude,
    updatedAt: met.properties.meta?.updated_at ?? null,
    computedAt: ahora.toISOString(),
    current: { temperature: primero.temperature, time: primero.time, wind: primero.wind,
               condition: sinCondicion(primero.condition) },
    days,
    periods: vigentes.map((p) => ({ ...p, condition: sinCondicion(p.condition) })),
  };
}

export const urlMet = (m) =>
  `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${MUNICIPIOS_CLIMA[m].latitude}&lon=${MUNICIPIOS_CLIMA[m].longitude}`;
