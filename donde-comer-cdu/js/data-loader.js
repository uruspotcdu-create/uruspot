/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — data-loader.js

   FASE 2 (paso 6, último de la fase) del Plan Maestro de Modularización
   (2026-08-06). Extraído de app.js §11 (Carga de Datos con Resiliencia):
   fetchJSON() — fetch con reintentos automáticos, AbortController y
   tracking vía OperationManager.

   Qué NO se extrae acá, y por qué: cargarCatalogo() se queda en app.js
   a propósito. A diferencia de fetchJSON (entrada url+intentos, salida
   Promise<json>, cero dependencias de dominio), cargarCatalogo() es
   puro orquestador — arma REGISTRO desde la respuesta, transiciona la
   máquina de estados, dispara 5 funciones de pintado y render(), y
   decide qué mostrar si falla. Extraerla mezclaría "cómo se pide un
   JSON con reintentos" (servicio genérico, reusable) con "qué hace la
   app con lugares-core.json" (orquestación específica de dominio) —
   mismo criterio que ya separó establecerCatalogo() (dominio, en
   catalog.js) de fetchJSON (transporte, acá).

   OperationManager (tracking de operaciones activas/cancelación) sigue
   viviendo en app.js porque lo usan otras partes además de fetchJSON
   (p. ej. limpiar() llama OperationManager.cancelarTodas()) — se
   inyecta acá como dependencia explícita (mismo patrón ADR-003 que
   favorites.js con su callback onError) en vez de importarlo, así este
   módulo no asume que OperationManager existe como global de app.js.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Arma un fetchJSON(url, intentosRestantes) ligado a un
 * OperationManager y a la política de reintentos dados.
 *
 * @param {Object} deps
 * @param {Object} deps.operationManager - objeto con .crear(nombre, abortController) y .completar(opId)
 * @param {number} deps.retryAttempts - intentos por defecto cuando no se pasa intentosRestantes
 * @param {number} deps.retryDelayMs - espera entre reintentos
 * @returns {{ fetchJSON: function(string, number=): Promise<*> }}
 */
export function crearDataLoader(deps) {
  var operationManager = deps.operationManager;
  var intentosPorDefecto = deps.retryAttempts;
  var delayReintentoMs = deps.retryDelayMs;

  function fetchJSON(url, intentosRestantes) {
    if (intentosRestantes === undefined) intentosRestantes = intentosPorDefecto;

    var abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var opId = operationManager.crear('fetchJSON: ' + url, abortController);

    // 'no-cache' (no 'no-store'): sigue revalidando con el servidor en
    // cada pedido, pero permite que un 304 Not Modified reutilice el
    // cuerpo cacheado en vez de retransferir el JSON completo — ver
    // comentario original en app.js (auditoría de rendimiento, Fase 9).
    return fetch(url, {
      cache: 'no-cache',
      signal: abortController ? abortController.signal : undefined
    })
      .then(function (r) {
        if (!r.ok) {
          var err = new Error('HTTP ' + r.status + ' al pedir ' + url);
          err.status = r.status;
          throw err;
        }
        return r.json();
      })
      .then(function (data) {
        operationManager.completar(opId);
        return data;
      })
      .catch(function (err) {
        if (intentosRestantes > 0 && (!err.name || err.name !== 'AbortError')) {
          return new Promise(function (resolve) {
            setTimeout(resolve, delayReintentoMs);
          }).then(function () {
            return fetchJSON(url, intentosRestantes - 1);
          });
        }
        operationManager.completar(opId);
        throw err;
      });
  }

  return { fetchJSON: fetchJSON };
}

