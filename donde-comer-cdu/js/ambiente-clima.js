/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-clima.js
   Fase 2: Weather Engine (Arquitectura técnica, Cap. 3.7)

   Subsistema del Grupo de Contenido Visual. Responsabilidad única:
   gestionar la Capa de Clima: activación y desactivación de variaciones
   climáticas (lluvia, niebla, viento) según la configuración de escena
   vigente.

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 3.7 — es el subsistema de menor frecuencia de activación por
     diseño (Cap. 5.7 Fase 1) — no debe activarse de forma constante ni
     convertirse en un elemento permanente de ninguna escena.
   - Cap. 3.7 — nunca debe activarse sin una señal explícita del Motion
     Controller — no tiene lógica propia de decisión sobre cuándo activarse.
   - Cap. 2.3 — nunca se comunica lateralmente con otros subsistemas del
     Grupo de Contenido Visual. Todo pasa por Motion Controller.
   - Cap. 2.3 — solo recibe parámetros del Motion Controller, nunca
     consulta directamente a Performance Manager o Accessibility Manager.
   - Cap. 7.2 — desactivable según orden de degradación (Cap. 7.2: primero
     en ser desactivado cuando hay restricciones de recursos).
   - Cap. 9.2 — bajo reducirMovimiento se desactiva por completo.

   Debe cargarse después de ambiente-movimiento.js y antes de
   ambiente-orquestador.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function movimiento() { return global.AmbienteMovimiento || null; }

  var efectosActivos = {}; // { lluvia: boolean, niebla: boolean, viento: boolean }
  var contenedor = null;
  var parametrosActuales = null;
  var desuscribir = null;

  // Variaciones climáticas posibles (Cap. 5.7 Fase 1)
  var EFECTOS_DISPONIBLES = {
    lluvia: { elemento: null, claseCSS: 'ambient-lluvia' },
    niebla: { elemento: null, claseCSS: 'ambient-niebla' },
    viento: { elemento: null, claseCSS: 'ambient-viento' }
  };

  // Activar un efecto climático
  function activarEfecto(nombreEfecto) {
    if (!EFECTOS_DISPONIBLES[nombreEfecto]) return;
    if (efectosActivos[nombreEfecto]) return; // ya está activo

    var efecto = EFECTOS_DISPONIBLES[nombreEfecto];
    efecto.elemento = document.createElement('div');
    efecto.elemento.className = efecto.claseCSS;
    efecto.elemento.style.position = 'fixed';
    efecto.elemento.style.top = '0';
    efecto.elemento.style.left = '0';
    efecto.elemento.style.width = '100%';
    efecto.elemento.style.height = '100%';
    efecto.elemento.style.pointerEvents = 'none';
    efecto.elemento.style.zIndex = '5';
    efecto.elemento.style.opacity = '0.3';

    if (contenedor) contenedor.appendChild(efecto.elemento);
    efectosActivos[nombreEfecto] = true;
  }

  // Desactivar un efecto climático
  function desactivarEfecto(nombreEfecto) {
    if (!EFECTOS_DISPONIBLES[nombreEfecto]) return;
    if (!efectosActivos[nombreEfecto]) return; // ya está inactivo

    var efecto = EFECTOS_DISPONIBLES[nombreEfecto];
    if (efecto.elemento && efecto.elemento.parentNode) {
      efecto.elemento.parentNode.removeChild(efecto.elemento);
      efecto.elemento = null;
    }
    efectosActivos[nombreEfecto] = false;
  }

  // Manejador de cambios en parámetros del Motion Controller
  function alCambiarParametros(evento) {
    parametrosActuales = evento.parametros;
    if (!parametrosActuales || !parametrosActuales.clima) return;

    var clima = parametrosActuales.clima;

    // Cap. 3.7: nunca debe activarse sin una señal explícita
    // La señal explícita es: clima.habilitado === true
    if (!clima.habilitado) {
      // Desactivar todos los efectos
      Object.keys(EFECTOS_DISPONIBLES).forEach(desactivarEfecto);
      return;
    }

    // Cap. 3.7: "clima es un toggle que resolverá el futuro Weather Engine"
    // Por ahora, si está habilitado, activamos niebla sutil (Cap. 5.9 Fase 1)
    if (clima.nieblaSutil) {
      activarEfecto('niebla');
    } else {
      desactivarEfecto('niebla');
    }

    // Cap. 5.7 Fase 1: "lluvia, noche y atardecer... variaciones que se
    // superponen". Lluvia es un toggle independiente de la escena.
    // Será activado por un future Context Manager o similar.
  }

  var api = {
    // Verificar si un efecto está actualmente activo
    estaActivo: function (nombreEfecto) {
      return !!efectosActivos[nombreEfecto];
    },

    // Obtener lista de efectos activos
    obtenerActivos: function () {
      return Object.keys(efectosActivos).filter(function (k) {
        return efectosActivos[k];
      });
    },

    // Inicializar el subsistema
    iniciar: function () {
      if (typeof document === 'undefined') return;

      // Crear contenedor
      contenedor = document.createElement('div');
      contenedor.id = 'ambient-clima-contenedor';
      document.body.appendChild(contenedor);

      // Inicializar estado de efectos
      Object.keys(EFECTOS_DISPONIBLES).forEach(function (k) {
        efectosActivos[k] = false;
      });

      // Suscribirse a cambios del Motion Controller
      var m = movimiento();
      if (m) {
        desuscribir = m.suscribir(alCambiarParametros);
        parametrosActuales = m.parametros();
      }
    },

    // Limpiar y detener
    destruir: function () {
      if (desuscribir) desuscribir();

      // Desactivar todos los efectos
      Object.keys(EFECTOS_DISPONIBLES).forEach(desactivarEfecto);

      // Remover contenedor
      if (contenedor && contenedor.parentNode) {
        contenedor.parentNode.removeChild(contenedor);
      }
    }
  };

  global.AmbienteClima = api;

})(window);
