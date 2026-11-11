#!/usr/bin/env node
// Opción B: redacta notas a partir de los comunicados capturados (scripts/avisos/capturar.js).
//
//   ANTHROPIC_API_KEY=… node scripts/notas/publicar.js
//
// Por cada comunicado nuevo de los últimos DIAS días:
//   1. lee su texto completo en el portal;
//   2. pide la nota a Claude (con la foto, para detectar menores y describirla);
//   3. revisa cifras, citas, nombres y fechas contra el comunicado (verificar.js);
//   4. si todo cuadra y el tema no es delicado, la publica; si no, la deja como borrador «en espera».
// Sin ANTHROPIC_API_KEY no hace nada (no hay costo).
// Si RESUMEN_REVISION trae una ruta, escribe ahí la lista de notas en espera (para el aviso en GitHub).

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { PORTALES } from "../avisos/lectores.js";
import { hoyEnMonterrey, sumarDias } from "../../src/lib/agenda.js";
import { textoDelComunicado } from "./textos.js";
import { SinCredito, costoUSD, pedirNota } from "./redactar.js";
import { motivosDeRevision, verificar } from "./verificar.js";

const RAIZ_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const DIAS = 2;            // sólo comunicados de hoy y de los dos días anteriores
export const MAXIMO_POR_CORRIDA = 8;
const MAX_INTENTOS = 3;
const ANCHO_FOTO_NOTA = 1200;
const AGENTE = "PeriodicoRojo/1.0 (+https://periodico-rojo-web.pages.dev/about)";
const REPO = "https://github.com/alex2005ia/periodico-rojo-web";

const sinAcentos = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const slugDe = (t) => sinAcentos(t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const q = (t) => JSON.stringify(String(t)); // cadena YAML entre comillas dobles

async function leerJson(f, siFalta) { try { return JSON.parse(await readFile(f, "utf8")); } catch { return siFalta; } }

function hacerDescarga(fetchImpl) {
  return async (url, { tipo = "texto" } = {}) => {
    const r = await fetchImpl(url, { headers: { "User-Agent": AGENTE }, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return tipo === "bytes" ? Buffer.from(await r.arrayBuffer()) : r.text();
  };
}

/** Frontmatter + cuerpo de la nota en Markdown, con el mismo formato que las notas escritas a mano. */
export function archivoNota({ nota, aviso, emisor, publicado, foto, borrador, revision }) {
  const l = [
    "---",
    `titulo: ${q(nota.titulo.trim())}`,
    `descripcion: ${q(nota.descripcion.trim())}`,
    `municipio: ${aviso.municipio}`,
    `categoria: ${nota.categoria}`,
    `publicado: ${publicado.toISOString()}`,
    `fecha_original: ${aviso.fecha}`,
    `autor: "Redacción automática de Periódico Rojo"`,
    "automatica: true",
    `aviso: ${q(aviso.id)}`,
    "fuente:",
    `  nombre: ${q(emisor)}`,
    `  url: ${q(aviso.url)}`,
  ];
  if (foto) {
    l.push("foto:", `  archivo: ${q(foto.archivo)}`, `  alt: ${q(foto.alt)}`, `  credito: ${q(emisor)}`);
    if (foto.original) l.push(`  original: ${q(foto.original)}`);
  }
  if (nota.evento) {
    const e = nota.evento;
    l.push("evento:", `  fecha: ${q(e.fecha_texto)}`);
    if (e.lugar) l.push(`  lugar: ${q(e.lugar)}`);
    l.push(`  inicio: ${e.inicio}`);
    if (e.fin && e.fin !== e.inicio) l.push(`  fin: ${e.fin}`);
  }
  l.push(`borrador: ${borrador}`);
  if (revision.length) l.push("revision:", ...revision.map((m) => `  - ${q(m)}`));
  l.push("---", "", nota.cuerpo.trim(), "");
  return l.join("\n");
}

async function notasAutomaticasEnEspera(dirNotas) {
  const res = [];
  for (const f of (await readdir(dirNotas)).filter((f) => f.endsWith(".md"))) {
    const t = await readFile(path.join(dirNotas, f), "utf8");
    const cab = t.split(/^---$/m)[1] ?? "";
    if (!/^automatica: true$/m.test(cab) || !/^borrador: true$/m.test(cab)) continue;
    const titulo = JSON.parse(cab.match(/^titulo: (.*)$/m)?.[1] ?? '""');
    const motivos = [...cab.matchAll(/^ {2}- (".*")$/gm)].map((m) => JSON.parse(m[1]));
    res.push({ archivo: f, titulo, motivos });
  }
  return res;
}

export function textoResumen(enEspera) {
  if (!enEspera.length) return "";
  return [
    "Estas notas se redactaron automáticamente, pero **esperan revisión** antes de publicarse.",
    "",
    "**Para publicar una:** abre «Editar», cambia `borrador: true` por `borrador: false` y pulsa «Commit changes».",
    "Puedes corregir el texto en el mismo paso. **Para descartarla:** abre «Archivo» y bórralo (menú ··· → Delete file).",
    "",
    ...enEspera.flatMap((n) => [
      `### ${n.titulo}`,
      `- Por qué espera: ${n.motivos.join("; ") || "sin motivo registrado"}`,
      `- [Editar](${REPO}/edit/main/src/content/articulos/${n.archivo}) · [Archivo](${REPO}/blob/main/src/content/articulos/${n.archivo})`,
      "",
    ]),
  ].join("\n");
}

export async function publicarNotas({
  raiz = RAIZ_REPO, hoy = hoyEnMonterrey(), clave = process.env.ANTHROPIC_API_KEY, fetchImpl = fetch,
  registro = console.log, ahora = () => new Date(), maximo = MAXIMO_POR_CORRIDA,
} = {}) {
  const R = {
    avisos: path.join(raiz, "src/data/avisos"),
    notas: path.join(raiz, "src/content/articulos"),
    fotos: path.join(raiz, "src/assets/fotos"),
    publicas: path.join(raiz, "public"),
  };
  const resultado = { publicadas: [], enEspera: [], omitidas: [], fallas: [], costo: 0 };
  if (!clave) {
    registro("Sin ANTHROPIC_API_KEY: no se redactan notas (opción B apagada).");
    return resultado;
  }
  const descargar = hacerDescarga(fetchImpl);

  // Comunicados candidatos, del más antiguo al más reciente.
  const desde = sumarDias(hoy, -DIAS);
  const porMes = new Map();
  for (const f of (await readdir(R.avisos)).filter((f) => /^\d{4}-\d{2}\.json$/.test(f))) porMes.set(f, await leerJson(path.join(R.avisos, f), []));
  const candidatos = [...porMes.values()].flat()
    .filter((a) => !a.nota && !a.oculto && a.fecha >= desde && a.fecha <= hoy)
    .sort((x, y) => x.fecha.localeCompare(y.fecha) || x.capturado.localeCompare(y.capturado))
    .slice(0, maximo);
  registro(`${candidatos.length} comunicados por redactar.`);

  const usados = new Set((await readdir(R.notas)).map((f) => f.replace(/\.md$/, "")));

  for (const aviso of candidatos) {
    const emisor = PORTALES[aviso.municipio]?.nombre ?? aviso.municipio;
    try {
      const fuente = await textoDelComunicado(aviso, descargar);
      if (!fuente || fuente.length < 200) {
        aviso.nota = { estado: "omitida", motivo: "el portal no ofrece el texto completo" };
        resultado.omitidas.push(aviso.id);
        registro(`- ${aviso.id}: omitida (sin texto suficiente)`);
        continue;
      }
      const fotoAviso = aviso.foto && existsSync(path.join(R.publicas, aviso.foto)) ? await readFile(path.join(R.publicas, aviso.foto)) : null;

      const { nota, uso } = await pedirNota({ clave, aviso, emisor, fuente, fotoWebp: fotoAviso, fetchImpl });
      resultado.costo += costoUSD(uso);

      if (!nota.apto) {
        aviso.nota = { estado: "omitida", motivo: nota.motivo_no_apto || "no apto para nota" };
        resultado.omitidas.push(aviso.id);
        registro(`- ${aviso.id}: omitida (${aviso.nota.motivo})`);
        continue;
      }

      // Foto: no si la IA ve menores reconocibles (y se retira también del comunicado), ni si el aviso no la lleva.
      let foto = null;
      if (nota.foto?.menores_reconocibles && aviso.foto) {
        await rm(path.join(R.publicas, aviso.foto), { force: true });
        Object.assign(aviso, { foto: null, sin_foto: "menores-ia" });
        delete aviso.foto_ancho; delete aviso.foto_alto;
      }
      let slug = `${aviso.municipio}-${slugDe(nota.titulo)}`;
      if (slug.length > 80) slug = slug.slice(0, 81).replace(/-[^-]*$/, ""); // corta en palabra completa
      for (let n = 2; usados.has(slug); n++) slug = `${slug.replace(/-\d+$/, "")}-${n}`;
      usados.add(slug);

      if (aviso.foto && aviso.foto_original) {
        try {
          const original = await descargar(aviso.foto_original, { tipo: "bytes" });
          const datos = await sharp(original).rotate().resize({ width: ANCHO_FOTO_NOTA, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
          await mkdir(R.fotos, { recursive: true });
          await writeFile(path.join(R.fotos, `${slug}.webp`), datos);
          const alt = (nota.foto?.descripcion ?? "").trim();
          foto = {
            archivo: `../../assets/fotos/${slug}.webp`,
            alt: alt.length >= 10 ? alt : `Imagen difundida por el ${emisor}`,
            original: aviso.foto_original,
          };
        } catch (e) {
          registro(`  ${aviso.id}: nota sin foto (${e.message})`);
        }
      }

      const problemas = verificar(nota, fuente, aviso);
      const temas = motivosDeRevision(nota, fuente, aviso);
      const revision = [...problemas, ...temas.map((t) => `tema delicado: ${t}`)];
      const borrador = revision.length > 0;
      if (nota.evento && problemas.some((p) => p.includes("evento"))) nota.evento = null; // no se agenda algo dudoso

      await writeFile(path.join(R.notas, `${slug}.md`), archivoNota({ nota, aviso, emisor, publicado: ahora(), foto, borrador, revision }));
      aviso.nota = { slug, estado: borrador ? "en-espera" : "publicada", ...(borrador ? { motivos: revision } : {}) };
      (borrador ? resultado.enEspera : resultado.publicadas).push(slug);
      registro(`${borrador ? "⏸" : "✓"} ${slug}${borrador ? ` (en espera: ${revision.join("; ")})` : ""}`);
    } catch (e) {
      if (e instanceof SinCredito) {
        resultado.fallas.push(`API de Claude: ${e.message}`);
        registro(`✗ API de Claude: ${e.message}. Se detiene la redacción en esta corrida.`);
        break;
      }
      aviso.nota_intentos = (aviso.nota_intentos ?? 0) + 1;
      if (aviso.nota_intentos >= MAX_INTENTOS) aviso.nota = { estado: "omitida", motivo: `falló ${MAX_INTENTOS} veces: ${e.message}` };
      resultado.fallas.push(`${aviso.id}: ${e.message}`);
      registro(`✗ ${aviso.id}: ${e.message}`);
    }
  }

  for (const [f, avisos] of porMes) {
    const texto = JSON.stringify(avisos, null, 2) + "\n";
    if (texto !== (await readFile(path.join(R.avisos, f), "utf8"))) await writeFile(path.join(R.avisos, f), texto);
  }

  if (process.env.RESUMEN_REVISION) await writeFile(process.env.RESUMEN_REVISION, textoResumen(await notasAutomaticasEnEspera(R.notas)));
  registro(`Notas: ${resultado.publicadas.length} publicadas, ${resultado.enEspera.length} en espera, ${resultado.omitidas.length} omitidas. ` +
    `Costo aproximado: ${resultado.costo.toFixed(4)} USD.`);
  return resultado;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { fallas, publicadas, enEspera } = await publicarNotas();
  if (process.env.GITHUB_OUTPUT) {
    await writeFile(process.env.GITHUB_OUTPUT, `publicadas=${publicadas.length}\nen_espera=${enEspera.length}\n`, { flag: "a" });
  }
  if (fallas.length) {
    console.error("\nProblemas al redactar:\n- " + fallas.join("\n- "));
    process.exitCode = 1;
  }
}
