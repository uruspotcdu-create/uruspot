'use strict';
// Los archivos originales usan el patrón (function(global){...})(window||global)
// y exportan también vía module.exports cuando existe. En Node, 'window' no
// existe, así que caen a 'global' — perfecto para requerir tal cual, sin tocar
// una sola línea del código fuente real.

// Mock mínimo de localStorage para motor-plano.js (obtenerUsuarioId /
// leerEstado / guardarEstado). El código YA maneja su ausencia con
// try/catch, pero lo proveemos para poder testear también la persistencia.
function mockLocalStorage() {
  var store = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; },
    clear: function () { store = {}; }
  };
}

global.localStorage = mockLocalStorage();

var CFG = require('./motor-config.js');
var PLANO = require('./motor-plano.js');
var EXPOSICION = require('./motor-exposicion.js');

module.exports = { CFG: CFG, PLANO: PLANO, EXPOSICION: EXPOSICION, mockLocalStorage: mockLocalStorage };
