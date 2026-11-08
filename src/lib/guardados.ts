// Expedientes guardados por la persona en este navegador. No se sincronizan ni notifican.
// Si el navegador bloquea el almacenamiento (modo privado, datos borrados), simplemente no se guardan.
const LLAVE = "periodico-rojo:proyectos-guardados";

export function guardados(): Set<string> {
  try {
    const crudo = localStorage.getItem(LLAVE);
    const lista = crudo ? JSON.parse(crudo) : [];
    return new Set(Array.isArray(lista) ? lista.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function alternar(slug: string): boolean {
  const actual = guardados();
  const activo = !actual.has(slug);
  if (activo) actual.add(slug);
  else actual.delete(slug);
  try {
    localStorage.setItem(LLAVE, JSON.stringify([...actual]));
  } catch {
    /* almacenamiento no disponible */
  }
  return activo;
}
