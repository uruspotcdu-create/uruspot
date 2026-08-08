/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — ui-state.js

   FASE 2 (paso 5) del Plan Maestro de Modularización (2026-08-06).
   Extraído de app.js §2 (Cache y Estado Global): el objeto `uiState`
   (estado de sesión local — consulta, filtros, paginación, etc.).

   A diferencia de catalog.js/favorites.js/cache.js (que reemplazaron
   el acceso directo por funciones obtenerX()/set...()), acá se elige
   otra estrategia: crearUIState() devuelve el mismo objeto plano de
   siempre envuelto en un Proxy. app.js sigue leyendo y escribiendo
   `uiState.consultaActual`, `uiState.paginaTarjetas = 1`, etc. exacto
   igual que antes — son 115+ usos dispersos en más de 20 funciones,
   reescribir cada uno a getters/setters explícitos multiplicaría el
   riesgo de este paso por poco beneficio real (a diferencia de
   REGISTRO/porId, que solo tenían 20 call sites y un único punto de
   escritura).

   Lo que SÍ cambia, y es el objetivo real de este paso (ver
   ARQUITECTURA_MAESTRO_APP.md §7, FASE 2, contrato "UIState.set/get/
   merge con eventos"): cada asignación a una propiedad — sin importar
   si el código de app.js la hace vía `uiState.x = y` directo o vía
   setUIState()/mergeUIState() — ahora emite 'uiStateChanged' en
   appEventBus. Nadie escucha ese evento todavía (Fase 3+ lo usará
   para desacoplar render() de uiState directo); emitirlo ya desde
   ahora deja el contrato cumplido sin esperar a ese consumidor.

   setUIState()/mergeUIState() se exportan para código NUEVO (a partir
   de acá) que prefiera la API explícita del plan en vez de asignación
   directa — ambos caminos son equivalentes porque pasan por el mismo
   Proxy.
   ═══════════════════════════════════════════════════════════════════ */

import { VISUAL_STATE } from './constants.js';
import { appEventBus } from './event-bus.js';

export function crearUIState() {
  var estado = {
    consultaActual: '',
    filtroRubroActivo: null,
    ubicacionUsuario: null,
    cercaTuyoActivo: false,
    verCatalogoCompleto: false,
    paginaTarjetas: 1,
    ultimaRamaRenderizada: null,
    visualState: VISUAL_STATE.LOADING,
    lastErrorState: null,
    focusedElement: null,
    scrollPosition: 0,
    cartasActuales: [], // referencia a tarjetas pintadas para reconciliación

    // Fase 4 — Journey/UX (URUSPOT-PENDIENTES-VERIFICADO-287.md §2/§3):
    // "Mostrar más" como nueva tanda real. `tandaRecorte` acumula lo
    // ya mostrado por iniciativa propia (Guía/Exploración) para que
    // "ver más sugerencias" pida al motor una tanda NUEVA excluyendo
    // lo ya visto, en vez de solo revelar más de la misma lista — ver
    // render() y manejarClickPanel(). Se reinicia solo: cuando cambia
    // la rama de recorte (clave = región + rubro activo), ver render().
    tandaRecorte: null, // { clave, lista:[], razones:{}, hayMasCandidatos:bool }
    pedirMasRecorte: false, // true solo durante el render() que sigue al click de "ver más sugerencias"

    // Fase 4 — "Sorprendeme" (hallazgo "serendipia sin control
    // explícito"): activo/inactivo como cualquier otro filtro de la
    // sesión (mismo patrón que cercaTuyoActivo). `sorpresaSeed` crece
    // en cada click para que pedir sorpresa dos veces no muestre la
    // misma selección (ver motor-exposicion.js: calcularRecorteInterno).
    sorprendemeActivo: false,
    sorpresaSeed: 0
  };

  return new Proxy(estado, {
    set: function (target, prop, value) {
      var anterior = target[prop];
      target[prop] = value;
      if (anterior !== value) {
        appEventBus.emit('uiStateChanged', { prop: prop, anterior: anterior, actual: value });
      }
      return true;
    }
  });
}

// API explícita opcional (ver comentario de cabecera) — equivalente
// a la asignación directa, mismo Proxy, mismo evento emitido.
export function setUIState(uiState, prop, value) {
  uiState[prop] = value;
}

export function mergeUIState(uiState, cambios) {
  Object.keys(cambios).forEach(function (k) {
    uiState[k] = cambios[k];
  });
}

