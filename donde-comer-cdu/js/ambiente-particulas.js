/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-particulas.js
   Fase 2: Particle Engine (Arquitectura técnica, Cap. 3.6)

   Subsistema del Grupo de Contenido Visual. Responsabilidad única:
   gestionar la Capa de Partículas: creación, movimiento limitados en
   cantidad, variación y destrucción de los elementos que la componen.

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 3.6 — no gestiona ningún efecto climático (eso pertenece al
     Weather Engine, aunque ambos puedan compartir primitivas visuales
     similares a nivel de Asset Registry).
   - Cap. 3.6 — no debe exceder el techo de partículas simultáneas
     comunicado por Motion Controller, incluso si la configuración de
     escena solicitara una densidad mayor — el límite de rendimiento
     siempre tiene prioridad (Cap. 9.2).
   - Cap. 2.3 — nunca se comunica lateralmente con otros subsistemas del
     Grupo de Contenido Visual (Particle ↔ Weather, Particle ↔ Lighting,
     etc.). Todo pasa por Motion Controller.
   - Cap. 2.3 — solo recibe parámetros del Motion Controller, nunca
     consulta directamente a Performance Manager o Accessibility Manager.
   - Cap. 7.2 — desactivable según orden de degradación (Cap. 7.2: segundo
     en ser desactivado tras Clima).
   - Cap. 7.4 — respeta el factorPresupuesto si está en los parámetros.

   Debe cargarse después de ambiente-movimiento.js y antes de
   ambiente-orquestador.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function movimiento() { return global.AmbienteMovimiento || null; }

  var particulasActivas = [];
  var contenedor = null;
  var parametrosActuales = null;
  var densidadMaxima = 150; // techo de partículas simultáneas (ajustable)
  var desuscribir = null;

  // Crear un elemento visual de partícula
  function crearParticula() {
    var particula = {
      elemento: null,
      posX: Math.random() * 100,
      posY: Math.random() * 100,
      velocidadX: (Math.random() - 0.5) * 2,
      velocidadY: (Math.random() - 0.5) * 2,
      duracion: Math.random() * 2000 + 2000 // 2-4 segundos
    };

    if (typeof document !== 'undefined') {
      particula.elemento = document.createElement('div');
      particula.elemento.className = 'ambient-particula';
      particula.elemento.style.position = 'absolute';
      particula.elemento.style.width = '4px';
      particula.elemento.style.height = '4px';
      particula.elemento.style.borderRadius = '50%';
      particula.elemento.style.backgroundColor = 'rgba(100, 180, 255, 0.5)';
      particula.elemento.style.left = particula.posX + '%';
      particula.elemento.style.top = particula.posY + '%';
      particula.elemento.style.pointerEvents = 'none';
      
      if (contenedor) contenedor.appendChild(particula.elemento);
    }

    return particula;
  }

  // Actualizar posición de una partícula
  function actualizarParticula(particula, deltaMs) {
    particula.duracion -= deltaMs;
    particula.posX += particula.velocidadX * (deltaMs / 1000);
    particula.posY += particula.velocidadY * (deltaMs / 1000);

    // Mantener dentro del viewport
    if (particula.posX < 0 || particula.posX > 100) {
      particula.velocidadX *= -1;
      particula.posX = Math.max(0, Math.min(100, particula.posX));
    }
    if (particula.posY < 0 || particula.posY > 100) {
      particula.velocidadY *= -1;
      particula.posY = Math.max(0, Math.min(100, particula.posY));
    }

    // Actualizar opacidad según duración restante
    var opacidad = Math.max(0, particula.duracion / 4000);
    if (particula.elemento) {
      particula.elemento.style.left = particula.posX + '%';
      particula.elemento.style.top = particula.posY + '%';
      particula.elemento.style.opacity = opacidad;
    }

    return particula.duracion > 0;
  }

  // Limpiar partículas muertas
  function limpiarParticulasMuertas() {
    particulasActivas = particulasActivas.filter(function (p) {
      if (p.duracion <= 0) {
        if (p.elemento && p.elemento.parentNode) {
          p.elemento.parentNode.removeChild(p.elemento);
        }
        return false;
      }
      return true;
    });
  }

  // Animar el loop de partículas
  var animationFrameId = null;
  var ultimoFrame = Date.now();

  function animar() {
    var ahora = Date.now();
    var deltaMs = ahora - ultimoFrame;
    ultimoFrame = ahora;

    // Actualizar partículas existentes
    particulasActivas.forEach(function (p) {
      actualizarParticula(p, deltaMs);
    });

    // Limpiar partículas muertas
    limpiarParticulasMuertas();

    // Generar nuevas partículas según densidad
    if (parametrosActuales && parametrosActuales.particulas) {
      var densidad = parametrosActuales.particulas.densidad || 0;
      var cantidadDeseada = Math.round(densidadMaxima * densidad);
      var cantidadActual = particulasActivas.length;

      // Generar nuevas si es necesario
      while (cantidadActual < cantidadDeseada) {
        particulasActivas.push(crearParticula());
        cantidadActual++;
      }

      // Eliminar extras si es necesario
      while (cantidadActual > cantidadDeseada && particulasActivas.length > 0) {
        var p = particulasActivas.pop();
        if (p.elemento && p.elemento.parentNode) {
          p.elemento.parentNode.removeChild(p.elemento);
        }
        cantidadActual--;
      }
    }

    animationFrameId = requestAnimationFrame(animar);
  }

  // Manejador de cambios en parámetros del Motion Controller
  function alCambiarParametros(evento) {
    parametrosActuales = evento.parametros;
    // Cap. 7.2: bajo accesibilidad o fidelidad mínima, la densidad se reduce a 0
    // y todas las partículas existentes se limpian.
  }

  var api = {
    // Obtener cantidad de partículas actualmente activas
    obtenerCantidadActiva: function () {
      return particulasActivas.length;
    },

    // Cambiar el techo máximo de partículas
    establecerDensidadMaxima: function (cantidad) {
      densidadMaxima = Math.max(10, cantidad); // mínimo 10
    },

    // Inicializar el subsistema
    iniciar: function () {
      if (typeof document === 'undefined') return;

      // Crear contenedor
      contenedor = document.createElement('div');
      contenedor.id = 'ambient-particulas-contenedor';
      contenedor.style.position = 'fixed';
      contenedor.style.top = '0';
      contenedor.style.left = '0';
      contenedor.style.width = '100%';
      contenedor.style.height = '100%';
      contenedor.style.pointerEvents = 'none';
      contenedor.style.zIndex = '10';
      document.body.appendChild(contenedor);

      // Suscribirse a cambios del Motion Controller
      var m = movimiento();
      if (m) {
        desuscribir = m.suscribir(alCambiarParametros);
        parametrosActuales = m.parametros();
      }

      // Iniciar animación
      animar();
    },

    // Limpiar y detener
    destruir: function () {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (desuscribir) desuscribir();

      // Limpiar todas las partículas
      particulasActivas.forEach(function (p) {
        if (p.elemento && p.elemento.parentNode) {
          p.elemento.parentNode.removeChild(p.elemento);
        }
      });
      particulasActivas = [];

      // Remover contenedor
      if (contenedor && contenedor.parentNode) {
        contenedor.parentNode.removeChild(contenedor);
      }
    }
  };

  global.AmbienteParticulas = api;

})(window);
