/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — motor-comparacion.js
   Comparador inline (Fase 4, Journey/UX, evolutivo A→C — URUSPOT-
   PENDIENTES, Fase 3D §5 "Vista de Evaluación/comparación").

   ───────────────────────────────────────────────────────────────────
   POR QUÉ UN MÓDULO PROPIO (y no lógica suelta en app.js)
   ───────────────────────────────────────────────────────────────────
   app.js ya consume esta API (ver pintarTarjetas / render(), rama
   RAMA_CURADURIA) desde antes de que este archivo existiera —
   `window.URU_COMPARACION.esComparable(lista)` /
   `.comparar(lista, { ubicacion })` — con guardas `window.URU_COMPARACION &&`
   en cada punto de uso, así que su ausencia nunca rompió nada: el
   comparador simplemente quedaba "apagado" (comparacion: null) y todo
   seguía funcionando como una lista normal. Este archivo cierra esa
   brecha con la MISMA firma que app.js ya espera — cero cambios en
   app.js, ficha.js ni CSS.

   Mismo criterio de frontera que motor-exposicion.js: función pura,
   sin DOM, sin fetch, sin depender de app.js. Recibe la lista ya
   resuelta (coleccionCurada() + ordenarPorCercania(), ver app.js) y
   la ubicación ya resuelta (uiState.ubicacionUsuario, que puede ser
   null si el usuario nunca activó "Cerca de mí") — este módulo nunca
   pide geolocalización por su cuenta.

   ───────────────────────────────────────────────────────────────────
   QUÉ HACE
   ───────────────────────────────────────────────────────────────────
   • `esComparable(lista)`: la comparación solo tiene sentido en un
     rango chico (Blueprint V2: "2-4 — con más guardados vuelve a ser
     una lista normal, comparar 8 cosas a la vez no es comparar, es
     abrumar"). Fuera de ese rango, false.
   • `comparar(lista, contexto)`: para el mismo rango, calcula:
       - `cantidad`: lista.length, para el texto "Comparando N de tus
         guardados" (ver app.js, notaComparacion).
       - `mismoRubro`: true si TODOS comparten `.grupo` — decide si
         ese texto termina en "." o en " (de distinto rubro).".
       - `porId`: por cada lugar, qué badge (si alguno) le corresponde:
         `esMejorRating` / `esMasCercano`. Ninguna de las dos señales
         se otorga si hay empate en el valor ganador — un badge que
         dice "mejor" sobre un empate sería un dato inventado, no uno
         real (mismo principio que razonesDesdeSeñales() en
         motor-exposicion.js: nunca mostrar una razón que el dato no
         respalda).

   QUÉ NO HACE (a propósito)
   • No decide CUÁNDO mostrar el comparador — eso es de app.js (rama
     RAMA_CURADURIA nada más; búsqueda y recorte por iniciativa propia
     nunca lo activan, Blueprint v2 sección 4b).
   • No ordena la lista — llega ya ordenada (ordenarPorCercania) y
     sale en el mismo orden; `comparar()` solo anota, no reordena.
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  // Rango en el que "comparar" tiene sentido (ver nota arriba). Se
  // exponen ambos límites por si algún consumidor futuro necesita
  // mostrar el rango en UI (p. ej. un tooltip "guardá entre 2 y 4
  // para comparar") sin duplicar el número.
  var MIN_PARA_COMPARAR = 2;
  var MAX_PARA_COMPARAR = 4;

  function esComparable(lista) {
    return Array.isArray(lista) &&
      lista.length >= MIN_PARA_COMPARAR &&
      lista.length <= MAX_PARA_COMPARAR;
  }

  // Duplicada intencionalmente de la equivalente en app.js/
  // motor-exposicion.js — mismo motivo documentado en ambas: este
  // módulo no puede depender de app.js, y motor-exposicion.js no
  // expone la suya en su API pública. Fórmula de Haversine, metros.
  function distanciaMetros(lat1, lng1, lat2, lng2) {
    var R = 6371000;
    var toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad;
    var dLng = (lng2 - lng1) * toRad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function ubicacionValida(u) {
    return !!u && typeof u.lat === 'number' && typeof u.lng === 'number';
  }

  function coordenadasValidas(l) {
    return typeof l.lat === 'number' && typeof l.lng === 'number';
  }

  // Devuelve el id del único lugar "ganador" según `valorDe(lugar)`
  // (más chico o más grande, según `mejorEs`), o null si no hay
  // ganador único (empate, o ningún lugar con valor utilizable) —
  // nunca se otorga un badge sobre un empate.
  function idGanadorUnico(lista, valorDe, mejorEs) {
    var mejorValor = null;
    var mejorId = null;
    var empatado = false;

    lista.forEach(function (lugar) {
      var v = valorDe(lugar);
      if (v === null || typeof v !== 'number' || !isFinite(v)) return;

      if (mejorValor === null || (mejorEs === 'menor' ? v < mejorValor : v > mejorValor)) {
        mejorValor = v;
        mejorId = lugar.id;
        empatado = false;
      } else if (v === mejorValor) {
        empatado = true;
      }
    });

    return empatado ? null : mejorId;
  }

  /**
   * @param {object[]} lista — 2 a 4 lugares (mismo shape que el
   *   registro: id, grupo, rating opcional, lat/lng opcionales).
   * @param {object} [contexto] — { ubicacion:{lat,lng} } opcional.
   * @returns {{cantidad:number, mismoRubro:boolean,
   *   porId:Object<string,{esMejorRating:boolean,esMasCercano:boolean}>}}
   */
  function comparar(lista, contexto) {
    contexto = contexto || {};
    var ubicacion = ubicacionValida(contexto.ubicacion) ? contexto.ubicacion : null;

    var primerGrupo = lista.length ? lista[0].grupo : null;
    var mismoRubro = lista.every(function (l) { return l.grupo === primerGrupo; });

    var idMejorRating = idGanadorUnico(lista, function (l) {
      return typeof l.rating === 'number' ? l.rating : null;
    }, 'mayor');

    var idMasCercano = ubicacion
      ? idGanadorUnico(lista, function (l) {
        return coordenadasValidas(l)
          ? distanciaMetros(ubicacion.lat, ubicacion.lng, l.lat, l.lng)
          : null;
      }, 'menor')
      : null;

    var porId = {};
    lista.forEach(function (lugar) {
      porId[lugar.id] = {
        esMejorRating: lugar.id === idMejorRating,
        esMasCercano: lugar.id === idMasCercano
      };
    });

    return {
      cantidad: lista.length,
      mismoRubro: mismoRubro,
      porId: porId
    };
  }

  global.URU_COMPARACION = {
    MIN_PARA_COMPARAR: MIN_PARA_COMPARAR,
    MAX_PARA_COMPARAR: MAX_PARA_COMPARAR,
    esComparable: esComparable,
    comparar: comparar
  };

})(typeof window !== 'undefined' ? window : global);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window.URU_COMPARACION : global.URU_COMPARACION);
}

