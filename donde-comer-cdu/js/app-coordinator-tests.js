/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — app-coordinator-tests.js

   Plan Maestro de Modularización, Fase 7 — validación de
   crearAppCoordinator() (js/app-coordinator.js), extraído de app.js
   §4/§7/§8/§10/§23-28. Mismo patrón sin framework que el resto del
   repo (render-engine-tests.js, keyboard-nav-tests.js). Corre con:
     node js/app-coordinator-tests.js
   Sale con código 1 si algo falla (run-tests.js la integra en SUITES).

   `window`/`document` se stubean sobre `global` (mismo criterio que
   keyboard-nav-tests.js/listeners-tests.js). `document.getElementById`
   resuelve contra un mapa `_elementosPorId` controlable por test, para
   poder ejercitar validarDOM() (elementos requeridos presentes/
   faltantes) sin un DOM real.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

if (typeof global.window === 'undefined') {
  global.window = global;
}

var _elementosPorId = {};
global.document = {
  readyState: 'complete',
  getElementById: function (id) { return _elementosPorId[id] || null; },
  addEventListener: function () {},
  removeEventListener: function () {}
};

var crearAppCoordinator = require('./app-coordinator.js').crearAppCoordinator;

var fallos = 0, total = 0;
function assert(desc, cond) {
  total++;
  if (!cond) { fallos++; console.error('✗ ' + desc); }
  else console.log('✓ ' + desc);
}

var STATE = {
  UNINITIALIZED: 'UNINITIALIZED', INITIALIZING: 'INITIALIZING',
  LOADING_CATALOG: 'LOADING_CATALOG', READY: 'READY', ERROR: 'ERROR',
  CLEANUP: 'CLEANUP'
};
var ERROR_TYPE = { STATE_INVALID: 'STATE_INVALID', UNKNOWN: 'UNKNOWN' };

/**
 * Fabrica una instancia nueva de AppCoordinator con mocks controlables.
 * `overrides` permite pisar cualquier dep puntual por test sin repetir
 * todo el bloque — mismo criterio que fabricarEngine()/fabricarListeners()
 * en el resto del repo.
 */
function fabricarCoordinator(overrides) {
  overrides = overrides || {};
  var llamadas = {
    transicionarEstado: [],
    render: 0,
    cargarCatalogo: 0,
    pintarEsqueleto: 0,
    actualizarContadorGuardados: 0,
    mostrarEstadoError: 0,
    procesarError: [],
    cancelarTodas: 0,
    reiniciarCache: 0,
    vaciarLogEstado: 0,
    accesibilidadLimpiar: 0
  };

  var DOM = overrides.DOM || {};
  var estadoActualVal = { valor: overrides.estadoInicial || STATE.UNINITIALIZED };
  var estadoSesion = { valor: overrides.estadoSesionInicial !== undefined ? overrides.estadoSesionInicial : null };
  var modulos = { PLANO: null, EXPO: null, MAPA: null };

  var PLANO_REAL = Object.assign({
    leerEstado: function () { return { sesion: {} }; },
    registrarApertura: function (e) { return e; },
    guardarEstado: function () {}
  }, overrides.PLANO || {});

  var deps = Object.assign({
    CIUDAD: 'concepcion-del-uruguay',
    STATE: STATE,
    ERROR_TYPE: ERROR_TYPE,
    FOCUS_TRAP_DELAY_MS: 10,
    CLIMA_CONTEXTO_INTERVALO_MS: 1000,
    debugLog: function () {},

    obtenerRegistro: overrides.obtenerRegistro || function () { return []; },
    obtenerPorId: overrides.obtenerPorId || function () { return null; },

    estadoActual: function () { return estadoActualVal.valor; },
    transicionarEstado: function (nuevo, motivo) {
      llamadas.transicionarEstado.push(nuevo);
      estadoActualVal.valor = nuevo;
    },
    forzarEstado: function (nuevo) { estadoActualVal.valor = nuevo; },
    puedeTransicionar: function () { return true; },
    obtenerUltimoCambioDeEstado: function () { return null; },
    obtenerLogCambiosEstado: function () { return []; },
    vaciarLogEstado: function () { llamadas.vaciarLogEstado++; },

    DOM: DOM,
    REQUIRED_DOM_IDS: overrides.REQUIRED_DOM_IDS || ['inputBuscar'],
    OPTIONAL_DOM_IDS: overrides.OPTIONAL_DOM_IDS || ['btnLimpiarBusqueda'],

    uiState: overrides.uiState || { filtroRubroActivo: null, visualState: 'idle' },
    activeOperations: overrides.activeOperations || {},

    getEstado: function () { return estadoSesion.valor; },
    setEstado: function (nuevo) { estadoSesion.valor = nuevo; },
    setPLANO: function (v) { modulos.PLANO = v; },
    setEXPO: function (v) { modulos.EXPO = v; },
    setMAPA: function (v) { modulos.MAPA = v; },
    getPLANO: function () { return modulos.PLANO; },
    getEXPO: function () { return modulos.EXPO; },
    getMAPA: function () { return modulos.MAPA; },

    obtenerDynamicElements: overrides.obtenerDynamicElements || function () { return {}; },
    resetDynamicElements: overrides.resetDynamicElements || function () {},

    ErrorRecovery: Object.assign({
      procesar: function (e, tipo, origen) { llamadas.procesarError.push({ tipo: tipo, origen: origen }); }
    }, overrides.ErrorRecovery || {}),

    leerFavoritos: overrides.leerFavoritos || function () { return {}; },
    guardarFavoritos: overrides.guardarFavoritos || function () {},
    actualizarContadorGuardados: function () { llamadas.actualizarContadorGuardados++; },
    pintarEsqueleto: function () { llamadas.pintarEsqueleto++; },

    Listeners: Object.assign({ inicializar: function () {}, programarPeriodica: function () {} }, overrides.Listeners || {}),
    NavegacionTeclado: Object.assign({ inicializar: function () {} }, overrides.NavegacionTeclado || {}),

    inicializarGeolocation: overrides.inicializarGeolocation || function () {},
    activarCercaDeMi: overrides.activarCercaDeMi || function () {},
    desactivarCercaDeMi: overrides.desactivarCercaDeMi || function () {},

    ClimateContext: Object.assign({ inicializarActualizacionPeriodica: function () { return null; } }, overrides.ClimateContext || {}),
    cargarMotorAmbientalDiferido: overrides.cargarMotorAmbientalDiferido || function () {},
    promoverCssEditorialDiferido: overrides.promoverCssEditorialDiferido || function () {},
    cargarCatalogo: function () { llamadas.cargarCatalogo++; },

    mostrarEstadoError: function () { llamadas.mostrarEstadoError++; },

    render: function () { llamadas.render++; },
    RenderEngine: Object.assign({ reiniciarCache: function () { llamadas.reiniciarCache++; } }, overrides.RenderEngine || {}),
    OperationManager: Object.assign({
      cancelarTodas: function () { llamadas.cancelarTodas++; },
      contarActivas: function () { return 0; }
    }, overrides.OperationManager || {})
  }, overrides.deps || {});

  // Sin window.URU_PLANO/URU_EXPOSICION/URU_MAPA salvo que el test los
  // pise explícitamente — validarModulos() los lee de ahí.
  window.URU_PLANO = overrides.URU_PLANO !== undefined ? overrides.URU_PLANO : PLANO_REAL;
  window.URU_EXPOSICION = overrides.URU_EXPOSICION !== undefined ? overrides.URU_EXPOSICION : {};
  window.URU_MAPA = overrides.URU_MAPA !== undefined ? overrides.URU_MAPA : {};

  var coordinator = crearAppCoordinator(deps);
  return { coordinator: coordinator, llamadas: llamadas, estadoActualVal: estadoActualVal, estadoSesion: estadoSesion, modulos: modulos, DOM: DOM };
}

// ─────────────────────────────────────────────────────────────────────
// validarModulos()
// ─────────────────────────────────────────────────────────────────────

(function () {
  var f = fabricarCoordinator({ URU_PLANO: { x: 1 }, URU_EXPOSICION: { y: 1 }, URU_MAPA: { z: 1 } });
  f.coordinator.validarModulos();
  assert('validarModulos(): con los 3 módulos presentes no tira', true);
  assert('validarModulos(): escribe PLANO de vuelta en app.js vía setPLANO', f.modulos.PLANO.x === 1);
  assert('validarModulos(): escribe EXPO de vuelta en app.js vía setEXPO', f.modulos.EXPO.y === 1);
  assert('validarModulos(): escribe MAPA de vuelta en app.js vía setMAPA', f.modulos.MAPA.z === 1);
})();

(function () {
  var f = fabricarCoordinator({ URU_PLANO: null, URU_EXPOSICION: { y: 1 }, URU_MAPA: { z: 1 } });
  var tiro = false, mensaje = '';
  try { f.coordinator.validarModulos(); } catch (e) { tiro = true; mensaje = e.message; }
  assert('validarModulos(): con URU_PLANO faltante, tira Error', tiro);
  assert('validarModulos(): el mensaje de error nombra el módulo faltante', mensaje.indexOf('URU_PLANO') > -1);
})();

// ─────────────────────────────────────────────────────────────────────
// validarDOM()
// ─────────────────────────────────────────────────────────────────────

(function () {
  _elementosPorId = { inputBuscar: { id: 'inputBuscar' } };
  var f = fabricarCoordinator({ REQUIRED_DOM_IDS: ['inputBuscar'], OPTIONAL_DOM_IDS: ['btnLimpiarBusqueda'] });
  var resultado = f.coordinator.validarDOM();
  assert('validarDOM(): con el elemento requerido presente, devuelve true', resultado === true);
  assert('validarDOM(): puebla DOM[id] para el requerido encontrado', f.DOM.inputBuscar && f.DOM.inputBuscar.id === 'inputBuscar');
  assert('validarDOM(): un opcional ausente NO frena el arranque (no está en DOM)', !f.DOM.btnLimpiarBusqueda);
})();

(function () {
  _elementosPorId = {};
  var f = fabricarCoordinator({ REQUIRED_DOM_IDS: ['inputBuscar', 'panelDescubrimiento'] });
  var tiro = false, mensaje = '';
  try { f.coordinator.validarDOM(); } catch (e) { tiro = true; mensaje = e.message; }
  assert('validarDOM(): con requeridos faltantes, tira Error', tiro);
  assert('validarDOM(): el mensaje lista los ids faltantes', mensaje.indexOf('inputBuscar') > -1 && mensaje.indexOf('panelDescubrimiento') > -1);
})();

// ─────────────────────────────────────────────────────────────────────
// inicializarEstado()
// ─────────────────────────────────────────────────────────────────────

(function () {
  _elementosPorId = { inputBuscar: {} };
  var f = fabricarCoordinator({
    URU_PLANO: {
      leerEstado: function () { return { sesion: { curaduriaActiva: false } }; },
      registrarApertura: function (e) { return Object.assign({}, e, { abierta: true }); },
      guardarEstado: function () {}
    }
  });
  f.coordinator.validarModulos();
  var ok = f.coordinator.inicializarEstado();
  assert('inicializarEstado(): camino feliz devuelve true', ok === true);
  assert('inicializarEstado(): escribe el estado resuelto vía setEstado', f.estadoSesion.valor && f.estadoSesion.valor.abierta === true);
  assert('inicializarEstado(): llama actualizarContadorGuardados()', f.llamadas.actualizarContadorGuardados === 1);
})();

(function () {
  var f = fabricarCoordinator({
    URU_PLANO: {
      leerEstado: function () { throw new Error('localStorage no disponible'); },
      registrarApertura: function (e) { return e; },
      guardarEstado: function () {}
    }
  });
  f.coordinator.validarModulos();
  var ok = f.coordinator.inicializarEstado();
  assert('inicializarEstado(): si PLANO.leerEstado() tira, devuelve false', ok === false);
  assert('inicializarEstado(): reporta el error a ErrorRecovery con STATE_INVALID',
    f.llamadas.procesarError.length === 1 && f.llamadas.procesarError[0].tipo === ERROR_TYPE.STATE_INVALID);
})();

// ─────────────────────────────────────────────────────────────────────
// ValidacionSuite
// ─────────────────────────────────────────────────────────────────────

(function () {
  var f = fabricarCoordinator({
    estadoSesionInicial: null,
    obtenerRegistro: function () { return [{ id: 'a' }, { id: 'b' }]; }
  });
  var ok = f.coordinator.ValidacionSuite.validarEstado();
  assert('ValidacionSuite.validarEstado(): estado null con REGISTRO no vacío es inválido', ok === false);
})();

(function () {
  var f = fabricarCoordinator({
    estadoSesionInicial: { sesion: {} },
    obtenerRegistro: function () { return [{ id: 'a', grupo: 'gastronomia' }]; },
    uiState: { filtroRubroActivo: 'inexistente' }
  });
  var ok = f.coordinator.ValidacionSuite.validarEstado();
  assert('ValidacionSuite.validarEstado(): filtroRubroActivo que no existe en REGISTRO es inválido', ok === false);
})();

(function () {
  var f = fabricarCoordinator({
    estadoSesionInicial: { sesion: {} },
    obtenerRegistro: function () { return [{ id: 'a', grupo: 'gastronomia' }]; },
    uiState: { filtroRubroActivo: 'gastronomia' },
    leerFavoritos: function () { return {}; },
    DOM: { contadorCuraduria: { textContent: '0' } }
  });
  var ok = f.coordinator.ValidacionSuite.validarEstado();
  assert('ValidacionSuite.validarEstado(): estado consistente es válido', ok === true);
})();

(function () {
  var guardados = null;
  var f = fabricarCoordinator({
    estadoSesionInicial: { sesion: {} },
    leerFavoritos: function () { return { huerfano: true, real: true }; },
    obtenerPorId: function (id) { return id === 'real' ? { id: 'real' } : null; },
    guardarFavoritos: function (favs) { guardados = favs; }
  });
  f.coordinator.ValidacionSuite.reparar();
  assert('ValidacionSuite.reparar(): borra favoritos huérfanos (sin match en catálogo)', guardados && guardados.huerfano === undefined);
  assert('ValidacionSuite.reparar(): conserva favoritos que sí existen en catálogo', guardados && guardados.real === true);
})();

// ─────────────────────────────────────────────────────────────────────
// AccesibilidadManager
// ─────────────────────────────────────────────────────────────────────

(function () {
  var elFocuseado = null;
  var elFalso = { focus: function () { elFocuseado = this; } };
  var f = fabricarCoordinator({});
  var id = f.coordinator.AccesibilidadManager.guardarFoco(elFalso);
  f.coordinator.AccesibilidadManager.restaurarFoco(id);
  assert('AccesibilidadManager: guardarFoco()/restaurarFoco() hacen roundtrip sobre el mismo elemento', elFocuseado === elFalso);
})();

(function () {
  _elementosPorId = {};
  var estadoResultados = { textContent: '' };
  var f = fabricarCoordinator({ DOM: { estadoResultados: estadoResultados } });
  f.coordinator.AccesibilidadManager.anunciar('3 resultados');
  assert('AccesibilidadManager.anunciar(): escribe en DOM.estadoResultados.textContent', estadoResultados.textContent === '3 resultados');
})();

// ─────────────────────────────────────────────────────────────────────
// inicializar() / limpiar() / reiniciar() — flujo completo
// ─────────────────────────────────────────────────────────────────────

(function () {
  _elementosPorId = { inputBuscar: {} };
  var f = fabricarCoordinator({
    URU_PLANO: {
      leerEstado: function () { return { sesion: {} }; },
      registrarApertura: function (e) { return e; },
      guardarEstado: function () {}
    }
  });
  f.coordinator.init();
  assert('inicializar(): transiciona INITIALIZING → LOADING_CATALOG en orden',
    f.llamadas.transicionarEstado[0] === STATE.INITIALIZING &&
    f.llamadas.transicionarEstado[f.llamadas.transicionarEstado.length - 1] === STATE.LOADING_CATALOG);
  assert('inicializar(): pinta el esqueleto antes de cargar el catálogo', f.llamadas.pintarEsqueleto === 1);
  assert('inicializar(): termina llamando cargarCatalogo() una vez', f.llamadas.cargarCatalogo === 1);
})();

(function () {
  _elementosPorId = { inputBuscar: {} };
  var f = fabricarCoordinator({ estadoInicial: STATE.READY });
  f.coordinator.init();
  assert('inicializar(): si ya se intentó inicializar (!= UNINITIALIZED), no hace nada', f.llamadas.transicionarEstado.length === 0);
})();

(function () {
  // inicializarEstado() falla -> init() debe frenar antes de pintarEsqueleto()/cargarCatalogo().
  _elementosPorId = { inputBuscar: {} };
  var f = fabricarCoordinator({
    URU_PLANO: {
      leerEstado: function () { throw new Error('estado corrupto'); },
      registrarApertura: function (e) { return e; },
      guardarEstado: function () {}
    }
  });
  f.coordinator.init();
  assert('inicializar(): si inicializarEstado() falla, NO sigue de largo (no pinta esqueleto)', f.llamadas.pintarEsqueleto === 0);
  assert('inicializar(): si inicializarEstado() falla, NO carga el catálogo', f.llamadas.cargarCatalogo === 0);
})();

(function () {
  var f = fabricarCoordinator({ estadoInicial: STATE.READY, activeOperations: { permanenciaTimer: 123, otro: null } });
  f.coordinator.destroy();
  assert('limpiar(): transiciona a CLEANUP', f.llamadas.transicionarEstado.indexOf(STATE.CLEANUP) > -1);
  assert('limpiar(): cancela todas las operaciones activas', f.llamadas.cancelarTodas === 1);
  assert('limpiar(): resetea la cache de RenderEngine', f.llamadas.reiniciarCache === 1);
  assert('limpiar(): vacía el log de la máquina de estados', f.llamadas.vaciarLogEstado === 1);
})();

(function () {
  _elementosPorId = { inputBuscar: {} };
  var f = fabricarCoordinator({
    estadoInicial: STATE.READY,
    URU_PLANO: {
      leerEstado: function () { return { sesion: {} }; },
      registrarApertura: function (e) { return e; },
      guardarEstado: function () {}
    }
  });
  f.coordinator.restart();
  assert('reiniciar(): limpia, fuerza UNINITIALIZED y vuelve a inicializar (llega a cargarCatalogo)', f.llamadas.cargarCatalogo === 1);
})();

// ─────────────────────────────────────────────────────────────────────
// api pública (window.URU_APP)
// ─────────────────────────────────────────────────────────────────────

(function () {
  var f = fabricarCoordinator({});
  var api = f.coordinator.api;
  assert('api: expone init/destroy/restart', typeof api.init === 'function' && typeof api.destroy === 'function' && typeof api.restart === 'function');
  assert('api: expone LifecycleHooks con on/off/fire', api.LifecycleHooks && typeof api.LifecycleHooks.on === 'function');
  assert('api: version/buildDate son las metadatas fijas esperadas', api.version === '2.3.0' && api.buildDate === '2026-07-25');
})();

(function () {
  var favs = { '1': true };
  var f = fabricarCoordinator({
    leerFavoritos: function () { return favs; },
    guardarFavoritos: function (nuevos) { favs = nuevos; }
  });
  var resultado = f.coordinator.api.toggleFavorite('1');
  assert('api.toggleFavorite(): invierte el favorito y persiste', resultado === false && favs['1'] === false);
  assert('api.toggleFavorite(): actualiza el contador de guardados', f.llamadas.actualizarContadorGuardados === 1);
})();

(function () {
  var uiState = { consultaActual: '', filtroRubroActivo: null };
  var f = fabricarCoordinator({ uiState: uiState, DOM: { inputBuscar: { value: '' } } });
  f.coordinator.api.buscar('pizza');
  assert('api.buscar(): setea uiState.consultaActual', uiState.consultaActual === 'pizza');
  assert('api.buscar(): sincroniza el input real', f.DOM.inputBuscar.value === 'pizza');
  assert('api.buscar(): dispara un render()', f.llamadas.render === 1);
})();

(function () {
  var activado = null;
  var f = fabricarCoordinator({
    obtenerDynamicElements: function () { return { btnCercaDeMi: { id: 'btn-real' } }; },
    activarCercaDeMi: function (btn) { activado = btn; }
  });
  f.coordinator.api.activarCercaDeMi();
  assert('api.activarCercaDeMi(): resuelve el botón real vía obtenerDynamicElements() (no una copia vieja)', activado && activado.id === 'btn-real');
})();

// ─────────────────────────────────────────────────────────────────────
// arrancar() — punto de entrada
// ─────────────────────────────────────────────────────────────────────

(function () {
  _elementosPorId = { inputBuscar: {} };
  global.document.readyState = 'complete';
  var pagehideHandlers = [];
  global.window.addEventListener = function (tipo, fn) { if (tipo === 'pagehide') pagehideHandlers.push(fn); };
  var f = fabricarCoordinator({
    URU_PLANO: {
      leerEstado: function () { return { sesion: {} }; },
      registrarApertura: function (e) { return e; },
      guardarEstado: function () {}
    }
  });
  f.coordinator.arrancar();
  assert('arrancar(): con document.readyState=complete, corre inicializar() de inmediato', f.llamadas.cargarCatalogo === 1);
  assert('arrancar(): registra un listener de pagehide para el cleanup', pagehideHandlers.length === 1);

  pagehideHandlers[0]({ persisted: false });
  assert('arrancar(): pagehide sin bfcache (persisted=false) corre limpiar()', f.llamadas.cancelarTodas === 1);
})();

(function () {
  _elementosPorId = { inputBuscar: {} };
  global.document.readyState = 'complete';
  global.window.addEventListener = function (tipo, fn) {
    if (tipo === 'pagehide') { this._pagehide = fn; }
  }.bind({});
  var pagehideHandler = null;
  global.window.addEventListener = function (tipo, fn) { if (tipo === 'pagehide') pagehideHandler = fn; };
  var f = fabricarCoordinator({
    URU_PLANO: {
      leerEstado: function () { return { sesion: {} }; },
      registrarApertura: function (e) { return e; },
      guardarEstado: function () {}
    }
  });
  f.coordinator.arrancar();
  pagehideHandler({ persisted: true });
  assert('arrancar(): pagehide CON bfcache (persisted=true) NO corre limpiar() (no destruye estado vivo en memoria)', f.llamadas.cancelarTodas === 0);
})();

console.log('\n' + (total - fallos) + '/' + total + ' pruebas de app-coordinator OK');
if (fallos > 0) {
  console.error(fallos + ' prueba(s) fallaron.');
  process.exit(1);
}

