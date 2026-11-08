# Periódico Rojo

Noticias, eventos y avisos municipales de la zona metropolitana de Monterrey, con revisión editorial y
fuentes oficiales. Sitio estático hecho con [Astro](https://astro.build).

> Reconstruido el 07-11-2026: el repositorio original se perdió con la cuenta anterior de GitHub. El
> contenido (22 notas, fotos con crédito y la página «Sobre») se rescató del sitio publicado y se
> verificó contra él.

## Requisitos

- Node.js 20.3 o más reciente (la versión LTS actual sirve).

## Comandos

```bash
npm install        # una sola vez, instala las dependencias
npm run dev        # sitio en http://localhost:4321 mientras editas
npm run build      # genera el sitio final en dist/
npm run preview    # sirve dist/ para revisarlo antes de publicar
```

## Agregar una nota

Crea un archivo en `src/content/articulos/`. El nombre del archivo es la dirección de la nota:
`monterrey-ejemplo.md` se publica en `/articles/monterrey-ejemplo`.

```markdown
---
titulo: "Título de la nota"
descripcion: "Una o dos frases que resumen la nota."
municipio: monterrey          # garcia, san-nicolas, monterrey, escobedo, san-pedro, guadalupe
categoria: comunidad          # cultura, deportes, comunidad, obras-y-servicios, avisos
publicado: 2026-11-07T18:50:00.000Z   # instante de publicación (UTC)
fecha_original: 2026-11-06            # fecha del comunicado, sin hora
fuente:
  nombre: "Gobierno de Monterrey"
  url: "https://www.monterrey.gob.mx/noticias/..."
foto:                         # opcional: sin foto se muestra el sello del periódico
  archivo: "../../assets/fotos/monterrey-ejemplo.jpg"
  alt: "Descripción de lo que se ve en la foto."
  credito: "Gobierno de Monterrey"
  original: "https://..."     # opcional: enlace a la imagen original
evento:                       # opcional: sólo si la nota anuncia un evento
  fecha: "Sábado 15 de noviembre · 10:00 a.m."
  lugar: "Explanada de la Macroplaza"
borrador: false               # true la oculta del sitio
---

Texto de la nota en Markdown.
```

Si falta un campo obligatorio o un valor no es válido (por ejemplo, un municipio mal escrito), `npm run build`
se detiene y dice qué archivo y qué campo revisar.

Las fotos van en `src/assets/fotos/`. Astro las reduce y convierte a WebP al compilar.

## Agregar o actualizar un expediente de proyecto

Cada expediente es un archivo JSON en `src/content/proyectos/`. El nombre es su dirección:
`limpieza-canal-medular.json` se publica en `/proyectos/limpieza-canal-medular`. Copia uno existente y cambia:

- `municipio` (los mismos de las notas), `tema` (`Obras y servicios`, `Planeación urbana`, `Energía`, `Industria`,
  `Logística`) y `estado` (`Anuncio documentado`, `Avance reportado`, `Concluido según la fuente`,
  `Suspendido según la fuente`, `Sin novedades`).
- `eventos`: un hito por documento nuevo, con su `url` y `donde_comprobarlo` (qué párrafo o dato lo sustenta).
  Al agregar un hito, actualiza también `fecha_fuente` y `ultimo_cotejo` del expediente.
- `pendientes`: lo que todavía no está confirmado. No disponer de un dato no significa que sea cero.
- `fuentes`: nombres de archivo de `src/content/fuentes/` (sin `.json`). `nota_relacionada`: nombre de una nota.

Las fuentes son archivos JSON en `src/content/fuentes/`. Sus expedientes no se escriben a mano: se calculan.
Si un expediente cita una fuente o una nota que no existe, o un valor no es válido, `npm run build` se detiene.

Los expedientes guardados por cada lector viven sólo en su navegador (no hay cuentas ni servidor).

## El tiempo por municipio

La portada y cada página de municipio muestran el pronóstico (hora actual, próximas horas y siete días).
El navegador lo pide a `/api/clima?municipio=<id>`, una función de Cloudflare Pages (`functions/api/clima.js`)
que consulta MET Norway (Locationforecast 2.0, licencia CC BY 4.0) y guarda la respuesta en la caché de
Cloudflare hasta su `Expires` (mínimo 10 minutos). La conversión al español está en `src/lib/clima-met.js`.

- Costo: gratis. Las funciones de Cloudflare incluyen 100 000 solicitudes al día en el plan gratuito; si se
  rebasan, la función responde error ese día (no genera cobro sin un plan de pago).
- MET Norway pide identificarse (la función manda `PeriodicoRojo/1.0` con la dirección del sitio), respetar la
  caché y dar crédito; el crédito está al pie del módulo.
- Pruebas: `npm test`.

## Publicación

El sitio es estático y se publica en **Cloudflare Pages** (plan gratuito): cada cambio en `main` ejecuta
`npm run build` y publica `dist/`. Otra rama genera una vista previa en `https://<rama>.periodico-rojo-web.pages.dev`.
La dirección pública se define con la variable `SITE_URL` en Cloudflare; el RSS y el sitemap la usan.

## Estructura

| Ruta | Qué es |
| --- | --- |
| `src/content/articulos/` | Las notas (Markdown con datos al inicio) |
| `src/content/proyectos/`, `src/content/fuentes/` | Expedientes de seguimiento y catálogo de fuentes (JSON) |
| `src/lib/seguimiento.ts` | Temas, estados y textos fijos de la sección de proyectos |
| `src/content.config.ts` | Esquema que valida cada nota |
| `src/lib/sitio.ts` | Municipios, categorías y datos del periódico |
| `src/pages/` | Portada, notas, municipios, categorías, «Sobre», RSS y 404 |
| `src/components/`, `src/layouts/` | Piezas de la página (encabezado, tarjetas, pie) |
| `src/styles/global.css` | Colores y tipografía del periódico |

## Pendiente de reconstruir

- **P3**: el tiempo por municipio (`/api/clima`, MET Norway) y la agenda de próximos eventos.
- Búsqueda (`/search`).

## Licencias

- Código: de Periódico Rojo.
- Tipografías Source Sans Pro y Source Serif 4: SIL Open Font License, incluidas mediante Fontsource.
- Fotografías: de las fuentes acreditadas en cada nota.
