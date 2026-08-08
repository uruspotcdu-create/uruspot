/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — js/app-telemetria.js
   Primer módulo real (auditoría de ingeniería, Oportunidad 3, 2026-08-06)
   de la separación de app.js por responsabilidad — mismo criterio que
   ya rige el Ambient Engine: un módulo con un contrato público
   explícito, sin closures compartidos con quien lo consume.

   Por qué éste es el primero: de los cinco grupos identificados
   (máquina de estados + fetch, render de tarjetas, render de mapa,
   accesibilidad/foco, telemetría/debug), este es el único que es
   puramente CONSUMIDOR de estado ajeno — nunca produce un efecto que
   otro código dependa de observar (a diferencia de, p. ej., el render
   de tarjetas, del que sí depende directamente lo que el usuario ve).
   Antes de esta extracción, verificado por grep: `recordRender`,
   `recordNetworkRequest` y `recordError` (antes en MetricsCollector)
   nunca se llaman desde dentro de app.js — solo son alcanzables desde
   afuera vía `window.URU_APP.metrics`, igual que el resto de esta
   superficie de debug. Separarlo primero no puede introducir una
   regresión visible para un usuario real, solo para quien esté
   inspeccionando la app desde la consola — el subconjunto de riesgo
   más bajo posible para ser el primer módulo de este roadmap.

   CONTRATO (a diferencia de ambiente-movimiento.js, que lee
   directamente `global.AmbienteConfig`/`global.AmbienteRendimiento`
   como OTROS módulos con su propia API pública): este módulo no tiene
   ningún acceso propio al estado interno de app.js — `estado`,
   `uiState`, `DOM`, `REGISTRO`, `currentState`, etc. son privados del
   closure de ese archivo, no globales. La única forma de que este
   módulo los vea es que app.js se los entregue explícitamente, una
   vez, llamando a `configurar(contexto)` con un objeto de funciones
   de acceso (nunca los valores directos — evita capturar una foto
   vieja de algo que cambia con el tiempo, como `estado` tras cada
   render). Sin `configurar()` previo, cada método se degrada
   fail-open (mismo criterio que el resto del proyecto, p. ej. Cap.
   1.4 del Ambient Engine): devuelve un resultado vacío/neutro y
   avisa por consola, en vez de arrojar sobre `contexto` nulo.

   `contexto` esperado (ver app.js, sección de wiring, para la
   implementación real de cada función):
     obtenerDOM()                  → objeto DOM cacheado
     obtenerEstado()                → estado del Plano (PLANO.aplicarAccion)
     obtenerEstadoUI()              → uiState
     obtenerEstadoMaquina()         → currentState (string)
     obtenerUltimoCambioDeEstado()  → timestamp (ms) del último cambio
     obtenerRegistro()              → REGISTRO (array de lugares)
     obtenerCacheRender()           → lastRenderCache
     obtenerLogCambiosEstado()      → stateChangeLog
     contarOperacionesActivas()     → número
     validarEstadoInvariantes()     → ValidacionSuite.validarEstado()
     modulosDisponibles()           → { PLANO, EXPO, MAPA } booleanos
     leerFavoritos() / guardarFavoritos(obj) / actualizarContadorGuardados()
     establecerConsultaBusqueda(str) / establecerFiltroRubro(str|null)
     render()

   Carga: debe estar disponible ANTES de que app.js llame a
   `AppTelemetria.configurar(...)` durante su propia inicialización —
   por eso este archivo va junto a ciclo-vida.js, antes de
   motor.bundle.js en index.html, no dentro de ningún bundle.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var contexto = null;

  function avisarSinConfigurar(metodo) {
    if (global.console) {
      console.warn('[AppTelemetria] ' + metodo + '() llamado antes de configurar() — devolviendo un valor vacío en vez de romper.');
    }
  }

  // ── Métricas ─────────────────────────────────────────────────────
  // A diferencia del resto de este archivo, el conteo interno de
  // métricas NO viene del contexto inyectado — es estado propio de
  // este módulo (nadie más lo necesita leer directo), igual que ya
  // era antes de la extracción. Lo único que sí toma del contexto es
  // `obtenerUltimoCambioDeEstado()`, para el cálculo de `uptime`.
  var contadores = {
    totalRenders: 0,
    totalRenderTime: 0,
    lastRenderTime: 0,
    slowRenders: 0,
    networkRequests: 0,
    networkErrors: 0,
    networkTime: 0,
    operationsStarted: 0,
    operationsCompleted: 0,
    operationsCanceled: 0,
    focusChanges: 0,
    keyboardInteractions: 0,
    geolocationAttempts: 0,
    geolocationSuccesses: 0,
    errorCount: 0,
    memoryWarnings: 0
  };

  var metrics = {
    recordRender: function (startTime, endTime) {
      contadores.totalRenders++;
      var duration = endTime - startTime;
      contadores.totalRenderTime += duration;
      contadores.lastRenderTime = duration;
      if (duration > 100) {
        contadores.slowRenders++;
        console.warn('[Metrics] Render lento: ' + duration.toFixed(1) + 'ms');
      }
    },

    recordNetworkRequest: function (duration, success) {
      contadores.networkRequests++;
      if (success) {
        contadores.networkTime += duration;
      } else {
        contadores.networkErrors++;
      }
    },

    recordError: function (tipo) {
      contadores.errorCount++;
    },

    getSummary: function () {
      var ultimoCambio = contexto && typeof contexto.obtenerUltimoCambioDeEstado === 'function'
        ? contexto.obtenerUltimoCambioDeEstado()
        : null;
      return {
        renders: contadores.totalRenders,
        avgRenderTime: contadores.totalRenders > 0 ? (contadores.totalRenderTime / contadores.totalRenders).toFixed(1) : 0,
        slowRenders: contadores.slowRenders,
        networkRequests: contadores.networkRequests,
        networkErrors: contadores.networkErrors,
        totalErrors: contadores.errorCount,
        uptime: Date.now() - (ultimoCambio || Date.now())
      };
    },

    // PERF (mismo criterio que motor-plano.js/copiarEstado, auditoría
    // 2026-08-05): structuredClone en vez de JSON.parse(JSON.stringify(...))
    // — `contadores` es un objeto plano de solo números, 100%
    // serializable de forma estructurada, así que es equivalente sin
    // pagar el paso por texto. Fallback defensivo si no está disponible.
    export: function () {
      if (typeof structuredClone === 'function') return structuredClone(contadores);
      return JSON.parse(JSON.stringify(contadores));
    }
  };

  // ── Testing / validación ────────────────────────────────────────
  var testing = {
    runSmokeTesting: function () {
      if (!contexto) { avisarSinConfigurar('testing.runSmokeTesting'); return { total: 0, pasadas: 0, fallidas: 0, errores: ['AppTelemetria no configurado'] }; }

      var resultados = { total: 0, pasadas: 0, fallidas: 0, errores: [] };
      var DOM = contexto.obtenerDOM();
      var estado = contexto.obtenerEstado();
      var REGISTRO = contexto.obtenerRegistro();
      var modulos = contexto.modulosDisponibles();

      resultados.total++;
      try {
        if (Object.keys(DOM).length === 0) throw new Error('DOM no inicializado');
        resultados.pasadas++;
      } catch (e) {
        resultados.fallidas++;
        resultados.errores.push('DOM: ' + e.message);
      }

      resultados.total++;
      try {
        if (!estado) throw new Error('Estado es null');
        if (!estado.sesion) throw new Error('Estado.sesion es null');
        resultados.pasadas++;
      } catch (e) {
        resultados.fallidas++;
        resultados.errores.push('Estado: ' + e.message);
      }

      resultados.total++;
      try {
        if (!Array.isArray(REGISTRO)) throw new Error('REGISTRO no es array');
        if (REGISTRO.length === 0) throw new Error('REGISTRO vacío');
        resultados.pasadas++;
      } catch (e) {
        resultados.fallidas++;
        resultados.errores.push('Registro: ' + e.message);
      }

      resultados.total++;
      try {
        if (!modulos.PLANO || !modulos.EXPO || !modulos.MAPA) {
          throw new Error('Módulos no inyectados');
        }
        resultados.pasadas++;
      } catch (e) {
        resultados.fallidas++;
        resultados.errores.push('Módulos: ' + e.message);
      }

      resultados.total++;
      try {
        var favs = contexto.leerFavoritos();
        if (typeof favs !== 'object') throw new Error('Favoritos no es objeto');
        resultados.pasadas++;
      } catch (e) {
        resultados.fallidas++;
        resultados.errores.push('Favoritos: ' + e.message);
      }

      resultados.total++;
      try {
        if (!DOM.inputBuscar) throw new Error('Input de búsqueda no existe');
        resultados.pasadas++;
      } catch (e) {
        resultados.fallidas++;
        resultados.errores.push('Búsqueda: ' + e.message);
      }

      resultados.total++;
      try {
        if (!contexto.validarEstadoInvariantes()) {
          throw new Error('Validación fallida');
        }
        resultados.pasadas++;
      } catch (e) {
        resultados.fallidas++;
        resultados.errores.push('Validación: ' + e.message);
      }

      resultados.total++;
      try {
        if (contexto.contarOperacionesActivas() < 0) {
          throw new Error('OperationManager roto');
        }
        resultados.pasadas++;
      } catch (e) {
        resultados.fallidas++;
        resultados.errores.push('Operations: ' + e.message);
      }

      console.log('[Testing] Smoke tests: ' + resultados.pasadas + '/' + resultados.total + ' pasadas');
      if (resultados.errores.length > 0) {
        console.error('[Testing] Errores encontrados:', resultados.errores);
      }

      return resultados;
    },

    validarContratoDOM: function () {
      if (!contexto) { avisarSinConfigurar('testing.validarContratoDOM'); return { requeridos: [], resultados: {} }; }

      var DOM = contexto.obtenerDOM();
      var contrato = {
        requeridos: ['inputBuscar', 'panelDescubrimiento', 'tituloRegion', 'subtituloRegion'],
        resultados: {}
      };

      contrato.requeridos.forEach(function (id) {
        contrato.resultados[id] = !!DOM[id];
      });

      var todoOK = Object.keys(contrato.resultados).every(function (k) {
        return contrato.resultados[k];
      });

      console.log('[Testing] Contrato DOM: ' + (todoOK ? 'OK' : 'FALLIDO'));
      return contrato;
    },

    validarRegistro: function () {
      if (!contexto) { avisarSinConfigurar('testing.validarRegistro'); return { total: 0, problemasEncontrados: 0, porcentajeIntegridad: '0.0' }; }

      var REGISTRO = contexto.obtenerRegistro();
      var problemas = [];
      REGISTRO.forEach(function (l, i) {
        if (!l.id) problemas.push('Item ' + i + ': sin id');
        if (!l.nombre) problemas.push('Item ' + i + ': sin nombre');
        if (!l.grupo) problemas.push('Item ' + i + ': sin grupo');
      });

      if (problemas.length > 0) {
        console.error('[Testing] Problemas en registro:', problemas.slice(0, 5));
      }

      return {
        total: REGISTRO.length,
        problemasEncontrados: problemas.length,
        porcentajeIntegridad: REGISTRO.length > 0 ? ((REGISTRO.length - problemas.length) / REGISTRO.length * 100).toFixed(1) : '0.0'
      };
    }
  };

  // ── Debug / inspección interactiva ──────────────────────────────
  var debug = {
    inspectarEstado: function () {
      if (!contexto) { avisarSinConfigurar('debug.inspectarEstado'); return null; }
      return {
        current: contexto.obtenerEstadoMaquina(),
        uiState: contexto.obtenerEstadoUI(),
        estado: contexto.obtenerEstado(),
        registroSize: contexto.obtenerRegistro().length,
        cacheInfo: contexto.obtenerCacheRender(),
        operacionesActivas: contexto.contarOperacionesActivas()
      };
    },

    simularBusqueda: function (consulta) {
      if (!contexto) { avisarSinConfigurar('debug.simularBusqueda'); return; }
      contexto.establecerConsultaBusqueda(consulta);
      contexto.render();
    },

    simularFiltroRubro: function (rubro) {
      if (!contexto) { avisarSinConfigurar('debug.simularFiltroRubro'); return; }
      contexto.establecerFiltroRubro(rubro);
      contexto.render();
    },

    simularGuardarFavorito: function (lugarId) {
      if (!contexto) { avisarSinConfigurar('debug.simularGuardarFavorito'); return; }
      var favoritos = contexto.leerFavoritos();
      favoritos[lugarId] = !favoritos[lugarId];
      contexto.guardarFavoritos(favoritos);
      contexto.actualizarContadorGuardados();
      contexto.render();
    },

    healthCheck: function () {
      if (!contexto) { avisarSinConfigurar('debug.healthCheck'); return null; }
      var resultadoTesting = testing.runSmokeTesting();
      var resultadoMetrics = metrics.getSummary();
      var resultadoRegistro = testing.validarRegistro();
      var resultadoContrato = testing.validarContratoDOM();

      return {
        estado: contexto.obtenerEstadoMaquina(),
        testing: resultadoTesting,
        metrics: resultadoMetrics,
        registro: resultadoRegistro,
        contrato: resultadoContrato,
        timestamp: new Date().toISOString()
      };
    },

    exportDebugData: function () {
      if (!contexto) { avisarSinConfigurar('debug.exportDebugData'); return null; }
      return {
        version: '2.3.0',
        timestamp: new Date().toISOString(),
        health: debug.healthCheck(),
        stateLog: contexto.obtenerLogCambiosEstado().slice(-20),
        metricsExport: metrics.export(),
        registroMuestraSize10: contexto.obtenerRegistro().slice(0, 10)
      };
    }
  };

  global.AppTelemetria = {
    // Llamado una única vez por app.js, durante su propia
    // inicialización (idempotente a propósito: una segunda llamada
    // simplemente reemplaza el contexto — útil para reiniciar() sin
    // acumular estado viejo).
    configurar: function (nuevoContexto) {
      contexto = nuevoContexto || null;
    },
    metrics: metrics,
    testing: testing,
    debug: debug
  };

})(window);

