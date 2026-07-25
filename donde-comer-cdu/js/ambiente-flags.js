/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-flags.js
   Fase 5 (Integration Blueprint, Cap. 14 criterio 3): "cada fase
   (F0-F3) es individualmente desactivable sin afectar a las
   anteriores".

   Este módulo NO decide nada por sí mismo (mismo principio que
   gobierna todo el Ambient Engine, Resumen ejecutivo del Blueprint):
   solo expone una lectura de si un grupo de subsistemas debe
   arrancar o no. La decisión de apagarlo vive fuera de este archivo
   — en localStorage o en el querystring — nunca hardcodeada acá.

   Uso pensado para debug/rollback rápido en producción sin redeploy:
     localStorage.setItem('ambienteFlags', JSON.stringify({clima:false}))
   o vía URL: ?ambiente_off=clima,horarioTinte

   Por defecto TODO está activo — agregar este archivo no cambia
   ningún comportamiento visible hasta que alguien apague un flag
   explícitamente (Cap. 1.2 Blueprint: "reversibilidad real").

   Debe cargarse junto al resto del Grupo de Infraestructura, ANTES
   de ambiente-orquestador.js (que es quien lo consulta).
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // Grupos definidos según el Cap. 14 criterio 3 del Blueprint de
  // Integración, mapeados a la arquitectura real ya existente en este
  // repo (no a nombres hipotéticos): los subsistemas de mayor "blast
  // radius" (Cap. 15.3) son los primeros candidatos a poder apagarse
  // de forma aislada sin tocar el resto del motor.
  var NOMBRES_VALIDOS = ['motor', 'sustratoVisual', 'clima', 'horarioTinte'];

  var cache = null;

  function leerOverrideURL() {
    var params;
    try {
      params = new URLSearchParams(global.location.search);
    } catch (e) {
      return {};
    }
    var apagar = params.get('ambiente_off');
    if (!apagar) return {};
    var resultado = {};
    apagar.split(',').forEach(function (nombre) {
      nombre = nombre.trim();
      if (NOMBRES_VALIDOS.indexOf(nombre) !== -1) resultado[nombre] = false;
    });
    return resultado;
  }

  function leerOverrideStorage() {
    try {
      var crudo = global.localStorage.getItem('ambienteFlags');
      if (!crudo) return {};
      var parsed = JSON.parse(crudo);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      // localStorage puede fallar (modo privado, cuota, JSON corrupto).
      // Igual que el resto del motor (Cap. 1.4 diseño): mejor
      // continuar con todo activo que romper el arranque por esto.
      return {};
    }
  }

  function calcular() {
    var deURL = leerOverrideURL();
    var deStorage = leerOverrideStorage();
    var estado = {};
    NOMBRES_VALIDOS.forEach(function (nombre) {
      // Precedencia: URL (debug puntual) gana sobre localStorage
      // (preferencia persistida), que gana sobre el default (true).
      if (Object.prototype.hasOwnProperty.call(deURL, nombre)) {
        estado[nombre] = deURL[nombre];
      } else if (Object.prototype.hasOwnProperty.call(deStorage, nombre)) {
        estado[nombre] = !!deStorage[nombre];
      } else {
        estado[nombre] = true;
      }
    });
    return estado;
  }

  global.AmbienteFlags = {
    // Cap. 14 criterio 3: verificable apagando cada flag de forma
    // aislada. Un nombre desconocido nunca apaga nada (fail-open,
    // mismo criterio que el resto del motor ante datos inesperados).
    activo: function (nombre) {
      if (!cache) cache = calcular();
      return NOMBRES_VALIDOS.indexOf(nombre) === -1 ? true : cache[nombre];
    },
    // Expuesto solo para diagnóstico (ambiente-diagnostico.js) y para
    // que un ingeniero pueda inspeccionar el estado real desde la
    // consola sin adivinar precedencias.
    estadoActual: function () {
      if (!cache) cache = calcular();
      return Object.assign({}, cache);
    }
  };

})(window);
