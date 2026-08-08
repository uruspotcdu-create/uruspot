/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — js/ciclo-vida.js
   Infraestructura de ciclo de vida a nivel de PROYECTO (auditoría de
   ingeniería, Hallazgo profundizado 2, 2026-08-05 — "Oportunidad 1").

   Por qué existe: el patrón "un módulo pausa su propio trabajo cuando
   la pestaña queda oculta" ya se resolvió, correctamente, DOS veces
   dentro del Ambient Engine (ambiente-scheduler.js para el rAF
   compartido, ambiente-movimiento.js para centralizar la lectura de
   `visibilitychange`) — y una tercera vez SIN resolverse: motor-render.js
   y ambiente-metrics.js reimplementan cada uno su propio listener de
   visibilidad, y los timers de negocio en app.js (permanenciaTimer,
   climaContextoTimer) no tenían ninguna gestión de segundo plano en
   absoluto (seguían corriendo, con fetch() real cada 5 minutos en el
   caso del clima, con la pestaña oculta).

   Este archivo NO reemplaza a ambiente-scheduler.js/ambiente-
   movimiento.js — esos dos siguen siendo los dueños del rAF compartido
   y de los parámetros de movimiento del Ambient Engine, con toda su
   lógica de escena/fidelidad, que este módulo deliberadamente no
   conoce. Lo que sí hace es extraer la parte genérica y reutilizable
   de ese mismo problema — "un único listener real de
   `visibilitychange`" y "un `setInterval` que se pausa de verdad en
   segundo plano" — a un módulo sin ninguna dependencia de conceptos
   del Ambient Engine (escena, fidelidad, AmbienteRendimiento), para
   que código que no es parte de ese motor (el núcleo de negocio en
   app.js, el motor de mapa en motor-render.js) pueda resolver el mismo
   problema sin arrastrar ese dominio.

   Carga: PRIMER <script> de negocio del documento (antes incluso de
   motor.bundle.js) — motor-render.js vive dentro de motor.bundle.js,
   que carga antes que app.min.js, y app.min.js usa este módulo para
   sus dos timers de negocio desde el arranque mismo de la app. Tiene
   que estar disponible antes que cualquiera de los dos. No depende de
   nada más, así que cargarlo primero no le pide nada al resto del
   grafo de dependencias.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function pestanaVisible() {
    return (typeof document !== 'undefined') ? !document.hidden : true;
  }

  // ── Visibilidad: un único listener real de `document` ───────────────
  // Mismo principio que ya documenta ambiente-movimiento.js ("para que
  // ningún módulo necesite su propio listener de visibilidad"), acá
  // sin ningún conocimiento de escena/parámetros — solo el booleano
  // crudo.
  var listenersVisibilidad = [];
  var listenerDocRegistrado = false;

  function alCambiarVisibilidadDoc() {
    var visible = pestanaVisible();
    // Copia antes de iterar: un listener que se desuscribe a sí mismo
    // durante la notificación no debe alterar esta pasada (mismo
    // criterio que ambiente-movimiento.js/emitir()).
    listenersVisibilidad.slice().forEach(function (cb) {
      try { cb(visible); }
      catch (e) { /* un listener roto no debe tumbar al resto */ }
    });
  }

  function suscribirVisibilidad(cb) {
    if (typeof cb !== 'function') return function () {};
    if (!listenerDocRegistrado && typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      listenerDocRegistrado = true;
      document.addEventListener('visibilitychange', alCambiarVisibilidadDoc);
    }
    listenersVisibilidad.push(cb);
    return function desuscribir() {
      var idx = listenersVisibilidad.indexOf(cb);
      if (idx > -1) listenersVisibilidad.splice(idx, 1);
    };
  }

  // ── Tareas periódicas con pausa real en segundo plano ────────────────
  // A diferencia de un `setInterval` desnudo, esto detiene el
  // intervalo de verdad (clearInterval real, no un no-op gateado
  // adentro del callback) mientras la pestaña está oculta, y lo
  // vuelve a arrancar al recuperar foco — sin acumular ticks perdidos
  // (cada tick es trabajo independiente, igual que ya asumían
  // tickPermanencia/actualizarClimaContexto en app.js).
  function programarTareaPeriodica(fn, ms) {
    if (typeof fn !== 'function' || typeof ms !== 'number' || ms <= 0) {
      return function cancelarNoOp() {};
    }
    if (typeof global.setInterval !== 'function') {
      return function cancelarNoOp() {};
    }

    var intervalId = null;

    function iniciarIntervalo() {
      if (intervalId !== null) return; // ya corriendo, no duplicar
      intervalId = global.setInterval(fn, ms);
    }
    function detenerIntervalo() {
      if (intervalId === null) return;
      global.clearInterval(intervalId);
      intervalId = null;
    }

    if (pestanaVisible()) iniciarIntervalo();

    var desuscribirVisibilidad = suscribirVisibilidad(function (visible) {
      if (visible) iniciarIntervalo();
      else detenerIntervalo();
    });

    return function cancelar() {
      detenerIntervalo();
      desuscribirVisibilidad();
    };
  }

  global.CicloVida = {
    suscribirVisibilidad: suscribirVisibilidad,
    programarTareaPeriodica: programarTareaPeriodica,
    get pestanaVisible() { return pestanaVisible(); }
  };

})(window);

