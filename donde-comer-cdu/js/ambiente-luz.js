/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-luz.js
   Fase 2: Lighting Engine (Arquitectura técnica, Cap. 3.8)

   Subsistema del Grupo de Contenido Visual. Responsabilidad única:
   gestionar la Capa de Luz: resplandores, viñetas, y la coherencia
   lumínica entre el fondo y los elementos de interfaz que "reciben" esa
   luz.

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 3.8 — no gestiona el ciclo horario en sí (eso es responsabilidad
     del Background Renderer) — recibe ese dato ya resuelto y lo traduce
     en efectos de iluminación coherentes con él.
   - Cap. 3.8 — debe introducir una temperatura de color que coherente con
     la del Background Renderer activo (Cap. 3.8 confirmación, Motion
     Controller la enforza).
   - Cap. 2.3 — nunca se comunica lateralmente con otros subsistemas del
     Grupo de Contenido Visual. Todo pasa por Motion Controller.
   - Cap. 2.3 — solo recibe parámetros del Motion Controller, nunca
     consulta directamente a Performance Manager o Accessibility Manager.
   - Cap. 7.2 — NUNCA se desactiva, incluso bajo restricciones severas
     de rendimiento (siempre tiene nivel.luz = 1).

   Debe cargarse después de ambiente-movimiento.js y antes de
   ambiente-orquestador.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function movimiento() { return global.AmbienteMovimiento || null; }

  var viñeta = null; // elemento de viñeta
  var resplandor = null; // elemento de resplandor
  var parametrosActuales = null;
  var desuscribir = null;

  // Calcular color base según intensidad (simulando ciclo horario)
  function calcularTemperaturaColor(intensidad) {
    // Cap. 3.1 Fase 1: transición de día a atardecer a noche
    // Intensidad alta (día) → color azul/blanco
    // Intensidad media (atardecer) → color naranja
    // Intensidad baja (noche) → color azul frío
    
    if (intensidad >= 0.7) {
      // Día: azul claro
      return 'rgba(135, 206, 250, 0.15)'; // light sky blue
    } else if (intensidad >= 0.4) {
      // Atardecer: naranja cálido
      return 'rgba(255, 165, 0, 0.15)'; // orange glow
    } else {
      // Noche: azul oscuro
      return 'rgba(25, 45, 85, 0.2)'; // deep blue
    }
  }

  // Crear viñeta (oscurecimiento en bordes)
  function crearVigneta() {
    if (!viñeta) {
      viñeta = document.createElement('div');
      viñeta.id = 'ambient-vigneta';
      viñeta.style.position = 'fixed';
      viñeta.style.top = '0';
      viñeta.style.left = '0';
      viñeta.style.width = '100%';
      viñeta.style.height = '100%';
      viñeta.style.pointerEvents = 'none';
      viñeta.style.zIndex = '3';
      viñeta.style.background = 'radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, 0.3) 100%)';
      document.body.appendChild(viñeta);
    }
  }

  // Crear resplandor base
  function crearResplandor() {
    if (!resplandor) {
      resplandor = document.createElement('div');
      resplandor.id = 'ambient-resplandor';
      resplandor.style.position = 'fixed';
      resplandor.style.top = '0';
      resplandor.style.left = '0';
      resplandor.style.width = '100%';
      resplandor.style.height = '100%';
      resplandor.style.pointerEvents = 'none';
      resplandor.style.zIndex = '1';
      resplandor.style.mixBlendMode = 'screen';
      // Sin opacity inline: css/ambiente-estilos.css la calcula a
      // partir de --amb-resplandor-base (ver actualizarLuz) sumada a
      // --amb-respiracion (Fase 4, Cap. 8) — un valor inline acá
      // ganaría por especificidad y anularía esa suma.
      document.body.appendChild(resplandor);
    }
  }

  // Actualizar color e intensidad de la luz
  function actualizarLuz(parametros) {
    if (!parametros || !parametros.luz) return;

    var luz = parametros.luz;
    var intensidad = luz.intensidad || 0.5;

    // Crear elementos si no existen
    if (typeof document !== 'undefined') {
      crearVigneta();
      crearResplandor();
    }

    // Actualizar viñeta según intensidad
    if (viñeta) {
      // Menos intensidad = más oscuro en bordes
      var opacidadVigneta = 0.3 + (0.2 * (1 - intensidad));
      viñeta.style.background = 'radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, ' + opacidadVigneta + ') 100%)';
    }

    // Actualizar resplandor según temperatura de color
    if (resplandor) {
      var colorTemperatura = calcularTemperaturaColor(intensidad);
      resplandor.style.backgroundColor = colorTemperatura;
      // Fase 4 (Cap. 8): la opacidad final no se fija acá — se publica
      // solo la base, y css/ambiente-estilos.css le suma la variación
      // continua de --amb-respiracion (ambiente-respiracion.js). Este
      // módulo sigue sin conocer a ese otro módulo (Cap. 2.3): ambos
      // convergen únicamente en la hoja de estilos.
      resplandor.style.setProperty('--amb-resplandor-base', (0.3 * intensidad).toString());
    }
  }

  // Manejador de cambios en parámetros del Motion Controller
  function alCambiarParametros(evento) {
    parametrosActuales = evento.parametros;
    actualizarLuz(parametrosActuales);
  }

  var api = {
    // Obtener la intensidad de luz actual
    obtenerIntensidad: function () {
      return (parametrosActuales && parametrosActuales.luz) 
        ? parametrosActuales.luz.intensidad 
        : 0.5;
    },

    // Inicializar el subsistema
    iniciar: function () {
      if (typeof document === 'undefined') return;

      // Suscribirse a cambios del Motion Controller
      var m = movimiento();
      if (m) {
        desuscribir = m.suscribir(alCambiarParametros);
        parametrosActuales = m.parametros();
        actualizarLuz(parametrosActuales);
      }
    },

    // Limpiar y detener
    destruir: function () {
      if (desuscribir) desuscribir();

      // Remover viñeta
      if (viñeta && viñeta.parentNode) {
        viñeta.parentNode.removeChild(viñeta);
        viñeta = null;
      }

      // Remover resplandor
      if (resplandor && resplandor.parentNode) {
        resplandor.parentNode.removeChild(resplandor);
        resplandor = null;
      }
    }
  };

  global.AmbienteLuz = api;

})(window);
