import { defineCollection, reference, z } from "astro:content";
import { glob } from "astro/loaders";
import { IDS_CATEGORIAS, IDS_MUNICIPIOS } from "./lib/sitio";
import { ESTADOS_EXPEDIENTE, BASES, TEMAS } from "./lib/seguimiento";

// Cada nota es un archivo Markdown en src/content/articulos. El nombre del archivo es su dirección:
// articulos/monterrey-drenaje.md se publica en /articles/monterrey-drenaje.
// Si falta un campo obligatorio o un valor no es válido, la compilación se detiene con el error.
const articulos = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/articulos" }),
  schema: ({ image }) =>
    z.object({
      titulo: z.string().min(10),
      descripcion: z.string().min(20),
      municipio: z.enum(IDS_MUNICIPIOS),
      categoria: z.enum(IDS_CATEGORIAS),
      // Instante en que Periódico Rojo publicó la nota (con hora y zona).
      publicado: z.coerce.date(),
      // Fecha del comunicado original: una fecha sin hora (AAAA-MM-DD).
      fecha_original: z
        .union([z.string(), z.date()])
        .transform((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v))
        .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "usa AAAA-MM-DD")),
      autor: z.string().default("Redacción de Periódico Rojo"),
      fuente: z.object({
        nombre: z.string(),
        url: z.string().url(),
      }),
      foto: z
        .object({
          archivo: image(),
          alt: z.string().min(10),
          credito: z.string(),
          original: z.string().url().optional(),
        })
        .optional(),
      evento: z
        .object({
          fecha: z.string(),
          lugar: z.string().optional(),
        })
        .optional(),
      borrador: z.boolean().default(false),
    }),
});

const fechaSinHora = z
  .union([z.string(), z.date()])
  .transform((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v))
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "usa AAAA-MM-DD"));

// Expedientes de seguimiento: un archivo JSON por proyecto en src/content/proyectos.
// El nombre del archivo es su dirección: proyectos/limpieza-canal-medular.json → /proyectos/limpieza-canal-medular.
// Cada hito cita el documento que lo sustenta y dónde comprobarlo. Lo que falta se declara en "pendientes".
const proyectos = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/proyectos" }),
  schema: z.object({
    titulo: z.string().min(10),
    subtitulo: z.string().min(20),
    municipio: z.enum(IDS_MUNICIPIOS),
    tema: z.enum(TEMAS),
    estado: z.enum(ESTADOS_EXPEDIENTE),
    resumen: z.string().min(40),
    fecha_fuente: fechaSinHora,          // fecha del documento más reciente
    ultimo_cotejo: fechaSinHora,         // última vez que la redacción revisó el expediente
    base: z.enum(BASES),
    eventos: z
      .array(
        z.object({
          titulo: z.string().min(10),
          estado: z.string(),
          base: z.enum(BASES),
          fecha_fuente: fechaSinHora,
          fecha_hecho: fechaSinHora.nullable(),   // fecha en que ocurrió, si el documento la dice
          incorporado: fechaSinHora,
          cotejo: z.string(),
          documentos: z
            .array(
              z.object({
                titulo: z.string(),
                url: z.string().url(),
                emisor: z.string(),
                fecha: fechaSinHora,
                donde_comprobarlo: z.string().min(10),
              }),
            )
            .min(1, "cada hito necesita al menos un documento"),
        }),
      )
      .min(1),
    pendientes: z.array(z.string()).default([]),
    ubicacion: z.string(),
    precision: z.string(),
    fuentes: z.array(reference("fuentes")).min(1),
    nota_relacionada: reference("articulos").optional(),
    borrador: z.boolean().default(false),
  }),
});

// Catálogo de fuentes de la sección de proyectos: un archivo JSON por fuente en src/content/fuentes.
// Los expedientes de cada fuente no se escriben aquí: se calculan desde los proyectos que la citan.
const fuentes = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/fuentes" }),
  schema: z.object({
    titulo: z.string(),
    tipo: z.string(),
    emisor: z.string(),
    estado_acceso: z.string(),
    cobertura: z.string(),
    ultima_comprobacion: fechaSinHora,
    incorporacion: z.string(),
    reutilizacion: z.string(),
    nota_licencia: z.string(),
    url: z.string().url(),
  }),
});

export const collections = { articulos, proyectos, fuentes };
