/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — listeners-tests.js

   Plan Maestro de Modularización, Fase 5 — validación de crearListeners()
   (js/listeners.js), extraído de app.js §19 (Inicialización de
   Listeners y Eventos). Mismo patrón sin framework que
   dom-painter-tests.js/render-engine-tests.js. Corre con:
     node js/listeners-tests.js
   Sale con código 1 si algo falla (run-tests.js la integra en SUITES).

   DOM falso: mismo criterio que dom-painter-tests.js — sin jsdom, un
   stub mínimo con exactamente lo que listeners.js toca (closest,
   dataset, classList, addEventListener, appendChild, setAttribute,
   focus, getBoundingClientRect). `crearElementoFalso()` es una versión
   extendida de `crearNodoFalso()` (dom-painter-tests.js) con soporte de
   `closest()` configurable por selector — necesario porque
   manejarClickPanel hace varios `e.target.closest('[data-accion="..."]')`
   encadenados por click, cosa que dom-painter.js nunca necesitó.

   Timers: `setTimeout`/`clearTimeout`/`requestAnimationFrame` se
   reemplazan por versiones deterministas (sin reloj real) — mismo
   criterio que `dispararTimers()` en coreografias-tests.js: los
   callbacks quedan en una cola y solo corren cuando el test los
   dispara explícitamente, nunca por temporización real.

   `window` se stubea sobre `global` (mismo criterio que
   render-engine-tests.js).
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

if (typeof global.window === 'undefined') {
  global.window = global;
}

// ─── Timers deterministas ────────────────────────────────────────────
var _timers = new Map();
var _timerSeq = 1;
global.setTimeout = function (fn, ms) {
  var id = _timerSeq++;
  _timers.set(id, fn);
  return id;
};
global.clearTimeout = function (id) { _timers.delete(id); };
function dispararTimers() {
  var pendientes = Array.from(_timers.values());
  _timers.clear();
  pendientes.forEach(function (fn) { fn(); });
}
function cantidadTimersPendientes() { return _timers.size; }

global.requestAnimationFrame = function (fn) { fn(); return 1; };

// ─── document falso ──────────────────────────────────────────────────
var _clasesHtml = {};
global.document = {
  documentElement: {
    classList: {
      add: function (c) { _clasesHtml[c] = true; },
      remove: function (c) { delete _clasesHtml[c]; },
      contains: function (c) { return !!_clasesHtml[c]; }
    }
  },
  hidden: false,
  createElement: function (tag) {
    return crearElementoFalso({ overrides: { tagName: tag } });
  },
  addEventListener: function () {},
  removeEventListener: function () {}
};

var crearListeners = require('./listeners.js').crearListeners;

// Node 22+ define `global.navigator` como propiedad nativa de solo
// getter (sin setter) — una asignación directa (`global.navigator = x`)
// lanza TypeError. Es `configurable: true`, así que redefinirla con
// `Object.defineProperty` funciona igual que la asignación directa
// funcionaba en versiones de Node donde `navigator` no existía como
// global. `delete global.navigator` sigue funcionando tal cual (mismo
// motivo: configurable).
function definirNavigatorFalso(obj) {
  Object.defineProperty(global, 'navigator', { value: obj, configurable: true, writable: true });
}

var fallos = 0, total = 0;
function assert(desc, cond) {
  total++;
  if (!cond) { fallos++; console.error('✗ ' + desc); }
  else console.log('✓ ' + desc);
}

/**
 * Elemento DOM falso con `closest()` configurable por selector vía
 * `closestMap` ({ selector: elementoODevolucion|null }) — selectors no
 * declarados en el mapa devuelven null (comportamiento real de
 * `Element.closest` cuando no hay ancestro que matchee).
 */
function crearElementoFalso(opts) {
  opts = opts || {};
  var closestMap = opts.closestMap || {};
  var attrs = {};
  var el = {
    dataset: opts.dataset || {},
    classList: {
      _clases: {},
      add: function (c) { this._clases[c] = true; },
      remove: function (c) { delete this._clases[c]; },
      toggle: function (c, forzar) {
        var activo = forzar !== undefined ? forzar : !this._clases[c];
        if (activo) this._clases[c] = true; else delete this._clases[c];
      },
      contains: function (c) { return !!this._clases[c]; }
    },
    style: {},
    innerHTML: '',
    textContent: '',
    value: '',
    hidden: false,
    setAttribute: function (k, v) { attrs[k] = v; },
    getAttribute: function (k) { return attrs.hasOwnProperty(k) ? attrs[k] : null; },
    attrs: attrs,
    closest: function (sel) {
      return closestMap.hasOwnProperty(sel) ? closestMap[sel] : null;
    },
    querySelector: function () { return opts.querySelectorResult || null; },
    querySelectorAll: function () { return opts.querySelectorAllResult || []; },
    addEventListener: function () {},
    removeEventListener: function () {},
    appendChild: function (child) { this._hijoAgregado = child; },
    focus: function () { this._focused = true; },
    scrollIntoView: function () {},
    getBoundingClientRect: function () { return { width: 20, height: 20, left: 0, top: 0 }; }
  };
  return Object.assign(el, opts.overrides || {});
}

/**
 * Fabrica un evento de click sobre el panel: `e.target` es el
 * elemento que "recibió" el click (normalmente un botón de acción o
 * una tarjeta), con `closest()` cableado para las 8 acciones posibles
 * de manejarClickPanel + `[data-lugar-id]` — mismo criterio que
 * `manejarClickPanel` usa internamente (8 `closest()` independientes
 * sobre el mismo `e.target`).
 *
 * @param {string|null} accion - uno de los valores `data-accion`, o
 *   null para un click sobre la tarjeta sin ninguna acción específica.
 * @param {Object|null} carta - elemento tarjeta falso (o null).
 * @param {Object} [datasetBoton] - dataset extra del botón de acción
 *   (p. ej. { origen: 'iniciativa_propia' } para btnAceptar).
 */
function crearEventoClickPanel(accion, carta, datasetBoton) {
  var ACCIONES = [
    'aceptar', 'rechazar', 'guardar', 'compartir', 'cargar-mas',
    'mas-sugerencias-recorte', 'limpiar-busqueda', 'limpiar-filtro-rubro'
  ];
  var boton = accion ? crearElementoFalso({
    dataset: datasetBoton || {},
    closestMap: { '[data-lugar-id]': carta }
  }) : null;

  var closestMap = { '[data-lugar-id]': carta };
  ACCIONES.forEach(function (a) {
    closestMap['[data-accion="' + a + '"]'] = (a === accion) ? boton : null;
  });

  return { target: { closest: function (sel) { return closestMap.hasOwnProperty(sel) ? closestMap[sel] : null; } } };
}

/**
 * Fabrica una instancia nueva de Listeners con DOM falso y mocks
 * controlables. `overrides` permite pisar deps puntuales por test.
 * Mismo criterio que `fabricarPainter()` en dom-painter-tests.js.
 */
function fabricarListeners(overrides) {
  overrides = overrides || {};

  // `_timers` es un mapa a nivel de archivo (mismo criterio que
  // `_clasesHtml`/`document` falso, arriba): cada bloque de test corre
  // en su propia IIFE con su propia instancia de Listeners, pero
  // comparte el mock global de setTimeout. Un timer programado por un
  // bloque anterior (p.ej. el debounce de filtro en el bloque de
  // manejarClickRubros, que no se dispara ni se limpia porque ese test
  // no lo necesita) quedaría contaminando el conteo de
  // `cantidadTimersPendientes()` de bloques posteriores. Se limpia acá,
  // al fabricar cada instancia nueva, para que cada bloque arranque con
  // el mapa en cero — mismo aislamiento que ya tienen `_clasesHtml` (se
  // reinicia implícitamente porque nadie la lee entre bloques) y el
  // resto de los mocks por-instancia de abajo.
  _timers.clear();

  var DOM = Object.assign({
    inputBuscar: crearElementoFalso(),
    btnLimpiarBusqueda: crearElementoFalso(),
    panelDescubrimiento: crearElementoFalso({ querySelectorAllResult: [] }),
    listaRubros: crearElementoFalso(),
    btnVerGuardados: crearElementoFalso(),
    faqLista: crearElementoFalso(),
    sugerenciasRapidas: crearElementoFalso(),
    filtrosActivos: crearElementoFalso(),
    tituloRegion: crearElementoFalso()
  }, overrides.DOM || {});

  var uiState = Object.assign({
    consultaActual: '',
    paginaTarjetas: 1,
    filtroRubroActivo: null,
    pedirMasRecorte: false,
    sorprendemeActivo: false,
    sorpresaSeed: 0
  }, overrides.uiState || {});

  var activeOperations = Object.assign({
    debounceBuscarId: null,
    debounceFiltroId: null,
    permanenciaTimer: null
  }, overrides.activeOperations || {});

  var llamadas = {
    render: 0,
    pintarRubros: 0,
    actualizarContadorGuardados: 0,
    programarRenderTrasSalida: 0,
    guardarEstado: 0
  };

  var estadoInterno = overrides.estadoInicial !== undefined
    ? overrides.estadoInicial
    : { sesion: { curaduriaActiva: false } };

  var PLANO_REAL = Object.assign({
    aplicarAccion: function (est, accion, payload) {
      // Devuelve un objeto nuevo (mismo criterio que motor-plano.js
      // real: no muta el estado recibido) marcando qué acción se
      // aplicó, para que los tests puedan verificar el argumento.
      return Object.assign({}, est, {
        sesion: Object.assign({}, est ? est.sesion : {}, { curaduriaActiva: accion === 'entrarCuraduria' ? true : (accion === 'salirCuraduria' ? false : (est ? est.sesion.curaduriaActiva : false)) }),
        ultimaAccion: accion,
        ultimoPayload: payload
      });
    },
    guardarEstado: function () { llamadas.guardarEstado++; },
    region: function () { return { nombre: 'exploracion' }; }
  }, overrides.PLANO || {});

  var favoritosAlmacen = overrides.favoritosIniciales || {};

  var motorMapaFake = overrides.motorMapa !== undefined ? overrides.motorMapa : {
    enfocar: function () { this._enfocado = true; },
    resaltar: function () { this._resaltado = true; },
    quitarResaltado: function () { this._sinResaltado = true; }
  };

  var listeners = crearListeners(Object.assign({
    DOM: DOM,
    uiState: uiState,
    activeOperations: activeOperations,
    render: function () { llamadas.render++; },
    obtenerPorId: overrides.obtenerPorId || function (id) {
      return { id: id, nombre: 'Lugar ' + id, grupo: 'bar', categoria: 'Bar' };
    },
    slug: overrides.slug || function (lugar) { return lugar ? lugar.id : ''; },
    hayBusquedaOFiltro: overrides.hayBusquedaOFiltro || function () { return !!uiState.consultaActual || !!uiState.filtroRubroActivo; },
    leerFavoritos: function () { return favoritosAlmacen; },
    guardarFavoritos: function (f) { favoritosAlmacen = f; },
    actualizarContadorGuardados: function () { llamadas.actualizarContadorGuardados++; },
    DomPainter: { pintarRubros: function () { llamadas.pintarRubros++; } },
    getEstado: function () { return estadoInterno; },
    setEstado: function (nuevo) { estadoInterno = nuevo; },
    getPLANO: function () { return PLANO_REAL; },
    getMotorMapa: function () { return motorMapaFake; },
    programarRenderTrasSalida: function () { llamadas.programarRenderTrasSalida++; },
    RenderEngine: overrides.RenderEngine || { obtenerCache: function () { return { region: 'exploracion' }; } },
    estadoActual: overrides.estadoActual || function () { return 'READY'; },
    STATE: { READY: 'READY' },
    PERMANENCIA_TICK_MS: 5000,
    DEBOUNCE_BUSQUEDA_MS: 10,
    DEBOUNCE_FILTRO_MS: 10,
    manejarClickSugerencias: function () {},
    manejarClickFiltrosActivos: function () {},
    inicializarScrollReveal: function () {},
    prefiereMovimientoReducido: overrides.prefiereMovimientoReducido || function () { return false; }
  }, overrides.deps || {}));

  return {
    listeners: listeners, DOM: DOM, uiState: uiState,
    activeOperations: activeOperations, llamadas: llamadas,
    getEstado: function () { return estadoInterno; },
    getFavoritos: function () { return favoritosAlmacen; },
    motorMapaFake: motorMapaFake
  };
}

/* ═══════════════════════════════════════════════════════════════════
   manejarClickPanel — una rama por bloque, orden §6 del plan de Fase 5
   ═══════════════════════════════════════════════════════════════════ */

// BLOQUE — limpiar-busqueda
(function () {
  var f = fabricarListeners();
  f.uiState.consultaActual = 'pizza';
  var e = crearEventoClickPanel('limpiar-busqueda', null);
  f.listeners._handlers.manejarClickPanel(e);
  assert('manejarClickPanel: limpiar-busqueda vacía consultaActual', f.uiState.consultaActual === '');
  assert('manejarClickPanel: limpiar-busqueda dispara render()', f.llamadas.render >= 1);
})();

// BLOQUE — limpiar-filtro-rubro
(function () {
  var f = fabricarListeners();
  f.uiState.filtroRubroActivo = 'bar';
  var e = crearEventoClickPanel('limpiar-filtro-rubro', null);
  f.listeners._handlers.manejarClickPanel(e);
  assert('manejarClickPanel: limpiar-filtro-rubro limpia el filtro', f.uiState.filtroRubroActivo === null);
  assert('manejarClickPanel: limpiar-filtro-rubro repinta rubros', f.llamadas.pintarRubros === 1);
  assert('manejarClickPanel: limpiar-filtro-rubro dispara render()', f.llamadas.render === 1);
})();

// BLOQUE — cargar-mas
(function () {
  var f = fabricarListeners();
  f.uiState.paginaTarjetas = 1;
  var e = crearEventoClickPanel('cargar-mas', null);
  f.listeners._handlers.manejarClickPanel(e);
  assert('manejarClickPanel: cargar-mas incrementa paginaTarjetas', f.uiState.paginaTarjetas === 2);
  assert('manejarClickPanel: cargar-mas dispara render()', f.llamadas.render === 1);
})();

// BLOQUE — mas-sugerencias-recorte
(function () {
  var f = fabricarListeners();
  f.uiState.sorprendemeActivo = true;
  f.uiState.sorpresaSeed = 3;
  var e = crearEventoClickPanel('mas-sugerencias-recorte', null);
  f.listeners._handlers.manejarClickPanel(e);
  assert('manejarClickPanel: mas-sugerencias-recorte marca pedirMasRecorte', f.uiState.pedirMasRecorte === true);
  assert('manejarClickPanel: mas-sugerencias-recorte avanza sorpresaSeed si sorprendeme activo', f.uiState.sorpresaSeed === 4);
  assert('manejarClickPanel: mas-sugerencias-recorte dispara render()', f.llamadas.render === 1);
})();

// BLOQUE — btnAceptar
(function () {
  var f = fabricarListeners();
  var carta = crearElementoFalso({ dataset: { lugarId: 'lugar1' } });
  var e = crearEventoClickPanel('aceptar', carta, { origen: 'iniciativa_propia' });
  var coreografiasLlamada = null;
  global.window.Coreografias = { aperturaFicha: function (s) { coreografiasLlamada = s; } };
  f.listeners._handlers.manejarClickPanel(e);
  assert('manejarClickPanel: aceptar aplica la acción "aceptar" en PLANO', f.getEstado().ultimaAccion === 'aceptar');
  assert('manejarClickPanel: aceptar pasa lugarId correcto', f.getEstado().ultimoPayload.lugarId === 'lugar1');
  assert('manejarClickPanel: aceptar detecta porIniciativaPropia', f.getEstado().ultimoPayload.porIniciativaPropia === true);
  assert('manejarClickPanel: aceptar llama PLANO.guardarEstado', f.llamadas.guardarEstado === 1);
  assert('manejarClickPanel: aceptar dispara Coreografias.aperturaFicha con el slug', coreografiasLlamada === 'lugar1');
  delete global.window.Coreografias;
})();

// BLOQUE — btnAceptar sin window.Coreografias (fail-open: no debe romper)
(function () {
  var f = fabricarListeners();
  var carta = crearElementoFalso({ dataset: { lugarId: 'lugar2' } });
  var e = crearEventoClickPanel('aceptar', carta, {});
  delete global.window.Coreografias;
  var noRompio = true;
  try {
    f.listeners._handlers.manejarClickPanel(e);
  } catch (err) {
    noRompio = false;
  }
  assert('manejarClickPanel: aceptar sin Coreografias no rompe (fail-open)', noRompio);
})();

// BLOQUE — btnRechazar
(function () {
  var f = fabricarListeners();
  var carta = crearElementoFalso({ dataset: { lugarId: 'lugar3' } });
  var e = crearEventoClickPanel('rechazar', carta);
  f.listeners._handlers.manejarClickPanel(e);
  assert('manejarClickPanel: rechazar aplica la acción "rechazar" en PLANO', f.getEstado().ultimaAccion === 'rechazar');
  assert('manejarClickPanel: rechazar llama PLANO.guardarEstado', f.llamadas.guardarEstado === 1);
  assert('manejarClickPanel: rechazar programa render tras salida (animación)', f.llamadas.programarRenderTrasSalida === 1);
})();

// BLOQUE — btnGuardar: pasa de no-guardado a guardado
(function () {
  var f = fabricarListeners({ favoritosIniciales: {} });
  var carta = crearElementoFalso({ dataset: { lugarId: 'lugar4' } });
  var boton = crearElementoFalso({ closestMap: { '[data-lugar-id]': carta } });
  var e = { target: { closest: function (sel) {
    if (sel === '[data-accion="guardar"]') return boton;
    if (sel === '[data-lugar-id]') return carta;
    return null;
  } } };
  f.listeners._handlers.manejarClickPanel(e);
  assert('manejarClickPanel: guardar togglea el favorito a true', f.getFavoritos().lugar4 === true);
  assert('manejarClickPanel: guardar activa clase "activo" en el botón', boton.classList.contains('activo') === true);
  assert('manejarClickPanel: guardar setea aria-pressed=true', boton.getAttribute('aria-pressed') === 'true');
  assert('manejarClickPanel: guardar setea aria-label "Quitar de guardados"', boton.getAttribute('aria-label') === 'Quitar de guardados');
  assert('manejarClickPanel: guardar setea textContent "★ guardado"', boton.textContent === '★ guardado');
  assert('manejarClickPanel: guardar llama actualizarContadorGuardados', f.llamadas.actualizarContadorGuardados === 1);
})();

// BLOQUE — btnGuardar: desguardar durante curaduría dispara salida animada
(function () {
  var f = fabricarListeners({
    favoritosIniciales: { lugar5: true },
    estadoInicial: { sesion: { curaduriaActiva: true } }
  });
  var carta = crearElementoFalso({ dataset: { lugarId: 'lugar5' } });
  var boton = crearElementoFalso({ closestMap: { '[data-lugar-id]': carta } });
  var e = { target: { closest: function (sel) {
    if (sel === '[data-accion="guardar"]') return boton;
    if (sel === '[data-lugar-id]') return carta;
    return null;
  } } };
  f.listeners._handlers.manejarClickPanel(e);
  assert('manejarClickPanel: desguardar en curaduría togglea a false', f.getFavoritos().lugar5 === false);
  assert('manejarClickPanel: desguardar en curaduría setea textContent "☆ guardar"', boton.textContent === '☆ guardar');
  assert('manejarClickPanel: desguardar en curaduría programa render tras salida', f.llamadas.programarRenderTrasSalida === 1);
})();

// BLOQUE — btnCompartir: con Web Share API disponible
(function () {
  var f = fabricarListeners();
  var carta = crearElementoFalso({ dataset: { lugarId: 'lugar6' } });
  var boton = crearElementoFalso({ closestMap: { '[data-lugar-id]': carta } });
  var e = { target: { closest: function (sel) {
    if (sel === '[data-accion="compartir"]') return boton;
    if (sel === '[data-lugar-id]') return carta;
    return null;
  } } };
  var compartido = null;
  global.window.location = { origin: 'https://uruspot.com.ar', pathname: '/donde-comer-cdu/' };
  definirNavigatorFalso({ share: function (payload) { compartido = payload; return Promise.resolve(); } });
  f.listeners._handlers.manejarClickPanel(e);
  assert('manejarClickPanel: compartir con Web Share API llama navigator.share', compartido !== null);
  assert('manejarClickPanel: compartir arma la URL de la ficha con el slug', compartido.url.indexOf('locales/lugar6/') !== -1);
  delete global.navigator;
})();

// BLOQUE — btnCompartir: sin Web Share API, fallback a clipboard
(function () {
  var f = fabricarListeners();
  var carta = crearElementoFalso({ dataset: { lugarId: 'lugar7' } });
  var boton = crearElementoFalso({ closestMap: { '[data-lugar-id]': carta }, overrides: { innerHTML: '📤' } });
  var e = { target: { closest: function (sel) {
    if (sel === '[data-accion="compartir"]') return boton;
    if (sel === '[data-lugar-id]') return carta;
    return null;
  } } };
  var copiado = null;
  global.window.location = { origin: 'https://uruspot.com.ar', pathname: '/donde-comer-cdu/' };
  definirNavigatorFalso({ clipboard: { writeText: function (txt) { copiado = txt; return Promise.resolve(); } } });
  f.listeners._handlers.manejarClickPanel(e);
  assert('manejarClickPanel: compartir sin Web Share usa clipboard.writeText', copiado !== null && copiado.indexOf('locales/lugar7/') !== -1);
  delete global.navigator;
})();

// BLOQUE — carta sin acción (click en la tarjeta): foco en el mapa
(function () {
  var f = fabricarListeners();
  var carta = crearElementoFalso({ dataset: { lugarId: 'lugar8' } });
  var e = crearEventoClickPanel(null, carta);
  f.listeners._handlers.manejarClickPanel(e);
  assert('manejarClickPanel: click en tarjeta sin acción enfoca en el mapa', f.motorMapaFake._enfocado === true);
})();

/* ═══════════════════════════════════════════════════════════════════
   manejarHoverPanel / manejarHoverOutPanel
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarListeners();
  var carta = crearElementoFalso({ dataset: { lugarId: 'lugarH' } });
  f.listeners._handlers.manejarHoverPanel({ target: { closest: function () { return carta; } } });
  assert('manejarHoverPanel: resalta en el mapa al pasar el mouse', f.motorMapaFake._resaltado === true);

  f.listeners._handlers.manejarHoverOutPanel({ target: { closest: function () { return carta; } } });
  assert('manejarHoverOutPanel: quita el resaltado al sacar el mouse', f.motorMapaFake._sinResaltado === true);
})();

/* ═══════════════════════════════════════════════════════════════════
   manejarFinEntradaTarjeta
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarListeners();
  var tarjeta = crearElementoFalso({ overrides: { classList: { _clases: { 'tarjeta--entrando': true }, remove: function (c) { delete this._clases[c]; }, contains: function (c) { return !!this._clases[c]; } } } });
  f.listeners._handlers.manejarFinEntradaTarjeta({ animationName: 'uru-fade-up', target: tarjeta });
  assert('manejarFinEntradaTarjeta: quita tarjeta--entrando en la animación correcta', tarjeta.classList.contains('tarjeta--entrando') === false);
})();

(function () {
  var f = fabricarListeners();
  var tarjeta = crearElementoFalso({ overrides: { classList: { _clases: { 'tarjeta--entrando': true }, remove: function (c) { delete this._clases[c]; }, contains: function (c) { return !!this._clases[c]; } } } });
  f.listeners._handlers.manejarFinEntradaTarjeta({ animationName: 'otra-animacion', target: tarjeta });
  assert('manejarFinEntradaTarjeta: ignora animaciones que no son uru-fade-up', tarjeta.classList.contains('tarjeta--entrando') === true);
})();

/* ═══════════════════════════════════════════════════════════════════
   manejarClickRubros → seleccionarRubro
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarListeners();
  var chip = crearElementoFalso({ dataset: { rubro: 'bar' } });
  f.listeners._handlers.manejarClickRubros({ target: { closest: function () { return chip; } } });
  assert('manejarClickRubros: activa el rubro clickeado', f.uiState.filtroRubroActivo === 'bar');
  assert('manejarClickRubros: reinicia paginaTarjetas a 1', f.uiState.paginaTarjetas === 1);
  assert('manejarClickRubros: repinta rubros de inmediato (feedback sin debounce)', f.llamadas.pintarRubros === 1);
  assert('manejarClickRubros: sale de curaduría', f.getEstado().ultimaAccion === 'salirCuraduria');

  // Segundo click sobre el mismo rubro: deselecciona (toggle)
  f.listeners._handlers.manejarClickRubros({ target: { closest: function () { return chip; } } });
  assert('manejarClickRubros: un segundo click sobre el mismo rubro lo deselecciona', f.uiState.filtroRubroActivo === null);
})();

(function () {
  var f = fabricarListeners();
  f.listeners._handlers.manejarClickRubros({ target: { closest: function () { return null; } } });
  assert('manejarClickRubros: click fuera de un chip no hace nada', f.llamadas.pintarRubros === 0);
})();

/* ═══════════════════════════════════════════════════════════════════
   manejarClickVerGuardados
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarListeners();
  f.uiState.paginaTarjetas = 3;
  f.listeners._handlers.manejarClickVerGuardados();
  assert('manejarClickVerGuardados: entra en curaduría', f.getEstado().ultimaAccion === 'entrarCuraduria');
  assert('manejarClickVerGuardados: reinicia paginaTarjetas a 1', f.uiState.paginaTarjetas === 1);
  assert('manejarClickVerGuardados: dispara render()', f.llamadas.render === 1);
})();

/* ═══════════════════════════════════════════════════════════════════
   manejarClickFAQ
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarListeners();
  var item = crearElementoFalso();
  var pregunta = crearElementoFalso({ closestMap: { '.faq-item': item } });
  pregunta.setAttribute('aria-expanded', 'false');
  f.listeners._handlers.manejarClickFAQ({ target: { closest: function (sel) { return sel === '.faq-pregunta' ? pregunta : null; } } });
  assert('manejarClickFAQ: abre la pregunta cerrada (aria-expanded=true)', pregunta.getAttribute('aria-expanded') === 'true');
  assert('manejarClickFAQ: agrega la clase faq-item--abierta', item.classList.contains('faq-item--abierta') === true);

  f.listeners._handlers.manejarClickFAQ({ target: { closest: function (sel) { return sel === '.faq-pregunta' ? pregunta : null; } } });
  assert('manejarClickFAQ: un segundo click la vuelve a cerrar', pregunta.getAttribute('aria-expanded') === 'false');
})();

/* ═══════════════════════════════════════════════════════════════════
   manejarKeydownBuscar / manejarKeydownPanel
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarListeners();
  var primerResultado = crearElementoFalso();
  f.DOM.panelDescubrimiento.querySelectorAll = function () { return [crearElementoFalso({ querySelectorResult: primerResultado })]; };
  var prevenido = false;
  f.listeners._handlers.manejarKeydownBuscar({ key: 'ArrowDown', preventDefault: function () { prevenido = true; } });
  assert('manejarKeydownBuscar: ArrowDown enfoca el primer resultado', primerResultado._focused === true);
  assert('manejarKeydownBuscar: ArrowDown hace preventDefault', prevenido === true);
})();

(function () {
  var f = fabricarListeners();
  f.uiState.consultaActual = 'algo';
  var prevenido = false;
  f.listeners._handlers.manejarKeydownBuscar({ key: 'Escape', preventDefault: function () { prevenido = true; } });
  assert('manejarKeydownBuscar: Escape con texto limpia la búsqueda', f.uiState.consultaActual === '');
  assert('manejarKeydownBuscar: Escape hace preventDefault', prevenido === true);
})();

(function () {
  var f = fabricarListeners();
  var tarjeta1Foco = crearElementoFalso();
  var tarjeta2Foco = crearElementoFalso();
  f.DOM.panelDescubrimiento.querySelectorAll = function () {
    return [
      crearElementoFalso({ querySelectorResult: tarjeta1Foco }),
      crearElementoFalso({ querySelectorResult: tarjeta2Foco })
    ];
  };
  var tarjetaFalsa = crearElementoFalso();
  var prevenido = false;
  f.listeners._handlers.manejarKeydownPanel({
    key: 'ArrowDown',
    target: tarjeta1Foco,
    preventDefault: function () { prevenido = true; }
  });
  assert('manejarKeydownPanel: sin ancestro .tarjeta no hace nada (guarda de closest)', prevenido === false);
})();

/* ═══════════════════════════════════════════════════════════════════
   manejarInputBusqueda — debounce dispara una sola vez
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarListeners();
  f.listeners._handlers.manejarInputBusqueda({ target: { value: 'pi' } });
  assert('manejarInputBusqueda: consultaActual se actualiza en el acto', f.uiState.consultaActual === 'pi');
  assert('manejarInputBusqueda: aplica "nombrar" con 2+ caracteres', f.getEstado().ultimaAccion === 'nombrar');
  assert('manejarInputBusqueda: no renderiza sincrónicamente (espera el debounce)', f.llamadas.render === 0);
  assert('manejarInputBusqueda: programa exactamente un timer de debounce', cantidadTimersPendientes() === 1);

  dispararTimers();
  assert('manejarInputBusqueda: tras el debounce, render() se dispara UNA sola vez', f.llamadas.render === 1);
  assert('manejarInputBusqueda: tras el debounce, guardarEstado() se llama', f.llamadas.guardarEstado === 1);
})();

(function () {
  var f = fabricarListeners();
  f.uiState.consultaActual = 'algo';
  f.listeners._handlers.manejarInputBusqueda({ target: { value: '' } });
  assert('manejarInputBusqueda: vaciar el campo aplica "despejarBusqueda"', f.getEstado().ultimaAccion === 'despejarBusqueda');
  assert('manejarInputBusqueda: vaciar el campo renderiza YA, sin debounce (se siente instantáneo)', f.llamadas.render === 1);
})();

/* ═══════════════════════════════════════════════════════════════════
   tickPermanencia
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarListeners({
    estadoActual: function () { return 'READY' },
    RenderEngine: { obtenerCache: function () { return { region: 'guia' }; } }
  });
  f.listeners._handlers.tickPermanencia();
  assert('tickPermanencia: aplica la acción "permanecer"', f.getEstado().ultimaAccion === 'permanecer');
  assert('tickPermanencia: región distinta a la cacheada → dispara render()', f.llamadas.render === 1);
})();

(function () {
  var f = fabricarListeners({ estadoActual: function () { return 'ERROR'; } });
  f.listeners._handlers.tickPermanencia();
  assert('tickPermanencia: fuera de STATE.READY, no hace nada', f.llamadas.render === 0 && f.getEstado().ultimaAccion === undefined);
})();

/* ═══════════════════════════════════════════════════════════════════
   manejarScrollParaSupresionVidrio
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarListeners();
  f.listeners._handlers.manejarScrollParaSupresionVidrio();
  assert('manejarScrollParaSupresionVidrio: agrega u-suprimir-vidrio al hacer scroll', global.document.documentElement.classList.contains('u-suprimir-vidrio') === true);

  dispararTimers();
  assert('manejarScrollParaSupresionVidrio: quita u-suprimir-vidrio cuando el scroll termina', global.document.documentElement.classList.contains('u-suprimir-vidrio') === false);
})();

/* ═══════════════════════════════════════════════════════════════════
   RESUMEN
   ═══════════════════════════════════════════════════════════════════ */

console.log('');
console.log(total - fallos + '/' + total + ' pruebas de listeners OK');

if (fallos > 0) {
  process.exit(1);
}

