// Redacción de una nota a partir de un comunicado, con la API de Claude.
// Sólo se usa si existe la variable ANTHROPIC_API_KEY (secreto de GitHub). Sin ella, no se llama a nada ni se cobra.
import { IDS_CATEGORIAS } from "../../src/lib/sitio.ts"; // Node 22.18+ lee TypeScript sin compilar

export const MODELO = "claude-sonnet-5-5";
const API = "https://api.anthropic.com/v1/messages";

export const INSTRUCCIONES = `Eres redactor de Periódico Rojo, un periódico digital local de la zona metropolitana de Monterrey, Nuevo León.
Recibes el comunicado oficial de un gobierno municipal y escribes una nota breve, útil y verificable para vecinos.

Reglas de redacción (obligatorias):
- Usa SOLO información que esté en el comunicado. No agregues datos, cifras, nombres, cargos, lugares ni contexto que no estén ahí.
- Atribuye: "según el comunicado", "informó el Gobierno de…", "de acuerdo con el municipio". No presentes como hecho comprobado lo que es una afirmación del gobierno.
- Tono neutral e informativo. Elimina la propaganda: adjetivos de elogio, lemas, frases de campaña, agradecimientos y promesas genéricas.
- Prioriza lo que le sirve al lector: qué pasa, dónde, cuándo, a quién beneficia, requisitos, horarios, costos, cómo participar.
- Si falta un dato práctico importante (horario, costo, requisitos, fecha de término), dilo en una frase al final: "El comunicado no precisa…".
- Español de México. Cifras como en el comunicado (si dice "9 mil 200", escribe "9 mil 200").
- Título: una oración informativa en minúsculas normales (nunca todo en mayúsculas), de 15 palabras o menos, sin signos de exclamación.
- Descripción: una o dos oraciones que resuman lo esencial (máximo 220 caracteres).
- Cuerpo: de 3 a 6 párrafos cortos en Markdown simple, sin encabezados, sin listas largas, sin citas inventadas. El primer párrafo dice quién informó qué y cuándo.
- No uses primera persona ni te dirijas al lector con "te invitamos".

Además:
- "hechos": hasta 8 frases copiadas LITERALMENTE del comunicado (sin cambiar ni una letra) que sustentan los datos que usaste.
- "evento": sólo si el comunicado anuncia algo a lo que el público puede asistir o un plazo para participar, con fecha explícita. Si no, null.
- "apto": false si el comunicado es sólo promoción política o propaganda sin información pública útil (por ejemplo, logros genéricos de un partido o gobierno, mensajes de campaña), o si no tiene contenido suficiente para una nota.
- "sensible": marca true si trata de seguridad o delitos, violencia, accidentes o tragedias, salud, elecciones o partidos, acusaciones o investigaciones, o situaciones delicadas que involucren a menores.
- Si recibes una fotografía: indica si muestra a niñas, niños o adolescentes reconocibles (rostros identificables), y descríbela en una frase neutral para el texto alternativo. No identifiques a nadie por su nombre a partir de la imagen.`;

const HERRAMIENTA = {
  name: "entregar_nota",
  description: "Entrega la nota redactada y la evaluación del comunicado.",
  input_schema: {
    type: "object",
    properties: {
      apto: { type: "boolean" },
      motivo_no_apto: { type: "string" },
      titulo: { type: "string" },
      descripcion: { type: "string" },
      cuerpo: { type: "string" },
      categoria: { type: "string", enum: IDS_CATEGORIAS },
      evento: {
        type: ["object", "null"],
        properties: {
          fecha_texto: { type: "string", description: "Como lo leerá el público, con horario si lo hay. Ej.: 'Sábado 15 de noviembre de 2026 · 10:00 a.m.'" },
          lugar: { type: "string" },
          inicio: { type: "string", description: "AAAA-MM-DD" },
          fin: { type: "string", description: "AAAA-MM-DD; igual a inicio si es un solo día" },
        },
        required: ["fecha_texto", "inicio"],
      },
      hechos: {
        type: "array",
        items: { type: "object", properties: { dato: { type: "string" }, cita: { type: "string" } }, required: ["dato", "cita"] },
      },
      sensible: {
        type: "object",
        properties: { es: { type: "boolean" }, motivos: { type: "array", items: { type: "string" } } },
        required: ["es"],
      },
      foto: {
        type: ["object", "null"],
        properties: { menores_reconocibles: { type: "boolean" }, descripcion: { type: "string" } },
        required: ["menores_reconocibles", "descripcion"],
      },
    },
    required: ["apto", "titulo", "descripcion", "cuerpo", "categoria", "evento", "hechos", "sensible", "foto"],
  },
};

export class SinCredito extends Error {}

/**
 * Pide la nota a Claude. fotoWebp (Buffer) es opcional.
 * Devuelve { nota, uso: { entrada, salida } }.
 */
export async function pedirNota({ clave, aviso, emisor, fuente, fotoWebp, fetchImpl = fetch }) {
  const contenido = [];
  if (fotoWebp) contenido.push({ type: "image", source: { type: "base64", media_type: "image/webp", data: fotoWebp.toString("base64") } });
  contenido.push({
    type: "text",
    text: `Emisor: ${emisor}\nFecha del comunicado: ${aviso.fecha}\nTítulo original: ${aviso.titulo}\nDirección: ${aviso.url}\n\n` +
      `<comunicado>\n${fuente}\n</comunicado>\n\n` +
      (fotoWebp ? "La imagen adjunta es la fotografía principal del comunicado." : "El comunicado no tiene fotografía: usa foto = null."),
  });

  const r = await fetchImpl(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": clave, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 2500,
      system: INSTRUCCIONES,
      tools: [HERRAMIENTA],
      tool_choice: { type: "tool", name: HERRAMIENTA.name },
      messages: [{ role: "user", content: contenido }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    const mensaje = cuerpo?.error?.message ?? `HTTP ${r.status}`;
    // Sin saldo, límite de gasto alcanzado o llave inválida: no tiene caso seguir intentando en esta corrida.
    if (r.status === 401 || r.status === 403 || /credit|billing|usage limit|spend/i.test(mensaje)) throw new SinCredito(mensaje);
    throw new Error(mensaje);
  }
  const uso = { entrada: cuerpo.usage?.input_tokens ?? 0, salida: cuerpo.usage?.output_tokens ?? 0 };
  const llamada = cuerpo.content?.find((c) => c.type === "tool_use");
  if (!llamada) throw new Error("la respuesta no trae la nota");
  return { nota: llamada.input, uso };
}

// Precio de Sonnet 5.5 (USD por millón de tokens), para informar el costo aproximado de cada corrida.
export const costoUSD = ({ entrada, salida }) => (entrada * 2 + salida * 10) / 1e6;
