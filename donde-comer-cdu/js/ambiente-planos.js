/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-planos.js
   Fase 3: Plane Manager (Asset Language / Sistema Visual, Cap. 4.1)

   Subsistema del Grupo de Contenido Visual. Responsabilidad única:
   crear y mantener los 4 planos fijos que define el Cap. 4.1 — nada
   más. No dibuja ningún asset propio; las 7 familias (cada una en su
   propio módulo) se insertan dentro del contenedor del plano que les
   corresponde.

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 4.1 — "El sistema define 4 planos, no más." Este módulo es,
     a propósito, el único lugar donde existen los 4 contenedores;
     ninguna familia crea su propio plano.
   - Cap. 4.2 — "Los planos P0 y P1 nunca cambian de opacidad por
     interacción del usuario." Por eso la opacidad de P0/P1 se fija
     una sola vez desde tokens de color (css/ambiente-tokens.css) y
     nunca se toca desde JS.
   - Cap. 7.3 — el shift de temperatura por clima/horario "nunca se
     aplica al plano P0". Por eso el filtro de temperatura (ver CSS)
     solo se declara sobre los contenedores P1/P2/P3, jamás sobre P0.
   - Cap. 2.3 (Arquitectura) — como cualquier subsistema del Grupo de
     Contenido Visual, este módulo solo lee al Motion Controller, nunca
     directamente a Accesibilidad o Rendimiento.

   Debe cargarse después de ambiente-movimiento.js (se suscribe a sus
   parámetros para fidelidad/reducido) y antes de cualquier módulo de
   familia (ambiente-reticula.js, ambiente-topografia.js, etc.), que
   dependen de AmbientePlanos.contenedor() para existir.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function movimiento() { return global.AmbienteMovimiento || null; }

  var PLANOS = ['p0', 'p1', 'p2', 'p3'];
  var contenedores = {};
  var raiz = null;

  function crear() {
    if (raiz) return; // idempotente

    raiz = document.createElement('div');
    raiz.id = 'ambiente-planos';
    raiz.setAttribute('aria-hidden', 'true');

    PLANOS.forEach(function (id) {
      var el = document.createElement('div');
      el.id = 'ambiente-plano-' + id;
      el.className = 'ambiente-plano ambiente-plano--' + id;
      raiz.appendChild(el);
      contenedores[id] = el;
    });

    document.body.insertBefore(raiz, document.body.firstChild);
  }

  // Cap. 9.4 punto 2 / 8.1 checklist 4: cada familia hereda el plano
  // y la fidelidad de su grupo, nunca decide por asset individual.
  // Este módulo centraliza esa lectura para que ninguna familia
  // tenga que suscribirse por su cuenta al Motion Controller.
  function aplicarFidelidad(parametros) {
    if (!raiz) return;
    var nivel = parametros ? parametros.nivelFidelidad : 'completa';
    var reducido = !!(parametros && parametros.reducido);
    raiz.setAttribute('data-ambiente-fase3-fidelidad', nivel || 'completa');
    raiz.setAttribute('data-ambiente-fase3-reducido', String(reducido));
  }

  var api = {
    // Devuelve el contenedor DOM del plano solicitado ('p0'..'p3'),
    // o null si el Plane Manager todavía no se inicializó. Es la
    // única puerta de entrada que una familia debería usar — ninguna
    // familia debe hacer document.body.appendChild() directamente.
    contenedor: function (id) {
      return contenedores[id] || null;
    },

    iniciar: function () {
      if (typeof document === 'undefined') return;
      crear();

      var m = movimiento();
      if (m) {
        m.suscribir(function (evento) { aplicarFidelidad(evento.parametros); });
        aplicarFidelidad(m.parametros());
      } else {
        aplicarFidelidad(null);
      }
    }
  };

  global.AmbientePlanos = api;

})(window);
