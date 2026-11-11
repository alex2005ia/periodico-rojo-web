// Catálogos editoriales del periódico: municipios cubiertos y categorías de las notas.
// El orden de cada lista es el orden en que aparecen en menús y filtros.

export const MUNICIPIOS = [
  // "corto" es el nombre de uso común, para el menú.
  { id: "garcia", nombre: "García", corto: "García" },
  { id: "san-nicolas", nombre: "San Nicolás de los Garza", corto: "San Nicolás" },
  { id: "monterrey", nombre: "Monterrey", corto: "Monterrey" },
  { id: "escobedo", nombre: "General Escobedo", corto: "Escobedo" },
  { id: "san-pedro", nombre: "San Pedro Garza García", corto: "San Pedro" },
  { id: "guadalupe", nombre: "Guadalupe", corto: "Guadalupe" },
] as const;

export const CATEGORIAS = [
  { id: "cultura", nombre: "Cultura" },
  { id: "deportes", nombre: "Deportes" },
  { id: "comunidad", nombre: "Comunidad" },
  { id: "obras-y-servicios", nombre: "Obras y servicios" },
  { id: "avisos", nombre: "Avisos" },
] as const;

export type MunicipioId = (typeof MUNICIPIOS)[number]["id"];
export type CategoriaId = (typeof CATEGORIAS)[number]["id"];

export const IDS_MUNICIPIOS = MUNICIPIOS.map((m) => m.id) as [MunicipioId, ...MunicipioId[]];
export const IDS_CATEGORIAS = CATEGORIAS.map((c) => c.id) as [CategoriaId, ...CategoriaId[]];

export const nombreMunicipio = (id: string) => MUNICIPIOS.find((m) => m.id === id)?.nombre ?? id;
export const nombreCategoria = (id: string) => CATEGORIAS.find((c) => c.id === id)?.nombre ?? id;

export const SITIO = {
  nombre: "Periódico Rojo",
  lema: "La información cerca de ti",
  descripcion:
    "Noticias, eventos y avisos municipales de la zona metropolitana de Monterrey, con revisión editorial y fuentes oficiales.",
  zona: "zona metropolitana de Monterrey",
};
