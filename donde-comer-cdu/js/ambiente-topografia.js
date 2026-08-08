/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-topografia.js
   Fase 3: familia "Curvas topográficas" (Cap. 2.1, familia 5, del
   documento de Lenguaje de Assets v1.0)

   Subsistema del Grupo de Contenido Visual. Responsabilidad única:
   pedirle su SVG al Asset Registry ('curvas-topograficas', Cap. 8.1)
   e insertarlo dentro del plano P0 — mismo patrón exacto que
   ambiente-reticula.js (ver ese archivo para el detalle de las
   reglas que ambos respetan). Se mantiene como módulo aparte, no
   fusionado con Retícula, porque son dos familias distintas del Cap.
   2 del documento (Cap. 3.4: "un asset = un archivo"; acá aplicado
   también a nivel de familia — cada una con su propio módulo de
   comportamiento, aunque ambas compartan plano y firma de
   movimiento).

   Debe cargarse después de ambiente-planos.js y ambiente-assets.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ID_ASSET = 'curvas-topograficas';
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

  global.AmbienteTopografia = api;

})(window);

