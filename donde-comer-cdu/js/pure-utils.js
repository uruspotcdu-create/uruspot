/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — js/pure-utils.js
   FASE 1 del Plan Maestro de Modularización (ARQUITECTURA_MAESTRO_APP.md
   §7). Funciones 100% puras de app.js que todavía vivían inline: no
   leen `estado`, `uiState`, `DOM`, `REGISTRO` ni ningún closure de
   app.js — solo sus propios parámetros.

   NOTA IMPORTANTE: NO es la primera extracción de "funciones puras"
   de este repo. `js/app-formato.js` (Oportunidad 3, 2026-08-06) ya
   sacó otro grupo de puras (escapeHTML, cssEscape, slug, mapsHref,
   distanciaMetros, formatoDistancia, prefiereMovimientoReducido) con
   el patrón `window.AppFormato` — sin ES6. Este archivo cubre las TRES
   puras que quedaban sueltas en app.js y que la Sección 2 ("CACHE Y
   ESTADO GLOBAL") y la Sección 5 ("UTILIDADES DE RENDERIZADO
   DIFERENCIAL") todavía tenían inline:
     - calcularDistancia   (app.js, Sección 2, ~línea 226)
     - razonesPorLugarId   (app.js, Sección 5, ~línea 566)
     - hayCambioEnLista    (app.js, Sección 5, ~línea 576)

   Deliberadamente NO se incluye acá `ordenarPorCercaniaConCache` —
   aunque vive junto a calcularDistancia en la Sección 2, no es pura:
   lee y escribe `DISTANCIA_CACHE`, una variable de estado/caché
   module-level de app.js. Extraerla es tarea de Fase 2 (Estado
   Centralizado — data/cache.js), no de Fase 1.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Distancia euclidiana simple entre dos coordenadas (no geodésica).
 * Se usa como heurística rápida de ordenamiento donde no hace falta
 * precisión en metros — para eso está `distanciaMetros` en
 * app-formato.js, que sí usa la fórmula de Haversine.
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number}
 */
export function calcularDistancia(lat1, lng1, lat2, lng2) {
  return Math.sqrt(
    Math.pow(lat1 - lat2, 2) + Math.pow(lng1 - lng2, 2)
  );
}

/**
 * Fase 4 — MUST HAVE (Fase 3A §4, Fase 3D §7): reduce el resultado de
 * recortePorIniciativaPropiaExplicado() a un mapa { id: primeraRazon }
 * — razonesDesdeSeñales() siempre devuelve al menos una razón (incluye
 * un fallback genérico), así que este mapa siempre tiene entrada para
 * cada lugar del recorte, nunca queda vacío para un id presente.
 * @param {Array<{lugar: {id: any}, razones: string[]}>} lugaresConRazones
 * @returns {Object<string, string>}
 */
export function razonesPorLugarId(lugaresConRazones) {
  var mapa = {};
  (lugaresConRazones || []).forEach(function (x) {
    if (x.lugar && x.lugar.id != null && x.razones && x.razones.length) {
      mapa[x.lugar.id] = x.razones[0];
    }
  });
  return mapa;
}

/**
 * Determina si el contenido de la lista cambió significativamente.
 * Usa hash rápido de IDs de lugares (concatenación) en vez de
 * comparación profunda — barato y suficiente para decidir si vale la
 * pena volver a pintar.
 * @param {Array<{id: any}>|null} listaAnterior
 * @param {Array<{id: any}>|null} listaActual
 * @returns {boolean}
 */
export function hayCambioEnLista(listaAnterior, listaActual) {
  if (!listaAnterior || !listaActual) return true;
  if (listaAnterior.length !== listaActual.length) return true;

  var hashAnterior = listaAnterior.map(function (l) { return l.id; }).join(',');
  var hashActual = listaActual.map(function (l) { return l.id; }).join(',');
  return hashAnterior !== hashActual;
}

