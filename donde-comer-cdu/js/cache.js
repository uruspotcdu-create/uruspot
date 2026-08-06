/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — cache.js

   FASE 2 del Plan Maestro de Modularización (2026-08-06), primer
   módulo: caché de distancias por ubicación de referencia. Extraído
   de app.js §2 (Cache y Estado Global) sin cambios de comportamiento
   — es el bloque de esa sección con menor acoplamiento (cero
   dependencias de otro estado de app.js más allá de
   calcularDistancia(), ya modularizada en pure-utils.js desde
   Fase 1), así que es el punto de partida más seguro de Fase 2.

   Responsabilidad única: dado (lista, lat, lng), devolver la lista
   ordenada por cercanía, cacheando el mapeo id→distancia por
   ubicación de referencia (hasta 10 ubicaciones simultáneas, LRU
   simple por orden de inserción) para no recalcular Haversine en
   cada búsqueda/filtro con la misma ubicación.
   ═══════════════════════════════════════════════════════════════════ */

import { calcularDistancia } from './pure-utils.js';

var DISTANCIA_CACHE = Object.create(null);
var MAX_UBICACIONES_CACHEADAS = 10;

export function ordenarPorCercaniaConCache(lista, lat, lng) {
  var cacheKey = lat.toFixed(6) + ',' + lng.toFixed(6);

  if (DISTANCIA_CACHE[cacheKey]) {
    var mapeoDistancias = DISTANCIA_CACHE[cacheKey];
    var listaCopia = lista.slice();
    listaCopia.sort(function (a, b) {
      var distA = mapeoDistancias[a.id] !== undefined
        ? mapeoDistancias[a.id]
        : 999999;
      var distB = mapeoDistancias[b.id] !== undefined
        ? mapeoDistancias[b.id]
        : 999999;
      return distA - distB;
    });
    return listaCopia;
  }

  var distancias = Object.create(null);
  lista.forEach(function (l) {
    if (l.lat !== undefined && l.lng !== undefined) {
      distancias[l.id] = calcularDistancia(l.lat, l.lng, lat, lng);
    }
  });

  DISTANCIA_CACHE[cacheKey] = distancias;

  var cacheKeys = Object.keys(DISTANCIA_CACHE);
  if (cacheKeys.length > MAX_UBICACIONES_CACHEADAS) {
    var keyAntigua = cacheKeys[0];
    delete DISTANCIA_CACHE[keyAntigua];
  }

  var listaCopia = lista.slice();
  listaCopia.sort(function (a, b) {
    return (distancias[a.id] || 999999) - (distancias[b.id] || 999999);
  });

  return listaCopia;
}

// Expuesto solo para tests/diagnóstico — ningún llamador de producción
// debería necesitar limpiar el caché manualmente.
export function _limpiarCacheDistancias() {
  DISTANCIA_CACHE = Object.create(null);
}
