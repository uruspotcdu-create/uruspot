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

  // 2026-08-08 (Revisión 4): profundidad por scroll, mismo mecanismo
  // ya probado en ambiente-particulas-deriva.js (Cap. 6.1: "Sí
  // (parallax)" también aplica a esta familia — Orientación, igual
  // que Partículas de deriva, vive en P2). Se escribe sobre el propio
  // contenedor del plano ('p2'), no sobre el <svg>: las custom
  // properties heredan hacia abajo, así que una sola escritura llega
  // tanto al <svg> (.amb-asset--brujula) como al pseudo-elemento del
  // glow (.ambiente-plano--p2::before, ver css/ambiente-planos.css)
  // sin que este módulo necesite conocer al glow en absoluto — sigue
  // siendo responsabilidad exclusiva de ese archivo CSS cómo se ve.
  //
  // Dos variables, dos velocidades (Cap. 5: "máximo dos grupos de
  // movimiento por familia"): la Brújula se desplaza un poco más
  // rápido que su propio glow, que queda relativamente atrás — la
  // diferencia de velocidad es, por sí sola, lo que lee como
  // profundidad de dos capas en vez de un solo elemento plano
  // moviéndose. Igual que en Partículas de deriva, nunca se anima
  // opacidad ni se dispara reflow (Cap. 9.1): solo transform, vía
  // variable, siempre dentro de un rAF.
  var FACTOR_BRUJULA = 0.015;
  var TOPE_BRUJULA = 40;
  var FACTOR_GLOW = 0.007;
  var TOPE_GLOW = 22;

  var contenedorPlano = null;
  var ultimoScrollY = null;
  var frameSolicitado = false;
  var listenerActivo = false;

  function accesibilidad() { return global.AmbienteAccesibilidad || null; }

  function clamp(valor, tope) {
    return Math.max(-tope, Math.min(tope, valor));
  }

  function aplicarScroll() {
    frameSolicitado = false;
    if (!contenedorPlano) return;
    var y = global.scrollY;
    contenedorPlano.style.setProperty('--amb-brujula-scroll', clamp(y * FACTOR_BRUJULA, TOPE_BRUJULA));
    // Sentido invertido a propósito (nota de más arriba): el glow
    // queda relativamente atrás de la Brújula, no acompañándola 1:1.
    contenedorPlano.style.setProperty('--amb-brujula-glow-scroll', clamp(y * -FACTOR_GLOW, TOPE_GLOW));
  }

  function alScroll() {
    if (ultimoScrollY === global.scrollY) return;
    ultimoScrollY = global.scrollY;
    if (frameSolicitado) return;
    frameSolicitado = true;
    global.requestAnimationFrame(aplicarScroll);
  }

  function activarParallaxSiCorresponde() {
    var a = accesibilidad();
    var reducido = !!(a && a.reducirMovimiento);
    if (reducido) {
      desactivarParallax();
      return;
    }
    if (listenerActivo || !contenedorPlano) return;
    global.addEventListener('scroll', alScroll, { passive: true });
    listenerActivo = true;
    aplicarScroll();
  }

  function desactivarParallax() {
    if (!listenerActivo) return;
    global.removeEventListener('scroll', alScroll);
    listenerActivo = false;
    if (contenedorPlano) {
      contenedorPlano.style.removeProperty('--amb-brujula-scroll');
      contenedorPlano.style.removeProperty('--amb-brujula-glow-scroll');
    }
  }

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
    contenedorPlano = contenedor;
    insertado = true;

    activarParallaxSiCorresponde();
  }

  var api = {
    iniciar: function () {
      if (insertado) return;
      if (!global.AmbienteAssets || typeof global.AmbienteAssets.obtenerBinario !== 'function') return;
      global.AmbienteAssets.obtenerBinario(ID_ASSET).then(insertarEnPlano);

      var a = accesibilidad();
      if (a && typeof a.suscribir === 'function') {
        a.suscribir(function () { activarParallaxSiCorresponde(); });
      }
    }
  };

  global.AmbienteBrujula = api;

})(window);
