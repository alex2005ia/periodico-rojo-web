// Pruebas de los avisos municipales (node --test). Usan respuestas reales de los portales del 11-11-2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PORTALES, FormatoCambiado, fechaDeTexto, idAviso, podriaMostrarMenores, textoPlano } from "../scripts/avisos/lectores.js";
import { capturar } from "../scripts/avisos/capturar.js";

const F = (n) => readFileSync(new URL(`./fixtures/avisos/${n}`, import.meta.url), "utf8");

test("fechas en los formatos de los portales", () => {
  assert.equal(fechaDeTexto("10 Nov 2026"), "2026-11-10");
  assert.equal(fechaDeTexto("11 de nov. de 2026"), "2026-11-11");
  assert.equal(fechaDeTexto("3 de noviembre de 2026"), "2026-11-03");
  assert.equal(fechaDeTexto("1 Dec 2026"), "2026-12-01");
  assert.equal(fechaDeTexto("5 de dic. de 2026"), "2026-12-05");
  assert.equal(fechaDeTexto("Servicio público"), null);
});

test("texto plano: etiquetas y entidades", () => {
  assert.equal(textoPlano("Ampliar&aacute; el <b>canal</b>&nbsp; pluvial &#8220;sur&#8221;"), "Ampliará el canal pluvial “sur”");
});

test("Monterrey: listado y foto completa de la nota", () => {
  const av = PORTALES.monterrey.leer(F("monterrey.html"));
  assert.equal(av.length, 12);
  assert.deepEqual(av[2], {
    municipio: "monterrey",
    clave: "https://www.monterrey.gob.mx/noticias/retira-monterrey-9-mil-200-toneladas-de-basura-y-escombro-del-canal-medular/",
    url: "https://www.monterrey.gob.mx/noticias/retira-monterrey-9-mil-200-toneladas-de-basura-y-escombro-del-canal-medular/",
    titulo: "Retira Monterrey 9 mil 200 toneladas de basura y escombro del Canal Medular",
    fecha: "2026-11-09",
    imagenEnNota: true,
  });
  // La de la nota es la versión de ancho fijo (sin recorte), no la de la tarjeta (fill-800x450).
  assert.equal(PORTALES.monterrey.imagenDeNota(F("monterrey-nota.html")),
    "https://storage.googleapis.com/mty-cms-static-production/media/images/1_CANAL_MEDULAR.width-1600.jpg");
});

test("Guadalupe", () => {
  const av = PORTALES.guadalupe.leer(F("guadalupe.html"));
  assert.equal(av.length, 9);
  assert.equal(av[0].titulo, "Inicia Guadalupe “Juguetón Navideño” 2026");
  assert.equal(av[0].fecha, "2026-11-11");
  assert.equal(av[0].url, "https://guadalupe.gob.mx/noticia/inicia-guadalupe-jugueton-navideno-2026");
  assert.match(av[0].imagen, /^https:\/\/guadalupe\.gob\.mx\/assets\/noticias\/inicia-guadalupe-jugueton-navideno-2026\//);
});

test("Escobedo: una página por día; la foto distingue comunicados", () => {
  const av = PORTALES.escobedo.leer(F("escobedo.html"));
  assert.equal(av.length, 25);
  assert.equal(av[0].titulo, "AMPLIARÁ ESCOBEDO CANAL PLUVIAL EN NEXXUS; REDUCIRÁ TIEMPOS DE DESFOGUE");
  assert.equal(av[0].fecha, "2026-11-10");
  assert.equal(av[0].url, "https://escobedo.gob.mx/?p=notas&a=20261110");
  assert.equal(av[0].clave, "https://escobedo.gob.mx/?p=notas&a=20261110#1794384327");
  assert.equal(av[0].imagen, "https://escobedo.gob.mx/notas/20261110/im00-1794384327.jpg");
  assert.equal(new Set(av.map((a) => a.clave)).size, av.length, "claves únicas");
});

test("García y San Pedro (API de WordPress)", () => {
  const g = PORTALES.garcia.leer(F("garcia.json"));
  assert.equal(g.length, 5);
  assert.equal(g[1].titulo, "Festival de la Catrina recibe miles de visitantes en García");
  assert.equal(g[1].fecha, "2026-11-04");
  assert.match(g[1].imagen, /^https:\/\/garcia\.gob\.mx\/wp-content\/uploads\//);

  const sp = PORTALES["san-pedro"].leer(F("san-pedro.json"));
  assert.equal(sp.length, 5);
  assert.equal(sp[1].titulo, "Anuncia San Pedro la 28ª edición del Kilómetro del Juguete");
  assert.equal(sp[1].url, "https://blog.sanpedro.gob.mx/news/anuncia-san-pedro-la-28a-edicion-del-kilometro-del-juguete/");
  assert.match(sp[1].imagen, /blog-5444-98cc\.jpeg$/);
});

test("San Nicolás (XML con la foto dentro)", () => {
  const av = PORTALES["san-nicolas"].leer(F("san-nicolas.xml"));
  assert.equal(av.length, 3);
  assert.equal(av[0].url, "https://sanicolas.gob.mx/SITIO_OFICIAL_PC/Nota/Nota?Id=142");
  assert.equal(av[0].fecha, "2026-06-24");
  assert.ok(av[0].imagenBase64.startsWith("/9j/"));
});

test("un portal que cambia de diseño se detecta", () => {
  assert.throws(() => PORTALES.guadalupe.leer("<html><body>Nuevo sitio</body></html>"), FormatoCambiado);
  assert.throws(() => PORTALES.garcia.leer("[]"), FormatoCambiado);
});

test("filtro de menores en el título", () => {
  for (const t of ["Inicia Guadalupe “Juguetón Navideño” 2026", "Activa Guadalupe dos nuevas rutas escolares gratuitas",
    "Acercan atención cardiológica gratuita a niñas y niños de Guadalupe", "DIF Escobedo entrega apoyo", "Cardiochavitos llega a la colonia"]) {
    assert.ok(podriaMostrarMenores(t), t);
  }
  for (const t of ["Retira Monterrey 9 mil 200 toneladas de basura", "Ninguna afectación por lluvias", "Rehabilita Escobedo parque en Santa Luz"]) {
    assert.ok(!podriaMostrarMenores(t), t);
  }
});

test("identificador legible y estable", () => {
  assert.equal(idAviso({ municipio: "guadalupe", fecha: "2026-11-11", titulo: "Inicia Guadalupe “Juguetón Navideño” 2026" }),
    "guadalupe-2026-11-11-inicia-guadalupe-jugueton-navideno-2026");
  const largo = idAviso({ municipio: "escobedo", fecha: "2026-11-10", titulo: "AMPLIARÁ ESCOBEDO CANAL PLUVIAL EN NEXXUS; REDUCIRÁ TIEMPOS DE DESFOGUE" });
  assert.equal(largo, "escobedo-2026-11-10-ampliara-escobedo-canal-pluvial-en-nexxus-reducira-tiempos");
});

// ---------- captura completa con la red simulada ----------

async function fotoDePrueba(ancho = 1200, alto = 800) {
  return sharp({ create: { width: ancho, height: alto, channels: 3, background: "#b03" } }).jpeg().toBuffer();
}

async function conRedSimulada(respuestas, fn) {
  const original = globalThis.fetch;
  const pedidas = [];
  globalThis.fetch = async (url) => {
    pedidas.push(String(url));
    const r = respuestas(String(url));
    if (r == null) return new Response("no", { status: 404 });
    return new Response(r, { status: 200 });
  };
  try { return await fn(pedidas); } finally { globalThis.fetch = original; }
}

test("captura: agrega nuevos, guarda fotos completas, aplica filtros y no repite", { timeout: 120_000 }, async () => {
  const raiz = await mkdtemp(path.join(os.tmpdir(), "avisos-"));
  try {
    await mkdir(path.join(raiz, "src/data"), { recursive: true });
    await writeFile(path.join(raiz, "src/data/avisos-retiros.json"), JSON.stringify({
      ocultar: [], sin_foto: ["guadalupe-2026-11-10-prioriza-guadalupe-seguridad-de-ciudadanos-con-operativo-del"], portales_sin_foto: ["escobedo"],
    }));
    const foto = await fotoDePrueba();
    const respuestas = (url) => {
      if (url === PORTALES.guadalupe.listado) return F("guadalupe.html");
      if (url === PORTALES.escobedo.listado) return F("escobedo.html");
      if (url.startsWith("https://guadalupe.gob.mx/assets/")) return foto;
      return null; // los demás portales "caen"
    };
    const registro = () => {};
    const r1 = await conRedSimulada(respuestas, () => capturar({ raiz, hoy: "2026-11-11", registro, sinPausas: true }));
    // Fallan los 4 portales sin respuesta, pero Guadalupe y Escobedo se guardan.
    assert.equal(r1.fallas.length, 4);
    const nov = JSON.parse(await readFile(path.join(raiz, "src/data/avisos/2026-11.json"), "utf8"));
    const oct = JSON.parse(await readFile(path.join(raiz, "src/data/avisos/2026-10.json"), "utf8"));
    // Sólo comunicados de los últimos 30 días (desde el 12-10).
    assert.ok([...nov, ...oct].every((a) => a.fecha >= "2026-10-12"));
    assert.ok(!oct.some((a) => a.fecha === "2026-10-10"));

    const porId = Object.fromEntries([...nov, ...oct].map((a) => [a.id, a]));
    const jugueton = porId["guadalupe-2026-11-11-inicia-guadalupe-jugueton-navideno-2026"];
    assert.equal(jugueton.foto, null);
    assert.equal(jugueton.sin_foto, "menores");
    assert.equal(porId["guadalupe-2026-11-10-prioriza-guadalupe-seguridad-de-ciudadanos-con-operativo-del"].sin_foto, "retiro");
    const violencia = porId["guadalupe-2026-11-09-refuerza-guadalupe-acciones-para-contrarrestar-la-violencia"];
    assert.equal(violencia.foto, "/avisos/guadalupe-2026-11-09-refuerza-guadalupe-acciones-para-contrarrestar-la-violencia.webp");
    // Reducida a 640 px sin recortar: conserva la proporción 3:2.
    assert.deepEqual([violencia.foto_ancho, violencia.foto_alto], [640, 427]);
    assert.ok(existsSync(path.join(raiz, "public", violencia.foto)));
    // Escobedo prohibió sus fotos (en esta prueba): sus avisos van sin foto y sin descargarlas.
    assert.ok(nov.filter((a) => a.municipio === "escobedo").every((a) => a.sin_foto === "portal"));

    const estado = JSON.parse(await readFile(path.join(raiz, "src/data/avisos-estado.json"), "utf8"));
    assert.equal(estado.guadalupe.ultimo_exito, "2026-11-11");
    assert.equal(estado.garcia.ultimo_error.resuelto, false);

    // Segunda corrida: nada nuevo y no se descargan fotos otra vez.
    const r2 = await conRedSimulada(respuestas, async (pedidas) => {
      const r = await capturar({ raiz, hoy: "2026-11-11", registro, sinPausas: true });
      assert.ok(!pedidas.some((u) => u.includes("/assets/")), "no vuelve a bajar fotos");
      return r;
    });
    assert.equal(r2.nuevos, 0);

    // 61 días después la foto se borra y el aviso conserva el enlace.
    await writeFile(path.join(raiz, "src/data/avisos-retiros.json"), JSON.stringify({ ocultar: [violencia.id] }));
    await conRedSimulada(() => null, () => capturar({ raiz, hoy: "2027-01-10", registro, sinPausas: true }));
    const despues = JSON.parse(await readFile(path.join(raiz, "src/data/avisos/2026-11.json"), "utf8"));
    const v2 = despues.find((a) => a.id === violencia.id);
    assert.equal(v2.foto, null);
    assert.equal(v2.oculto, true);
    assert.equal(v2.url, violencia.url);
    assert.ok(!existsSync(path.join(raiz, "public", violencia.foto)));
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});
