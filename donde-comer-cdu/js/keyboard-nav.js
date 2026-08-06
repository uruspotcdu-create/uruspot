/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — keyboard-nav.js

   FASE 5 del Plan Maestro de Modularización (2026-08-06). Extraído de
   app.js §20 (Navegación por Teclado Avanzada): los atajos de teclado
   globales (Escape para salir de curaduría, Ctrl/Cmd+K para enfocar la
   búsqueda, Alt+L para enfocar la lista de rubros).

   `manejarKeydownBuscar`/`manejarKeydownPanel` (navegación con flechas
   dentro del buscador/panel) NO viven acá — se quedaron en listeners.js
   junto con `elementosNavegablesDelPanel()`, porque ya estaban cableados
   sobre `DOM.inputBuscar`/`DOM.panelDescubrimiento` con el resto de los
   listeners de esos mismos elementos (ver cabecera de listeners.js).
   Este módulo es solo el listener de teclado GLOBAL, sobre `document`.

   `actualizarClimaContexto()`/`inicializarContextoClima()`, que vivían
   "coladas" dentro de la Sección 20 original sin relación con teclado,
   NO se migran acá (ver PLAN_FASE_5_LISTENERS.md §7, opción B): ya
   fueron movidas a climate-context.js como `ClimateContext
   .inicializarActualizacionPeriodica()`.

   Mismo criterio que listeners.js (ADR-003 del plan): dependencias
   explícitas por parámetro, nada de `window.X` asumido adentro del
   módulo.

   `estado` viaja como getter/setter (`getEstado`/`setEstado`), no por
   valor — mismo motivo que en listeners.js: el `var NavegacionTeclado =
   crearNavegacionTeclado(...)` corre al parsear app.js, antes de que
   `estado` tenga su valor real asignado por validarModulos()/init().
   ═══════════════════════════════════════════════════════════════════ */

/**
 * @param {Object} deps
 * @param {Object} deps.DOM - referencias DOM reales de app.js
 * @param {Object} deps.uiState - instancia real de ui-state.js
 * @param {function():void} deps.render
 * @param {function():Object|null} deps.getEstado - lectura de `estado`
 * @param {function(Object):void} deps.setEstado - escritura de `estado`
 * @param {Object} deps.getPLANO - lectura de `PLANO` (motor-plano.js, resuelto en validarModulos())
 */
export function crearNavegacionTeclado(deps) {
  var DOM = deps.DOM;
  var uiState = deps.uiState;
  var render = deps.render;
  var getEstado = deps.getEstado;
  var setEstado = deps.setEstado;
  var getPLANO = deps.getPLANO;

  function manejarTecladoGlobal(e) {
    // Escape: salir de modal/curaduría
    if (e.key === 'Escape') {
      var estadoActual = getEstado();
      if (estadoActual && estadoActual.sesion.curaduriaActiva) {
        setEstado(getPLANO().aplicarAccion(estadoActual, 'salirCuraduria'));
        getPLANO().guardarEstado(getEstado());
        uiState.paginaTarjetas = 1;
        render();
        e.preventDefault();
      }
      return;
    }

    // Ctrl+K o Cmd+K: enfocar búsqueda
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      if (DOM.inputBuscar) {
        DOM.inputBuscar.focus();
        e.preventDefault();
      }
      return;
    }

    // Alt+L: enfocar lista de rubros
    if (e.altKey && e.key === 'l') {
      var primerChip = DOM.listaRubros && DOM.listaRubros.querySelector('[data-rubro]');
      if (primerChip) {
        primerChip.focus();
        e.preventDefault();
      }
      return;
    }
  }

  function inicializar() {
    document.addEventListener('keydown', manejarTecladoGlobal);
  }

  return {
    inicializar: inicializar,
    // exponer el handler para poder testearlo sin togglear
    // addEventListener real (mismo criterio que listeners.js/
    // dom-painter-tests.js: llamar la función directo con un evento
    // fake, no simular el DOM real).
    _handlers: {
      manejarTecladoGlobal: manejarTecladoGlobal
    }
  };
}
