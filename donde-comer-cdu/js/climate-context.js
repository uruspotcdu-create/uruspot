/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — climate-context.js

   FASE 3 (paso 1) del Plan Maestro de Modularización (2026-08-06).
   Extraído de app.js §20b (Contexto de Clima para el Recorte):
   actualizarClimaContexto() + climaContextoCache.

   Elegido primero dentro de Fase 3 por ser el bloque más aislado: solo
   2 usos reales de climaContextoCache fuera de su propia definición
   (uno para escribir tras el fetch, otro para leerlo en render() al
   armar contextoRecorte.clima) — mismo criterio que ya usó cache.js/
   favorites.js en Fase 2 para elegir orden de extracción.

   Contrato del plan (§7, FASE 3): "ClimateContextService.update() →
   Promise" + "cachea resultados". crearClimateContext() devuelve
   { actualizar, obtener } en vez de un singleton — mismo patrón de
   fábrica que crearDataLoader()/crearUIState(), para que el caché viva
   en un closure propio y no en un módulo-nivel compartido entre
   instancias (relevante para tests).

   render() sigue siendo dueño de decidir qué hacer con el clima
   cacheado (pasarlo a EXPO.recortePorIniciativaPropiaExplicado) — este
   módulo solo sabe "pedir el dato y guardarlo", no qué motor lo
   consume después.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * @param {Object} deps
 * @param {string} deps.url - endpoint del contexto climático
 * @param {number} deps.timeoutMs - abort del fetch si tarda más que esto
 * @returns {{ actualizar: function(function=): Promise<Object|null>, obtener: function(): Object|null }}
 */
export function crearClimateContext(deps) {
  var url = deps.url;
  var timeoutMs = deps.timeoutMs;
  var cache = null; // { weather_code, temperature_2m, precipitation } | null

  /**
   * Trae el clima actual y lo cachea. Si falla o tarda, el caché
   * simplemente queda como estaba (null la primera vez) — quien
   * consuma obtener() ya sabe tratar null como "sin señal de clima".
   *
   * @param {function(Object):void} [onActualizado] - callback opcional, se
   *   llama solo cuando el fetch trajo un dato nuevo real (para que el
   *   llamador pueda re-renderizar, mismo comportamiento que el
   *   render() al final del .then() original en app.js).
   */
  function actualizar(onActualizado) {
    if (typeof fetch !== 'function') return Promise.resolve(cache);

    var controlador = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = controlador
      ? setTimeout(function () { controlador.abort(); }, timeoutMs)
      : null;

    return fetch(url, { signal: controlador ? controlador.signal : undefined })
      .then(function (res) {
        if (timeoutId) clearTimeout(timeoutId);
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (datos) {
        var actual = datos && datos.current;
        if (!actual) return cache;
        var nuevo = {
          weather_code: actual.weather_code,
          temperature_2m: actual.temperature_2m,
          precipitation: actual.precipitation
        };
        cache = nuevo;
        if (onActualizado) onActualizado(cache);
        return cache;
      })
      .catch(function () {
        if (timeoutId) clearTimeout(timeoutId);
        return cache;
      });
  }

  function obtener() {
    return cache;
  }

  return { actualizar: actualizar, obtener: obtener };
}
