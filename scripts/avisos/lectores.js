// Lectores de los portales municipales: convierten la respuesta de cada portal en una lista de avisos.
// Funciones puras (texto → datos), sin red ni dependencias, para probarlas con respuestas reales guardadas.
//
// Cada aviso: { municipio, clave, url, titulo, fecha (AAAA-MM-DD), imagen, imagenEnNota, imagenBase64 }
//   clave        identifica el comunicado aunque cambie el título (normalmente, su dirección)
//   imagen       dirección de la foto completa, si el listado la trae
//   imagenEnNota true si la foto completa hay que buscarla en la página de la nota (Monterrey)
//   imagenBase64 la foto viene dentro de la respuesta (San Nicolás)
//
// Si un portal responde pero el lector no encuentra ningún aviso, se lanza un error: casi siempre
// significa que el portal cambió de diseño y hay que ajustar el lector.

export class FormatoCambiado extends Error {}

// ---------- utilidades ----------

const ENTIDADES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", ndash: "–", mdash: "—", hellip: "…", deg: "°",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", Aacute: "Á", Eacute: "É",
  Iacute: "Í", Oacute: "Ó", Uacute: "Ú", ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü",
  iexcl: "¡", iquest: "¿", ordf: "ª", ordm: "º",
};

export function textoPlano(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

const MESES = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8,
  sep: 9, sept: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12,
};

/** "10 Nov 2026", "11 de nov. de 2026", "3 de noviembre de 2026" → "2026-11-10" (o null). */
export function fechaDeTexto(texto) {
  const m = textoPlano(texto).toLowerCase().match(/(\d{1,2})\s+(?:de\s+)?([a-zé]{3,10})\.?\s+(?:de\s+)?(\d{4})/);
  if (!m) return null;
  const mes = MESES[m[2].slice(0, 4)] ?? MESES[m[2].slice(0, 3)];
  if (!mes) return null;
  return `${m[3]}-${String(mes).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const absoluta = (url, base) => new URL(textoPlano(url), base).href;

function exigir(avisos, portal) {
  if (avisos.length === 0) throw new FormatoCambiado(`${portal}: el portal respondió, pero no se encontró ningún comunicado`);
  for (const a of avisos) {
    if (!a.titulo || !/^\d{4}-\d{2}-\d{2}$/.test(a.fecha ?? "") || !a.url) {
      throw new FormatoCambiado(`${portal}: comunicado incompleto (${JSON.stringify(a).slice(0, 160)})`);
    }
  }
  return avisos;
}

// ---------- portales ----------

export const PORTALES = {
  monterrey: {
    nombre: "Gobierno de Monterrey",
    listado: "https://www.monterrey.gob.mx/noticias/",
    leer(html) {
      const avisos = [];
      for (const bloque of html.split(/<article\b/).slice(1)) {
        const url = bloque.match(/<a href="(https:\/\/www\.monterrey\.gob\.mx\/noticias\/[^"]+)"/)?.[1];
        const titulo = bloque.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1];
        // La fecha es el único <span> del encabezado de la tarjeta con formato de día, mes y año.
        const fecha = [...bloque.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((s) => fechaDeTexto(s[1])).find(Boolean);
        if (!url || !titulo) continue;
        // La imagen del listado viene recortada (fill-800x450); la completa está en la nota.
        avisos.push({ municipio: "monterrey", clave: url, url, titulo: textoPlano(titulo), fecha, imagenEnNota: true });
      }
      return exigir(avisos, "Monterrey");
    },
    /** Foto completa dentro de la nota: la primera imagen del contenido con ancho fijo (sin recorte). */
    imagenDeNota(html) {
      const urls = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => textoPlano(m[1]));
      return urls.find((u) => /mty-cms-static-production\/media\/images\//.test(u) && /\.width-\d+\.(jpe?g|png|webp)$/i.test(u) && !/logo/i.test(u)) ?? null;
    },
  },

  guadalupe: {
    nombre: "Gobierno de Guadalupe",
    listado: "https://guadalupe.gob.mx/noticias",
    leer(html) {
      const avisos = [];
      const re = /<a href="(\/noticia\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      for (const [, ruta, tarjeta] of html.matchAll(re)) {
        const titulo = tarjeta.match(/<div class="text-xl[^"]*">([\s\S]*?)<\/div>/)?.[1];
        const fecha = fechaDeTexto(tarjeta.match(/<div class="text-primary[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? "");
        const img = tarjeta.match(/<img[^>]+src="([^"]+)"/)?.[1];
        if (!titulo) continue;
        const url = absoluta(ruta, "https://guadalupe.gob.mx/");
        avisos.push({ municipio: "guadalupe", clave: url, url, titulo: textoPlano(titulo), fecha, imagen: img ? absoluta(img, url) : null });
      }
      return exigir(avisos, "Guadalupe");
    },
  },

  escobedo: {
    nombre: "Gobierno de General Escobedo",
    listado: "https://escobedo.gob.mx/?p=notas",
    leer(html) {
      const avisos = [];
      for (const bloque of html.split('<div class="entry event col-12">').slice(1)) {
        const titulo = bloque.match(/<h2>([\s\S]*?)<\/h2>/)?.[1];
        const dia = bloque.match(/href="\?p=notas&(?:amp;)?a=(\d{8})"/)?.[1];
        const img = bloque.match(/class="entry-image">\s*<img src="([^"]+)"/)?.[1];
        if (!titulo || !dia) continue;
        const fecha = `${dia.slice(0, 4)}-${dia.slice(4, 6)}-${dia.slice(6, 8)}`;
        // Escobedo publica una página por día; el número de la foto distingue comunicados del mismo día.
        const url = `https://escobedo.gob.mx/?p=notas&a=${dia}`;
        const numero = img?.match(/-(\d+)\.\w+$/)?.[1] ?? textoPlano(titulo).slice(0, 40);
        avisos.push({
          municipio: "escobedo", clave: `${url}#${numero}`, url, titulo: textoPlano(titulo), fecha,
          imagen: img ? absoluta(img, "https://escobedo.gob.mx/") : null,
        });
      }
      return exigir(avisos, "Escobedo");
    },
  },

  garcia: {
    nombre: "Gobierno de García",
    listado: "https://garcia.gob.mx/wp-json/wp/v2/posts?per_page=10",
    leer(texto) {
      const avisos = JSON.parse(texto).map((p) => {
        const img = p.content?.rendered?.match(/<img[^>]+src="([^"]+)"/)?.[1];
        return {
          municipio: "garcia", clave: p.link, url: p.link, titulo: textoPlano(p.title?.rendered),
          fecha: String(p.date ?? "").slice(0, 10), imagen: img ? textoPlano(img) : null,
        };
      });
      return exigir(avisos, "García");
    },
  },

  "san-pedro": {
    nombre: "Gobierno de San Pedro Garza García",
    // Las noticias actuales están en el tipo «news»; las entradas «posts» se dejaron de usar en 2024.
    listado: "https://blog.sanpedro.gob.mx/wp-json/wp/v2/news?per_page=10&_embed=wp:featuredmedia",
    leer(texto) {
      const avisos = JSON.parse(texto).map((p) => {
        const foto = p._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? null;
        return {
          municipio: "san-pedro", clave: p.link, url: p.link, titulo: textoPlano(p.title?.rendered),
          fecha: String(p.date ?? "").slice(0, 10), imagen: foto,
        };
      });
      return exigir(avisos, "San Pedro");
    },
  },

  "san-nicolas": {
    nombre: "Gobierno de San Nicolás de los Garza",
    // Responde con todas sus noticias y las fotos dentro (más de 30 MB): se consulta una vez al día.
    listado: "https://sanicolas.gob.mx/SITIO_OFICIAL_PC/Noticias/GetNoticias",
    unaVezAlDia: true,
    leer(xml) {
      const avisos = [];
      for (const [, fila] of xml.matchAll(/<Table1>([\s\S]*?)<\/Table1>/g)) {
        const campo = (n) => fila.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`))?.[1];
        const id = campo("Id_Entrada");
        if (!id) continue;
        const url = `https://sanicolas.gob.mx/SITIO_OFICIAL_PC/Nota/Nota?Id=${id.trim()}`;
        const base64 = campo("Imagen_Encabezado")?.trim();
        avisos.push({
          municipio: "san-nicolas", clave: url, url, titulo: textoPlano(campo("Titulo")),
          fecha: (campo("FechaHoraPub") ?? "").trim().slice(0, 10), imagenBase64: base64 || null,
        });
      }
      return exigir(avisos, "San Nicolás");
    },
  },
};

// ---------- reglas editoriales ----------

const sinAcentos = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Comunicados que probablemente muestran a niñas, niños o adolescentes: se publican sin foto.
const MENORES = /\b(nin(a|as|o|os|ez)|infan\w*|escuel\w*|escolar\w*|estudiant\w*|alumn\w*|kinder|preescolar\w*|primaria\w*|secundaria\w*|dif|juguet\w*|menores|adolescent\w*|bebes?|guarderi\w*|chavit\w*|pequen(o|os|a|as)|juvenil\w*|jovenes)\b/;

// Partes de palabra que delatan programas infantiles aunque vayan pegadas (Cardiochavitos, Ludoinfantil).
const MENORES_DENTRO = /chavit|infantil|peques/;

export const podriaMostrarMenores = (titulo) => {
  const t = sinAcentos(titulo);
  return MENORES.test(t) || MENORES_DENTRO.test(t);
};

/** Identificador legible y estable: municipio, fecha y comienzo del título. */
export function idAviso({ municipio, fecha, titulo }) {
  let slug = sinAcentos(titulo).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (slug.length > 60) slug = slug.slice(0, 61).replace(/-[^-]*$/, ""); // corta en palabra completa
  return `${municipio}-${fecha}-${slug || "comunicado"}`;
}
