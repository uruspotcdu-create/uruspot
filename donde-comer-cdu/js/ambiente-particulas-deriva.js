/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-particulas-deriva.js
   Fase 3: familia "Partículas de deriva" (Cap. 2.1, familia 6, del
   documento de Lenguaje de Assets v1.0). Roadmap Cap. 12, orden 7.

   Nombre deliberadamente distinto de js/ambiente-particulas.js: ese
   archivo es el Particle Engine de la Fase 2 (Arquitectura técnica,
   Cap. 3.6) — un subsistema previo, basado en <div>, que no sigue
   ninguna regla de este documento (no usa las 5 primitivas
   compartidas, no vive en un plano P0-P3, no respeta el sistema de
   viewBox 100x100). Son dos cosas distintas que hoy conviven en el
   repo; este módulo es la familia real del Cap. 2.1, no un reemplazo
   del Particle Engine de Fase 2 — fusionarlos sería una decisión de
   arquitectura fuera del alcance de este paso.

   Mismo patrón de carga e inserción que ambiente-brujula.js
   (insertado una sola vez, siempre visible desde el arranque, plano
   P2 — Cap. 4.1: "Orientación", brújula + partículas de deriva).

   Responsabilidad adicional, propia de esta familia (Cap. 6.1: "Sí
   (parallax)", la única reactividad a scroll que exige la matriz de
   reactividad en este paso): además de insertar el asset, escucha
   scroll y traduce la posición a la variable CSS
   --amb-particulas-scroll sobre el grupo .particulas-parallax del
   propio SVG (ver assets/ambient/_tokens/ambiente-tokens-movimiento.
   css — este módulo nunca escribe transform directamente, solo la
   variable que esa regla consume, Cap. 9.1: nunca layout, siempre
   transform/opacity).

   Bajo prefers-reduced-motion (Cap. 9.5, Accessibility Manager) el
   listener de scroll ni se agrega — no tiene sentido computar un
   valor que la propia regla CSS va a ignorar (ver el bloque
   @media (prefers-reduced-motion: reduce) en tokens de movimiento).

   Debe cargarse después de ambiente-planos.js, ambiente-assets.js y
   ambiente-accesibilidad.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ID_ASSET = 'particulas-deriva';
  var insertado = false;
  var grupoParallax = null;
  var ultimoScrollY = null;
  var frameSolicitado = false;

  // Factor de atenuación del parallax — deliberadamente pequeño
  // (Cap. 6.1 lo describe como parallax de una familia de fondo, no
  // como un efecto de scroll protagonista): 0.02 hace que 500px de
  // scroll real se traduzcan en 10px de desplazamiento del grupo.
  var FACTOR_PARALLAX = 0.02;
  // Techo del desplazamiento acumulado, para que una página muy larga
  // no termine sacando las motas del viewport visible del plano P2.
  var TOPE_DESPLAZAMIENTO = 60;

  function accesibilidad() { return global.AmbienteAccesibilidad || null; }

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
    grupoParallax = svg.querySelector('.particulas-parallax');
    insertado = true;

    activarParallaxSiCorresponde();
  }

  function aplicarScroll() {
    frameSolicitado = false;
    if (!grupoParallax) return;
    var y = Math.max(-TOPE_DESPLAZAMIENTO, Math.min(TOPE_DESPLAZAMIENTO, global.scrollY * FACTOR_PARALLAX));
    grupoParallax.style.setProperty('--amb-particulas-scroll', y);
  }

  function alScroll() {
    if (ultimoScrollY === global.scrollY) return;
    ultimoScrollY = global.scrollY;
    if (frameSolicitado) return;
    frameSolicitado = true;
    global.requestAnimationFrame(aplicarScroll);
  }

  var listenerActivo = false;

  function activarParallaxSiCorresponde() {
    var a = accesibilidad();
    var reducido = !!(a && a.reducirMovimiento);
    if (reducido) {
      desactivarParallax();
      return;
    }
    if (listenerActivo || !grupoParallax) return;
    global.addEventListener('scroll', alScroll, { passive: true });
    listenerActivo = true;
    aplicarScroll();
  }

  function desactivarParallax() {
    if (!listenerActivo) return;
    global.removeEventListener('scroll', alScroll);
    listenerActivo = false;
    if (grupoParallax) grupoParallax.style.removeProperty('--amb-particulas-scroll');
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

  global.AmbienteParticulasDeriva = api;

})(window);
