(function() {
  'use strict';
  var TILE_SIZE = 0.05;
  var CACHE_TILES = new Map();
  var lugaresEnCache = new Map();
  var FETCH_BUFFER = 2;

  function getTileKey(lat, lng) {
    var tileX = Math.floor(lng / TILE_SIZE);
    var tileY = Math.floor(lat / TILE_SIZE);
    return tileX + ',' + tileY;
  }

  function getTilesForViewport(bounds) {
    var tiles = new Set();
    var minX = Math.floor(bounds.west / TILE_SIZE);
    var maxX = Math.floor(bounds.east / TILE_SIZE);
    var minY = Math.floor(bounds.south / TILE_SIZE);
    var maxY = Math.floor(bounds.north / TILE_SIZE);

    for (var x = minX - FETCH_BUFFER; x <= maxX + FETCH_BUFFER; x++) {
      for (var y = minY - FETCH_BUFFER; y <= maxY + FETCH_BUFFER; y++) {
        tiles.add(x + ',' + y);
      }
    }
    return tiles;
  }

  function fetchTile(tileKey) {
    if (CACHE_TILES.has(tileKey)) {
      return Promise.resolve(CACHE_TILES.get(tileKey));
    }
    return fetch('datos/lugares-mapa-tiles/' + tileKey + '.json')
      .then(r => r.ok ? r.json() : [])
      .then(lugares => {
        CACHE_TILES.set(tileKey, lugares);
        lugares.forEach(l => lugaresEnCache.set(l.id, l));
        return lugares;
      })
      .catch(e => { console.warn('Tile error:', e); return []; });
  }

  window.Virtualizador = {
    cargarParaViewport(bounds) {
      var tiles = getTilesForViewport(bounds);
      var promesas = Array.from(tiles).map(fetchTile);
      return Promise.all(promesas).then(resultados => {
        var todos = [];
        resultados.forEach(tile => { todos = todos.concat(tile || []); });
        return todos;
      });
    },
    obtenerCacheado(id) { return lugaresEnCache.get(id); },
    limpiarCache() { CACHE_TILES.clear(); lugaresEnCache.clear(); }
  };
})();
