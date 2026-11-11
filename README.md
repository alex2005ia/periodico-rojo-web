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
  fecha: "Sábado 15 de noviembre · 10:00 a.m."   # texto para el público, con horario
  lugar: "Explanada de la Macroplaza"
  inicio: 2026-11-15          # día en que empieza (lo usa la agenda)
  fin: 2026-11-16             # opcional: último día, si dura más de uno
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

## Comunicados de los municipios

GitHub Actions (`.github/workflows/comunicados.yml`) revisa los seis portales a las 7:40, 13:10 y 19:40 (hora de
Nuevo León) con `scripts/avisos/capturar.js` y hace commit de lo nuevo; Cloudflare vuelve a publicar el sitio.
No se redacta nada: título, fecha, foto y enlace al original. También se puede correr a mano desde la pestaña
**Actions → Comunicados de los municipios → Run workflow**.

- Datos: `src/data/avisos/AAAA-MM.json`. Fotos: `public/avisos/` (640 px, completas; se borran a los 60 días).
- **Retirar algo** — editar `src/data/avisos-retiros.json` y guardar en GitHub; se aplica en la siguiente revisión:
  - `"ocultar"`: identificadores de avisos que no deben aparecer.
  - `"sin_foto"`: identificadores de avisos que se quedan sin foto.
  - `"portales_sin_foto"`: municipios que prohíben usar sus fotos (por ejemplo `"escobedo"`).
  El identificador está en el nombre de la foto y en `src/data/avisos/`.
- Sin foto automáticamente si el título sugiere niñas, niños o adolescentes (escuela, DIF, juguetes, etc.).
- Si un portal falla o cambia de diseño, la ejecución termina en rojo y GitHub manda un correo. El lector de cada
  portal está en `scripts/avisos/lectores.js` y sus pruebas en `tests/avisos.test.js`.

## Notas automáticas (opción B)

Si el repositorio tiene el secreto `ANTHROPIC_API_KEY` (Settings → Secrets and variables → Actions), el mismo flujo
redacta una nota por cada comunicado nuevo de los últimos dos días con `scripts/notas/publicar.js`:

1. Lee el texto completo del comunicado en el portal (`scripts/notas/textos.js`; San Nicolás no lo ofrece).
2. Pide la nota a Claude Sonnet 5.5 con las reglas de estilo (`scripts/notas/redactar.js`) y, si hay foto, le pregunta
   si muestra menores reconocibles (entonces no se usa la foto ni en la nota ni en el comunicado).
3. Revisa contra el comunicado (`scripts/notas/verificar.js`): cifras, citas literales, nombres propios y fechas del evento.
4. Si todo cuadra y no es un tema delicado (seguridad, violencia, tragedias, salud, elecciones, acusaciones), se publica
   con la leyenda «Nota redactada automáticamente». Si no, queda como borrador y aparece en el aviso de GitHub
   **«Notas en espera de revisión»** (pestaña Issues), con enlaces para editarla y publicarla (`borrador: false`).

Los comunicados que la IA considera sólo propaganda no se convierten en nota. Costo: unos 0.01 USD por nota; si se
acaba el saldo o se alcanza el límite de gasto, la redacción se detiene (la ejecución sale en rojo) y lo pendiente se
reintenta después. Sin el secreto, no hace nada.

## Agenda

`/agenda` reúne las notas que traen `evento`, ordenadas por `inicio`. La portada y cada municipio muestran los
próximos tres; si no hay ninguno por venir, el bloque no aparece. Como el sitio se compila sólo al publicar, el
navegador vuelve a revisar con la fecha del día (hora de Nuevo León) qué eventos ya pasaron, cuáles son hoy,
mañana o están en curso. Cada evento tiene su archivo de calendario en `/agenda/<nota>.ics` (día completo; el
horario va en la descripción, como lo da el comunicado). Si el comunicado no da la fecha, no se agrega `evento`.

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
