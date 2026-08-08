/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — error-recovery.js

   FASE 3 (paso 3) del Plan Maestro de Modularización (2026-08-06).
   Extraído de app.js §6 (Manejo de Errores y Recuperación): el objeto
   ErrorRecovery completo (procesar / recuperarDeCarguaCatalogo /
   registrarParaDebug — el nombre "Cargua" es un typo del código
   original, se conserva tal cual para no tocar el único call site que
   lo usa, ver app.js).

   Dependencias inyectadas explícitamente (ADR-003 del plan, mismo
   patrón que favorites.js/data-loader.js) en vez de asumidas como
   globales de app.js:
     - uiState: procesar() escribe uiState.lastErrorState; se pasa la
       instancia real (crearUIState(), Fase 2) para que la escritura
       seguida emita 'uiStateChanged' igual que antes.
     - mostrarEstadoError, cargarCatalogo: son function declarations
       de app.js (hoisted), se pasan por valor sin problema.
     - pintarEsqueleto: es la ÚNICA de las cuatro que NO es hoisted de
       verdad — es un `var pintarEsqueleto;` que recién se asigna más
       abajo en app.js (Oportunidad 3, extracción a app-tarjetas.js).
       Pasarla por valor en el punto donde antes vivía ErrorRecovery
       capturaría `undefined` (la asignación real ocurre después en el
       archivo). Por eso app.js pasa un thunk `function(){
       pintarEsqueleto(); }` en vez del valor directo — mismo binding
       tardío que tenía el closure original, sin depender de en qué
       línea se construye este módulo.

   transicionarEstado/STATE/ERROR_TYPE/ERROR_TYPES_FATALES SÍ se
   importan directo (no inyectados): son singletons de módulos ES ya
   existentes (state-manager.js, constants.js), sin ambigüedad de
   instancia como la que sí tiene uiState.
   ═══════════════════════════════════════════════════════════════════ */

import { transicionarEstado } from './state-manager.js';
import { STATE, ERROR_TYPE, ERROR_TYPES_FATALES } from './constants.js';

/**
 * @param {Object} deps
 * @param {Object} deps.uiState - instancia real de uiState (ui-state.js)
 * @param {function(string, Object):void} deps.mostrarEstadoError
 * @param {function():void} deps.pintarEsqueleto
 * @param {function():void} deps.cargarCatalogo
 */
export function crearErrorRecovery(deps) {
  var uiState = deps.uiState;
  var mostrarEstadoError = deps.mostrarEstadoError;
  var pintarEsqueleto = deps.pintarEsqueleto;
  var cargarCatalogo = deps.cargarCatalogo;

  return {
    /**
     * Procesa un error y lo registra apropiadamente.
     */
    procesar: function (error, tipoError, contexto) {
      var detalles = {
        tipo: tipoError,
        mensaje: error && error.message ? error.message : String(error),
        contexto: contexto,
        timestamp: Date.now()
      };

      console.error('[Error] ' + tipoError + ':', detalles);
      uiState.lastErrorState = detalles;

      // Ver ERROR_TYPES_FATALES (constants.js) para la justificación
      // completa: un error ya recuperado en su propio origen (p. ej.
      // ERROR_TYPE.STORAGE desde leerFavoritos/guardarFavoritos) se
      // registra para debug pero NO detiene el resto de la aplicación.
      if (ERROR_TYPES_FATALES.indexOf(tipoError) !== -1) {
        mostrarEstadoError(tipoError, detalles);
        transicionarEstado(STATE.ERROR, tipoError);
      }

      return detalles;
    },

    /**
     * Intenta recuperar de un error en la carga de catálogo.
     */
    recuperarDeCarguaCatalogo: function () {
      if (uiState.lastErrorState && uiState.lastErrorState.tipo === ERROR_TYPE.CATALOG_FETCH) {
        // Cap. 6.3 (Estados del Ambient Engine): "Error → Activo solo
        // vía reintento explícito" — este es exactamente ese reintento
        // explícito. Sin este paso, iniciarCarga() de cargarCatalogo()
        // sería un no-op (solo transiciona desde Activo) y el Ambient
        // Engine quedaría en Error para siempre.
        if (window.AmbientEngine) window.AmbientEngine.reintentar();
        transicionarEstado(STATE.RECOVERING, 'reintentando_catalogo');
        pintarEsqueleto();
        cargarCatalogo();
      }
    },

    /**
     * Registra estado de error en un lugar seguro para debugging.
     */
    registrarParaDebug: function (error, tipo) {
      try {
        var debug = JSON.parse(localStorage.getItem('uruspot_debug_errors') || '[]');
        debug.push({
          tipo: tipo,
          mensaje: error && error.message ? error.message : String(error),
          stack: error && error.stack ? error.stack.substring(0, 200) : '',
          timestamp: new Date().toISOString()
        });
        // Guardar últimos 10 errores
        if (debug.length > 10) debug.shift();
        localStorage.setItem('uruspot_debug_errors', JSON.stringify(debug));
      } catch (e) {
        // Storage puede estar bloqueado o lleno
      }
    }
  };
}

