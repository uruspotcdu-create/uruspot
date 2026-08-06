/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — js/app-formato.js
   Segundo módulo real (auditoría de ingeniería, Oportunidad 3,
   2026-08-06) de la separación de app.js por responsabilidad.

   Por qué éste es el segundo: al mapear el grupo "render de tarjetas"
   para extraerlo, grep confirmó que sus funciones de formato/escape
   (`escapeHTML`, `cssEscape`, `slug`, `mapsHref`, `distanciaMetros`,
   `formatoDistancia`) NO son exclusivas de las tarjetas — también las
   usan el render de destacados (`pintarDestacados`) y el de la
   herramienta de mapa (`actualizarMapaHerramienta`, `pintarLeyenda`).
   Sacarlas junto con `pintarTarjetas` habría creado una dependencia
   cruzada nueva (destacados/mapa importando desde el módulo de
   tarjetas) en vez de resolver una. Se extraen antes, solas, como lo
   que realmente son: un sexto grupo transversal que el informe
   original no nombró porque agrupaba por *quién las llama*, no por
   *qué necesitan para funcionar* — y estas siete funciones no
   necesitan nada.

   A diferencia de `app-telemetria.js` (que sí necesita `configurar()`
   porque lee estado privado de app.js), estas funciones son 100%
   puras respecto del estado de la aplicación: nunca leen `estado`,
   `uiState`, `DOM`, `REGISTRO` ni ningún otro closure de app.js — solo
   sus propios parámetros y, cuando corresponde, un global de solo
   lectura (`window.URU_LOCALES_SLUGS`, `window.CSS`,
   `window.Coreografias`, `window.matchMedia`). Verificado por grep
   antes de mover cada una: ninguna asigna a nada fuera de sí misma.
   Por eso este módulo no tiene `configurar()` — no hay nada que
   inyectar.

   `prefiereMovimientoReducido` viaja con este grupo aunque no sea
   texto/URL: es la misma categoría de función (sin estado propio,
   consultada desde tarjetas Y desde el resto del render) y separarla
   habría dejado un séptimo módulo de una sola función sin necesidad.

   Carga: sin dependencias, así que el orden respecto de
   app-telemetria.js no importa — pero debe estar disponible ANTES de
   que se ejecute el cuerpo de nivel superior de app.js (que asigna
   los alias locales de estas funciones apenas arranca), por eso va
   junto a ciclo-vida.js y app-telemetria.js en index.html, antes de
   motor.bundle.js — no dentro de ningún bundle.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function cssEscape(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function slug(lugar) {
    var mapa = window.URU_LOCALES_SLUGS;
    return (mapa && mapa[lugar.id]) || null;
  }

  function mapsHref(lugar) {
    if (typeof lugar.lat === 'number' && typeof lugar.lng === 'number') {
      return 'https://www.google.com/maps/search/?api=1&query=' + lugar.lat + ',' + lugar.lng;
    }
    if (lugar.direccion) {
      return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lugar.nombre + ', ' + lugar.direccion);
    }
    return null;
  }

  function distanciaMetros(lat1, lng1, lat2, lng2) {
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatoDistancia(m) {
    if (m < 1000) return Math.round(m / 10) * 10 + ' m';
    return (m / 1000).toFixed(1).replace('.0', '') + ' km';
  }

  function prefiereMovimientoReducido() {
    if (window.Coreografias) return window.Coreografias.reducirMovimiento();
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  global.AppFormato = {
    escapeHTML: escapeHTML,
    cssEscape: cssEscape,
    slug: slug,
    mapsHref: mapsHref,
    distanciaMetros: distanciaMetros,
    formatoDistancia: formatoDistancia,
    prefiereMovimientoReducido: prefiereMovimientoReducido
  };

})(window);
