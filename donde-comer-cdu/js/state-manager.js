/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — state-manager.js

   FASE 2 del Plan Maestro de Modularización (2026-08-06). Extraído de
   app.js §3 (Máquina de Estados y Transiciones) sin cambios de
   comportamiento. Encapsula currentState/lastStateChange/
   stateChangeLog — el segundo bloque de Fase 2 más aislado después de
   cache.js/favorites.js: solo 8 referencias a currentState en todo
   app.js, todas dentro de este mismo bloque salvo dos asignaciones
   directas (bypass deliberado de la validación, ver
   forzarEstado()/vaciarLog() más abajo) y dos getters de la API
   pública. Dependencias externas — STATE y debugLog (constants.js,
   Fase 1) y appEventBus (event-bus.js, Fase 1) — ya eran módulos ES
   antes de este paso, cero acoplamiento nuevo.
   ═══════════════════════════════════════════════════════════════════ */

import { STATE, debugLog } from './constants.js';
import { appEventBus } from './event-bus.js';

var currentState = STATE.UNINITIALIZED;
var lastStateChange = null;
var stateChangeLog = [];

var TRANSICIONES_VALIDAS = {
  'uninitialized': ['initializing'],
  'initializing': ['loading_catalog', 'error'],
  'loading_catalog': ['ready', 'error'],
  'ready': ['interaction', 'error', 'loading_subtask', 'recovery'],
  'interaction': ['ready', 'error'],
  'error': ['recovering', 'ready'],
  'recovering': ['ready', 'error'],
  'loading_subtask': ['ready', 'error'],
  'cleanup': []
};

/**
 * Valida si una transición es legal en la máquina de estados.
 */
export function puedeTransicionar(nuevoEstado) {
  var permitidas = TRANSICIONES_VALIDAS[currentState] || [];
  return permitidas.indexOf(nuevoEstado) !== -1;
}

/**
 * Transiciona la aplicación a un nuevo estado.
 * Registra la transición para debugging y ejecuta callbacks.
 */
export function transicionarEstado(nuevoEstado, razon) {
  var estadoAnterior = currentState;
  if (estadoAnterior === nuevoEstado) return; // idempotente

  if (!puedeTransicionar(nuevoEstado)) {
    console.warn('[State] Transición no declarada en el mapa: ' + estadoAnterior + ' → ' + nuevoEstado + ' (' + (razon || 'sin_razon') + '). Revisar la tabla de transiciones en puedeTransicionar() o el call site.');
  }

  currentState = nuevoEstado;
  lastStateChange = Date.now();

  if (window.URU_CONFIG && window.URU_CONFIG.debug) {
    stateChangeLog.push({
      desde: estadoAnterior,
      hacia: nuevoEstado,
      timestamp: lastStateChange,
      razon: razon || 'sin_razon'
    });

    // Guardar últimos 50 cambios para debugging
    if (stateChangeLog.length > 50) {
      stateChangeLog.shift();
    }
  }

  debugLog('[State] ' + estadoAnterior + ' → ' + nuevoEstado + ' (' + (razon || 'unknown') + ')');

  appEventBus.emit('stateChanged', {
    desde: estadoAnterior,
    hacia: nuevoEstado,
    razon: razon || 'sin_razon'
  });
}

/**
 * Obtiene el estado actual con seguridad.
 */
export function estadoActual() {
  return currentState;
}

export function obtenerUltimoCambioDeEstado() {
  return lastStateChange;
}

export function obtenerLogCambiosEstado() {
  return stateChangeLog;
}

// Usado por limpiar() (app.js): vacía el log de transiciones sin pasar
// por transicionarEstado() — mismo comportamiento que la asignación
// directa `stateChangeLog = []` que reemplaza.
export function vaciarLog() {
  stateChangeLog = [];
}

// Usado por reiniciar() (app.js): fuerza currentState sin validar
// contra TRANSICIONES_VALIDAS ni emitir stateChanged — mismo bypass
// deliberado que la asignación directa `currentState = STATE.X` que
// reemplaza (reiniciar() llama a esto después de limpiar(), que ya
// dejó el estado en CLEANUP, una transición sin salidas válidas en el
// mapa — por eso el bypass es intencional, no un descuido).
export function forzarEstado(nuevoEstado) {
  currentState = nuevoEstado;
}

