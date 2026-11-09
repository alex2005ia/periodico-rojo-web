// Pruebas del pronóstico (node --test). Usan una respuesta sintética con la forma de MET Norway.
import { test } from "node:test";
import assert from "node:assert/strict";
import { condicion, diaLocal, nivelLluvia, sol, transformar } from "../src/lib/clima-met.js";
import { onRequestGet } from "../functions/api/clima.js";

// 48 entradas por hora y luego cada 6 horas, como MET: desde 2026-11-08 18:00 UTC (12:00 en Monterrey).
function metSintetico() {
  const inicio = Date.parse("2026-11-08T18:00:00Z");
  const serie = [];
  let t = inicio;
  for (let i = 0; i < 60; i++) {
    const hora = i < 48;
    const iso = new Date(t).toISOString().replace(".000", "");
    const entrada = { time: iso, data: { instant: { details: { air_temperature: 15 + (i % 10), wind_speed: 3 } } } };
    const simbolo = i === 5 ? "rain" : i === 30 ? "heavyrainshowers_day" : "cloudy";
    if (hora) entrada.data.next_1_hours = { summary: { symbol_code: simbolo }, details: { precipitation_amount: i === 5 ? 1.2 : 0 } };
    entrada.data.next_6_hours = { summary: { symbol_code: "partlycloudy_day" }, details: { precipitation_amount: hora ? 0 : 0.5 } };
    serie.push(entrada);
    t += (hora ? 1 : 6) * 3600000;
  }
  delete serie[serie.length - 1].data.next_6_hours; // la última entrada de MET no trae intervalo
  return { properties: { meta: { updated_at: "2026-11-08T17:30:00Z" }, timeseries: serie } };
}

const AHORA = new Date("2026-11-08T18:30:00Z"); // 12:30 en Monterrey

test("condición en español con ícono", () => {
  assert.deepEqual(condicion("rain"), { label: "Lluvia prevista", icon: "🌧", rank: 5 });
  assert.equal(condicion("clearsky_night").icon, "🌙");
  assert.equal(condicion("lightrainandthunder").label, "Tormenta eléctrica");
  assert.equal(condicion(undefined).label, "Sin dato del cielo");
});

test("día local en hora de Nuevo León", () => {
  assert.equal(diaLocal("2026-11-09T05:00:00Z"), "2026-11-08"); // 23:00 del día 8
  assert.equal(diaLocal("2026-11-09T06:00:00Z"), "2026-11-09");
});

test("forma igual a la del sitio anterior", () => {
  const r = transformar(metSintetico(), "monterrey", AHORA);
  assert.deepEqual(Object.keys(r), ["municipality", "name", "latitude", "longitude", "updatedAt", "computedAt",
    "current", "days", "periods"]);
  assert.equal(r.name, "Monterrey");
  assert.equal(r.current.time, "2026-11-08T18:00:00Z"); // el intervalo en curso
  assert.equal(r.current.wind, 10.8); // 3 m/s
  assert.ok(r.days.length <= 7 && r.days.length >= 5);
  assert.equal(r.days[0].date, "2026-11-08");
  assert.equal(r.days[0].partial, true);
  assert.equal(r.days[0].precipitation, 1.2);
  assert.equal(r.days[0].condition.label, "Lluvia prevista"); // hay lluvia: manda la hora más severa
  assert.ok(!("rank" in r.days[0].condition) && !("rank" in r.current.condition));
  assert.deepEqual([...new Set(r.periods.map((p) => p.periodHours))], [1, 6]);
  const seis = r.days.find((d) => d.date === "2026-11-11");
  assert.equal(seis.precipitation, 2); // cuatro bloques de 6 h con 0.5 mm
});

test("lo que ya pasó no se muestra; lo vencido es error", () => {
  const r = transformar(metSintetico(), "garcia", new Date("2026-11-08T20:10:00Z"));
  assert.equal(r.periods[0].time, "2026-11-08T20:00:00Z");
  assert.throws(() => transformar(metSintetico(), "garcia", new Date("2026-12-31T00:00:00Z")));
  assert.throws(() => transformar({}, "garcia", AHORA));
});

test("la función valida el municipio y se identifica ante MET", async () => {
  const original = globalThis.fetch;
  let pedido;
  globalThis.fetch = async (url, opciones) => {
    pedido = { url: String(url), agente: opciones.headers["user-agent"] };
    return new Response(JSON.stringify(metSintetico()), { status: 200,
      headers: { expires: new Date(Date.now() + 1800000).toUTCString() } });
  };
  try {
    const mala = await onRequestGet({ request: new Request("https://x/api/clima?municipio=xx"), waitUntil() {} });
    assert.equal(mala.status, 400);
    assert.equal((await mala.json()).error, "Selecciona un municipio de la cobertura.");
    const buena = await onRequestGet({ request: new Request("https://x/api/clima?municipio=san-pedro"), waitUntil() {} });
    assert.equal(buena.status, 200);
    assert.equal(buena.headers.get("cache-control"), "public, max-age=300");
    assert.match(pedido.url, /lat=25\.66&lon=-100\.4$/);
    assert.match(pedido.agente, /PeriodicoRojo/);
    globalThis.fetch = async () => new Response("", { status: 503 });
    const caida = await onRequestGet({ request: new Request("https://x/api/clima?municipio=monterrey"), waitUntil() {} });
    assert.equal(caida.status, 502);
  } finally {
    globalThis.fetch = original;
  }
});

test("salida y puesta del sol en Monterrey (8 de noviembre: ~6:55 a.m. y ~6:00 p.m.)", () => {
  const { salida, puesta } = sol(25.68, -100.32, "2026-11-08");
  const local = (ms) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Monterrey", hour: "2-digit", minute: "2-digit" }).format(ms);
  assert.match(local(salida), /^06:(4\d|5\d)$|^07:0\d$/);
  assert.match(local(puesta), /^17:(4\d|5\d)$|^18:[01]\d$/);
});

test("lluvia en palabras", () => {
  assert.equal(nivelLluvia(0, 1, "cloudy"), 0);
  assert.equal(nivelLluvia(0.1, 1, "lightrain"), 1);
  assert.equal(nivelLluvia(0.6, 1, "rain"), 2);
  assert.equal(nivelLluvia(2, 1, "rain"), 3);
  assert.equal(nivelLluvia(30, 6, "heavyrain"), 4);
  assert.equal(nivelLluvia(0.2, 1, "rainandthunder"), 5);
  assert.equal(nivelLluvia(1.2, 6, "lightrain"), 1); // 0.2 mm por hora
});

test("cada periodo trae día o noche, momento y lluvia; cada día, sol y lluvia", () => {
  const r = transformar(metSintetico(), "monterrey", AHORA);
  const p = r.periods[0];
  assert.equal(p.isDay, true);
  assert.equal(p.phase, "tarde"); // 12:30 en Monterrey
  assert.ok(r.periods.some((x) => x.phase === "noche") && r.periods.some((x) => x.phase === "madrugada"));
  assert.deepEqual(r.periods[5].rain, { level: 3, label: "Lluvia" }); // 1.2 mm en una hora
  assert.equal(r.days[0].rain.label, "Lluvia");
  assert.ok(r.days[0].sunrise < r.days[0].sunset);
});
