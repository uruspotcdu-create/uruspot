/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — proyeccion.js
   Matemática pura de proyección Web Mercator. Sin DOM, sin efectos
   secundarios, sin dependencias. Es la única fuente de verdad para
   convertir lat/lng ⇄ pixeles de mundo en cualquier zoom (entero o
   fraccionario). Todo lo demás del motor del mapa se apoya en esto,
   nunca reimplementa la conversión por su cuenta.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var TAM_TILE = 256;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  // lat/lng → pixeles de mundo en el zoom dado (puede ser fraccionario)
  function proyectar(lat, lng, zoom) {
    var escala = TAM_TILE * Math.pow(2, zoom);
    var seno = clamp(Math.sin(lat * Math.PI / 180), -0.9999, 0.9999);
    var x = escala * (0.5 + lng / 360);
    var y = escala * (0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI));
    return { x: x, y: y };
  }

  // pixeles de mundo → lat/lng en el zoom dado
  function desproyectar(x, y, zoom) {
    var escala = TAM_TILE * Math.pow(2, zoom);
    var lng = (x / escala - 0.5) * 360;
    var n = Math.PI - 2 * Math.PI * (y / escala);
    var lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat: lat, lng: lng };
  }

  // Pixel de PANTALLA (relativo al contenedor) para un punto dado, según
  // el estado actual del viewport (centro + zoom + tamaño del contenedor)
  function puntoAPantalla(lat, lng, viewport) {
    var centro = proyectar(viewport.lat, viewport.lng, viewport.zoom);
    var p = proyectar(lat, lng, viewport.zoom);
    return {
      x: p.x - centro.x + viewport.ancho / 2,
      y: p.y - centro.y + viewport.alto / 2
    };
  }

  // Inversa: pixel de pantalla → lat/lng, dado el viewport actual
  function pantallaAPunto(x, y, viewport) {
    var centro = proyectar(viewport.lat, viewport.lng, viewport.zoom);
    return desproyectar(
      centro.x + (x - viewport.ancho / 2),
      centro.y + (y - viewport.alto / 2),
      viewport.zoom
    );
  }

  // Calcula centro + zoom entero que encuadran un conjunto de puntos
  // con un margen (padding) en pixeles, sin superar zoomMax.
  function encuadrar(puntos, ancho, alto, padding, zoomMax) {
    if (!puntos.length) return null;
    if (puntos.length === 1) {
      return { lat: puntos[0].lat, lng: puntos[0].lng, zoom: Math.min(16, zoomMax) };
    }
    var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    puntos.forEach(function (p) {
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
    });
    var centroLat = (minLat + maxLat) / 2, centroLng = (minLng + maxLng) / 2;
    var zoom;
    for (zoom = zoomMax; zoom > 2; zoom--) {
      var pMin = proyectar(maxLat, minLng, zoom);
      var pMax = proyectar(minLat, maxLng, zoom);
      var w = Math.abs(pMax.x - pMin.x), h = Math.abs(pMax.y - pMin.y);
      if (w <= ancho - padding * 2 && h <= alto - padding * 2) break;
    }
    return { lat: centroLat, lng: centroLng, zoom: zoom };
  }

  var API = {
    TAM_TILE: TAM_TILE,
    clamp: clamp,
    proyectar: proyectar,
    desproyectar: desproyectar,
    puntoAPantalla: puntoAPantalla,
    pantallaAPunto: pantallaAPunto,
    encuadrar: encuadrar
  };

  global.URU_PROYECCION = API;
})(typeof window !== 'undefined' ? window : global);
if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window.URU_PROYECCION : global.URU_PROYECCION);
}
