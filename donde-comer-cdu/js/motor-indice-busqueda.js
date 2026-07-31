(function() {
  'use strict';
  var indice = {};
  function normalizarPalabra(word) {
    return word.toLowerCase().replace(/[áéíóú]/g, function(c) {
      var m = {á:'a', é:'e', í:'i', ó:'o', ú:'u'};
      return m[c] || c;
    });
  }
  function construirIndice(lugares) {
    indice = {};
    lugares.forEach(function(l, idx) {
      var campos = [l.nombre, l.categoria, l.grupo, (l.direccion || '')];
      campos.forEach(function(campo) {
        if (!campo) return;
        var palabras = campo.toLowerCase().split(/\s+/);
        palabras.forEach(function(p) {
          var norm = normalizarPalabra(p);
          if (!indice[norm]) indice[norm] = [];
          if (indice[norm].indexOf(idx) === -1) indice[norm].push(idx);
        });
      });
    });
  }
  function buscarPorIndice(lugares, query) {
    var q = normalizarPalabra(query.trim());
    if (!q || q.length < 2) return lugares.slice();
    var ids = indice[q];
    if (!ids || !ids.length) return [];
    return ids.map(function(idx) { return lugares[idx]; });
  }
  window.IndiceInvertido = { construir: construirIndice, buscar: buscarPorIndice };
})();
