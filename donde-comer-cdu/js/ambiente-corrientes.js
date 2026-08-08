/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-corrientes.js
   Fase 3: familia "Corrientes" (Cap. 2.1, familia 2, del documento de
   Lenguaje de Assets v1.0)

   Subsistema del Grupo de Contenido Visual. Responsabilidad única:
   pedirle su SVG al Asset Registry ('corrientes', Cap. 8.1) e
   insertarlo dentro del plano P1 — mismo patrón exacto que
   ambiente-reticula.js y ambiente-topografia.js (ver esos archivos
   para el detalle de las reglas que los tres respetan), con una
   sola diferencia deliberada: el contenedor es 'p1', no 'p0', porque
   Corrientes es la familia "Corriente" del Cap. 4.1, un plano más
   cerca que Retícula/Topográficas.

   Se mantiene como módulo aparte, no fusionado con los anteriores,
   por el mismo criterio que ya separa a esos dos entre sí (Cap. 3.4:
   "un asset = un archivo", aplicado también a nivel de familia — cada
   una con su propio módulo de comportamiento).

   Debe cargarse después de ambiente-planos.js y ambiente-assets.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ID_ASSET = 'corrientes';
  var insertado = false;

  function insertarEnPlano(markupSvg) {
    if (insertado || !markupSvg) return;
    var planos = global.AmbientePlanos;
    var contenedor = planos ? planos.contenedor('p1') : null;
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

  global.AmbienteCorrientes = api;

})(window);

