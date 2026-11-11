#!/usr/bin/env node
// Captura de comunicados municipales (opción A: título, fecha, foto y enlace; sin redactar nada).
//
//   node scripts/avisos/capturar.js            revisa los seis portales
//   node scripts/avisos/capturar.js --solo garcia
//
// Escribe:
//   src/data/avisos/AAAA-MM.json   los avisos, por mes de publicación
//   public/avisos/<id>.webp        la foto, completa y reducida (sólo de los últimos DIAS_CON_FOTO días)
//   src/data/avisos-estado.json    último éxito y último error de cada portal
// Lee:
//   src/data/avisos-retiros.json   avisos a ocultar o a dejar sin foto, y portales que prohíben usar sus fotos
//
// Termina con código 1 si algún portal falló (GitHub manda un correo), pero guarda lo de los demás.

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { PORTALES, idAviso, podriaMostrarMenores } from "./lectores.js";
import { hoyEnMonterrey, sumarDias } from "../../src/lib/agenda.js";

const RAIZ_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// Rutas relativas a la raíz (las pruebas usan una carpeta temporal).
const rutas = (raiz) => ({
  raiz,
  datos: path.join(raiz, "src/data/avisos"),
  fotos: path.join(raiz, "public/avisos"),
  estado: path.join(raiz, "src/data/avisos-estado.json"),
  retiros: path.join(raiz, "src/data/avisos-retiros.json"),
});

export const DIAS_NUEVOS = 30;    // un comunicado más viejo que esto no se agrega
export const DIAS_CON_FOTO = 60;  // pasado este plazo se borra la foto guardada (queda el enlace)
const ANCHO_FOTO = 640;
const AGENTE = "PeriodicoRojo/1.0 (+https://periodico-rojo-web.pages.dev/about)";
const PAUSA_MS = 1500;            // entre solicitudes al mismo portal

let factorEspera = 1; // las pruebas lo ponen en 0
const esperar = (ms) => new Promise((r) => setTimeout(r, ms * factorEspera));

async function descargar(url, { tipo = "texto", intentos = 3 } = {}) {
  let ultimo;
  for (let i = 1; i <= intentos; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": AGENTE }, signal: AbortSignal.timeout(60_000), redirect: "follow" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return tipo === "bytes" ? Buffer.from(await r.arrayBuffer()) : await r.text();
    } catch (e) {
      ultimo = e;
      if (i < intentos) await esperar(3000 * i);
    }
  }
  throw new Error(`${url}: ${ultimo?.message ?? ultimo}`);
}

async function leerJson(archivo, siFalta) {
  try { return JSON.parse(await readFile(archivo, "utf8")); } catch { return siFalta; }
}

async function escribirJson(archivo, datos) {
  await mkdir(path.dirname(archivo), { recursive: true });
  const texto = JSON.stringify(datos, null, 2) + "\n";
  const antes = existsSync(archivo) ? await readFile(archivo, "utf8") : null;
  if (antes !== texto) await writeFile(archivo, texto); // sin cambios, sin escribir (y sin commit)
}

async function cargarAvisos(R) {
  const porMes = new Map();
  await mkdir(R.datos, { recursive: true });
  for (const f of (await readdir(R.datos)).filter((f) => /^\d{4}-\d{2}\.json$/.test(f))) {
    porMes.set(f.slice(0, 7), await leerJson(path.join(R.datos, f), []));
  }
  return porMes;
}

/** Reduce la foto sin recortarla y la guarda en WebP. Devuelve su tamaño o null si no es una imagen válida. */
async function guardarFoto(R, bytes, id) {
  const imagen = sharp(bytes, { failOn: "error" }).rotate();
  const { width, height } = await imagen.metadata();
  if (!width || !height || width < 200) return null; // íconos o imágenes rotas
  const salida = await imagen.resize({ width: ANCHO_FOTO, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer({ resolveWithObject: true });
  await mkdir(R.fotos, { recursive: true });
  await writeFile(path.join(R.fotos, `${id}.webp`), salida.data);
  return { ancho: salida.info.width, alto: salida.info.height };
}

async function borrarFoto(R, aviso, motivo) {
  if (aviso.foto) await rm(path.join(R.raiz, "public", aviso.foto), { force: true });
  aviso.foto = null;
  delete aviso.foto_ancho;
  delete aviso.foto_alto;
  aviso.sin_foto = motivo;
}

export async function capturar({ solo, hoy = hoyEnMonterrey(), registro = console.log, raiz = RAIZ_REPO, sinPausas = false } = {}) {
  factorEspera = sinPausas ? 0 : 1;
  const R = rutas(raiz);
  const retiros = { ocultar: [], sin_foto: [], portales_sin_foto: [], ...(await leerJson(R.retiros, {})) };
  const estado = await leerJson(R.estado, {});
  const porMes = await cargarAvisos(R);
  const conocidas = new Set([...porMes.values()].flat().map((a) => a.clave));
  const limiteNuevos = sumarDias(hoy, -DIAS_NUEVOS);
  const fallas = [];
  let nuevos = 0;

  for (const [municipio, portal] of Object.entries(PORTALES)) {
    if (solo && solo !== municipio) continue;
    const previo = estado[municipio] ?? {};
    if (portal.unaVezAlDia && previo.ultimo_exito === hoy && !solo) {
      registro(`${municipio}: ya se revisó hoy (se consulta una vez al día)`);
      continue;
    }
    try {
      const avisos = portal.leer(await descargar(portal.listado));
      const porAgregar = avisos.filter((a) => !conocidas.has(a.clave) && a.fecha >= limiteNuevos && a.fecha <= hoy);
      for (const a of porAgregar) {
        const id = idAviso(a);
        const registroAviso = {
          id, municipio, titulo: a.titulo, fecha: a.fecha, url: a.url, clave: a.clave,
          foto: null, foto_original: a.imagen ?? null, capturado: new Date().toISOString(),
        };

        // ¿Lleva foto? Primero las reglas; sólo después se descarga.
        let motivo = null;
        if (retiros.portales_sin_foto.includes(municipio)) motivo = "portal";
        else if (retiros.sin_foto.includes(id)) motivo = "retiro";
        else if (podriaMostrarMenores(a.titulo)) motivo = "menores";

        if (!motivo) {
          try {
            let bytes = null;
            if (a.imagenBase64) bytes = Buffer.from(a.imagenBase64, "base64");
            else {
              if (a.imagenEnNota) {
                await esperar(PAUSA_MS);
                registroAviso.foto_original = portal.imagenDeNota(await descargar(a.url));
              }
              if (registroAviso.foto_original) {
                await esperar(PAUSA_MS);
                bytes = await descargar(registroAviso.foto_original, { tipo: "bytes" });
              }
            }
            const medidas = bytes ? await guardarFoto(R, bytes, id) : null;
            if (medidas) Object.assign(registroAviso, { foto: `/avisos/${id}.webp`, foto_ancho: medidas.ancho, foto_alto: medidas.alto });
            else motivo = "no-disponible";
          } catch (e) {
            motivo = "no-disponible"; // una foto que falla no detiene el aviso
            registro(`  ${id}: sin foto (${e.message})`);
          }
        }
        if (motivo) registroAviso.sin_foto = motivo;

        const mes = a.fecha.slice(0, 7);
        porMes.set(mes, [...(porMes.get(mes) ?? []), registroAviso]);
        conocidas.add(a.clave);
        nuevos++;
        registro(`+ ${id}${registroAviso.foto ? "" : ` (sin foto: ${motivo})`}`);
      }
      const error = previo.ultimo_error ? { ...previo.ultimo_error, resuelto: true } : null;
      estado[municipio] = { ultimo_exito: hoy, leidos: avisos.length, ultimo_error: error };
      registro(`${municipio}: ${avisos.length} en el portal, ${porAgregar.length} nuevos`);
    } catch (e) {
      fallas.push(`${municipio}: ${e.message}`);
      estado[municipio] = { ...previo, ultimo_error: { fecha: hoy, mensaje: e.message, resuelto: false } };
      registro(`✗ ${municipio}: ${e.message}`);
    }
  }

  // Retiros y fotos vencidas: se aplican a todo lo guardado, también a avisos viejos.
  const limiteFoto = sumarDias(hoy, -DIAS_CON_FOTO);
  for (const [mes, avisos] of porMes) {
    for (const a of avisos) {
      if (retiros.ocultar.includes(a.id)) a.oculto = true;
      if (a.foto && retiros.portales_sin_foto.includes(a.municipio)) await borrarFoto(R, a, "portal");
      else if (a.foto && (retiros.sin_foto.includes(a.id) || a.oculto)) await borrarFoto(R, a, "retiro");
      else if (a.foto && a.fecha < limiteFoto) await borrarFoto(R, a, "antigua");
    }
    avisos.sort((x, y) => y.fecha.localeCompare(x.fecha) || y.capturado.localeCompare(x.capturado));
    await escribirJson(path.join(R.datos, `${mes}.json`), avisos);
  }

  // Fotos que ya no corresponden a ningún aviso (por ejemplo, tras borrar uno a mano).
  const usadas = new Set([...porMes.values()].flat().map((a) => a.foto).filter(Boolean));
  if (existsSync(R.fotos)) {
    for (const f of await readdir(R.fotos)) {
      if (!f.startsWith(".") && !usadas.has(`/avisos/${f}`)) await rm(path.join(R.fotos, f), { force: true });
    }
  }

  await escribirJson(R.estado, estado);
  registro(`Listo: ${nuevos} avisos nuevos${fallas.length ? `; fallaron ${fallas.length} portales` : ""}.`);
  return { nuevos, fallas };
}

// Ejecución desde la línea de comandos.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--solo");
  const { fallas } = await capturar({ solo: i > 0 ? process.argv[i + 1] : undefined });
  if (fallas.length) {
    console.error("\nPortales con problemas (revisar el lector o si el portal está caído):\n- " + fallas.join("\n- "));
    process.exitCode = 1;
  }
}
