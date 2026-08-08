/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-horario-tinte.js
   Fase 3: variantes de clima/horario, Cap. 7.3 del documento de
   Lenguaje de Assets v1.0. Roadmap Cap. 12, orden 9.

   Responsabilidad única: escribir --amb-tinte-monto-p2/p3 y
   --amb-tinte-color-p2/p3 (assets/ambient/_tokens/
   ambiente-tokens-visual.css) según la hora real del día — nunca
   toca --amb-p0-* ni --amb-p1-* (Cap. 7.3, regla dura: el sustrato
   nunca cambia de temperatura).

   Deliberadamente un módulo aparte, no una extensión de
   js/ambiente-capa-fondo.js: ese módulo tiene una responsabilidad ya
   cerrada (el color del cielo, Cap. 4.1 Fase 1) y no debería crecer
   para conocer también planos P2/P3 del Cap. 4.1 de este documento
   — son dos capas distintas que comparten el mismo dato de entrada
   (la hora real), no el mismo subsistema (Cap. 2.3: responsabilidad
   única por módulo). Sí reutiliza el mismo patrón de cálculo y de
   muestreo (60s, ver justificación en ambiente-capa-fondo.js) para
   no introducir un segundo criterio de "cada cuánto se recalcula la
   hora" en el sistema.

   Franjas (Cap. 7.3, tabla):
   - Amanecer (5h-8h): ámbar bajo, monto de mezcla leve.
   - Atardecer (18h-21h): ámbar medio, monto de mezcla más marcado
     que el amanecer (textual: "shift cálido más marcado").
   - Resto del día / noche: monto 0% — sin tinte. La noche ya está
     cubierta por la base dark del sistema (ver nota en tokens
     visuales); este módulo no le suma nada extra a propósito.

   La transición entre franjas se interpola linealmente sobre el
   monto (nunca un salto discreto entre 0% y el pico) para que no se
   note un "click" de color en el borde exacto de cada franja —
   mismo espíritu de continuidad que exige Cap. 3.3 Fase 1 para el
   ciclo del cielo, aplicado acá al monto de mezcla en vez de al
   color en sí.

   No implementa Lluvia (ver nota extensa en el propio archivo de
   tokens visuales): no existe hoy una señal real de clima en la app.

   Debe cargarse después de ambiente-config.js (no depende de él
   directamente, pero por convención carga junto al resto de módulos
   de Contenido Visual) y antes de ambiente-orquestador.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var AMBAR_BAJO = '#E8B77A';   // amanecer — "ámbar bajo" (Cap. 7.3)
  var AMBAR_MEDIO = '#E08A4E';  // atardecer — "ámbar medio" (Cap. 7.3)

  var FRANJAS = [
    { h: 5,  monto: 0,   color: AMBAR_BAJO },
    { h: 6.5, monto: 22, color: AMBAR_BAJO },
    { h: 8,  monto: 0,   color: AMBAR_BAJO },
    { h: 18, monto: 0,   color: AMBAR_MEDIO },
    { h: 19.5, monto: 38, color: AMBAR_MEDIO },
    { h: 21, monto: 0,   color: AMBAR_MEDIO }
  ];

  function horaDecimalActual() {
    var ahora = new Date();
    return ahora.getHours() + ahora.getMinutes() / 60 + ahora.getSeconds() / 3600;
  }

  // Interpolación lineal simple del monto entre los puntos de
  // FRANJAS que rodean la hora actual — fuera de cualquier tramo
  // definido, el monto es 0 (sin tinte, Cap. 7.3: "sin cambio").
  function tinteEnHora(horaDecimal) {
    var h = ((horaDecimal % 24) + 24) % 24;
    for (var i = 0; i < FRANJAS.length - 1; i++) {
      var a = FRANJAS[i], b = FRANJAS[i + 1];
      if (a.color === b.color && h >= a.h && h <= b.h) {
        var t = (h - a.h) / (b.h - a.h);
        return { monto: a.monto + (b.monto - a.monto) * t, color: a.color };
      }
    }
    return { monto: 0, color: AMBAR_BAJO };
  }

  var raiz = null;

  function aplicar() {
    if (!raiz) raiz = document.documentElement;
    var tinte = tinteEnHora(horaDecimalActual());
    // Cap. 7.3: "el shift... solo se aplica a P2/P3" — nunca se
    // escribe acá ninguna variable --amb-p0-*/--amb-p1-*.
    raiz.style.setProperty('--amb-tinte-monto-p2', tinte.monto + '%');
    raiz.style.setProperty('--amb-tinte-color-p2', tinte.color);
    raiz.style.setProperty('--amb-tinte-monto-p3', tinte.monto + '%');
    raiz.style.setProperty('--amb-tinte-color-p3', tinte.color);
  }

  var PERIODO_MUESTREO_MS = 60000;
  var intervalo = null;

  var api = {
    iniciar: function () {
      if (typeof document === 'undefined') return;
      if (intervalo) return; // ya inicializado
      aplicar();
      intervalo = global.setInterval(function () {
        var m = global.AmbienteMovimiento;
        if (m && !m.pestanaVisible) return; // Cap. 9.2: nada se recalcula en 2º plano
        aplicar();
      }, PERIODO_MUESTREO_MS);
    }
  };

  global.AmbienteHorarioTinte = api;

})(window);

