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
    periodos.push({
      time: e.time,
      temperature: r1(det.air_temperature),
      wind: r1((det.wind_speed ?? 0) * 3.6), // m/s → km/h
      condition: condicion(bloque.summary?.symbol_code),
      periodHours: horas <= 1 ? 1 : 6,
      precipitation: r1(bloque.details?.precipitation_amount ?? 0),
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
    return {
      date,
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
