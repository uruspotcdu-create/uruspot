/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — keyboard-nav-tests.js

   Plan Maestro de Modularización, Fase 5 — validación de
   crearNavegacionTeclado() (js/keyboard-nav.js), extraído de app.js §20
   (Navegación por Teclado Avanzada). Mismo patrón sin framework que
   listeners-tests.js/dom-painter-tests.js. Corre con:
     node js/keyboard-nav-tests.js
   Sale con código 1 si algo falla (run-tests.js la integra en SUITES).

   DOM falso: mismo `crearElementoFalso()` (versión acotada — este
   módulo solo necesita `.focus()`, `.querySelector()`) que
   listeners-tests.js. `window`/`document` se stubean sobre `global`
   (mismo criterio que listeners-tests.js/render-engine-tests.js).
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

if (typeof global.window === 'undefined') {
  global.window = global;
}

var _listenersRegistrados = [];
global.document = {
  addEventListener: function (tipo, fn) { _listenersRegistrados.push({ tipo: tipo, fn: fn }); },
  removeEventListener: function () {}
};

var crearNavegacionTeclado = require('./keyboard-nav.js').crearNavegacionTeclado;

var fallos = 0, total = 0;
function assert(desc, cond) {
  total++;
  if (!cond) { fallos++; console.error('✗ ' + desc); }
  else console.log('✓ ' + desc);
}

/**
 * Elemento DOM falso mínimo: solo lo que keyboard-nav.js toca
 * (`focus()`, `querySelector()`). Mismo criterio de extensión por
 * `overrides` que `crearElementoFalso()` en listeners-tests.js.
 */
function crearElementoFalso(opts) {
  opts = opts || {};
  var el = {
    focus: function () { this._focused = true; },
    querySelector: function () { return opts.querySelectorResult || null; }
  };
  return Object.assign(el, opts.overrides || {});
}

/**
 * Fabrica una instancia nueva de NavegacionTeclado con DOM falso y
 * mocks controlables. Mismo criterio que `fabricarListeners()`.
 */
function fabricarNavegacionTeclado(overrides) {
  overrides = overrides || {};

  var DOM = Object.assign({
    inputBuscar: crearElementoFalso(),
    listaRubros: crearElementoFalso()
  }, overrides.DOM || {});

  var uiState = Object.assign({
    paginaTarjetas: 3
  }, overrides.uiState || {});

  var llamadas = { render: 0, guardarEstado: 0 };

  var estadoInterno = overrides.estadoInicial !== undefined
    ? overrides.estadoInicial
    : { sesion: { curaduriaActiva: false } };

  var PLANO_REAL = Object.assign({
    aplicarAccion: function (est, accion) {
      // Mismo criterio de fake que listeners-tests.js: no muta,
      // registra qué acción se aplicó.
      return Object.assign({}, est, {
        sesion: Object.assign({}, est ? est.sesion : {}, {
          curaduriaActiva: accion === 'salirCuraduria' ? false : (est ? est.sesion.curaduriaActiva : false)
        }),
        ultimaAccion: accion
      });
    },
    guardarEstado: function () { llamadas.guardarEstado++; }
  }, overrides.PLANO || {});

  var navegacionTeclado = crearNavegacionTeclado(Object.assign({
    DOM: DOM,
    uiState: uiState,
    render: function () { llamadas.render++; },
    getEstado: function () { return estadoInterno; },
    setEstado: function (nuevo) { estadoInterno = nuevo; },
    getPLANO: function () { return PLANO_REAL; }
  }, overrides.deps || {}));

  return {
    navegacionTeclado: navegacionTeclado, DOM: DOM, uiState: uiState,
    llamadas: llamadas, getEstado: function () { return estadoInterno; }
  };
}

function crearEventoTeclado(overrides) {
  var prevenido = false;
  var e = Object.assign({
    key: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    preventDefault: function () { prevenido = true; }
  }, overrides || {});
  e._fuePrevenido = function () { return prevenido; };
  return e;
}

/* ═══════════════════════════════════════════════════════════════════
   manejarTecladoGlobal — Escape
   ═══════════════════════════════════════════════════════════════════ */

// BLOQUE — Escape con curaduría activa: sale de curaduría
(function () {
  var f = fabricarNavegacionTeclado({ estadoInicial: { sesion: { curaduriaActiva: true } } });
  var e = crearEventoTeclado({ key: 'Escape' });
  f.navegacionTeclado._handlers.manejarTecladoGlobal(e);
  assert('Escape con curaduría activa: aplica "salirCuraduria"', f.getEstado().ultimaAccion === 'salirCuraduria');
  assert('Escape con curaduría activa: guarda el estado', f.llamadas.guardarEstado === 1);
  assert('Escape con curaduría activa: reinicia paginaTarjetas a 1', f.uiState.paginaTarjetas === 1);
  assert('Escape con curaduría activa: dispara render()', f.llamadas.render === 1);
  assert('Escape con curaduría activa: hace preventDefault', e._fuePrevenido() === true);
})();

// BLOQUE — Escape sin curaduría activa: no hace nada
(function () {
  var f = fabricarNavegacionTeclado({ estadoInicial: { sesion: { curaduriaActiva: false } } });
  var e = crearEventoTeclado({ key: 'Escape' });
  f.navegacionTeclado._handlers.manejarTecladoGlobal(e);
  assert('Escape sin curaduría activa: no dispara render()', f.llamadas.render === 0);
  assert('Escape sin curaduría activa: no guarda estado', f.llamadas.guardarEstado === 0);
  assert('Escape sin curaduría activa: no hace preventDefault', e._fuePrevenido() === false);
})();

/* ═══════════════════════════════════════════════════════════════════
   manejarTecladoGlobal — Ctrl/Cmd+K
   ═══════════════════════════════════════════════════════════════════ */

// BLOQUE — Ctrl+K enfoca la búsqueda
(function () {
  var f = fabricarNavegacionTeclado();
  var e = crearEventoTeclado({ key: 'k', ctrlKey: true });
  f.navegacionTeclado._handlers.manejarTecladoGlobal(e);
  assert('Ctrl+K: enfoca el input de búsqueda', f.DOM.inputBuscar._focused === true);
  assert('Ctrl+K: hace preventDefault', e._fuePrevenido() === true);
})();

// BLOQUE — Cmd+K (metaKey) también enfoca la búsqueda
(function () {
  var f = fabricarNavegacionTeclado();
  var e = crearEventoTeclado({ key: 'k', metaKey: true });
  f.navegacionTeclado._handlers.manejarTecladoGlobal(e);
  assert('Cmd+K: enfoca el input de búsqueda', f.DOM.inputBuscar._focused === true);
})();

// BLOQUE — "k" sin Ctrl/Cmd no hace nada (no es atajo)
(function () {
  var f = fabricarNavegacionTeclado();
  var e = crearEventoTeclado({ key: 'k' });
  f.navegacionTeclado._handlers.manejarTecladoGlobal(e);
  assert('"k" suelta: no enfoca la búsqueda', f.DOM.inputBuscar._focused === undefined);
  assert('"k" suelta: no hace preventDefault', e._fuePrevenido() === false);
})();

// BLOQUE — Ctrl+K sin DOM.inputBuscar disponible: no rompe (fail-open)
(function () {
  var f = fabricarNavegacionTeclado({ DOM: { inputBuscar: null, listaRubros: crearElementoFalso() } });
  var e = crearEventoTeclado({ key: 'k', ctrlKey: true });
  var lanzo = false;
  try { f.navegacionTeclado._handlers.manejarTecladoGlobal(e); } catch (err) { lanzo = true; }
  assert('Ctrl+K sin inputBuscar: no lanza excepción', lanzo === false);
  assert('Ctrl+K sin inputBuscar: no hace preventDefault', e._fuePrevenido() === false);
})();

/* ═══════════════════════════════════════════════════════════════════
   manejarTecladoGlobal — Alt+L
   ═══════════════════════════════════════════════════════════════════ */

// BLOQUE — Alt+L enfoca el primer chip de rubro
(function () {
  var primerChip = crearElementoFalso();
  var f = fabricarNavegacionTeclado({ DOM: { listaRubros: crearElementoFalso({ querySelectorResult: primerChip }) } });
  var e = crearEventoTeclado({ key: 'l', altKey: true });
  f.navegacionTeclado._handlers.manejarTecladoGlobal(e);
  assert('Alt+L: enfoca el primer chip de rubro', primerChip._focused === true);
  assert('Alt+L: hace preventDefault', e._fuePrevenido() === true);
})();

// BLOQUE — Alt+L sin ningún chip en la lista: no rompe (fail-open)
(function () {
  var f = fabricarNavegacionTeclado({ DOM: { listaRubros: crearElementoFalso({ querySelectorResult: null }) } });
  var e = crearEventoTeclado({ key: 'l', altKey: true });
  var lanzo = false;
  try { f.navegacionTeclado._handlers.manejarTecladoGlobal(e); } catch (err) { lanzo = true; }
  assert('Alt+L sin chips: no lanza excepción', lanzo === false);
  assert('Alt+L sin chips: no hace preventDefault', e._fuePrevenido() === false);
})();

// BLOQUE — Alt+L sin DOM.listaRubros disponible: no rompe (fail-open)
(function () {
  var f = fabricarNavegacionTeclado({ DOM: { listaRubros: null, inputBuscar: crearElementoFalso() } });
  var e = crearEventoTeclado({ key: 'l', altKey: true });
  var lanzo = false;
  try { f.navegacionTeclado._handlers.manejarTecladoGlobal(e); } catch (err) { lanzo = true; }
  assert('Alt+L sin listaRubros: no lanza excepción', lanzo === false);
})();

// BLOQUE — "l" sin Alt no hace nada
(function () {
  var primerChip = crearElementoFalso();
  var f = fabricarNavegacionTeclado({ DOM: { listaRubros: crearElementoFalso({ querySelectorResult: primerChip }) } });
  var e = crearEventoTeclado({ key: 'l' });
  f.navegacionTeclado._handlers.manejarTecladoGlobal(e);
  assert('"l" suelta: no enfoca el chip de rubro', primerChip._focused === undefined);
})();

/* ═══════════════════════════════════════════════════════════════════
   inicializar() — wiring del listener global
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  _listenersRegistrados.length = 0;
  var f = fabricarNavegacionTeclado();
  f.navegacionTeclado.inicializar();
  var registrado = _listenersRegistrados.filter(function (l) { return l.tipo === 'keydown'; });
  assert('inicializar(): registra un listener "keydown" en document', registrado.length === 1);
  assert('inicializar(): el listener registrado ES manejarTecladoGlobal', registrado[0].fn === f.navegacionTeclado._handlers.manejarTecladoGlobal);
})();

console.log('\n' + (total - fallos) + '/' + total + ' pruebas de keyboard-nav OK');
if (fallos > 0) {
  console.error('\n' + fallos + ' prueba(s) fallaron.');
  process.exit(1);
}

