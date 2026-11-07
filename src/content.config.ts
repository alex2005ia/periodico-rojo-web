import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { IDS_CATEGORIAS, IDS_MUNICIPIOS } from "./lib/sitio";

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

export const collections = { articulos };
