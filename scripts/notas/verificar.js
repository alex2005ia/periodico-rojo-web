// Revisiones automáticas de una nota redactada por IA, antes de publicarla sin intervención humana.
// Son reglas simples y conservadoras: si algo no se puede comprobar contra el comunicado, la nota espera revisión.

const normal = (t) =>
  String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[“”«»"]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

/** Cifras de un texto, sin separadores de miles: "1,200" → "1200"; "4.2" y "6:00" quedan como "4", "2", "6", "00". */
export function cifras(texto) {
  const sinMiles = String(texto ?? "").replace(/(\d)[,.](\d{3})(?!\d)/g, "$1$2");
  return new Set(sinMiles.match(/\d+/g) ?? []);
}

// Palabras con mayúscula que no hace falta encontrar en el comunicado.
const PERMITIDAS = new Set([
  "periodico", "rojo", "el", "la", "los", "las", "un", "una", "en", "de", "del", "con", "por", "para", "segun", "al",
  "este", "esta", "estos", "estas", "se", "su", "sus", "como", "tambien", "ademas", "hasta", "desde", "entre", "sin",
  "nuevo", "leon", "monterrey", "guadalupe", "escobedo", "general", "garcia", "san", "pedro", "garza", "nicolas",
  "mexico", "gobierno", "municipio", "municipal", "ayuntamiento", "alcalde", "alcaldesa",
  "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo",
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  "dia", "muertos", "navidad", "buen", "fin",
]);

/** Palabras con mayúscula inicial que no empiezan oración (posibles nombres propios). */
export function nombresPropios(texto) {
  const res = new Set();
  for (const oracion of String(texto ?? "").split(/(?<=[.!?:;])\s+|\n+/)) {
    const palabras = oracion.replace(/^[\s"“«(¿¡*#-]+/, "").split(/\s+/).slice(1);
    for (const p of palabras) {
      const limpia = p.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
      if (limpia.length > 2 && /^\p{Lu}/u.test(limpia) && !PERMITIDAS.has(normal(limpia))) res.add(limpia);
    }
  }
  return [...res];
}

// Temas que siempre pasan por una persona (además de lo que marque la IA). Las notas sobre niñas y niños
// (colectas, escuelas) no se detienen por eso: se publican sin foto si la IA ve menores en ella.
const DELICADOS = [
  [/\b(detenid|deteni|arrest|homicid|asesin|balacer|disparo|delito|delincuen|robo|asalt|secuestr|extorsi|narco|crimen|criminal)/, "seguridad"],
  [/\b(violencia|agresi|abuso|acoso|feminicid|lesionad)/, "violencia"],
  [/\b(accidente|choque|incendio|explosi|fallecid|fallecio|muerte de|lesionados|victima)/, "tragedia"],
  [/\b(hospital|enfermedad|cancer|oncolog|diagnost|vacun|epidemi|brote|salud mental|adiccion)/, "salud"],
  [/\b(eleccion|electoral|candidat|campana politica|partido politico|votacion|\bine\b|ieepc|morena|accion nacional|\bpri\b|movimiento ciudadano|4t)/, "elecciones"],
  [/\b(denuncia|acusa|demanda|investigacion|fiscalia|tribunal|juez|sentencia|irregularidad|corrupci)/, "acusaciones"],
];

export function temasDelicados(texto) {
  const t = normal(texto);
  return [...new Set(DELICADOS.filter(([re]) => re.test(t)).map(([, motivo]) => motivo))];
}

/**
 * Revisa la nota contra el comunicado. Devuelve la lista de problemas (vacía = se puede publicar sola).
 * nota: { titulo, descripcion, cuerpo, evento, hechos: [{dato, cita}], sensible: {es, motivos} }
 * fuente: texto del comunicado; aviso: { titulo, fecha }
 */
export function verificar(nota, fuente, aviso) {
  const problemas = [];
  const fuenteNormal = normal(fuente + "\n" + aviso.titulo);
  const texto = [nota.titulo, nota.descripcion, nota.cuerpo, nota.evento?.fecha_texto, nota.evento?.lugar].filter(Boolean).join("\n");

  // 1. Cada cifra de la nota debe estar en el comunicado (o en la fecha del comunicado).
  const permitidas = new Set([...cifras(fuente), ...cifras(aviso.titulo), ...aviso.fecha.split("-"), ...aviso.fecha.split("-").map((n) => String(Number(n)))]);
  const ajenas = [...cifras(texto)].filter((c) => !permitidas.has(c) && !permitidas.has(String(Number(c))));
  if (ajenas.length) problemas.push(`cifras que no están en el comunicado: ${ajenas.join(", ")}`);

  // 2. Cada cita que la IA dice haber usado debe aparecer literalmente.
  for (const h of nota.hechos ?? []) {
    if (!fuenteNormal.includes(normal(h.cita).replace(/^"|"$/g, ""))) problemas.push(`cita no encontrada: «${String(h.cita).slice(0, 80)}»`);
  }

  // 3. Nombres propios: deben aparecer en el comunicado.
  const ausentes = nombresPropios(texto).filter((n) => !fuenteNormal.includes(normal(n)));
  if (ausentes.length) problemas.push(`nombres que no están en el comunicado: ${ausentes.slice(0, 6).join(", ")}`);

  // 4. Evento: fechas válidas y no anteriores al comunicado.
  if (nota.evento) {
    const { inicio, fin } = nota.evento;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio ?? "") || (fin && !/^\d{4}-\d{2}-\d{2}$/.test(fin))) problemas.push("fechas del evento mal formadas");
    else if (inicio < aviso.fecha) problemas.push("el evento empieza antes de la fecha del comunicado");
    else if (fin && fin < inicio) problemas.push("el evento termina antes de empezar");
  }

  // 5. Forma: título breve y no en mayúsculas sostenidas; descripción y cuerpo con contenido.
  const palabras = nota.titulo.trim().split(/\s+/);
  if (palabras.length > 16) problemas.push("título de más de 16 palabras");
  if (nota.titulo === nota.titulo.toUpperCase()) problemas.push("título en mayúsculas");
  if ((nota.descripcion ?? "").length < 20) problemas.push("descripción muy corta");
  if ((nota.cuerpo ?? "").split(/\n\s*\n/).filter((p) => p.trim()).length < 2) problemas.push("cuerpo de menos de dos párrafos");

  return problemas;
}

/** Motivos para que una persona revise antes de publicar, aunque la nota pase las revisiones. */
export function motivosDeRevision(nota, fuente, aviso) {
  const motivos = new Set(nota.sensible?.es ? nota.sensible.motivos ?? ["delicado"] : []);
  // Se revisa el título original y lo que dice la nota, no todo el comunicado: muchos comunicados traen lemas
  // de partido ("nuestra 4T norteña") en notas de obras; la nota los quita, y si se cuelan, aquí se detectan.
  // Lo que el comunicado trate de fondo (un delito, una enfermedad) lo marca la IA en "sensible".
  const textoNota = [nota.titulo, nota.descripcion, nota.cuerpo].filter(Boolean).join("\n");
  for (const m of temasDelicados(`${aviso.titulo}\n${textoNota}`)) motivos.add(m);
  return [...motivos];
}
