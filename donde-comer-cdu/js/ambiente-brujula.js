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

  // 2026-08-08 (Revisión 6): segunda señal de profundidad, además del
  // scroll — posición del puntero. Deliberadamente restringida a
  // dispositivos con puntero fino y hover real (mouse de escritorio):
  // `matchMedia('(hover: hover) and (pointer: fine)')` es el mismo
  // criterio que ya usa el resto de la industria para distinguir
  // "puede acompañar al cursor sin estorbar" de touch, donde un
  // `pointermove` no es una señal de atención del usuario sino ruido
  // del propio gesto de scroll/tap — nunca se agrega el listener en
  // touch, ni siquiera detrás de un chequeo posterior. Igual criterio
  // de "el glow queda más atrás" que ya rige el parallax de scroll de
  // más arriba: dos variables nuevas, misma jerarquía de profundidad,
  // ahora sumada en vez de reemplazando a la variable de scroll (ver
  // el `calc()` combinado en css/ambiente-planos.css).
  var FACTOR_PUNTERO_BRUJULA = 0.05;
  var TOPE_PUNTERO_BRUJULA = 18;
  var FACTOR_PUNTERO_GLOW = 0.022;
  var TOPE_PUNTERO_GLOW = 9;

  var contenedorPlano = null;
  var ultimoScrollY = null;

  // 2026-08-09 (auditoría, hallazgo de código): las 4 variables de
  // parallax (scroll x2, puntero x2) se escribían solo sobre
  // contenedorPlano (el div de P2) — como los planos son 4 <div>
  // hermanos bajo #ambiente-planos (ver js/ambiente-planos.js), una
  // custom property escrita ahí nunca llega a P0/P1/P3 por herencia
  // (las custom properties heredan hacia abajo del árbol DOM, nunca
  // entre hermanos). Esto no rompía nada visible en la Brújula ni en
  // su propio glow (ambos SÍ son descendientes de P2, así que a ellos
  // sí les llegaba), pero dejaba muerta a .ambiente-plano--p1::before
  // (capa atmosférica, Revisión 9 en css/ambiente-planos.css), que
  // lee --amb-brujula-scroll esperando que valga algo distinto de 0
  // y en la práctica siempre calculaba translateY(0) — la variable
  // jamás llegaba a P1. Se agrega un segundo destino de escritura,
  // document.documentElement (ancestro real de los 4 planos, mismo
  // elemento donde ya publica su propia señal js/ambiente-clima.js),
  // sin sacar la escritura sobre contenedorPlano — así ningún
  // consumidor actual (Brújula, su glow) cambia de comportamiento, y
  // los nuevos consumidores entre planos (P1, y Corrientes más abajo)
  // pasan a recibir el valor real.
  var raizVariables = (typeof document !== 'undefined') ? document.documentElement : null;
  var frameSolicitado = false;
  var listenerActivo = false;
  var frameSolicitadoPuntero = false;
  var listenerPunteroActivo = false;
  var ultimoPunteroX = 0;
  var ultimoPunteroY = 0;

  function accesibilidad() { return global.AmbienteAccesibilidad || null; }
  function soportaPuntero() {
    return typeof global.matchMedia === 'function' &&
      global.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }

  function clamp(valor, tope) {
    return Math.max(-tope, Math.min(tope, valor));
  }

  function aplicarScroll() {
    frameSolicitado = false;
    if (!contenedorPlano) return;
    var y = global.scrollY;
    var valorScroll = clamp(y * FACTOR_BRUJULA, TOPE_BRUJULA);
    var valorGlowScroll = clamp(y * -FACTOR_GLOW, TOPE_GLOW);
    contenedorPlano.style.setProperty('--amb-brujula-scroll', valorScroll);
    // Sentido invertido a propósito (nota de más arriba): el glow
    // queda relativamente atrás de la Brújula, no acompañándola 1:1.
    contenedorPlano.style.setProperty('--amb-brujula-glow-scroll', valorGlowScroll);
    // Ver nota de raizVariables más arriba: mismo valor, también en el
    // ancestro común de los 4 planos, para que P1 (y cualquier otro
    // plano que en el futuro quiera sumarse) también lo reciba.
    if (raizVariables) {
      raizVariables.style.setProperty('--amb-brujula-scroll', valorScroll);
      raizVariables.style.setProperty('--amb-brujula-glow-scroll', valorGlowScroll);
    }
  }

  function alScroll() {
    if (ultimoScrollY === global.scrollY) return;
    ultimoScrollY = global.scrollY;
    if (frameSolicitado) return;
    frameSolicitado = true;
    global.requestAnimationFrame(aplicarScroll);
  }

  function aplicarPuntero() {
    frameSolicitadoPuntero = false;
    if (!contenedorPlano) return;
    // Offset relativo al centro del viewport, no a la posición
    // absoluta del puntero — así el efecto es "hacia dónde mirás
    // dentro de la pantalla", no una coordenada cruda sin sentido
    // visual (mismo espíritu que el ancla óptica (50,50) que ya usan
    // Coordenadas/Halos).
    var dx = ultimoPunteroX - global.innerWidth / 2;
    var dy = ultimoPunteroY - global.innerHeight / 2;
    contenedorPlano.style.setProperty('--amb-brujula-puntero-x', clamp(dx * FACTOR_PUNTERO_BRUJULA, TOPE_PUNTERO_BRUJULA));
    contenedorPlano.style.setProperty('--amb-brujula-puntero-y', clamp(dy * FACTOR_PUNTERO_BRUJULA, TOPE_PUNTERO_BRUJULA));
    contenedorPlano.style.setProperty('--amb-brujula-glow-puntero-x', clamp(dx * FACTOR_PUNTERO_GLOW, TOPE_PUNTERO_GLOW));
    contenedorPlano.style.setProperty('--amb-brujula-glow-puntero-y', clamp(dy * FACTOR_PUNTERO_GLOW, TOPE_PUNTERO_GLOW));
  }

  function alMoverPuntero(evento) {
    ultimoPunteroX = evento.clientX;
    ultimoPunteroY = evento.clientY;
    if (frameSolicitadoPuntero) return;
    frameSolicitadoPuntero = true;
    global.requestAnimationFrame(aplicarPuntero);
  }

  function activarParallaxPunteroSiCorresponde() {
    var a = accesibilidad();
    var reducido = !!(a && a.reducirMovimiento);
    if (reducido || !soportaPuntero()) {
      desactivarParallaxPuntero();
      return;
    }
    if (listenerPunteroActivo || !contenedorPlano) return;
    global.addEventListener('pointermove', alMoverPuntero, { passive: true });
    listenerPunteroActivo = true;
  }

  function desactivarParallaxPuntero() {
    if (!listenerPunteroActivo) return;
    global.removeEventListener('pointermove', alMoverPuntero);
    listenerPunteroActivo = false;
    if (contenedorPlano) {
      contenedorPlano.style.removeProperty('--amb-brujula-puntero-x');
      contenedorPlano.style.removeProperty('--amb-brujula-puntero-y');
      contenedorPlano.style.removeProperty('--amb-brujula-glow-puntero-x');
      contenedorPlano.style.removeProperty('--amb-brujula-glow-puntero-y');
    }
  }

  function activarParallaxSiCorresponde() {
    var a = accesibilidad();
    var reducido = !!(a && a.reducirMovimiento);
    if (reducido) {
      desactivarParallax();
      desactivarParallaxPuntero();
      return;
    }
    if (!listenerActivo && contenedorPlano) {
      global.addEventListener('scroll', alScroll, { passive: true });
      listenerActivo = true;
      aplicarScroll();
    }
    activarParallaxPunteroSiCorresponde();
  }

  function desactivarParallax() {
    if (!listenerActivo) return;
    global.removeEventListener('scroll', alScroll);
    listenerActivo = false;
    if (contenedorPlano) {
      contenedorPlano.style.removeProperty('--amb-brujula-scroll');
      contenedorPlano.style.removeProperty('--amb-brujula-glow-scroll');
    }
    if (raizVariables) {
      raizVariables.style.removeProperty('--amb-brujula-scroll');
      raizVariables.style.removeProperty('--amb-brujula-glow-scroll');
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
