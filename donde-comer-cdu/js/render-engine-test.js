// Smoke test manual de render-engine.js — corre con `node smoke-render-engine.js`
var RenderEngineFactory = require('./ui/render-engine.js');
var assert = require('assert');

function mockLugares(ids) {
  return ids.map(function (id) { return { id: id, grupo: 'restaurante', lat: -32.48, lng: -58.23 }; });
}

var deps = {
  RAMA_CURADURIA: 'curaduria',
  RAMA_BUSCADOR: 'buscador',
  ramaActual: function (reg) { return reg.rama; },
  listaPorAccionExplicita: function () { return mockLugares(['b1', 'b2']); },
  ordenarPorCercania: function (lista) { return lista; },
  leerFavoritos: function () { return { f1: true }; }
};

var engine = RenderEngineFactory.crear(deps);

// 1) Rama recorte (iniciativa propia) — primera vez, debe devolver resultado
var EXPO1 = {
  recortePorIniciativaPropia: function () { return mockLugares(['r1', 'r2', 'r3']); }
};
var ctx1 = {
  estado: {}, PLANO: { region: function () { return { nombre: 'guia', rama: 'recorte:guia' }; } },
  EXPO: EXPO1, REGISTRO: mockLugares(['r1', 'r2', 'r3']),
  uiState: { ultimaRamaRenderizada: null }
};
var res1 = engine.calcular(ctx1);
assert.ok(res1, 'primer render debe producir resultado');
assert.strictEqual(res1.rama, 'recorte:guia');
assert.strictEqual(res1.lista.length, 3);
console.log('[OK] Rama recorte inicial');

// 2) Mismo estado, misma lista → debe devolver null (sin cambios)
ctx1.uiState.ultimaRamaRenderizada = res1.rama;
var res1b = engine.calcular(ctx1);
assert.strictEqual(res1b, null, 'sin cambios debe devolver null');
console.log('[OK] Detección de "sin cambios"');

// 3) Cambiar a rama buscador (simula escribir en el buscador)
var ctx2 = {
  estado: {}, PLANO: { region: function () { return { nombre: 'accionDirecta', rama: 'buscador' }; } },
  EXPO: EXPO1, REGISTRO: mockLugares(['r1', 'r2', 'r3']),
  uiState: { ultimaRamaRenderizada: ctx1.uiState.ultimaRamaRenderizada }
};
var res2 = engine.calcular(ctx2);
assert.ok(res2, 'cambio de rama debe producir resultado');
assert.strictEqual(res2.rama, 'buscador');
assert.strictEqual(res2.opts.origen, 'accion_explicita');
console.log('[OK] Rama buscador (cambio de rama detectado)');

// 4) Rama curaduria (guardar favorito / ver guardados)
var EXPO3 = {
  coleccionCurada: function (registro, ids) { return mockLugares(ids); }
};
var ctx3 = {
  estado: {}, PLANO: { region: function () { return { nombre: 'curaduria', rama: 'curaduria' }; } },
  EXPO: EXPO3, REGISTRO: mockLugares(['f1']),
  uiState: { ultimaRamaRenderizada: res2.rama }
};
var res3 = engine.calcular(ctx3);
assert.ok(res3, 'rama curaduria debe producir resultado');
assert.strictEqual(res3.rama, 'curaduria');
assert.strictEqual(res3.lista.length, 1);
assert.strictEqual(res3.lista[0].id, 'f1');
assert.ok(res3.opts.vacioTexto, 'curaduria debe traer vacioTexto');
console.log('[OK] Rama curaduria (favoritos)');

// 5) obtenerCache/reiniciarCache
var cacheAntes = engine.obtenerCache();
assert.strictEqual(cacheAntes.rama, 'curaduria');
engine.reiniciarCache();
var cacheDespues = engine.obtenerCache();
assert.strictEqual(cacheDespues.lista, null);
console.log('[OK] obtenerCache / reiniciarCache');

console.log('\n5/5 checks OK');
