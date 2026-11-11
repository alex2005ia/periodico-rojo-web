// Pruebas de la opción B (redacción automática). La API de Claude y los portales se simulan: no hay costo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { deEscobedo, deGuadalupe, deMonterrey, deWordPress } from "../scripts/notas/textos.js";
import { cifras, motivosDeRevision, nombresPropios, temasDelicados, verificar } from "../scripts/notas/verificar.js";
import { archivoNota, publicarNotas, textoResumen } from "../scripts/notas/publicar.js";

const F = (n) => readFileSync(new URL(`./fixtures/avisos/${n}`, import.meta.url), "utf8");

// ---------- texto completo ----------

test("texto completo de cada portal", () => {
  const mty = deMonterrey(F("monterrey-nota.html"));
  assert.match(mty, /^El Gobierno de Monterrey continúa con los trabajos de limpieza del Canal Medular/);
  assert.ok(!mty.includes("Palacio Municipal"), "sin el pie de página del portal");

  const gpe = deGuadalupe(F("guadalupe-nota.html"));
  assert.match(gpe, /del 9 de noviembre al 18 de diciembre/);
  assert.match(gpe, /de lunes a viernes\.$/);

  const esc = deEscobedo(F("escobedo-dia.html"), "https://escobedo.gob.mx/?p=notas&a=20261110#1794384327");
  assert.match(esc, /^Con el objetivo de reducir los riesgos de inundaciones/);
  assert.match(esc, /mil 123 metros cuadrados/);
  assert.ok(esc.includes("realizará"), "entidades decodificadas");

  const sp = JSON.parse(F("san-pedro.json"));
  assert.match(deWordPress(JSON.stringify([sp[1]])), /edición 28 del Kilómetro del Juguete/);
});

// ---------- verificación ----------

const AVISO = { id: "escobedo-2026-11-10-x", municipio: "escobedo", fecha: "2026-11-10", titulo: "AMPLIARÁ ESCOBEDO CANAL PLUVIAL EN NEXXUS; REDUCIRÁ TIEMPOS DE DESFOGUE", url: "https://escobedo.gob.mx/?p=notas&a=20261110", clave: "x#1794384327" };
const FUENTE = deEscobedo(F("escobedo-dia.html"), "x#1794384327");
const BUENA = {
  apto: true,
  titulo: "Escobedo ampliará el canal pluvial de la colonia Nexxus Sector Dorado",
  descripcion: "La obra sumará mil 123 metros cuadrados y, según el municipio, beneficiará hasta a 30 mil habitantes.",
  cuerpo: "El Gobierno de Escobedo informó el 10 de noviembre que ampliará el puente y canal pluvial en la colonia Nexxus Sector Dorado, entre la avenida Pinos y la calle Platino.\n\nSegún el comunicado, el proyecto contempla una ampliación de mil 123 metros cuadrados y beneficiará hasta a 30 mil habitantes.\n\nEl comunicado no precisa el costo ni la fecha de término de la obra.",
  categoria: "obras-y-servicios",
  evento: null,
  hechos: [{ dato: "superficie", cita: "una ampliación de mil 123 metros cuadrados" }],
  sensible: { es: false },
  foto: { menores_reconocibles: false, descripcion: "Trabajos en el canal pluvial de la colonia Nexxus." },
};

test("cifras sin separadores", () => {
  assert.deepEqual([...cifras("1,200 viajes y 4.2 millones; 9 mil 200")], ["1200", "4", "2", "9", "200"]);
});

test("una nota fiel pasa las revisiones", () => {
  assert.deepEqual(verificar(BUENA, FUENTE, AVISO), []);
  assert.deepEqual(motivosDeRevision(BUENA, FUENTE, AVISO), []);
});

test("se detectan cifras, citas y nombres inventados", () => {
  const mala = {
    ...BUENA,
    descripcion: "La obra costará 45 millones de pesos, informó el secretario Juan Pérez Treviño.",
    hechos: [{ dato: "costo", cita: "una inversión de 45 millones de pesos" }],
  };
  const p = verificar(mala, FUENTE, AVISO);
  assert.ok(p.some((x) => x.startsWith("cifras que no están") && x.includes("45")), p.join(" | "));
  assert.ok(p.some((x) => x.startsWith("cita no encontrada")), p.join(" | "));
  assert.ok(p.some((x) => x.startsWith("nombres que no están") && x.includes("Juan")), p.join(" | "));
});

test("forma: título en mayúsculas o muy largo, evento en el pasado", () => {
  const p = verificar({ ...BUENA, titulo: AVISO.titulo, evento: { fecha_texto: "1 de noviembre", inicio: "2026-11-01" } }, FUENTE, AVISO);
  assert.ok(p.includes("título en mayúsculas"));
  assert.ok(p.includes("el evento empieza antes de la fecha del comunicado"));
});

test("nombres propios: no cuenta el inicio de oración ni palabras comunes", () => {
  assert.deepEqual(nombresPropios("El Gobierno de Monterrey informó. Según el comunicado, Ana López asistió."), ["Ana", "López"]);
});

test("temas delicados", () => {
  assert.deepEqual(temasDelicados("Detienen a dos hombres por robo en Guadalupe"), ["seguridad"]);
  assert.deepEqual(temasDelicados("Venta de pan de muerto en la plaza"), []);
  assert.deepEqual(temasDelicados("Colecta de juguetes para niñas y niños"), []);
  assert.ok(temasDelicados("Arranca la campaña electoral").includes("elecciones"));
  assert.deepEqual(motivosDeRevision({ ...BUENA, sensible: { es: true, motivos: ["salud"] } }, "texto", AVISO), ["salud"]);
});

// ---------- archivo de la nota ----------

test("archivo Markdown con el formato de las notas", () => {
  const md = archivoNota({
    nota: { ...BUENA, evento: { fecha_texto: "Sábado 15 de noviembre · 10:00 a.m.", lugar: "Plaza \"Principal\"", inicio: "2026-11-15", fin: "2026-11-15" } },
    aviso: AVISO, emisor: "Gobierno de General Escobedo", publicado: new Date("2026-11-11T19:00:00Z"),
    foto: { archivo: "../../assets/fotos/x.webp", alt: "Trabajos en el canal.", original: "https://escobedo.gob.mx/notas/20261110/im00-1794384327.jpg" },
    borrador: true, revision: ["tema delicado: salud"],
  });
  assert.match(md, /^---\ntitulo: "Escobedo ampliará/);
  assert.match(md, /\nautomatica: true\n/);
  assert.match(md, /\n {2}lugar: "Plaza \\"Principal\\""\n/);
  assert.match(md, /\n {2}inicio: 2026-11-15\n/);
  assert.ok(!md.includes("  fin:"), "un solo día: sin fin");
  assert.match(md, /\nborrador: true\nrevision:\n {2}- "tema delicado: salud"\n---\n\nEl Gobierno de Escobedo/);
});

// ---------- corrida completa ----------

async function preparar() {
  const raiz = await mkdtemp(path.join(os.tmpdir(), "notas-"));
  await mkdir(path.join(raiz, "src/data/avisos"), { recursive: true });
  await mkdir(path.join(raiz, "src/content/articulos"), { recursive: true });
  await mkdir(path.join(raiz, "public/avisos"), { recursive: true });
  const foto = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: "#456" } }).jpeg().toBuffer();
  await writeFile(path.join(raiz, "public/avisos/escobedo-2026-11-10-x.webp"), await sharp(foto).webp().toBuffer());
  const avisos = [
    { ...AVISO, foto: "/avisos/escobedo-2026-11-10-x.webp", foto_original: "https://escobedo.gob.mx/notas/20261110/im00-1794384327.jpg", capturado: "2026-11-11T13:40:00Z" },
    { id: "guadalupe-2026-11-11-detienen", municipio: "guadalupe", fecha: "2026-11-11", titulo: "Detiene Policía de Guadalupe a dos hombres", url: "https://guadalupe.gob.mx/noticia/detiene", clave: "https://guadalupe.gob.mx/noticia/detiene", foto: null, sin_foto: "no-disponible", capturado: "2026-11-11T13:41:00Z" },
    { id: "monterrey-2026-11-01-viejo", municipio: "monterrey", fecha: "2026-11-01", titulo: "Comunicado viejo", url: "https://www.monterrey.gob.mx/noticias/viejo/", clave: "v", capturado: "2026-11-01T13:00:00Z" },
    { id: "san-nicolas-2026-11-11-x", municipio: "san-nicolas", fecha: "2026-11-11", titulo: "Comunicado de San Nicolás", url: "https://sanicolas.gob.mx/SITIO_OFICIAL_PC/Nota/Nota?Id=200", clave: "s", capturado: "2026-11-11T13:42:00Z" },
  ];
  await writeFile(path.join(raiz, "src/data/avisos/2026-11.json"), JSON.stringify(avisos));
  return { raiz, foto };
}

function redSimulada({ foto, respuestaClaude }) {
  const llamadas = [];
  const fetchImpl = async (url, opciones = {}) => {
    url = String(url);
    llamadas.push(url);
    if (url === "https://api.anthropic.com/v1/messages") {
      const pedido = JSON.parse(opciones.body);
      const texto = pedido.messages[0].content.at(-1).text;
      const nota = respuestaClaude(texto, pedido);
      if (nota instanceof Response) return nota;
      return Response.json({ content: [{ type: "tool_use", name: "entregar_nota", input: nota }], usage: { input_tokens: 3000, output_tokens: 600 } });
    }
    if (url.startsWith("https://escobedo.gob.mx/?p=notas")) return new Response(F("escobedo-dia.html"));
    if (url.startsWith("https://escobedo.gob.mx/notas/")) return new Response(foto);
    if (url === "https://guadalupe.gob.mx/noticia/detiene") {
      return new Response(`<article class="space-y-4 blog-content"><p>${"La Policía de Guadalupe detuvo a dos hombres por acumular reportes de robo en la colonia Centro, informó el municipio. ".repeat(3)}</p></article>`);
    }
    return new Response("no", { status: 404 });
  };
  return { fetchImpl, llamadas };
}

test("sin llave no hace nada", async () => {
  const r = await publicarNotas({ clave: undefined, registro: () => {} });
  assert.deepEqual(r.publicadas, []);
});

test("corrida: publica la fiel, deja en espera la delicada, omite lo viejo y lo que no tiene texto", { timeout: 60_000 }, async () => {
  const { raiz, foto } = await preparar();
  try {
    const { fetchImpl, llamadas } = redSimulada({
      foto,
      respuestaClaude: (texto) => texto.includes("Nexxus") ? BUENA : {
        ...BUENA, titulo: "Policía de Guadalupe detiene a dos hombres por reportes de robo",
        descripcion: "La Policía de Guadalupe detuvo a dos hombres en la colonia Centro, informó el municipio.",
        cuerpo: "La Policía de Guadalupe detuvo a dos hombres por acumular reportes de robo en la colonia Centro, informó el municipio.\n\nEl comunicado no precisa la fecha de la detención.",
        categoria: "avisos", hechos: [], sensible: { es: true, motivos: ["seguridad"] }, foto: null,
      },
    });
    process.env.RESUMEN_REVISION = path.join(raiz, "resumen.md");
    const r = await publicarNotas({ raiz, hoy: "2026-11-11", clave: "prueba", fetchImpl, registro: () => {}, ahora: () => new Date("2026-11-11T19:15:00Z") });
    delete process.env.RESUMEN_REVISION;

    assert.deepEqual(r.publicadas, ["escobedo-escobedo-ampliara-el-canal-pluvial-de-la-colonia-nexxus-sector-dorado"]);
    assert.deepEqual(r.enEspera, ["guadalupe-policia-de-guadalupe-detiene-a-dos-hombres-por-reportes-de-robo"]);
    assert.deepEqual(r.omitidas, ["san-nicolas-2026-11-11-x"]);
    assert.ok(!llamadas.some((u) => u.includes("viejo")), "lo de hace más de 2 días no se toca");
    assert.equal(llamadas.filter((u) => u.includes("anthropic")).length, 2);
    assert.ok(Math.abs(r.costo - 2 * (3000 * 2 + 600 * 10) / 1e6) < 1e-9);

    const md = await readFile(path.join(raiz, "src/content/articulos", `${r.publicadas[0]}.md`), "utf8");
    assert.match(md, /\nborrador: false\n/);
    assert.match(md, /archivo: "\.\.\/\.\.\/assets\/fotos\/escobedo-escobedo-ampliara/);
    const meta = await sharp(path.join(raiz, "src/assets/fotos", `${r.publicadas[0]}.webp`)).metadata();
    assert.deepEqual([meta.width, meta.height], [1200, 750], "foto completa, sin recortar");

    const espera = await readFile(path.join(raiz, "src/content/articulos", `${r.enEspera[0]}.md`), "utf8");
    assert.match(espera, /\nborrador: true\nrevision:\n {2}- "tema delicado: seguridad"/);

    const avisos = JSON.parse(await readFile(path.join(raiz, "src/data/avisos/2026-11.json"), "utf8"));
    assert.deepEqual(avisos[0].nota, { slug: r.publicadas[0], estado: "publicada" });
    assert.equal(avisos[1].nota.estado, "en-espera");
    assert.equal(avisos[2].nota, undefined);

    const resumen = await readFile(path.join(raiz, "resumen.md"), "utf8");
    assert.match(resumen, /### Policía de Guadalupe detiene a dos hombres/);
    assert.match(resumen, /edit\/main\/src\/content\/articulos\/guadalupe-policia/);

    // Segunda corrida: nada pendiente, ninguna llamada a la API.
    const otra = redSimulada({ foto, respuestaClaude: () => assert.fail("no debe llamar a la API") });
    const r2 = await publicarNotas({ raiz, hoy: "2026-11-11", clave: "prueba", fetchImpl: otra.fetchImpl, registro: () => {} });
    assert.equal(r2.publicadas.length + r2.enEspera.length, 0);
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});

test("menores reconocibles en la foto: nota sin foto y se retira también del comunicado", { timeout: 60_000 }, async () => {
  const { raiz, foto } = await preparar();
  try {
    const { fetchImpl } = redSimulada({ foto, respuestaClaude: (t) => t.includes("Nexxus") ? { ...BUENA, foto: { menores_reconocibles: true, descripcion: "Niños en un parque." } } : { ...BUENA, apto: false, motivo_no_apto: "prueba" } });
    const r = await publicarNotas({ raiz, hoy: "2026-11-11", clave: "prueba", fetchImpl, registro: () => {} });
    const md = await readFile(path.join(raiz, "src/content/articulos", `${r.publicadas[0]}.md`), "utf8");
    assert.ok(!md.includes("foto:"));
    assert.ok(!existsSync(path.join(raiz, "public/avisos/escobedo-2026-11-10-x.webp")));
    const avisos = JSON.parse(await readFile(path.join(raiz, "src/data/avisos/2026-11.json"), "utf8"));
    assert.equal(avisos[0].sin_foto, "menores-ia");
    assert.equal(avisos[1].nota.estado, "omitida");
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});

test("sin saldo: se detiene sin marcar los comunicados (se reintentan después)", { timeout: 60_000 }, async () => {
  const { raiz, foto } = await preparar();
  try {
    const { fetchImpl, llamadas } = redSimulada({
      foto,
      respuestaClaude: () => Response.json({ error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } }, { status: 400 }),
    });
    const r = await publicarNotas({ raiz, hoy: "2026-11-11", clave: "prueba", fetchImpl, registro: () => {} });
    assert.equal(r.fallas.length, 1);
    assert.match(r.fallas[0], /credit balance/);
    assert.equal(llamadas.filter((u) => u.includes("anthropic")).length, 1, "no insiste");
    const avisos = JSON.parse(await readFile(path.join(raiz, "src/data/avisos/2026-11.json"), "utf8"));
    assert.equal(avisos[0].nota, undefined);
  } finally {
    await rm(raiz, { recursive: true, force: true });
  }
});

test("resumen vacío si no hay nada en espera", () => {
  assert.equal(textoResumen([]), "");
});
