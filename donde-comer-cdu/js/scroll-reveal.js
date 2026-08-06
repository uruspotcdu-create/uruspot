/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — scroll-reveal.js

   FASE 6 del Plan Maestro de Modularización (2026-08-06). Extraído de
   app.js §22 (Scroll Reveal — Progressive Enhancement):
   inicializarScrollReveal(). listeners.js ya venía preparado para esta
   extracción desde Fase 5 — recibía `inicializarScrollReveal` como
   dependencia inyectada (ver comentario "Sección 22, Fase 6 pendiente"
   en la cabecera de listeners.js) precisamente para no tener que
   tocar ese archivo de nuevo acá: app.js sigue pasándole la misma
   función bajo el mismo nombre, solo que ahora es
   `ScrollReveal.inicializar` en vez de una function declaration local.

   Única dependencia real: `prefiereMovimientoReducido` (alias local
   de app.js sobre window.AppFormato) — el resto (querySelectorAll,
   IntersectionObserver, getComputedStyle) son APIs del navegador que
   el módulo usa directo, mismo criterio que el resto del código de
   presentación ya extraído (dom-painter.js, listeners.js). window.
   Coreografias se lee directo, igual que en el original: es un motor
   opcional (gatea con `if (window.Coreografias)`), no una dependencia
   dura del módulo.

   Cap. 6 "Primer scroll" (Motion Direction Bible v1.0, pasos 9-10):

   Paso 9 — "los elementos que entran en el viewport se acercan con
   microdesfase según su orden de aparición, nunca todos a la vez".
   Sin esto, dos o más secciones .u-reveal que cruzan el umbral en el
   mismo callback del IntersectionObserver (scroll rápido, o varias
   secciones cortas cabiendo juntas en la ventana) se revelan en el
   mismo frame — el "bloque sincronizado" que el Cap. 10 reserva
   únicamente para elementos que deben leerse como una sola unidad
   conceptual, no como secciones independientes de la página.

   Paso 10 — "los elementos que salen del viewport se alejan
   levemente antes de desvanecerse, nunca cortan de forma abrupta".
   Por eso el observer ya no se desconecta tras la primera revelación
   (antes con observador.unobserve): sigue vivo para detectar cuándo
   una sección ya vista sale por completo por arriba del viewport
   (entrada.boundingClientRect.bottom <= 0) y agregarle .saliendo +
   .u-mov-saliendo (css/tokens.css + css/motion-gramatica.css), y
   para revertir ese estado si el usuario vuelve a scrollear hacia
   arriba y la sección reingresa. La condición de salida (0% visible,
   afuera por completo) y la de reingreso (12%, el mismo umbral de la
   primera entrada) son deliberadamente distintas: si fueran la misma
   marca de scroll, un usuario oscilando cerca del borde podría
   activar y desactivar la clase en cada frame — el "temblor" que el
   Cap. 14 prohíbe.

   dataset.uReveal marca "ya tuvo su primera entrada", para que la
   lógica de salida/reingreso nunca compita con la del paso 9 sobre
   el mismo elemento en el mismo callback.

   --motion-desfase (css/tokens.css) ya existía desde el paso de
   tokens pero no se consumía en ningún lado todavía; este es su
   primer uso real. Se lee una sola vez acá (no en cada callback del
   observer) porque es un token global que no cambia en runtime.
   ═══════════════════════════════════════════════════════════════════ */

export function crearScrollReveal(deps) {
  var prefiereMovimientoReducido = deps.prefiereMovimientoReducido;

  function inicializar() {
    if (prefiereMovimientoReducido()) {
      document.querySelectorAll('.u-reveal').forEach(function (el) {
        el.classList.add('visible');
      });
    } else if ('IntersectionObserver' in window) {
      var desfaseMs = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--motion-desfase')
      ) * 1000;
      if (!desfaseMs || isNaN(desfaseMs)) desfaseMs = 40; // fallback si el token no resuelve

      var observador = new IntersectionObserver(function (entradas) {
        // Orden de aparición (Cap. 6, paso 9): no el orden en que el
        // observer las entrega (que es el de intersección detectada,
        // no necesariamente el del documento), sino el orden real en
        // el DOM — así el decalaje siempre sigue la jerarquía visual
        // de la página, nunca un orden incidental del navegador.
        var primerasEntradas = entradas
          .filter(function (entrada) {
            return entrada.isIntersecting && !entrada.target.dataset.uReveal;
          })
          .sort(function (a, b) {
            return a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
          });

        primerasEntradas.forEach(function (entrada, indice) {
          entrada.target.style.transitionDelay = (indice * desfaseMs) + 'ms';
          entrada.target.classList.add('visible');
          entrada.target.dataset.uReveal = 'visto';
          if (window.Coreografias) {
            window.Coreografias.registrarRevelado(entrada.target.id || entrada.target.className);
          }
        });

        // Salida/reingreso (Cap. 6, paso 10) — solo sobre secciones que
        // ya pasaron por su primera entrada de arriba.
        entradas.forEach(function (entrada) {
          if (!entrada.target.dataset.uReveal) return;

          var estaSaliendo = entrada.target.classList.contains('saliendo');
          if (!entrada.isIntersecting && entrada.boundingClientRect.bottom <= 0 && !estaSaliendo) {
            entrada.target.classList.add('saliendo', 'u-mov-saliendo');
          } else if (entrada.isIntersecting && entrada.intersectionRatio >= 0.12 && estaSaliendo) {
            entrada.target.classList.remove('saliendo', 'u-mov-saliendo');
            entrada.target.style.transitionDelay = '';
          }
        });
      }, { threshold: [0, 0.12], rootMargin: '0px 0px -40px 0px' });

      document.querySelectorAll('.u-reveal').forEach(function (el) {
        el.classList.add('u-reveal--armado');
        observador.observe(el);
      });
    }
  }

  return {
    inicializar: inicializar
  };
}
