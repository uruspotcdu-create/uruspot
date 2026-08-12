/* migrate-legacy-fichas.js — migración ESTRUCTURAL (no de contenido) de
 * fichas legacy (jsonLdRaw hardcodeado a mano) a la estructura moderna
 * consolidada en BRODE: shell.negocio / shell.rubro / shell.faqItems /
 * shell.nombreCorto / shell.uruId / shell.features.
 *
 * ALCANCE DELIBERADO (sesión 2026-08, migración fase 2 del audit):
 * este script SOLO reestructura datos que YA EXISTEN en cada ficha.json
 * (extraídos de su jsonLdRaw) — no inventa historia, catálogo de
 * productos, ni preguntas frecuentes de ningún negocio real. faqItems
 * queda [] a propósito: fabricar FAQ de un negocio real sin fuente
 * sería publicar afirmaciones no verificadas sobre un tercero. cuerpo.html
 * NO se toca — sigue siendo el legacy más simple (sin barra de progreso,
 * sin grid de reseñas), eso es un proyecto de contenido aparte.
 *
 * uruId: resuelto por NOMBRE contra donde-comer-cdu/lugares-core.json
 * (1468 lugares reales), no por geo — la zona es demasiado densa y el
 * matching por lat/lng devolvía negocios vecinos incorrectos (ver
 * conversación de la sesión que generó este script). Solo se migran acá
 * los slugs con match de nombre de alta confianza, confirmados a mano
 * uno por uno contra lugares-core.json antes de correr esto — ver
 * CONFIRMADOS más abajo. Los que no tenían match confiable (7-colinas,
 * cremolatti, el-calderon, el-conventillo-de-baco, la-delfina, lucero,
 * nero-cafe, san-carlos) quedan deliberadamente afuera: mejor sin migrar
 * que con un uruId de otro negocio real asignado por error.
 *
 * features.* quedan todas en false: el cuerpo.html legacy no tiene los
 * elementos DOM (#fichaProgressFill, #fichaTopBtn, contadores) que esas
 * funcionalidades de ficha.js esperan — dejarlas en true no rompería
 * nada (ficha.js sabe convivir con su ausencia) pero tampoco activaría
 * nada real, así que se documenta el estado real en vez de un true que
 * no hace nada.
 *
 * jsonLdRaw / breadcrumbBlockRaw / faqBlockRaw / webPageBlockRaw se
 * ELIMINAN de cada ficha.json migrada: ficha-jsonld.js los regenera
 * automáticamente desde negocio/rubro/faqItems (mismo criterio que
 * faviconBlockRaw/robotsBlockRaw en el comentario_negocio de Brode —
 * campos muertos que invitan a editarlos sin efecto real una vez que el
 * generador gana). ogImageBlockRaw / colaScriptsRaw (incluyendo el
 * parche de color !important de Papa Luigi) NO se tocan en este script:
 * requieren verificación visual que este script no puede hacer, quedan
 * para una pasada aparte.
 *
 * Uso: node js/migrate-legacy-fichas.js [--dry-run]
 */
"use strict";
const fs = require("fs");
const path = require("path");

const LOCALES_DIR = path.join(__dirname, "..", "locales");
const CORE_PATH = path.join(__dirname, "..", "lugares-core.json");
const DRY_RUN = process.argv.includes("--dry-run");

// slug -> uruId, confirmados por nombre contra lugares-core.json a mano
// en la sesión que escribió este script (ver cabecera).
const CONFIRMADOS = {
  "antigua-fonda": "URU-00127", "bartolo-bar": "URU-00187", "bella-vista": "URU-00164",
  "bonhomia": "URU-00166", "bungalows-mexico": "URU-00126", "casa-del-arbol": "URU-00124",
  "cross-gimnasio": "URU-00122", "cultura-cafe": "URU-00182", "danys": "URU-00157",
  "dolores-costa": "URU-00175", "drakkar": "URU-00185", "el-arca-resto-bar": "URU-00162",
  "el-danubio-azul": "URU-00180", "faro-3260": "URU-00172", "garifo": "URU-00178",
  "gimnasio-538": "URU-00699", "helena-cafe": "URU-00183", "hoteleria-mitre": "URU-00128",
  "house-garage": "URU-00188", "italia": "URU-00159", "justo-jose": "URU-00161",
  "klug-gebrau": "URU-00186", "la-cuadra": "URU-00227", "la-ris": "URU-00167",
  "la-segunda": "URU-00174", "lo-de-juan": "URU-00191", "london-cafe": "URU-00184",
  "los-aguaribay": "URU-00125", "lucianos-gimnasio": "URU-00121", "mamma-mia": "URU-00177",
  "mi-viejo": "URU-00237", "muscle-gimnasio": "URU-00120", "panettone": "URU-00190",
  "panza-verde": "URU-00165", "papa-luigi": "URU-00163", "parada-33": "URU-00171",
  "parrilla-la-gruta": "URU-00168", "pimienta-negra": "URU-00170", "posta-torreon": "URU-00129",
  "power-gimnasio": "URU-00123", "sanduba": "URU-00169", "yelatti-artesanal": "URU-00160",
};

// grupo (lugares-core.json) -> { label, path } — mismos labels que usa
// donde-comer-cdu/js/rubros-meta.js (fuente de verdad de nombres de rubro
// en todo el sitio). path siempre /donde-comer-cdu/: es el motor único
// que sirve las 1500 fichas de todos los rubros (ver AGENTS.md §1.1),
// no solo gastronomía pese al nombre de la carpeta.
const RUBRO_POR_GRUPO = {
  gastronomia: { label: "Gastronomía", path: "/donde-comer-cdu/" },
  alojamiento: { label: "Alojamiento", path: "/donde-comer-cdu/" },
  deporte: { label: "Deporte", path: "/donde-comer-cdu/" },
};

// nombreCorto: nombre real de lugares-core.json, recortado a mano donde
// trae sufijos de marketing/ubicación que no van en un breadcrumb de 3
// niveles (ver contrato de ficha-jsonld.js: nombreCorto es texto plano
// corto, no el title completo).
const NOMBRE_CORTO_OVERRIDE = {
  "bungalows-mexico": "Bungalows México",
  "gimnasio-538": "Gimnasio 538",
};

function leerJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function limpiarAddress(a) {
  if (!a) return undefined;
  return {
    streetAddress: a.streetAddress,
    addressLocality: a.addressLocality,
    addressRegion: a.addressRegion,
    addressCountry: a.addressCountry,
  };
}

function limpiarGeo(g) {
  if (!g) return undefined;
  return { latitude: g.latitude, longitude: g.longitude };
}

function limpiarHoras(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((h) => ({ dayOfWeek: h.dayOfWeek, opens: h.opens, closes: h.closes }));
}

function migrarUna(slug, core) {
  const dir = path.join(LOCALES_DIR, slug);
  const fichaPath = path.join(dir, "ficha.json");
  const d = leerJSON(fichaPath);

  if (!d.jsonLdRaw) {
    return { slug, estado: "SKIP (ya no tiene jsonLdRaw — no es legacy o ya migrada)" };
  }

  const jl = JSON.parse(d.jsonLdRaw);
  const uruId = CONFIRMADOS[slug];
  const coreEntry = core.find((c) => c.id === uruId);
  if (!coreEntry) {
    return { slug, estado: "ERROR: uruId " + uruId + " no encontrado en lugares-core.json" };
  }

  const negocio = {
    tipo: jl["@type"],
    descripcion: jl.description,
    imagenes: Array.isArray(jl.image) ? jl.image : [jl.image].filter(Boolean),
    telefono: jl.telephone,
    priceRange: jl.priceRange,
    address: limpiarAddress(jl.address),
    geo: limpiarGeo(jl.geo),
    openingHoursSpecification: limpiarHoras(jl.openingHoursSpecification),
  };
  // podar undefined (mismo criterio que generarNegocioJsonLd en
  // ficha-jsonld.js: no emitir claves vacías/indefinidas).
  Object.keys(negocio).forEach((k) => {
    if (negocio[k] === undefined) delete negocio[k];
  });

  const rubroInfo = RUBRO_POR_GRUPO[coreEntry.grupo];
  if (!rubroInfo) {
    return { slug, estado: "ERROR: grupo desconocido '" + coreEntry.grupo + "' (agregar a RUBRO_POR_GRUPO)" };
  }

  const nombreCorto = NOMBRE_CORTO_OVERRIDE[slug] || coreEntry.nombre;

  const nuevo = Object.assign({}, d);
  nuevo.uruId = uruId;
  nuevo.negocio = negocio;
  nuevo.rubro = rubroInfo;
  nuevo.nombreCorto = nombreCorto;
  nuevo.faqItems = [];
  nuevo.features = {
    readingProgress: false,
    backToTop: false,
    animatedCounters: false,
    tiltCards: false,
  };
  nuevo._comentario_migracion_estructural =
    "[MIGRADO ESTRUCTURAL, 2026-08, migrate-legacy-fichas.js] negocio/rubro/" +
    "uruId/nombreCorto extraidos 1:1 desde el jsonLdRaw legacy (sin inventar " +
    "datos nuevos). uruId resuelto por nombre contra lugares-core.json " +
    "(id real: " + uruId + " -> " + coreEntry.nombre + "), no por geo " +
    "(la zona es demasiado densa para matching confiable por lat/lng). " +
    "faqItems queda vacio a proposito: no hay fuente real para fabricar " +
    "preguntas frecuentes de este negocio. features.* en false: cuerpo.html " +
    "de esta ficha todavia no tiene los elementos DOM que esas funcionalidades " +
    "requieren (paridad total de contenido con Brode es un trabajo aparte, " +
    "no estructural). jsonLdRaw/breadcrumbBlockRaw/faqBlockRaw/webPageBlockRaw " +
    "se eliminan: ficha-jsonld.js los regenera automaticamente desde los " +
    "campos de arriba (ver COMPATIBILIDAD en ficha-jsonld.js).";

  delete nuevo.jsonLdRaw;
  delete nuevo.breadcrumbBlockRaw;
  delete nuevo.faqBlockRaw;
  delete nuevo.webPageBlockRaw;

  if (!DRY_RUN) {
    fs.writeFileSync(fichaPath, JSON.stringify(nuevo, null, 2) + "\n", "utf8");
  }
  return { slug, estado: "OK -> " + uruId + " (" + coreEntry.nombre + ", " + coreEntry.grupo + ")" };
}

function main() {
  const core = leerJSON(CORE_PATH);
  const slugs = Object.keys(CONFIRMADOS);
  console.log(
    (DRY_RUN ? "[DRY RUN] " : "") + "Migrando " + slugs.length + " fichas legacy confirmadas...\n"
  );
  let ok = 0;
  let err = 0;
  for (const slug of slugs) {
    const r = migrarUna(slug, core);
    console.log(r.slug.padEnd(22), r.estado);
    if (r.estado.startsWith("OK")) ok++;
    else if (r.estado.startsWith("ERROR")) err++;
  }
  console.log("\n" + ok + " migradas, " + err + " con error.");
  if (err > 0) process.exitCode = 1;
}

main();
