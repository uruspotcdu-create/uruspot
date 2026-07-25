/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-reticula.js
   Fase 3: familia "Retícula cartográfica" (Cap. 2.1, familia 1, del
   documento de Lenguaje de Assets v1.0)

   Subsistema del Grupo de Contenido Visual. Responsabilidad única:
   pedirle su SVG al Asset Registry ('lineas-cartograficas', Cap. 8.1)
   e insertarlo dentro del plano P0 que expone el Plane Manager — no
   dibuja geometría propia (eso vive en el archivo .svg, Cap. 3.3) ni
   decide su propio plano o movimiento (los hereda: plano P0 vía
   AmbientePlanos, firma de movimiento "Respiración" ya declarada en
   assets/ambient/_tokens/ambiente-tokens-movimiento.css sobre la
   clase .amb-asset--reticula que el propio SVG ya trae).

   Idempotente: iniciar() no vuelve a insertar si ya insertó. Si el
   Asset Registry no puede resolver el binario (red, archivo movido),
   simplemente no aparece — nunca rompe el resto del Ambient Engine
   (mismo principio de "degradación aceptable" que ya usa el resto
   del sistema, ver ambiente-capa-fondo.css sobre @property).

   Debe cargarse después de ambiente-planos.js y ambiente-assets.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ID_ASSET = 'lineas-cartograficas';
  var insertado = false;

  function insertarEnPlano(markupSvg) {
    if (insertado || !markupSvg) return;
    var planos = global.AmbientePlanos;
    var contenedor = planos ? planos.contenedor('p0') : null;
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

  global.AmbienteReticula = api;

})(window);
