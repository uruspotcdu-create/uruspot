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

   Fase 6 (Playbook, WP5) / Fase 7 (Auditoría §9.1): conecta
   functions/weather.js como primera señal ambiental real. Sigue
   siendo un ejecutor, no un decisor de negocio: solo traduce
   temperatura/código WMO/viento ya normalizados por esa función a
   activar/desactivar los mismos tres efectos que ya existían — nunca
   agrega un cuarto efecto ni decide fuera de ese vocabulario. Nunca
   escribe en ninguna fuente de datos existente, solo lee. Una falla
   de red acá nunca debe notarse: se degrada a exactamente el mismo
   comportamiento de antes (niebla sutil por escena, nada más).

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

  // Fase 6/7: clima real. Endpoint co-alojado (Cloudflare Pages
  // Function en functions/weather.js) — mismo origen, sin CORS.
  var URL_CLIMA = '/weather';
  // Mismo intervalo que el cache-control del propio endpoint (300s):
  // pedir más seguido no traería datos más frescos (Fase 6 criterio
  // de rechazo: "cualquier polling con frecuencia propia distinta").
  var INTERVALO_REFRESCO_MS = 5 * 60 * 1000;
  var UMBRAL_VIENTO_KMH = 25;
  // Códigos WMO ya normalizados por functions/weather.js.
  var CODIGOS_LLUVIA = { 51: true, 61: true, 65: true, 71: true, 75: true };
  var CODIGO_NIEBLA = 45;

  var temporizadorClima = null;
  var climaRealVientoActivo = false;
  var climaRealLluviaActiva = false;
  var climaRealNieblaActiva = false;
  var listenerVisibilidad = null;

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
      climaRealLluviaActiva = false;
      climaRealVientoActivo = false;
      return;
    }

    // Cap. 3.7: "clima es un toggle que resolverá el futuro Weather Engine"
    // Por ahora, si está habilitado, activamos niebla sutil (Cap. 5.9 Fase 1)
    // Fase 6/7: niebla real (código WMO 45) se suma como OR — cualquiera
    // de las dos razones (escena o dato real) es suficiente, ninguna
    // anula a la otra.
    if (clima.nieblaSutil || climaRealNieblaActiva) {
      activarEfecto('niebla');
    } else {
      desactivarEfecto('niebla');
    }

    // Cap. 5.7 Fase 1: "lluvia, noche y atardecer... variaciones que se
    // superponen". Lluvia es un toggle independiente de la escena.
    // Fase 6/7: ahora sí tiene un Context Manager real — functions/weather.js.
    if (climaRealLluviaActiva) {
      activarEfecto('lluvia');
    } else {
      desactivarEfecto('lluvia');
    }
    if (climaRealVientoActivo) {
      activarEfecto('viento');
    } else {
      desactivarEfecto('viento');
    }
  }

  // Fase 6 WP5 / Fase 7 §9.1: traduce el dato ya normalizado de
  // functions/weather.js al mismo vocabulario de tres efectos que ya
  // existía. No decide nada de negocio nuevo — solo mapea código WMO
  // → efecto ya definido arriba (Cap. 2.3: sigue sin comunicarse
  // lateralmente con otros subsistemas de Contenido Visual).
  function aplicarDatosClimaReal(datos) {
    var codigo = datos && datos.current && datos.current.weather_code;
    var vientoKmh = datos && datos.current && datos.current.wind_speed_10m;

    climaRealLluviaActiva = !!(codigo != null && CODIGOS_LLUVIA[codigo]);
    climaRealNieblaActiva = codigo === CODIGO_NIEBLA;
    climaRealVientoActivo = typeof vientoKmh === 'number' && vientoKmh >= UMBRAL_VIENTO_KMH;

    publicarSenalVientoDOM();

    // Re-aplica contra la escena vigente (si el clima está deshabilitado
    // para esta escena, alCambiarParametros ya lo apaga todo igual).
    if (parametrosActuales) alCambiarParametros({ parametros: parametrosActuales });
  }

  // Auditoría de conexiones (Fase 8): changelog.md v1.0 registraba
  // "Reactividad a clima (lluvia/viento) de Corrientes y Partículas
  // de deriva" como pendiente, a propósito, por "sin señal real de
  // clima en la app". Esa señal ya existe acá desde Fase 6/7 — solo
  // nunca salía de este módulo. Mismo patrón exacto que
  // ambiente-respiracion.js (Cap. 2.3: "publica un valor que
  // cualquier CSS puede leer", nunca llama directo a otro subsistema
  // de Contenido Visual): se escribe una única variable numérica
  // --amb-clima-viento (0 o 1) sobre <html>, que
  // assets/ambient/_tokens/ambiente-tokens-movimiento.css usa para
  // acelerar la Deriva de Corrientes y la Flotación de Partículas —
  // ninguna de las dos familias necesita conocer a este módulo.
  // Deliberadamente solo viento: es la única de las tres señales de
  // clima real con una traducción de movimiento obvia y no forzada
  // (una corriente/partícula que "se apura" con viento real; lluvia y
  // niebla ya tienen su propia traducción visual — los overlays — y
  // forzarlas también sobre Corrientes/Partículas sería inventar una
  // asociación que el Cap. 8.2 pide evitar).
  function publicarSenalVientoDOM() {
    if (typeof document === 'undefined' || !document.documentElement) return;
    document.documentElement.style.setProperty(
      '--amb-clima-viento',
      climaRealVientoActivo ? '1' : '0'
    );
  }

  // Fetch con timeout corto: una falla o demora de la API externa
  // (Cap. 15.3 Blueprint: blast radius) nunca debe bloquear ni
  // degradar nada más del Ambient Engine — silenciosa, sin reintento
  // agresivo, mismo criterio fail-open que el resto del motor.
  function obtenerClimaReal() {
    if (typeof fetch !== 'function') return;
    var controlador = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timeoutId = controlador ? setTimeout(function () { controlador.abort(); }, 5000) : null;

    fetch(URL_CLIMA, { signal: controlador ? controlador.signal : undefined })
      .then(function (res) {
        if (timeoutId) clearTimeout(timeoutId);
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (datos) {
        if (datos) aplicarDatosClimaReal(datos);
      })
      .catch(function () {
        // Fail-open silencioso: se queda con el último estado conocido
        // (o con el comportamiento previo basado solo en escena) en
        // vez de romper o de reintentar agresivamente.
        if (timeoutId) clearTimeout(timeoutId);
      });
  }

  function pausarRefresco() {
    if (temporizadorClima) {
      clearInterval(temporizadorClima);
      temporizadorClima = null;
    }
  }

  function reanudarRefresco() {
    if (temporizadorClima) return;
    obtenerClimaReal();
    temporizadorClima = setInterval(obtenerClimaReal, INTERVALO_REFRESCO_MS);
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

      // Fase 6 WP5 / Fase 7 §9.1: clima real. Se pausa completamente
      // cuando la pestaña no es visible (Cap. 8.2 Playbook: "sin
      // listeners activos en background") y retoma con un fetch
      // inmediato al volver, en vez de esperar el próximo intervalo.
      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        if (document.visibilityState !== 'hidden') reanudarRefresco();
        listenerVisibilidad = function () {
          if (document.visibilityState === 'hidden') pausarRefresco();
          else reanudarRefresco();
        };
        document.addEventListener('visibilitychange', listenerVisibilidad);
      }
    },

    // Limpiar y detener
    destruir: function () {
      if (desuscribir) desuscribir();
      pausarRefresco();
      if (listenerVisibilidad && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', listenerVisibilidad);
        listenerVisibilidad = null;
      }

      // Desactivar todos los efectos
      Object.keys(EFECTOS_DISPONIBLES).forEach(desactivarEfecto);

      // Remover contenedor
      if (contenedor && contenedor.parentNode) {
        contenedor.parentNode.removeChild(contenedor);
      }

      // Auditoría de conexiones: limpiar también la señal publicada,
      // para que Corrientes/Partículas no queden "aceleradas" por un
      // viento que ya nadie está midiendo.
      climaRealVientoActivo = false;
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.style.removeProperty('--amb-clima-viento');
      }
    }
  };

  global.AmbienteClima = api;

})(window);
