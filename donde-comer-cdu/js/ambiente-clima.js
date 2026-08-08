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

   RESUELTO (no relacionado a este módulo, se anotó acá para que no
   se perdiera): scripts/build-ambiente-bundle.js en la raíz del repo
   ya valida contra el directorio (validarContraDirectorio, comparando
   ORDEN contra los archivos ambiente-*.js en disco) y ya incluye
   ambiente-scheduler.js en ORDEN. El duplicado que vivía en
   donde-comer-cdu/js/scripts/build-ambiente-bundle.js (lugar
   incorrecto) se eliminó — scripts/build-ambiente-bundle.js en la
   raíz es la única versión, y es la que hay que correr antes de cada
   deploy si se toca algún ambiente-*.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function movimiento() { return global.AmbienteMovimiento || null; }
  function rendimiento() { return global.AmbienteRendimiento || null; }

  // Etapa 3 (Roadmap A+B — Contrato común, ver ambiente-contrato.js):
  // mismo umbral que ya usa AmbienteConfig.NIVELES_FIDELIDAD.clima (0
  // en 'reducida' y 'minima', 1 en 'completa') — hoy ese umbral solo
  // apagaba el EFECTO visual vía Motion Controller (climaHabilitado
  // en ambiente-movimiento.js), nunca el polling real de red de este
  // módulo. Pura y sin leer AmbienteRendimiento por su cuenta (recibe
  // el nivel como parámetro), para que se pueda testear aislada sin
  // mockear el Performance Manager completo.
  function isActive(fidelidad) {
    return fidelidad !== 'reducida' && fidelidad !== 'minima';
  }

  function fidelidadActual() {
    var r = rendimiento();
    return r ? r.nivelFidelidad : 'completa';
  }

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
  var desuscribirVisibilidadMovimiento = null;
  var desuscribirRendimiento = null;

  // Etapa 3: dos razones independientes para pausar el polling, cada
  // una dueña de su propio booleano — igual que ya hacía el listener
  // de visibilidad antes de este cambio, solo que ahora hay dos en vez
  // de una. Ninguna anula el registro de la otra: si la pestaña está
  // oculta Y la fidelidad está degradada a la vez, al volver a
  // fidelidad completa con la pestaña todavía oculta, el polling debe
  // seguir pausado (por visibilidad), no reanudarse a medias.
  var visibilidadPermitePolling = true;
  var fidelidadPermitePolling = true;

  // Única función que decide arrancar/parar el intervalo real,
  // consultando ambas señales — así ninguna de las dos puede reanudar
  // el polling por su cuenta mientras la otra lo esté vetando.
  function actualizarEstadoPolling() {
    if (visibilidadPermitePolling && fidelidadPermitePolling) {
      reanudarRefresco();
    } else {
      pausarRefresco();
    }
  }

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
    // Etapa 3 (Roadmap A+B — Contrato común, ver ambiente-contrato.js):
    // campos de forma. id/tier/frequency son metadata declarativa; el
    // comportamiento real de este módulo sigue siendo el mismo de
    // siempre (dirigido por eventos del Motion Controller + polling
    // async), no por un loop de frames — ver la nota en step() más
    // abajo sobre por qué eso es, a propósito, un no-op por ahora.
    id: 'clima',
    // tier:'visual' (nunca 'core'): Cap. 7.2 dice explícitamente que
    // clima es el primer subsistema en desactivarse ante restricción
    // de recursos — mismo criterio que ya expresa isActive() arriba.
    tier: 'visual',
    // frequency:'static' (no 'full' ni 'reduced'): a diferencia de un
    // módulo que recalcula algo en cada frame o cada N ms, clima no
    // tiene una animación continua propia — solo prende/apaga tres
    // clases CSS ante un evento (cambio de escena o de dato real de
    // viento/lluvia/niebla) y se queda quieto entre esos eventos. No
    // hay "cada cuánto" que declarar porque no hay recómputo
    // periódico que gatear.
    frequency: 'static',
    isActive: isActive,

    // step(dt, sharedState): intencionalmente un no-op. El contrato
    // (ver ambiente-contrato.js) pide que step() sea cómputo puro sin
    // tocar DOM/CSS, y que read() sea lo único que el futuro
    // orquestador consulte para escribir en un único batch (Etapa 5).
    // Este módulo hoy escribe DOM directamente desde sus propios
    // callbacks (alCambiarParametros, aplicarDatosClimaReal) porque
    // esos callbacks no corren en el loop de frames — corren cuando
    // el Motion Controller emite un cambio o cuando responde el
    // fetch. Forzarlos hoy a vivir dentro de step() obligaría a cachear
    // su resultado un frame entero antes de aplicarlo, agregando
    // latencia sin ganar nada (nadie más necesita leer ese estado
    // intermedio todavía). Se documenta como desviación explícita,
    // no aplicada en silencio — separar de verdad "calcular" de
    // "escribir" en este módulo queda para cuando el orquestador
    // realmente lo consuma (Etapa 5, writer único), no antes.
    step: function (dt, sharedState) {},

    // read(): lo único que hoy expone al espíritu del contrato — el
    // último estado ya calculado, sin recalcular nada. Incluye lo
    // mismo que ya devolvía obtenerActivos(), en la forma de objeto
    // que un futuro consumidor esperaría de read().
    read: function () {
      return {
        lluvia: !!efectosActivos.lluvia,
        niebla: !!efectosActivos.niebla,
        viento: !!efectosActivos.viento
      };
    },

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
    // Fase 6 (auditoría §1/§3): idempotente — sin esta guarda, una
    // segunda llamada duplicaba el contenedor DOM, la suscripción al
    // Motion Controller y el listener de visibilitychange (el segundo
    // sobrescribía la referencia del primero en listenerVisibilidad,
    // por lo que ese primer listener quedaba huérfano, imposible de
    // remover, acumulándose en cada iniciar() repetido).
    iniciar: function () {
      if (typeof document === 'undefined') return;
      if (contenedor) return; // ya inicializado

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
      //
      // Etapa 3: mismo mecanismo de pausa, ahora también gateado por
      // fidelidad (isActive arriba) — antes ese umbral solo apagaba el
      // EFECTO visual vía Motion Controller, nunca el polling de red
      // real de este módulo. En 'reducida'/'minima' no tiene sentido
      // seguir pidiendo datos que van a alimentar un efecto que ya
      // está desactivado.
      //
      // PERF (auditoría de arquitectura, 2026-07-31): este módulo
      // tenía su propio listener directo de document.visibilitychange
      // — la misma señal cruda que Cap. 2.3 le asigna en exclusiva a
      // AmbienteMovimiento como fuente única para todo el Grupo de
      // Contenido Visual ("ningún módulo... necesita su propio
      // listener de visibilidad"), y que ambiente-respiracion.js ya
      // consume correctamente por esa vía. Ahora clima.js sigue el
      // mismo patrón: se suscribe al evento motivo:'visibilidad' del
      // Motion Controller en vez de escuchar document directamente, y
      // solo cae al listener directo si AmbienteMovimiento no llegó a
      // cargar (mismo respaldo defensivo que el resto del motor usa
      // ante una dependencia ausente). Cero cambio de comportamiento
      // — document.visibilitychange dispara exactamente el mismo
      // evento en ambos casos — es una corrección puramente
      // arquitectónica: una fuente de la señal, no dos.
      if (typeof document !== 'undefined') {
        visibilidadPermitePolling = document.visibilityState !== 'hidden';
        fidelidadPermitePolling = isActive(fidelidadActual());
        actualizarEstadoPolling();

        var alCambiarVisibilidad = function () {
          visibilidadPermitePolling = document.visibilityState !== 'hidden';
          actualizarEstadoPolling();
        };

        var m = movimiento();
        if (m && typeof m.suscribir === 'function') {
          desuscribirVisibilidadMovimiento = m.suscribir(function (evento) {
            if (evento.motivo === 'visibilidad') alCambiarVisibilidad();
          });
        } else if (typeof document.addEventListener === 'function') {
          listenerVisibilidad = alCambiarVisibilidad;
          document.addEventListener('visibilitychange', listenerVisibilidad);
        }

        var r = rendimiento();
        if (r) {
          desuscribirRendimiento = r.suscribir(function (evento) {
            fidelidadPermitePolling = isActive(evento.actual);
            actualizarEstadoPolling();
          });
        }
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
      if (desuscribirVisibilidadMovimiento) {
        desuscribirVisibilidadMovimiento();
        desuscribirVisibilidadMovimiento = null;
      }
      if (desuscribirRendimiento) {
        desuscribirRendimiento();
        desuscribirRendimiento = null;
      }
      visibilidadPermitePolling = true;
      fidelidadPermitePolling = true;

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

  // Etapa 3: envuelto con AmbienteContrato.crear() para validar la
  // forma contra el contrato común (loggea un warning si algo no
  // calza, nunca lanza — mismo criterio fail-open del resto del
  // motor). Fallback defensivo si por algún desorden de carga
  // AmbienteContrato no existiera todavía: se expone igual el api
  // crudo, sin validar, en vez de romper el arranque — un módulo
  // sin validar es preferible a un módulo ausente (mismo espíritu
  // que ya documenta ambiente-contrato.js sobre módulos inválidos).
  global.AmbienteClima = global.AmbienteContrato
    ? global.AmbienteContrato.crear(api)
    : api;

})(window);

