/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — js/event-bus.js
   FASE 1 del Plan Maestro de Modularización (ARQUITECTURA_MAESTRO_APP.md
   §7). Módulo NUEVO — no existe equivalente en app.js hoy. Provee la
   interfaz on/emit/off que el documento pide como base para
   desacoplar Fase 2+ (p. ej. UIState.set() emitiendo 'uiStateChanged',
   Catalog.load() emitiendo 'catalogLoaded' — ver §7, FASE 2).

   Implementación mínima a propósito: sin namespacing de eventos, sin
   wildcard, sin prioridades. Fase 1 solo necesita que el contrato
   on/emit/off exista y esté probado — cualquier feature extra se
   agrega cuando un consumidor real de Fase 2+ lo necesite (YAGNI).
   ═══════════════════════════════════════════════════════════════════ */

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * Registra un listener para un evento.
   * @param {string} evento
   * @param {Function} handler
   * @returns {() => void} función para desuscribirse (equivalente a off(evento, handler))
   */
  on(evento, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('EventBus.on: handler debe ser una función');
    }
    if (!this._listeners.has(evento)) {
      this._listeners.set(evento, new Set());
    }
    this._listeners.get(evento).add(handler);
    return () => this.off(evento, handler);
  }

  /**
   * Registra un listener que se ejecuta una sola vez.
   * @param {string} evento
   * @param {Function} handler
   * @returns {() => void} función para desuscribirse antes de que dispare
   */
  once(evento, handler) {
    const wrapper = (...args) => {
      this.off(evento, wrapper);
      handler(...args);
    };
    return this.on(evento, wrapper);
  }

  /**
   * Quita un listener previamente registrado con on()/once().
   * @param {string} evento
   * @param {Function} handler
   */
  off(evento, handler) {
    const set = this._listeners.get(evento);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this._listeners.delete(evento);
  }

  /**
   * Emite un evento de forma síncrona a todos los listeners
   * registrados, en orden de registro. Un handler que tira excepción
   * se loguea (console.error) y NO interrumpe al resto de los
   * listeners — un módulo roto en Fase 2+ no debe poder tumbar a
   * los demás suscriptores del mismo evento.
   * @param {string} evento
   * @param {...*} args
   */
  emit(evento, ...args) {
    const set = this._listeners.get(evento);
    if (!set) return;
    // Copia defensiva: si un handler llama off()/on() sobre el mismo
    // evento durante la emisión, no debe alterar la iteración en curso.
    Array.from(set).forEach((handler) => {
      try {
        handler(...args);
      } catch (err) {
        console.error(`[EventBus] handler para "${evento}" tiró un error:`, err);
      }
    });
  }

  /**
   * Quita todos los listeners de un evento puntual, o de todos los
   * eventos si no se pasa argumento. Pensado para tests y para
   * limpiar() en el ciclo de vida de la app (ver app.js Sección 10).
   * @param {string} [evento]
   */
  clear(evento) {
    if (evento === undefined) {
      this._listeners.clear();
    } else {
      this._listeners.delete(evento);
    }
  }
}

/**
 * Instancia compartida por defecto — conveniencia para módulos que
 * solo necesitan "el" bus de la app en vez de instanciar el propio
 * (p. ej. tests). Los módulos de Fase 2+ pueden preferir recibir un
 * EventBus por parámetro (inyección explícita, ver ADR-003 del
 * documento) en vez de importar este singleton directamente.
 */
export const appEventBus = new EventBus();

export default EventBus;
