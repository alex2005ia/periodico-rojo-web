// Pruebas de la agenda (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  archivoIcs, compararEventos, estadoEvento, hoyEnMonterrey, rangoCorto, sumarDias,
} from "../src/lib/agenda.js";

test("hoy en hora de Nuevo León, no en UTC", () => {
  assert.equal(hoyEnMonterrey(new Date("2026-11-10T05:30:00Z")), "2026-11-09"); // 23:30 del día 9
  assert.equal(hoyEnMonterrey(new Date("2026-11-10T06:30:00Z")), "2026-11-10");
});

test("sumar días cruza meses y años", () => {
  assert.equal(sumarDias("2026-10-31", 1), "2026-11-01");
  assert.equal(sumarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(sumarDias("2026-11-01", -1), "2026-10-31");
});

test("estado de un evento respecto a hoy", () => {
  const mictlan = { inicio: "2026-11-01", fin: "2026-11-02" };
  assert.equal(estadoEvento(mictlan, "2026-10-30"), "proximo");
  assert.equal(estadoEvento(mictlan, "2026-10-31"), "manana");
  assert.equal(estadoEvento(mictlan, "2026-11-01"), "hoy");
  assert.equal(estadoEvento(mictlan, "2026-11-02"), "en-curso"); // sigue el último día
  assert.equal(estadoEvento(mictlan, "2026-11-03"), "pasado");
  assert.equal(estadoEvento({ inicio: "2026-11-15" }, "2026-11-15"), "hoy"); // sin fin: un solo día
  assert.equal(estadoEvento({ inicio: "2026-11-15" }, "2026-11-16"), "pasado");
});

test("rango corto en español", () => {
  assert.equal(rangoCorto("2026-11-15"), "15 nov");
  assert.equal(rangoCorto("2026-11-01", "2026-11-02"), "1–2 nov");
  assert.equal(rangoCorto("2026-10-30", "2026-11-02"), "30 oct – 2 nov");
  assert.equal(rangoCorto("2026-12-30", "2027-01-02"), "30 dic 2026 – 2 ene 2027");
});

test("orden de la agenda", () => {
  const ev = [
    { id: "c", inicio: "2026-11-20" },
    { id: "b", inicio: "2026-11-15", fin: "2026-11-18" },
    { id: "a", inicio: "2026-11-15" },
  ].sort(compararEventos);
  assert.deepEqual(ev.map((e) => e.id), ["a", "b", "c"]);
});

test("archivo de calendario válido", () => {
  const ics = archivoIcs({
    uid: "escobedo-mictlan@periodico-rojo-web.pages.dev",
    titulo: "Escobedo celebra el Mictlán, con dos noches; música",
    inicio: "2026-11-01",
    fin: "2026-11-02",
    cuando: "Del 1 al 2 de noviembre de 2026 · desde las 6:00 p.m.",
    lugar: "Plaza Principal de Escobedo, calle Miguel Hidalgo #111, cabecera municipal",
    fuente: "https://escobedo.gob.mx/?a=20261030&p=notas",
    url: "https://periodico-rojo-web.pages.dev/articles/escobedo-mictlan-dia-de-muertos",
    marca: new Date("2026-10-31T23:35:00Z"),
  });
  const lineas = ics.split("\r\n");
  assert.equal(lineas[0], "BEGIN:VCALENDAR");
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(lineas.includes("DTSTART;VALUE=DATE:20261101"));
  assert.ok(lineas.includes("DTEND;VALUE=DATE:20261103"), "el final es exclusivo: el día siguiente");
  assert.ok(lineas.includes("DTSTAMP:20261031T233500Z"));
  // Comas y punto y coma escapados.
  assert.ok(ics.includes("SUMMARY:Escobedo celebra el Mictlán\\, con dos noches\\; música"));
  // Ninguna línea pasa de 75 bytes y las continuaciones empiezan con espacio.
  for (const l of lineas) assert.ok(new TextEncoder().encode(l).length <= 75, `línea larga: ${l}`);
  // Al desdoblar, el texto queda íntegro (sin letras partidas).
  const desdoblado = ics.replace(/\r\n /g, "");
  assert.ok(desdoblado.includes("LOCATION:Plaza Principal de Escobedo\\, calle Miguel Hidalgo #111\\, cabecera municipal"));
  assert.ok(desdoblado.includes("Cuándo: Del 1 al 2 de noviembre de 2026 · desde las 6:00 p.m.\\nDónde:"));
});
