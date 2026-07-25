/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-brujula.js
   Fase 3: familia "Brújula" (Cap. 2.1, familia 3, del documento de
   Lenguaje de Assets v1.0)

   Subsistema del Grupo de Contenido Visual. Responsabilidad única:
   pedirle su SVG al Asset Registry ('brujula', Cap. 8.1) e insertarlo
   dentro del plano P2 — mismo patrón de carga e inserción que
   ambiente-reticula.js / ambiente-topografia.js / ambiente-corrientes.js
   (insertado una sola vez, siempre visible desde el arranque), con
   una sola diferencia de plano: 'p2' en vez de 'p0'/'p1', porque la
   Brújula es la familia "Orientación" del Cap. 4.1.

   Reactividad a mapa/ubicación activa (Cap. 6.1: "la aguja apunta
   hacia el spot seleccionado") queda fuera de este paso a propósito
   — la oscilación libre definida en ambiente-tokens-movimiento.css
   es, por ahora, el único comportamiento de la aguja. Cablear un
   ángulo real requiere una proyección geográfica (rumbo real hacia
   el punto elegido) que hoy no existe en ningún subsistema de la
   app (ver la misma limitación ya documentada para Coordenadas en
   changelog.md) — se deja como paso posterior explícito, no como
   una excepción silenciosa (Cap. 8.2).

   Debe cargarse después de ambiente-planos.js y ambiente-assets.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ID_ASSET = 'brujula';
  var insertado = false;

  function insertarEnPlano(markupSvg) {
    if (insertado || !markupSvg) return;
    var planos = global.AmbientePlanos;
    var contenedor = planos ? planos.contenedor('p2') : null;
    if (!contenedor) return;

    var envoltorio = document.createElement('div');
    envoltorio.innerHTML = markupSvg;
    var svg = envoltorio.querySelector('svg');
    if (!svg) return;

    contenedor.appendChild(svg);
    insertado = true;
  }

  var api = {
    iniciar: function () {
      if (insertado) return;
      if (!global.AmbienteAssets || typeof global.AmbienteAssets.obtenerBinario !== 'function') return;
      global.AmbienteAssets.obtenerBinario(ID_ASSET).then(insertarEnPlano);
    }
  };

  global.AmbienteBrujula = api;

})(window);
