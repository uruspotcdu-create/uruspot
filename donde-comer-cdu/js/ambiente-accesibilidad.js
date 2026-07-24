/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-accesibilidad.js
   Fase 2: Accessibility Manager (Arquitectura técnica, Cap. 3.11 / 10.1 / 10.4)

   Subsistema del Grupo de Gobierno. Responsabilidad única: detectar
   preferencias de accesibilidad del usuario (`prefers-reduced-motion`
   y equivalentes) y emitir una señal de máxima prioridad absoluta,
   superpuesta a cualquier otro estado o escena (Cap. 3.11).

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 3.11 — "nunca debe tener su señal ignorada, sobrescrita o
     postergada por ningún otro subsistema, bajo ninguna
     circunstancia". Este módulo no espera confirmación de nadie: la
     lectura de reducirMovimiento es siempre síncrona y actual, nunca
     cacheada por quien la consume.
   - Cap. 10.1 — "esta señal se propaga por dos caminos simultáneos:
     hacia el State Manager... y directamente hacia el Motion
     Controller... sin esperar confirmación del State Manager". Por
     eso este módulo no tiene un único consumidor privilegiado: emite
     a todos sus suscriptores por igual y de forma inmediata — el
     futuro State Manager y el futuro Motion Controller se suscriben
     ambos, sin jerarquía entre ellos.
   - Cap. 10.4 — el diseño contempla una fuente adicional futura
     (preferencia configurable dentro de la propia aplicación,
     independiente de la del sistema operativo) "sin modificar el
     contrato central del sistema". Por eso reducirMovimiento no es
     un único booleano detectado una vez, sino la combinación de
     todas las fuentes activas — hoy solo la de sistema operativo,
     mañana también la de producto, con la misma API.
   - Cap. 3.11 — "Dependencias: ninguna". No importa AmbienteConfig
     ni ningún otro subsistema; la detección de accesibilidad no
     depende de ningún valor configurable.
   - Este módulo supersede la parte de `prefers-reduced-motion` de
     ambiente-senales.js (Fase 0/1) — ese archivo se retira cuando se
     reescriba el orquestador (Ambient Engine raíz) para usar este
     módulo en su lugar.

   Puede cargarse en cualquier momento del Grupo de Gobierno (no
   depende de Performance Manager ni de Interaction Observer), pero
   debe estar disponible antes que el futuro State Manager y Motion
   Controller.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var listeners = [];

  // ── Fuente 1: preferencia del sistema operativo / navegador ─────
  // Verificada al inicio de la sesión y monitoreada ante cambios en
  // tiempo real (Cap. 6.2 Fase 1: "verificada al inicio de la sesión
  // y monitoreada ante cambios en tiempo real").
  var mqMovimiento = (typeof global.matchMedia === 'function')
    ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var fuenteSistema = !!(mqMovimiento && mqMovimiento.matches);

  // ── Fuente 2: preferencia manual de producto (Cap. 10.4) ────────
  // No existe todavía en la interfaz de URU SPOT, pero la superficie
  // queda lista desde ahora para no tener que tocar el contrato de
  // este módulo cuando se agregue. null = "sin preferencia manual
  // explícita"; en ese caso no participa de la combinación. true
  // siempre fuerza reducción; false NUNCA anula una preferencia real
  // de sistema operativo (Cap. 3.11: la señal de sistema jamás debe
  // poder ser sobrescrita).
  var fuenteManual = null;

  function combinar() {
    return fuenteSistema || fuenteManual === true;
  }

  var reducirMovimiento = combinar();

  function emitir() {
    listeners.forEach(function (cb) {
      try { cb(reducirMovimiento); }
      catch (e) { /* un listener roto no debe tumbar al resto ni, mucho
                     menos, impedir que la señal llegue a los demás */ }
    });
  }

  function reevaluar() {
    var anterior = reducirMovimiento;
    reducirMovimiento = combinar();
    if (reducirMovimiento !== anterior) emitir();
  }

  if (mqMovimiento) {
    var onCambioSistema = function (evento) {
      fuenteSistema = evento.matches;
      reevaluar();
    };
    if (mqMovimiento.addEventListener) mqMovimiento.addEventListener('change', onCambioSistema);
    else if (mqMovimiento.addListener) mqMovimiento.addListener(onCambioSistema); // Safari viejo
  }

  var api = {
    // Lectura directa, siempre sincrónica y actual (Cap. 3.11) —
    // nunca debe cachearse por quien la consume.
    get reducirMovimiento() { return reducirMovimiento; },

    // Suscripción: cb(reducirMovimientoActual). Se invoca de
    // inmediato ante cualquier cambio, sin intermediarios (Cap.
    // 10.1: "sin esperar confirmación del State Manager"). Devuelve
    // una función para desuscribirse.
    suscribir: function (cb) {
      if (typeof cb !== 'function') return function () {};
      listeners.push(cb);
      return function desuscribir() {
        var idx = listeners.indexOf(cb);
        if (idx > -1) listeners.splice(idx, 1);
      };
    },

    // Superficie prevista para el futuro toggle de producto (Cap.
    // 10.4). Acepta true, false o null (para volver a depender
    // exclusivamente de la señal de sistema operativo).
    establecerPreferenciaManual: function (valor) {
      if (valor !== true && valor !== false && valor !== null) return;
      fuenteManual = valor;
      reevaluar();
    }
  };

  global.AmbienteAccesibilidad = api;

})(window);
