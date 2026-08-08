/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — motor-render-tests.js

   Roadmap de mejora, Fase 3.1 (2026-08-07) — motor-render.js era el
   único módulo del motor de mapa sin ningún test automático:
   motor-test.js ya cubre proyeccion.js, motor-config.js, motor-mapa.js,
   motor-plano.js y motor-exposicion.js, pero nunca motor-render.js.
   Corre con:
     node js/motor-render-tests.js
   Sale con código 1 si algo falla (run-tests.js la integra como
   suite 14/14).

   ALCANCE DELIBERADO (por qué esta suite NO instancia crear()):
   motor-render.js hace ~24 addEventListener, captura de puntero,
   getBoundingClientRect, ResizeObserver, Path2D y ~40 métodos de
   canvas 2D repartidos en un único closure de más de 2500 líneas
   (proyectarPuntos/agruparEnClusters incluidos). Simularlo con
   fidelidad suficiente para que un test de integración signifique
   algo real necesitaría, en la práctica, reconstruir un jsdom+canvas
   propio — exactamente el tipo de esfuerzo que el propio roadmap
   (Fase 3.1, nota final) descarta antes del lanzamiento ("la
   extracción completa de módulos NO se recomienda antes del
   lanzamiento"). Un stub más liviano daría falsa confianza (pasaría
   aunque el clustering real estuviera roto) sin cubrir el motivo real
   por el que este archivo es riesgoso.

   Lo que SÍ es real, puro, y se prueba acá: las funciones sin estado
   propio que motor-render.js expone en `_internas` (mismo criterio
   que `obtenerCache()` en render-engine.js) — colorSeguro, rgbDe,
   easeOutCubic, umbralDrag, hrefMapsDe, construirUrlTile. No son una
   reimplementación paralela: son las mismas funciones que corren
   dentro de `crear()`.

   `window`/`devicePixelRatio` se stubean sobre `global` (mismo
   criterio que motor-test.js/render-engine-tests.js). Se requiere
   proyeccion.js antes que motor-render.js porque este último aborta
   temprano (con un error claro) si `URU_PROYECCION` no existe — ver
   la guarda de dependencia dura al inicio del archivo real.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

if (typeof global.window === 'undefined') {
  global.window = global;
}
global.devicePixelRatio = 1;

require('./proyeccion.js');
var RENDER = require('./motor-render.js');
var I = RENDER._internas;

var fallos = 0, total = 0;
function assert(desc, cond) {
  total++;
  if (!cond) { fallos++; console.error('✗ ' + desc); }
  else console.log('✓ ' + desc);
}

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 0 — superficie expuesta
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  assert('URU_MOTOR_MAPA_RENDER expone crear()', typeof RENDER.crear === 'function');
  assert('_internas expone las 6 funciones puras esperadas',
    I && typeof I.colorSeguro === 'function' && typeof I.rgbDe === 'function' &&
    typeof I.easeOutCubic === 'function' && typeof I.umbralDrag === 'function' &&
    typeof I.hrefMapsDe === 'function' && typeof I.construirUrlTile === 'function');
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 1 — colorSeguro(c): valida hex de 6 dígitos, si no cae a
   COLOR_DEFECTO ('#C97A83'). Protege contra datos corruptos del
   catálogo que rompían parseInt en silencio (ver auditoría, cabecera
   del archivo real).
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  assert('colorSeguro acepta un hex válido de 6 dígitos tal cual',
    I.colorSeguro('#1a2b3c') === '#1a2b3c');
  assert('colorSeguro acepta hex en mayúsculas',
    I.colorSeguro('#ABCDEF') === '#ABCDEF');
  assert('colorSeguro cae al color por defecto si falta el "#"',
    I.colorSeguro('1a2b3c') === '#C97A83');
  assert('colorSeguro cae al color por defecto con hex de 3 dígitos (no soportado)',
    I.colorSeguro('#fff') === '#C97A83');
  assert('colorSeguro cae al color por defecto con caracteres no-hex',
    I.colorSeguro('#zzzzzz') === '#C97A83');
  assert('colorSeguro cae al color por defecto con null',
    I.colorSeguro(null) === '#C97A83');
  assert('colorSeguro cae al color por defecto con undefined',
    I.colorSeguro(undefined) === '#C97A83');
  assert('colorSeguro cae al color por defecto con un número (no string)',
    I.colorSeguro(123456) === '#C97A83');
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 2 — rgbDe(hex): parseo + memoización (CACHE_RGB). El mismo
   hex debe devolver el mismo objeto (identidad, no solo valores
   iguales) en llamadas sucesivas — es la garantía de que la caché
   realmente memoiza y no reparsea.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var negro = I.rgbDe('#000000');
  assert('rgbDe parsea negro correctamente', negro.r === 0 && negro.g === 0 && negro.b === 0);

  var blanco = I.rgbDe('#ffffff');
  assert('rgbDe parsea blanco correctamente', blanco.r === 255 && blanco.g === 255 && blanco.b === 255);

  var rojo = I.rgbDe('#ff0000');
  assert('rgbDe parsea un canal individual correctamente', rojo.r === 255 && rojo.g === 0 && rojo.b === 0);

  var primera = I.rgbDe('#C97A83');
  var segunda = I.rgbDe('#C97A83');
  assert('rgbDe memoiza: misma clave hex devuelve el mismo objeto (identidad)', primera === segunda);
  assert('rgbDe (mismo color por defecto que usa colorSeguro) parsea sin NaN',
    !isNaN(primera.r) && !isNaN(primera.g) && !isNaN(primera.b));
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 3 — easeOutCubic(t): 1 - (1-t)^3. Extremos fijos por
   definición matemática (0→0, 1→1) y un punto intermedio conocido.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  assert('easeOutCubic(0) === 0', I.easeOutCubic(0) === 0);
  assert('easeOutCubic(1) === 1', I.easeOutCubic(1) === 1);
  assert('easeOutCubic(0.5) === 0.875 (valor conocido de la curva)', I.easeOutCubic(0.5) === 0.875);
  assert('easeOutCubic es monótona creciente en [0,1] (progreso real de animación)',
    I.easeOutCubic(0.2) < I.easeOutCubic(0.6) && I.easeOutCubic(0.6) < I.easeOutCubic(0.9));
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 4 — umbralDrag(pointerType): 8px en touch (dedo, más ruido),
   2px en cualquier otro puntero (mouse/pen/undefined) — distinción
   por gesto real, no por capacidad general del dispositivo (ver
   auditoría "GAP REAL corregido" en la cabecera del archivo real).
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  assert('umbralDrag("touch") es 8px (más tolerante al jitter del dedo)', I.umbralDrag('touch') === 8);
  assert('umbralDrag("mouse") es 2px', I.umbralDrag('mouse') === 2);
  assert('umbralDrag("pen") también usa el umbral de mouse (no es touch)', I.umbralDrag('pen') === 2);
  assert('umbralDrag(undefined) usa el umbral de mouse por defecto', I.umbralDrag(undefined) === 2);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 5 — hrefMapsDe(p): siempre construye un link válido a
   Google Maps a partir de lat/lng crudos — es la acción primaria del
   popup, individual o dentro de un cluster, y no depende de que
   exista slug/ficha (a diferencia de punto.href).
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  assert('hrefMapsDe arma la URL con lat/lng separados por coma',
    I.hrefMapsDe({ lat: -32.4833, lng: -58.2333 }) ===
    'https://www.google.com/maps/search/?api=1&query=-32.4833,-58.2333');
  assert('hrefMapsDe siempre usa el endpoint search?api=1 (nunca /maps/@lat,lng directo)',
    I.hrefMapsDe({ lat: 0, lng: 0 }).indexOf('google.com/maps/search/?api=1') !== -1);
  assert('hrefMapsDe funciona con coordenadas positivas (hemisferio norte/este)',
    I.hrefMapsDe({ lat: 40.7128, lng: 74.0060 }) ===
    'https://www.google.com/maps/search/?api=1&query=40.7128,74.006');
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 6 — construirUrlTile(z, xw, y): subdominio determinístico
   por (xw+y) % 4, plantilla {z}/{x}/{y} sustituida, y sufijo @2x
   condicionado a devicePixelRatio > 1 (retina). Determinismo del
   subdominio importa: dos llamadas con las mismas coordenadas deben
   pegarle siempre al mismo host (mejor cacheo del navegador).
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  global.devicePixelRatio = 1;
  var url = I.construirUrlTile(14, 3, 5);
  assert('construirUrlTile sustituye z/x/y en la plantilla', url.indexOf('/14/3/5') !== -1);
  assert('construirUrlTile usa el dominio cartocdn esperado', url.indexOf('basemaps.cartocdn.com') !== -1);
  assert('construirUrlTile NO agrega @2x con devicePixelRatio=1', url.indexOf('@2x') === -1);

  global.devicePixelRatio = 2;
  var urlRetina = I.construirUrlTile(14, 3, 5);
  assert('construirUrlTile agrega @2x con devicePixelRatio=2', urlRetina.indexOf('@2x.png') !== -1);

  global.devicePixelRatio = 1;
  assert('construirUrlTile es determinístico: mismo (z,x,y) → mismo subdominio en llamadas repetidas',
    I.construirUrlTile(9, 100, 200) === I.construirUrlTile(9, 100, 200));

  var urlA = I.construirUrlTile(9, 0, 0);
  var urlB = I.construirUrlTile(9, 1, 0);
  assert('construirUrlTile reparte tiles distintos entre subdominios a/b/c/d (no siempre el mismo)',
    urlA.match(/^https:\/\/([a-d])\./)[1] !== urlB.match(/^https:\/\/([a-d])\./)[1]);
})();

console.log('');
console.log('RESULTADO: ' + (total - fallos) + '/' + total + ' aserciones OK.');
if (fallos > 0) {
  console.error(fallos + ' fallo(s).');
  process.exit(1);
}
process.exit(0);

