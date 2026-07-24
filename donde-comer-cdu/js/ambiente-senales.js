/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-senales.js
   Fase 0: Señales de rendimiento y accesibilidad
   (Documento de diseño, Cap. 9.5 y Cap. 11.2)

   Responsabilidad única: detectar y exponer las condiciones externas
   que el resto del Ambient Engine necesita para decidir cuánto
   moverse. Este módulo NUNCA decide movimiento por sí mismo — solo
   informa. No conoce estados, escenas ni capas (Cap. 4.9 / 11.3).

   Cualquier otro módulo del Ambient Engine debe leer estas señales
   desde acá. Ninguno debe implementar su propia detección de
   prefers-reduced-motion, visibilidad de pestaña o capacidad de
   dispositivo por separado — eso es exactamente el acoplamiento
   indebido que el Cap. 11.4 pide evitar.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var listeners = [];

  function emitir(nombreSenal) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](nombreSenal, senales); }
      catch (e) { /* un listener roto no debe tumbar al resto */ }
    }
  }

  // ── Movimiento reducido (Cap. 9.5) ──────────────────────────────
  // Se verifica al inicio de la sesión y se re-evalúa si el sistema
  // operativo cambia la preferencia durante la sesión (Cap. 6.3:
  // "Reducción se desactiva solo si la preferencia de sistema
  // operativo cambia durante la sesión").
  var mqMovimiento = (typeof global.matchMedia === 'function')
    ? global.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  // ── Visibilidad de pestaña ───────────────────────────────────────
  // Cap. 9.2: "prohibido cualquier ciclo de animación que continúe
  // ejecutándose en segundo plano cuando la aplicación no está
  // visible para el usuario".
  function pestanaVisible() {
    return (typeof document !== 'undefined') ? !document.hidden : true;
  }

  // ── Capacidad aproximada del dispositivo ─────────────────────────
  // Heurística deliberadamente simple (Cap. 9.1: el techo real de
  // elementos "a determinar por el equipo de frontend según pruebas
  // de dispositivo, pero nunca 'todas las que se vean bien' como
  // criterio"). Esto es solo una señal de partida barata y estable;
  // las capas que sí gastan recursos (Partículas, Clima — Fases 4 y
  // 8) son las que deciden qué hacer con este valor.
  function estimarRendimiento() {
    var nucleos = (global.navigator && global.navigator.hardwareConcurrency)
      ? global.navigator.hardwareConcurrency : 4;
    var memoria = (global.navigator && global.navigator.deviceMemory)
      ? global.navigator.deviceMemory : 4;
    if (nucleos <= 2 || memoria <= 2) return 'bajo';
    if (nucleos <= 4 || memoria <= 4) return 'medio';
    return 'alto';
  }

  var senales = {
    reducirMovimiento: !!(mqMovimiento && mqMovimiento.matches),
    pestanaVisible: pestanaVisible(),
    rendimiento: estimarRendimiento()
  };

  if (mqMovimiento) {
    var onCambioMovimiento = function (evento) {
      senales.reducirMovimiento = evento.matches;
      emitir('reducirMovimiento');
    };
    if (mqMovimiento.addEventListener) mqMovimiento.addEventListener('change', onCambioMovimiento);
    else if (mqMovimiento.addListener) mqMovimiento.addListener(onCambioMovimiento); // Safari viejo
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () {
      senales.pestanaVisible = pestanaVisible();
      emitir('pestanaVisible');
    });
  }

  global.AmbienteSenales = {
    // Lectura directa, siempre sincrónica y actual — nunca cacheada
    // por quien la consume.
    get reducirMovimiento() { return senales.reducirMovimiento; },
    get pestanaVisible() { return senales.pestanaVisible; },
    get rendimiento() { return senales.rendimiento; },

    // Suscripción: cb(nombreSenal, senalesActuales). Devuelve una
    // función para desuscribirse.
    suscribir: function (cb) {
      if (typeof cb !== 'function') return function () {};
      listeners.push(cb);
      return function desuscribir() {
        var idx = listeners.indexOf(cb);
        if (idx > -1) listeners.splice(idx, 1);
      };
    }
  };

})(window);
