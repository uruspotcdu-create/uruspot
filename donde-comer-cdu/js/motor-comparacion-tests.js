/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — motor-comparacion-tests.js
   Suite del comparador inline (motor-comparacion.js), mismo patrón
   sin framework que motor-test.js. Corre con:
     node js/motor-comparacion-tests.js
   Sale con código 1 si algo falla (run-tests.js la integra como
   suite 6/6).
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

var COMP = require('./motor-comparacion.js');

var fallos = 0, total = 0;
function assert(desc, cond) {
  total++;
  if (!cond) { fallos++; console.error('✗ ' + desc); }
  else console.log('✓ ' + desc);
}

function lugar(id, grupo, rating, lat, lng) {
  var l = { id: id, grupo: grupo };
  if (typeof rating === 'number') l.rating = rating;
  if (typeof lat === 'number') l.lat = lat;
  if (typeof lng === 'number') l.lng = lng;
  return l;
}

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 1 — esComparable(): rango 2-4
   ═══════════════════════════════════════════════════════════════════ */

assert('esComparable: 0 elementos -> false', COMP.esComparable([]) === false);
assert('esComparable: 1 elemento -> false', COMP.esComparable([lugar('a', 'bar')]) === false);
assert('esComparable: 2 elementos -> true', COMP.esComparable([lugar('a', 'bar'), lugar('b', 'bar')]) === true);
assert('esComparable: 4 elementos -> true', COMP.esComparable([
  lugar('a', 'bar'), lugar('b', 'bar'), lugar('c', 'bar'), lugar('d', 'bar')
]) === true);
assert('esComparable: 5 elementos -> false', COMP.esComparable([
  lugar('a', 'bar'), lugar('b', 'bar'), lugar('c', 'bar'), lugar('d', 'bar'), lugar('e', 'bar')
]) === false);
assert('esComparable: no-array -> false', COMP.esComparable(null) === false);
assert('MIN_PARA_COMPARAR y MAX_PARA_COMPARAR expuestos', COMP.MIN_PARA_COMPARAR === 2 && COMP.MAX_PARA_COMPARAR === 4);

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 2 — comparar(): cantidad y mismoRubro
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var r = COMP.comparar([lugar('a', 'bar'), lugar('b', 'bar'), lugar('c', 'bar')]);
  assert('comparar: cantidad = lista.length', r.cantidad === 3);
  assert('comparar: mismoRubro true cuando todos comparten grupo', r.mismoRubro === true);
})();

(function () {
  var r = COMP.comparar([lugar('a', 'bar'), lugar('b', 'restaurante')]);
  assert('comparar: mismoRubro false cuando difieren', r.mismoRubro === false);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 3 — esMejorRating: gana el único máximo, empate no otorga badge
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var a = lugar('a', 'bar', 4.5);
  var b = lugar('b', 'bar', 4.8);
  var c = lugar('c', 'bar', 4.2);
  var r = COMP.comparar([a, b, c]);
  assert('esMejorRating: el rating más alto gana', r.porId.b.esMejorRating === true);
  assert('esMejorRating: los demás no ganan', r.porId.a.esMejorRating === false && r.porId.c.esMejorRating === false);
})();

(function () {
  var a = lugar('a', 'bar', 4.8);
  var b = lugar('b', 'bar', 4.8);
  var r = COMP.comparar([a, b]);
  assert('esMejorRating: empate no otorga badge a nadie', r.porId.a.esMejorRating === false && r.porId.b.esMejorRating === false);
})();

(function () {
  var a = lugar('a', 'bar'); // sin rating
  var b = lugar('b', 'bar'); // sin rating
  var r = COMP.comparar([a, b]);
  assert('esMejorRating: ningún lugar con rating -> nadie gana', r.porId.a.esMejorRating === false && r.porId.b.esMejorRating === false);
})();

(function () {
  var a = lugar('a', 'bar', 4.5);
  var b = lugar('b', 'bar'); // sin rating: no participa
  var r = COMP.comparar([a, b]);
  assert('esMejorRating: único con rating gana aunque el otro no tenga dato', r.porId.a.esMejorRating === true);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 4 — esMasCercano: requiere ubicación en el contexto
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  // Punto de referencia: -32.4833,-58.2333 (CdU). b está más cerca.
  var a = lugar('a', 'bar', null, -32.50, -58.25);
  var b = lugar('b', 'bar', null, -32.484, -58.234);
  var r = COMP.comparar([a, b], { ubicacion: { lat: -32.4833, lng: -58.2333 } });
  assert('esMasCercano: el de menor distancia gana', r.porId.b.esMasCercano === true);
  assert('esMasCercano: el otro no gana', r.porId.a.esMasCercano === false);
})();

(function () {
  var a = lugar('a', 'bar', null, -32.50, -58.25);
  var b = lugar('b', 'bar', null, -32.51, -58.26);
  var r = COMP.comparar([a, b]); // sin contexto.ubicacion
  assert('esMasCercano: sin ubicación en el contexto, nadie gana', r.porId.a.esMasCercano === false && r.porId.b.esMasCercano === false);
})();

(function () {
  var a = lugar('a', 'bar'); // sin lat/lng
  var b = lugar('b', 'bar'); // sin lat/lng
  var r = COMP.comparar([a, b], { ubicacion: { lat: -32.4833, lng: -58.2333 } });
  assert('esMasCercano: sin coordenadas en los lugares, nadie gana', r.porId.a.esMasCercano === false && r.porId.b.esMasCercano === false);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 5 — porId: una entrada por cada lugar de la lista
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var lista = [lugar('a', 'bar'), lugar('b', 'bar'), lugar('c', 'bar')];
  var r = COMP.comparar(lista);
  assert('porId: tiene una entrada por cada id de la lista', Object.keys(r.porId).length === 3 &&
    r.porId.a && r.porId.b && r.porId.c);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 6 — Pureza: comparar() no muta la lista de entrada
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var a = lugar('a', 'bar', 4.5, -32.50, -58.25);
  var b = lugar('b', 'bar', 4.8, -32.51, -58.26);
  var lista = [a, b];
  var antes = JSON.stringify(lista);
  COMP.comparar(lista, { ubicacion: { lat: -32.4833, lng: -58.2333 } });
  assert('comparar: no muta los lugares de entrada', JSON.stringify(lista) === antes);
})();

console.log('\n' + (total - fallos) + '/' + total + ' pruebas de comparación OK');

if (fallos > 0) {
  console.error('\n' + fallos + ' prueba(s) fallaron.');
  process.exit(1);
}
process.exit(0);

