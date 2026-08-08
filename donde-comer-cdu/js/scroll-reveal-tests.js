/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — scroll-reveal-tests.js

   Plan Maestro de Modularización, Fase 6 — validación de
   ScrollReveal.inicializar() (antes inicializarScrollReveal(), app.js
   §22). Mismo patrón sin framework que keyboard-nav-tests.js. Corre
   con:
     node js/scroll-reveal-tests.js
   Sale con código 1 si algo falla (run-tests.js la integra en SUITES).

   document/IntersectionObserver falsos: mismo criterio que el resto
   de la red de seguridad del repo (cero jsdom) — un IntersectionObserver
   fake que captura el callback real pasado por el módulo, para poder
   simular "entradas" del observer a mano y verificar el Cap. 6
   (microdesfase de entrada, salida/reingreso) sin un navegador real.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

if (typeof global.window === 'undefined') {
  global.window = global;
}
if (typeof global.Node === 'undefined') {
  // DOCUMENT_POSITION_FOLLOWING real del DOM (usado por
  // compareDocumentPosition() para el orden de aparición, Cap. 6
  // paso 9) — no existe fuera de un navegador real.
  global.Node = { DOCUMENT_POSITION_FOLLOWING: 4 };
}

var crearScrollReveal = require('./scroll-reveal.js').crearScrollReveal;

var fallos = 0, total = 0;
function assert(desc, cond) {
  total++;
  if (!cond) { fallos++; console.error('✗ ' + desc); }
  else console.log('✓ ' + desc);
}

/**
 * Nodo .u-reveal falso: dataset, classList y style mínimos, más
 * compareDocumentPosition (para el orden de aparición del Cap. 6
 * paso 9) y boundingClientRect fijo (paso 10, salida/reingreso).
 */
function crearNodoReveal(id, posicionRelativaMenor) {
  var clases = {};
  return {
    id: id,
    dataset: {},
    style: { transitionDelay: '' },
    classList: {
      add: function () { for (var i = 0; i < arguments.length; i++) clases[arguments[i]] = true; },
      remove: function () { for (var i = 0; i < arguments.length; i++) delete clases[arguments[i]]; },
      contains: function (c) { return !!clases[c]; }
    },
    // DOCUMENT_POSITION_FOLLOWING (4): "this" precede a `otro` en el
    // documento cuando `posicionRelativaMenor` es true.
    compareDocumentPosition: function (otro) {
      return posicionRelativaMenor ? 4 : 0;
    }
  };
}

/**
 * Fabrica una instancia de ScrollReveal con document/window mockeados.
 * Captura el callback real del IntersectionObserver para poder
 * dispararlo a mano en cada test.
 */
function fabricar(overrides) {
  overrides = overrides || {};

  var nodos = overrides.nodos || [crearNodoReveal('a', true), crearNodoReveal('b', false)];

  var observados = [];
  var capturedCallback = null;
  var capturedOpts = null;

  global.IntersectionObserver = function (cb, opts) {
    capturedCallback = cb;
    capturedOpts = opts;
    this.observe = function (el) { observados.push(el); };
  };
  if (!('IntersectionObserver' in global.window)) {
    global.window.IntersectionObserver = global.IntersectionObserver;
  } else {
    global.window.IntersectionObserver = global.IntersectionObserver;
  }

  global.document = {
    documentElement: {},
    querySelectorAll: function (sel) {
      if (sel === '.u-reveal') return nodos;
      return [];
    }
  };
  global.getComputedStyle = function () {
    return { getPropertyValue: function () { return overrides.motionDesfase || ''; } };
  };

  var prm = overrides.prefiereMovimientoReducido || function () { return false; };

  var reveal = crearScrollReveal({ prefiereMovimientoReducido: prm });

  return {
    reveal: reveal,
    nodos: nodos,
    observados: function () { return observados; },
    dispararEntradas: function (entradas) { capturedCallback(entradas); },
    opts: function () { return capturedOpts; }
  };
}

function entradaFalsa(nodo, overrides) {
  return Object.assign({
    target: nodo,
    isIntersecting: true,
    intersectionRatio: 1,
    boundingClientRect: { bottom: 100 }
  }, overrides || {});
}

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 1 — Movimiento reducido: revela todo de inmediato, sin observer
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricar({ prefiereMovimientoReducido: function () { return true; } });
  f.reveal.inicializar();
  assert('movimiento reducido: agrega .visible a todos los .u-reveal de inmediato',
    f.nodos.every(function (n) { return n.classList.contains('visible'); }));
  assert('movimiento reducido: no registra ningún observer', f.observados().length === 0);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 2 — Sin movimiento reducido: arma el observer sobre cada nodo
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricar();
  f.reveal.inicializar();
  assert('observa cada .u-reveal', f.observados().length === f.nodos.length);
  assert('marca cada nodo con .u-reveal--armado', f.nodos.every(function (n) { return n.classList.contains('u-reveal--armado'); }));
  assert('usa threshold [0, 0.12] y rootMargin de -40px (Cap. 6/14)',
    f.opts().threshold[0] === 0 && f.opts().threshold[1] === 0.12 &&
    f.opts().rootMargin === '0px 0px -40px 0px');
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 3 — Primera entrada: microdesfase por orden de documento
   (Cap. 6, paso 9)
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  // b precede a a en el documento (posicionRelativaMenor=false en a
  // simula que a.compareDocumentPosition(b) NO trae FOLLOWING, o sea
  // b va primero) — el observer las entrega en otro orden (a, b) pero
  // deben aplicar el desfase en orden de DOM.
  var a = crearNodoReveal('a', false); // a NO precede a b
  var b = crearNodoReveal('b', true);  // b precede a a
  var f = fabricar({ nodos: [a, b], motionDesfase: '0.04' }); // 40ms
  f.reveal.inicializar();
  f.dispararEntradas([entradaFalsa(a), entradaFalsa(b)]);

  assert('primera entrada: ambos nodos quedan .visible', a.classList.contains('visible') && b.classList.contains('visible'));
  assert('primera entrada: ambos marcan dataset.uReveal="visto"', a.dataset.uReveal === 'visto' && b.dataset.uReveal === 'visto');
  assert('microdesfase: el nodo que va primero en el DOM (b) recibe el delay menor',
    b.style.transitionDelay === '0ms' && a.style.transitionDelay === '40ms');
})();

(function () {
  // Sin --motion-desfase resoluble: fallback a 40ms (documentado en
  // el módulo).
  var a = crearNodoReveal('a', false);
  var b = crearNodoReveal('b', true);
  var f = fabricar({ nodos: [a, b], motionDesfase: '' });
  f.reveal.inicializar();
  f.dispararEntradas([entradaFalsa(a), entradaFalsa(b)]);
  assert('fallback de --motion-desfase: usa 40ms cuando el token no resuelve',
    b.style.transitionDelay === '0ms' && a.style.transitionDelay === '40ms');
})();

(function () {
  // Un nodo que no interseca en este callback no debe revelarse.
  var a = crearNodoReveal('a', true);
  var f = fabricar({ nodos: [a] });
  f.reveal.inicializar();
  f.dispararEntradas([entradaFalsa(a, { isIntersecting: false })]);
  assert('sin intersección: no se revela ni marca dataset.uReveal', !a.classList.contains('visible') && !a.dataset.uReveal);
})();

(function () {
  // Un nodo que ya tuvo su primera entrada no vuelve a re-disparar el
  // paso 9 en un callback posterior.
  var a = crearNodoReveal('a', true);
  var f = fabricar({ nodos: [a] });
  f.reveal.inicializar();
  f.dispararEntradas([entradaFalsa(a)]);
  a.style.transitionDelay = '';
  f.dispararEntradas([entradaFalsa(a)]); // segundo callback, ya "visto"
  assert('segunda entrada sobre nodo ya visto: no vuelve a setear transitionDelay de "primera entrada"', a.style.transitionDelay === '');
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 4 — Salida/reingreso (Cap. 6, paso 10)
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var a = crearNodoReveal('a', true);
  var f = fabricar({ nodos: [a] });
  f.reveal.inicializar();
  f.dispararEntradas([entradaFalsa(a)]); // primera entrada: dataset.uReveal='visto'

  // Sale por completo arriba del viewport.
  f.dispararEntradas([entradaFalsa(a, { isIntersecting: false, boundingClientRect: { bottom: 0 } })]);
  assert('salida completa por arriba: agrega .saliendo/.u-mov-saliendo',
    a.classList.contains('saliendo') && a.classList.contains('u-mov-saliendo'));
})();

(function () {
  var a = crearNodoReveal('a', true);
  var f = fabricar({ nodos: [a] });
  f.reveal.inicializar();
  f.dispararEntradas([entradaFalsa(a)]);
  f.dispararEntradas([entradaFalsa(a, { isIntersecting: false, boundingClientRect: { bottom: 0 } })]);

  // Reingresa con intersectionRatio >= 0.12 (mismo umbral que la
  // primera entrada).
  f.dispararEntradas([entradaFalsa(a, { isIntersecting: true, intersectionRatio: 0.5 })]);
  assert('reingreso (>=0.12): quita .saliendo/.u-mov-saliendo', !a.classList.contains('saliendo') && !a.classList.contains('u-mov-saliendo'));
  assert('reingreso: limpia transitionDelay', a.style.transitionDelay === '');
})();

(function () {
  // No debe activar/desactivar en cada frame cerca del borde: por
  // debajo del umbral de reingreso (0.12) mientras sigue intersecando
  // no debe revertir "saliendo".
  var a = crearNodoReveal('a', true);
  var f = fabricar({ nodos: [a] });
  f.reveal.inicializar();
  f.dispararEntradas([entradaFalsa(a)]);
  f.dispararEntradas([entradaFalsa(a, { isIntersecting: false, boundingClientRect: { bottom: 0 } })]);
  f.dispararEntradas([entradaFalsa(a, { isIntersecting: true, intersectionRatio: 0.05 })]); // por debajo de 0.12
  assert('reingreso por debajo del umbral (0.12): sigue "saliendo" (sin temblor)', a.classList.contains('saliendo'));
})();

(function () {
  // Un nodo que nunca tuvo su primera entrada no debe entrar en la
  // lógica de salida/reingreso (guard dataset.uReveal al principio
  // del segundo forEach).
  var a = crearNodoReveal('a', true);
  var f = fabricar({ nodos: [a] });
  f.reveal.inicializar();
  f.dispararEntradas([entradaFalsa(a, { isIntersecting: false, boundingClientRect: { bottom: 0 } })]);
  assert('nodo sin primera entrada: la lógica de salida no lo toca', !a.classList.contains('saliendo'));
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 5 — Sin IntersectionObserver disponible: no rompe
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var originalIO = global.window.IntersectionObserver;
  delete global.window.IntersectionObserver;
  global.document = { documentElement: {}, querySelectorAll: function () { return [crearNodoReveal('a', true)]; } };
  var reveal = crearScrollReveal({ prefiereMovimientoReducido: function () { return false; } });
  var lanzo = false;
  try {
    reveal.inicializar();
  } catch (e) {
    lanzo = true;
  }
  assert('sin IntersectionObserver en window: no lanza excepción (fail-open)', lanzo === false);
  global.window.IntersectionObserver = originalIO;
})();

/* ═══════════════════════════════════════════════════════════════════
   RESUMEN
   ═══════════════════════════════════════════════════════════════════ */

console.log('');
console.log(total - fallos + '/' + total + ' pruebas de scroll-reveal OK');

if (fallos > 0) {
  process.exit(1);
}

