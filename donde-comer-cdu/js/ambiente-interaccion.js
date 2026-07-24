/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-interaccion.js
   Fase 2: Interaction Observer (Arquitectura técnica, Cap. 3.12)

   Subsistema del Grupo de Gobierno. Responsabilidad única: observar la
   actividad del usuario (gestos, foco, inactividad) y traducir esa
   actividad en eventos que el State Manager consume para sus transiciones
   (Idle, Activo, Foco).

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 3.12 — no interpreta el significado de negocio de la interacción
     (no sabe qué lugar fue tocado, solo que hubo un gesto).
   - Cap. 3.12 — no acumula o almacena historial sin límite. Solo mantiene
     estado actual: "hubo gesto hace N ms", "hay foco", "ninguno".
   - Cap. 3.12 — emite eventos hacia State Manager, nunca datos sin
     procesar.
   - Cap. 5.2 Fase 2: traduce patrones en transiciones: Activo→Idle
     (inactividad), cualquier gesto→Activo, foco en campo→Foco.

   Debe cargarse antes de ambiente-orquestador.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var listeners = [];
  var ultimoGesto = null; // timestamp del último gesto detectado
  var elementoFoco = null; // elemento que tiene foco actual
  var tiempoInactividadMs = 8000; // Cap. 4.6: inactividad prolongada
  var timerInactividad = null;

  function emitir(evento) {
    listeners.forEach(function (cb) {
      try { cb(evento); }
      catch (e) { /* listener roto no debe tumbar al resto */ }
    });
  }

  function registrarGesto() {
    ultimoGesto = Date.now();
    emitir({ tipo: 'gesto' });
    
    // Resetear timer de inactividad
    if (timerInactividad) clearTimeout(timerInactividad);
    timerInactividad = setTimeout(function () {
      emitir({ tipo: 'inactividad' });
    }, tiempoInactividadMs);
  }

  function registrarFoco(elemento) {
    elementoFoco = elemento;
    emitir({ tipo: 'foco', elemento: elemento });
  }

  function desregistrarFoco() {
    elementoFoco = null;
    emitir({ tipo: 'desfocar' });
  }

  // Detectores de gestos (Cap. 3.12: patrones de interacción relevantes)
  function inicializarDetectores() {
    if (typeof document === 'undefined') return;

    // Gestos de puntero/táctil: click, tap, touchstart
    var gestoEventos = ['click', 'touchstart'];
    gestoEventos.forEach(function (tipo) {
      document.addEventListener(tipo, registrarGesto, true);
    });

    // Foco en campos interactivos
    document.addEventListener('focus', function (e) {
      registrarFoco(e.target);
    }, true);

    document.addEventListener('blur', function (e) {
      desregistrarFoco();
    }, true);

    // Iniciar timer de inactividad
    timerInactividad = setTimeout(function () {
      emitir({ tipo: 'inactividad' });
    }, tiempoInactividadMs);
  }

  var api = {
    // Obtener el timestamp del último gesto (null si nunca hubo)
    ultimoGesto: function () { return ultimoGesto; },

    // Obtener el elemento con foco actual (null si no hay)
    elementoConFoco: function () { return elementoFoco; },

    // Verificar si está inactivo (sin gestos en los últimos N ms)
    estaInactivo: function () {
      if (!ultimoGesto) return true; // nunca interactuó
      return (Date.now() - ultimoGesto) >= tiempoInactividadMs;
    },

    // Suscribirse a cambios de interacción
    // cb({tipo: 'gesto'|'inactividad'|'foco'|'desfocar', elemento?})
    suscribir: function (cb) {
      if (typeof cb !== 'function') return function () {};
      listeners.push(cb);
      return function desuscribir() {
        var idx = listeners.indexOf(cb);
        if (idx > -1) listeners.splice(idx, 1);
      };
    },

    // Inicializar detectores de interacción
    iniciar: function () {
      inicializarDetectores();
    }
  };

  global.AmbienteInteraccion = api;

})(window);
