/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-metrics.js
   Etapa 1 (Roadmap A+B — Instrumentación)

   Subsistema del Grupo de Infraestructura. Responsabilidad única:
   tomar la misma medición que ya se usó a mano en
   js/diagnostico-rendimiento-temporal.js (performance.now() frame a
   frame + Long Tasks API) y convertirla en una utilidad reusable,
   continua y silenciosa, para que cada etapa siguiente de este
   roadmap pueda compararse contra la misma vara sin tener que
   reescribir el harness de medición cada vez.

   Dos modos, mismo método de medición debajo de los dos:

   - Modo continuo (iniciar()): alimenta a AmbienteDiagnostico frame a
     frame (registrarFrameTime) y por cada Long Task (registrarTareaLarga),
     igual que ambiente-rendimiento.js alimenta registrarFPS — un
     sumidero más de datos hacia el mismo registro central, nunca una
     fuente de verdad propia. PERF (2026-07-31): apagado por defecto —
     ver continuoHabilitado() más abajo. Se activa explícitamente con
     ?ambiente_metrics=on en la URL o localStorage.ambienteMetricsContinuo
     = 'true'; sin eso, iniciar() no arranca nada.

   - Modo puntual (medirVentana(ms, cb)): repite exactamente lo que
     hacía diagnostico-rendimiento-temporal.js (una ventana de N ms,
     FPS promedio + long tasks de esa ventana), pero sin tocar el DOM
     ni auto-redirigir la URL — devuelve el resultado crudo por
     callback para que quien la invoque decida qué hacer (loggear,
     comparar contra una baseline, etc). Este es el modo pensado para
     el punto 6 del roadmap ("repetir la captura de 10s... y comparar").
     No depende del flag de arriba — siempre disponible on-demand.

   Este módulo nunca decide nivel de fidelidad ni apaga ningún otro
   subsistema — mismo límite que ambiente-diagnostico.js ("nunca debe
   influir en tiempo real sobre el comportamiento del sistema"): es
   un observador puro, de un solo sentido (mide → registra), nunca al
   revés.

   Debe cargarse después de ambiente-diagnostico.js (es su único
   destino de escritura) y puede cargarse antes del resto del Grupo
   de Gobierno — no depende de ningún otro subsistema.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function diagnostico() { return global.AmbienteDiagnostico || null; }

  function ahora() {
    return (global.performance && typeof global.performance.now === 'function')
      ? global.performance.now() : Date.now();
  }

  function longTasksSoportadas() {
    try {
      return typeof PerformanceObserver !== 'undefined' &&
        !!PerformanceObserver.supportedEntryTypes &&
        PerformanceObserver.supportedEntryTypes.indexOf('longtask') !== -1;
    } catch (e) {
      return false;
    }
  }

  function pestanaVisible() {
    return (typeof document !== 'undefined') ? !document.hidden : true;
  }

  // PERF (auditoría de arquitectura, 2026-07-31): el modo continuo de
  // este módulo se auto-iniciaba SIEMPRE (ver api.iniciar() al final
  // del archivo) — un segundo rAF loop + PerformanceObserver de Long
  // Tasks, para siempre, en el 100% de las visitas, alimentando
  // AmbienteDiagnostico.registrarFrameTime()/registrarTareaLarga() sin
  // que ningún código de producción (app.js, index.html) llame jamás
  // a AmbienteDiagnostico.obtenerResumen() para leerlo — trabajo
  // puro, incluida una allocation ({valor, marca}) + push/splice en
  // CADA frame, sin ningún consumidor. medirVentana() (modo puntual,
  // sin tocar AmbienteDiagnostico) ya cubre el caso de uso real de
  // este módulo — el mismo que usó diagnostico-rendimiento-temporal.js
  // para las mediciones de la auditoría de rendimiento.
  //
  // Mismo mecanismo y misma precedencia que ya usa ambiente-flags.js
  // (URL gana sobre localStorage), pero polaridad invertida a
  // propósito: ahí el default es "todo activo" porque son features
  // del producto; acá el default es "apagado" porque es
  // instrumentación de diagnóstico sin consumidor en producción —
  // activarla es una decisión explícita de quien está midiendo, no
  // un costo que deba pagar cada visita real.
  function continuoHabilitado() {
    try {
      var params = new URLSearchParams(global.location.search);
      var deURL = params.get('ambiente_metrics');
      if (deURL !== null) return deURL === 'on';
    } catch (e) { /* location/URLSearchParams no disponible: seguir */ }
    try {
      return global.localStorage.getItem('ambienteMetricsContinuo') === 'true';
    } catch (e) {
      return false;
    }
  }

  // ── Modo continuo ─────────────────────────────────────────────────
  var rafId = null;
  var ultimoFrame = null;
  var iniciado = false;
  var pausadoPorVisibilidad = false;
  var longTaskObserver = null;
  var listenerVisibilidadRegistrado = false;

  // Mismo criterio de pausa que ambiente-rendimiento.js (Cap. 9.2 en
  // ese módulo): sin esto, un frame gap enorme al volver de segundo
  // plano se registraría como un frameTime falso, ensuciando la
  // métrica sin que haya pasado ningún jank real.
  function pasoFrame(marcaTiempo) {
    if (!pestanaVisible()) {
      ultimoFrame = null;
      pausadoPorVisibilidad = true;
      rafId = null;
      return;
    }
    if (ultimoFrame !== null) {
      var d = diagnostico();
      if (d) d.registrarFrameTime(marcaTiempo - ultimoFrame);
    }
    ultimoFrame = marcaTiempo;
    rafId = global.requestAnimationFrame(pasoFrame);
  }

  function alCambiarVisibilidad() {
    if (pestanaVisible() && pausadoPorVisibilidad && rafId === null) {
      pausadoPorVisibilidad = false;
      rafId = global.requestAnimationFrame(pasoFrame);
    }
  }

  function iniciarLongTasksContinuo() {
    if (!longTasksSoportadas()) return;
    try {
      longTaskObserver = new PerformanceObserver(function (list) {
        var d = diagnostico();
        if (!d) return;
        list.getEntries().forEach(function (entry) {
          d.registrarTareaLarga(entry.duration);
        });
      });
      longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      // Long Tasks API no disponible en este navegador: no crítico,
      // frameTime solo ya aporta señal (mismo criterio fail-open que
      // el resto del motor).
      longTaskObserver = null;
    }
  }

  // ── Modo puntual (una ventana de N ms, sin tocar AmbienteDiagnostico) ──
  function medirVentana(duracionMs, callback) {
    if (typeof callback !== 'function') return;
    var inicio = ahora();
    var frames = 0;
    var maxFrameGap = 0;
    var ultimo = null;
    var longTasksVentana = [];
    var obs = null;

    if (longTasksSoportadas()) {
      try {
        obs = new PerformanceObserver(function (list) {
          list.getEntries().forEach(function (entry) {
            longTasksVentana.push(entry.duration);
          });
        });
        obs.observe({ entryTypes: ['longtask'] });
      } catch (e) {
        obs = null;
      }
    }

    function medirFrame(t) {
      frames++;
      if (ultimo !== null) {
        var gap = t - ultimo;
        if (gap > maxFrameGap) maxFrameGap = gap;
      }
      ultimo = t;
      if (ahora() - inicio < duracionMs) {
        global.requestAnimationFrame(medirFrame);
      }
    }
    global.requestAnimationFrame(medirFrame);

    global.setTimeout(function () {
      if (obs) { try { obs.disconnect(); } catch (e) { /* ya desconectado */ } }
      var duracionReal = ahora() - inicio;
      var totalLongTaskMs = longTasksVentana.reduce(function (acc, d) { return acc + d; }, 0);
      callback({
        fpsPromedio: frames / (duracionReal / 1000),
        framesCapturados: frames,
        gapMaxEntreFrames_ms: Math.round(maxFrameGap),
        longTasksCantidad: longTasksVentana.length,
        longTasksTotalMs: Math.round(totalLongTaskMs),
        duracionRealMs: Math.round(duracionReal)
      });
    }, duracionMs + 50);
  }

  var api = {
    iniciar: function () {
      if (iniciado) return; // idempotente, mismo criterio que ambiente-rendimiento.js
      if (typeof global.requestAnimationFrame !== 'function') return;
      // PERF: sin opt-in explícito, no arranca nada — ver
      // continuoHabilitado() arriba para el porqué.
      if (!continuoHabilitado()) return;
      iniciado = true;
      rafId = global.requestAnimationFrame(pasoFrame);
      iniciarLongTasksContinuo();
      if (!listenerVisibilidadRegistrado && typeof document !== 'undefined' &&
          typeof document.addEventListener === 'function') {
        listenerVisibilidadRegistrado = true;
        document.addEventListener('visibilitychange', alCambiarVisibilidad);
      }
    },

    // Solo para pruebas / apagado explícito — igual que
    // ambiente-rendimiento.js.detener().
    detener: function () {
      if (rafId !== null && typeof global.cancelAnimationFrame === 'function') {
        global.cancelAnimationFrame(rafId);
      }
      rafId = null;
      ultimoFrame = null;
      iniciado = false;
      if (longTaskObserver) {
        try { longTaskObserver.disconnect(); } catch (e) { /* ya desconectado */ }
        longTaskObserver = null;
      }
    },

    medirVentana: medirVentana
  };

  global.AmbienteMetrics = api;

  // Se autoinicia al cargarse, mismo criterio que ambiente-rendimiento.js:
  // es Gobierno/Infraestructura pasivo, no espera a que el orquestador
  // dispare nada. PERF (2026-07-31): esta llamada ahora es un no-op en
  // producción salvo opt-in explícito (ver continuoHabilitado() arriba)
  // — antes de este cambio arrancaba incondicionalmente para el 100%
  // de las visitas, sin ningún consumidor real de su output.
  api.iniciar();

})(window);
