/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-estados.js
   Fase 0: Máquina de estados (Documento de diseño, Capítulo 6)

   Responsabilidad única: decidir en qué estado está el sistema y
   hacia cuál puede ir. Este módulo NUNCA manipula propiedades
   visuales directamente (Cap. 11.3: "la máquina de estados nunca
   debe manipular directamente propiedades visuales — solo debe
   comunicar en qué estado se encuentra"). Tampoco conoce escenas ni
   capas — solo conoce el grafo de transiciones del Cap. 6.4.

   Grafo de transiciones válidas (Cap. 6.4):
     Idle ↔ Activo
     Activo → Transición → Activo (con la nueva escena ya vigente)
     Activo → Carga → Activo | Error
     Activo ↔ Foco
     Error → Activo (solo vía reintento explícito)

   El Estado de Reducción (accesibilidad) NO participa de este grafo
   (Cap. 6.4): es una restricción global gestionada por
   ambiente-accesibilidad.js y leída por quien la necesite, no un nodo
   más de esta máquina.

   Fase 2 (Cap. 3.4 Arquitectura): la duración real de la Transición ya
   no se calcula acá — es un parámetro de movimiento, y por eso lo
   resuelve el Motion Controller (ambiente-movimiento.js). Este módulo
   solo le pregunta cuánto debe durar; nunca decide el número él mismo.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ESTADOS = {
    IDLE: 'idle',
    ACTIVO: 'activo',
    TRANSICION: 'transicion',
    CARGA: 'carga',
    FOCO: 'foco',
    ERROR: 'error'
  };

  // Cap. 6.5: "jamás el Estado de Carga debe extenderse
  // indefinidamente sin una salida". Si la solicitud original sigue
  // pendiente pasado este límite, el sistema pasa a Error igual.
  var TIMEOUT_CARGA_MS = 8000;

  // Arranca en Activo: abrir la aplicación ya cuenta como el primer
  // momento de atención del usuario (Cap. 6.1 solo define Idle como
  // "sin interacción del usuario en un lapso definido").
  var estadoActual = ESTADOS.ACTIVO;
  var listeners = [];
  var timeoutCarga = null;
  var transicionEnCurso = false;
  var transicionPendiente = null; // cola de una sola posición (Cap. 6.5)

  function emitir(anterior, actual) {
    listeners.forEach(function (cb) {
      try { cb({ anterior: anterior, actual: actual }); }
      catch (e) { /* un listener roto no debe tumbar al resto */ }
    });
  }

  function cambiarA(nuevoEstado) {
    var anterior = estadoActual;
    if (anterior === nuevoEstado) return;
    estadoActual = nuevoEstado;
    emitir(anterior, nuevoEstado);
  }

  // Banda de contexto: 400-900ms (Cap. 3.1). El cálculo real vive en
  // el Motion Controller (Cap. 3.4 Arquitectura) porque combina
  // rendimiento y accesibilidad — dos subsistemas de Gobierno que este
  // módulo no debería tener que conocer directamente. Si el Motion
  // Controller todavía no cargó (por ejemplo, en tests que instancian
  // este archivo solo), se usa el valor medio de la banda como
  // respaldo, nunca cero (Cap. 6.5: "eso rompería el principio de
  // continuidad").
  function duracionTransicion() {
    var m = global.AmbienteMovimiento;
    if (m && typeof m.duracionTransicion === 'function') return m.duracionTransicion();
    return 600;
  }

  var api = {
    ESTADOS: ESTADOS,

    actual: function () { return estadoActual; },

    // Suscripción a cambios de estado. cb({anterior, actual}).
    on: function (evento, cb) {
      if (evento !== 'cambio' || typeof cb !== 'function') return function () {};
      listeners.push(cb);
      return function () {
        var i = listeners.indexOf(cb);
        if (i > -1) listeners.splice(i, 1);
      };
    },

    // ── Idle ↔ Activo (Cap. 6.1 / 6.2 / 6.3) ───────────────────────
    // El temporizador de inactividad vive en el orquestador (conoce
    // el DOM y los eventos de gesto); este módulo solo reacciona.
    registrarGesto: function () {
      if (estadoActual === ESTADOS.IDLE) cambiarA(ESTADOS.ACTIVO);
    },
    pasarAInactivo: function () {
      if (estadoActual === ESTADOS.ACTIVO) cambiarA(ESTADOS.IDLE);
    },

    // ── Activo → Transición → Activo (Cap. 6.1 / 6.4 / 6.5) ─────────
    // alCompletar se ejecuta cuando termina la Transición, antes de
    // volver a Activo — es el momento en que la nueva escena "ya
    // vigente" se hace efectiva (por ejemplo, escribir el atributo
    // de escena en el DOM).
    iniciarTransicion: function (alCompletar) {
      if (transicionEnCurso) {
        // Cap. 6.5: jamás dos transiciones simultáneas. Se encola el
        // destino más reciente; los intermedios no importan, solo el
        // punto final al que el usuario efectivamente quiere llegar.
        transicionPendiente = alCompletar;
        return;
      }
      if (estadoActual !== ESTADOS.ACTIVO) return; // solo se transiciona desde Activo

      transicionEnCurso = true;
      cambiarA(ESTADOS.TRANSICION);
      global.setTimeout(function () {
        if (typeof alCompletar === 'function') alCompletar();
        cambiarA(ESTADOS.ACTIVO);
        transicionEnCurso = false;
        if (transicionPendiente) {
          var siguiente = transicionPendiente;
          transicionPendiente = null;
          api.iniciarTransicion(siguiente);
        }
      }, duracionTransicion());
    },

    // ── Activo → Carga → Activo | Error (Cap. 6.1 / 6.5) ────────────
    iniciarCarga: function () {
      if (estadoActual !== ESTADOS.ACTIVO) return;
      cambiarA(ESTADOS.CARGA);
      timeoutCarga = global.setTimeout(function () {
        api.finalizarCarga(false); // timeout ⇒ Error, nunca Carga indefinida
      }, TIMEOUT_CARGA_MS);
    },
    finalizarCarga: function (exito) {
      if (estadoActual !== ESTADOS.CARGA) return;
      if (timeoutCarga) { global.clearTimeout(timeoutCarga); timeoutCarga = null; }
      cambiarA(exito ? ESTADOS.ACTIVO : ESTADOS.ERROR);
    },

    // ── Activo ↔ Foco (Cap. 6.1 / 6.2 / 6.3) ────────────────────────
    entrarFoco: function () {
      if (estadoActual === ESTADOS.ACTIVO) cambiarA(ESTADOS.FOCO);
    },
    salirFoco: function () {
      if (estadoActual === ESTADOS.FOCO) cambiarA(ESTADOS.ACTIVO);
    },

    // ── Error → Activo (Cap. 6.3: "únicamente ante un reintento
    // exitoso explícito") ───────────────────────────────────────────
    reintentar: function () {
      if (estadoActual === ESTADOS.ERROR) cambiarA(ESTADOS.ACTIVO);
    }
  };

  global.AmbienteEstados = api;

})(window);

