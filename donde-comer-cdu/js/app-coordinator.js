/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — app-coordinator.js

   FASE 7 del Plan Maestro de Modularización (2026-08-06, ver
   ARQUITECTURA_MAESTRO_APP.md §7 "Orquestación Final"). Extraído de
   app.js §4 (Gestor de Operaciones), §7 (Validación de Invariantes),
   §8 (Accesibilidad Avanzada), §10 (Inicialización y Ciclo de Vida),
   §26 (Ciclo de Vida Extendido / LifecycleHooks), §23-25 (wiring de
   AppTelemetria) y §27-28 (API pública + punto de entrada). Es el
   "pegamento final" que menciona el plan: no contiene lógica de
   negocio nueva, solo conecta los módulos que ya construyó app.js
   (RenderEngine, DomPainter, Listeners, NavegacionTeclado, MapaModulo,
   ScrollReveal, ClimateContext, ErrorRecovery, RegistroCatálogo) con
   el DOM real y con `window.URU_APP`.

   Mismo criterio ya usado por render-engine.js/listeners.js/
   map-module.js (ADR-003 del plan): dependencias explícitas por
   parámetro, nada de `window.X`/globales de app.js asumidas adentro
   del módulo — con la misma excepción ya usada en listeners.js para
   los globals de terceros que YA estaban gateados con `if`/`typeof`
   en el código original (`window.Coreografias`).

   ORDEN DE CONSTRUCCIÓN (importante): a diferencia de RenderEngine/
   Listeners/MapaModulo — que se construyen A MITAD de app.js, antes
   de que varias de sus dependencias existan, y por eso reciben esas
   dependencias como getter/thunk — este módulo se construye al FINAL
   de la IIFE de app.js, en el mismo punto donde antes vivía la
   sección 27. Para ese momento, TODO lo que antes era "va a existir
   después" (render, leerFavoritos, cargarCatalogo, Listeners,
   RenderEngine, etc.) ya es un valor resuelto — así que la mayoría de
   las deps de abajo se pasan DIRECTO, por valor, sin thunk.

   EXCEPCIÓN — OperationManager (antes §4 de app.js) NO se movió acá
   pese a estar documentado como parte del mismo bloque en el plan
   maestro: `crearDataLoader()` (data-loader.js) ya lo necesita como
   dependencia mucho antes en app.js (para trackear los fetches del
   catálogo), es decir antes de que este coordinador exista si se
   construyera al final del archivo. Se deja donde está (construido en
   app.js, antes de fetchJSON) y viaja hacia acá como instancia ya
   resuelta, igual que ErrorRecovery/RenderEngine/Listeners — mover
   "toda la sección 4" habría exigido construir este módulo a mitad de
   archivo, con thunks para todo lo demás, exactamente el problema que
   la construcción al final evita para el resto de las 40+ deps.

   Las demás excepciones son las piezas que siguen mutando DESPUÉS de
   que este coordinador se construye:
     - `estado` (getEstado/setEstado) — se reasigna en cada acción de
       PLANO durante toda la sesión.
     - `PLANO`/`EXPO`/`MAPA` (getters/setters) — hoy null; recién se resuelven
       DENTRO de este módulo, en validarModulos() (antes vivía en
       app.js, ahora vive acá — por eso necesita ESCRIBIR esas tres
       variables de vuelta en app.js, de ahí los setters).
     - `dynamicElements` — se reconstruye por completo en cada
       limpiar()/reiniciar() (antes `dynamicElements = {}` reasignaba
       la variable local de app.js); se expone un getter
       (`obtenerDynamicElements`) para lectura y un thunk
       (`resetDynamicElements`) para el reset, en vez de pasar el
       objeto por valor (que quedaría apuntando a la instancia vieja
       después del primer reset).

   @param {Object} deps
   @param {string} deps.CIUDAD
   @param {Object} deps.STATE - constants.js
   @param {Object} deps.ERROR_TYPE - constants.js
   @param {number} deps.FOCUS_TRAP_DELAY_MS
   @param {number} deps.CLIMA_CONTEXTO_INTERVALO_MS
   @param {function(...*):void} deps.debugLog
   @param {function():Array} deps.obtenerRegistro - catalog.js
   @param {function(string):Object} deps.obtenerPorId - catalog.js
   @param {function():string} deps.estadoActual - state-manager.js
   @param {function(string,string):void} deps.transicionarEstado - state-manager.js
   @param {function(string):void} deps.forzarEstado - state-manager.js
   @param {function(string):boolean} deps.puedeTransicionar - state-manager.js
   @param {function():Object} deps.obtenerUltimoCambioDeEstado - state-manager.js
   @param {function():Array} deps.obtenerLogCambiosEstado - state-manager.js
   @param {function():void} deps.vaciarLogEstado - state-manager.js (vaciarLog)
   @param {Object} deps.DOM - objeto mutable de app.js, se llena in-place (DOM[id] = el)
   @param {Array<string>} deps.REQUIRED_DOM_IDS
   @param {Array<string>} deps.OPTIONAL_DOM_IDS
   @param {Object} deps.uiState - instancia real de ui-state.js
   @param {Object} deps.activeOperations - timers/operaciones de app.js
   @param {function():Object|null} deps.getEstado
   @param {function(Object):void} deps.setEstado
   @param {function(Object):void} deps.setPLANO
   @param {function(Object):void} deps.setEXPO
   @param {function(Object):void} deps.setMAPA
   @param {function():Object|null} deps.getPLANO
   @param {function():Object|null} deps.getEXPO
   @param {function():Object|null} deps.getMAPA
   @param {function():Object} deps.obtenerDynamicElements
   @param {function():void} deps.resetDynamicElements
   @param {Object} deps.ErrorRecovery - error-recovery.js
   @param {function():Object} deps.leerFavoritos - favorites.js (wrapper de app.js)
   @param {function(Object):void} deps.guardarFavoritos - favorites.js (wrapper de app.js)
   @param {function():void} deps.actualizarContadorGuardados
   @param {function():void} deps.pintarEsqueleto
   @param {Object} deps.Listeners - listeners.js, ya construido
   @param {Object} deps.NavegacionTeclado - keyboard-nav.js, ya construido
   @param {function():void} deps.inicializarGeolocation
   @param {function(Element):void} deps.activarCercaDeMi
   @param {function():void} deps.desactivarCercaDeMi
   @param {Object} deps.ClimateContext - climate-context.js, ya construido
   @param {function():void} deps.cargarMotorAmbientalDiferido
   @param {function():void} deps.promoverCssEditorialDiferido
   @param {function():void} deps.cargarCatalogo
   @param {function(string,Object):void} deps.mostrarEstadoError
   @param {function():void} deps.render
   @param {Object} deps.RenderEngine - render-engine.js, ya construido
   @param {Object} deps.OperationManager - construido en app.js (antes de
     fetchJSON/data-loader.js), NO acá — ver nota de cabecera arriba
   ═══════════════════════════════════════════════════════════════════ */

export function crearAppCoordinator(deps) {
  var CIUDAD = deps.CIUDAD;
  var STATE = deps.STATE;
  var ERROR_TYPE = deps.ERROR_TYPE;
  var FOCUS_TRAP_DELAY_MS = deps.FOCUS_TRAP_DELAY_MS;
  var CLIMA_CONTEXTO_INTERVALO_MS = deps.CLIMA_CONTEXTO_INTERVALO_MS;
  var debugLog = deps.debugLog;
  var obtenerRegistro = deps.obtenerRegistro;
  var obtenerPorId = deps.obtenerPorId;
  var estadoActual = deps.estadoActual;
  var transicionarEstado = deps.transicionarEstado;
  var forzarEstado = deps.forzarEstado;
  var puedeTransicionar = deps.puedeTransicionar;
  var obtenerUltimoCambioDeEstado = deps.obtenerUltimoCambioDeEstado;
  var obtenerLogCambiosEstado = deps.obtenerLogCambiosEstado;
  var vaciarLogEstado = deps.vaciarLogEstado;
  var DOM = deps.DOM;
  var REQUIRED_DOM_IDS = deps.REQUIRED_DOM_IDS;
  var OPTIONAL_DOM_IDS = deps.OPTIONAL_DOM_IDS;
  var uiState = deps.uiState;
  var activeOperations = deps.activeOperations;
  var getEstado = deps.getEstado;
  var setEstado = deps.setEstado;
  var setPLANO = deps.setPLANO;
  var setEXPO = deps.setEXPO;
  var setMAPA = deps.setMAPA;
  var getPLANO = deps.getPLANO;
  var getEXPO = deps.getEXPO;
  var getMAPA = deps.getMAPA;
  var obtenerDynamicElements = deps.obtenerDynamicElements;
  var resetDynamicElements = deps.resetDynamicElements;
  var ErrorRecovery = deps.ErrorRecovery;
  var leerFavoritos = deps.leerFavoritos;
  var guardarFavoritos = deps.guardarFavoritos;
  var actualizarContadorGuardados = deps.actualizarContadorGuardados;
  var pintarEsqueleto = deps.pintarEsqueleto;
  var Listeners = deps.Listeners;
  var NavegacionTeclado = deps.NavegacionTeclado;
  var inicializarGeolocation = deps.inicializarGeolocation;
  var activarCercaDeMi = deps.activarCercaDeMi;
  var desactivarCercaDeMi = deps.desactivarCercaDeMi;
  var ClimateContext = deps.ClimateContext;
  var cargarMotorAmbientalDiferido = deps.cargarMotorAmbientalDiferido;
  var promoverCssEditorialDiferido = deps.promoverCssEditorialDiferido;
  var cargarCatalogo = deps.cargarCatalogo;
  var mostrarEstadoError = deps.mostrarEstadoError;
  var render = deps.render;
  var RenderEngine = deps.RenderEngine;
  // §4 GESTOR DE OPERACIONES: construido en app.js, no acá — ver nota
  // de cabecera ("EXCEPCIÓN — OperationManager").
  var OperationManager = deps.OperationManager;

  // ───────────────────────────────────────────────────────────────────
  // 7. VALIDACIÓN DE INVARIANTES
  // ───────────────────────────────────────────────────────────────────
  // Extracción directa de app.js §7. `estado` se lee/escribe vía
  // getEstado() en vez del closure directo que tenía en app.js — ver
  // nota de cabecera sobre por qué es la única pieza de sesión que
  // sigue necesitando getter/setter en este módulo.

  var ValidacionSuite = (function () {
    return {
      validarEstado: function () {
        var errores = [];
        var estado = getEstado();

        if (obtenerRegistro().length > 0 && !estado) {
          errores.push('estado es null pero REGISTRO tiene ' + obtenerRegistro().length + ' items');
        }

        var favoritosActuales = leerFavoritos();
        var conteo = Object.keys(favoritosActuales).filter(function (id) {
          return favoritosActuales[id];
        }).length;
        var contador = DOM.contadorCuraduria ? parseInt(DOM.contadorCuraduria.textContent, 10) : 0;
        if (conteo !== contador && !isNaN(contador)) {
          console.warn('[Validación] Inconsistencia en conteo de guardados: favoritos=' + conteo + ', DOM=' + contador);
        }

        if (uiState.filtroRubroActivo && obtenerRegistro().length > 0) {
          var existe = obtenerRegistro().some(function (l) { return l.grupo === uiState.filtroRubroActivo; });
          if (!existe) {
            errores.push('filtroRubroActivo "' + uiState.filtroRubroActivo + '" no existe en REGISTRO');
          }
        }

        if (errores.length > 0) {
          console.error('[Validación] Errores encontrados:', errores);
          return false;
        }
        return true;
      },

      reparar: function () {
        if (!getEstado()) return;

        var favoritosActuales = leerFavoritos();
        var cambio = false;
        Object.keys(favoritosActuales).forEach(function (id) {
          if (favoritosActuales[id] && !obtenerPorId(id)) {
            delete favoritosActuales[id];
            cambio = true;
          }
        });
        if (cambio) {
          guardarFavoritos(favoritosActuales);
        }

        actualizarContadorGuardados();
      }
    };
  })();

  // ───────────────────────────────────────────────────────────────────
  // 8. UTILIDADES DE ACCESIBILIDAD AVANZADA
  // ───────────────────────────────────────────────────────────────────
  // Extracción directa de app.js §8 — sin cambios de comportamiento.

  var AccesibilidadManager = (function () {
    var focusStack = [];

    return {
      guardarFoco: function (el) {
        focusStack.push(el || document.activeElement);
        return focusStack.length - 1;
      },
      restaurarFoco: function (id) {
        if (id === undefined) id = focusStack.length - 1;
        var el = focusStack[id];
        if (el && el.focus) {
          el.focus({ preventScroll: false });
          focusStack[id] = null;
        }
      },
      enfocar: function (el, anuncio) {
        if (!el) return;
        if (el.getAttribute('tabindex') !== '0') {
          el.setAttribute('tabindex', '-1');
        }
        el.focus({ preventScroll: false });
        if (anuncio) {
          this.anunciar(anuncio);
        }
      },
      anunciar: function (mensaje) {
        if (DOM.estadoResultados) {
          DOM.estadoResultados.textContent = mensaje;
        }
      },
      conCapturaDeFoco: function (accion) {
        var id = this.guardarFoco();
        try {
          accion();
        } finally {
          var self = this;
          setTimeout(function () {
            self.restaurarFoco(id);
          }, FOCUS_TRAP_DELAY_MS);
        }
      },
      limpiar: function () {
        focusStack = [];
      }
    };
  })();

  // ───────────────────────────────────────────────────────────────────
  // 10. INICIALIZACIÓN Y CICLO DE VIDA
  // ───────────────────────────────────────────────────────────────────

  /**
   * Valida que los módulos globales inyectados (PLANO/EXPO/MAPA)
   * existan, y los escribe de vuelta en app.js vía los setters — antes
   * esto era una asignación directa a variables locales de app.js
   * (`PLANO = window.URU_PLANO`, etc.); acá esas variables viven en
   * otro archivo, así que el setter es la única forma de que el resto
   * de app.js (render(), listeners.js vía getPLANO, etc.) vea el valor
   * resuelto.
   */
  function validarModulos() {
    var PLANO = window.URU_PLANO;
    var EXPO = window.URU_EXPOSICION;
    var MAPA = window.URU_MAPA;
    setPLANO(PLANO);
    setEXPO(EXPO);
    setMAPA(MAPA);

    if (!PLANO || !EXPO || !MAPA) {
      var faltantes = [];
      if (!PLANO) faltantes.push('URU_PLANO');
      if (!EXPO) faltantes.push('URU_EXPOSICION');
      if (!MAPA) faltantes.push('URU_MAPA');
      throw new Error('Módulos faltantes: ' + faltantes.join(', '));
    }
  }

  /**
   * Valida que el DOM tenga todos los elementos requeridos. Muta `DOM`
   * in-place (misma referencia que ya tienen DomPainter/MapaModulo/
   * Listeners desde que se construyeron, más arriba en app.js) — nunca
   * la reasigna.
   */
  function validarDOM() {
    var faltantes = [];
    REQUIRED_DOM_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        DOM[id] = el;
      } else {
        faltantes.push(id);
      }
    });

    if (faltantes.length > 0) {
      throw new Error('Elementos DOM faltantes: ' + faltantes.join(', '));
    }

    OPTIONAL_DOM_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) DOM[id] = el;
    });

    return true;
  }

  /**
   * Inicializa el estado de la sesión desde el motor de plano.
   */
  function inicializarEstado() {
    try {
      var nuevoEstado = getPLANO().leerEstado(CIUDAD);
      nuevoEstado = getPLANO().registrarApertura(nuevoEstado);
      setEstado(nuevoEstado);
      getPLANO().guardarEstado(nuevoEstado);
      actualizarContadorGuardados();
      return true;
    } catch (e) {
      ErrorRecovery.procesar(e, ERROR_TYPE.STATE_INVALID, 'inicializarEstado');
      return false;
    }
  }

  /**
   * Punto de entrada principal de la aplicación. Extracción directa de
   * app.js §10 — mismo orden de pasos, mismo guard de "sin cambios de
   * comportamiento" que el resto de las Fases 1-6.
   */
  function inicializar() {
    if (estadoActual() !== STATE.UNINITIALIZED) {
      console.warn('[Init] Ya se intentó inicializar');
      return;
    }

    transicionarEstado(STATE.INITIALIZING, 'startup');

    try {
      validarModulos();
      validarDOM();

      // FIX (auditoría, hallazgo P0-1, 2026-08-05) — ver comentario
      // original en app.js: frenar acá si inicializarEstado() falla
      // evita pisar el STATE.ERROR que ErrorRecovery ya dejó.
      if (!inicializarEstado()) {
        return;
      }

      pintarEsqueleto();
      actualizarContadorGuardados();

      if (window.Coreografias && window.Coreografias.vieneDeFicha()) {
        window.Coreografias.cierreFicha();
      }

      Listeners.inicializar();
      NavegacionTeclado.inicializar();
      inicializarGeolocation();
      activeOperations.climaContextoTimer = ClimateContext.inicializarActualizacionPeriodica({
        render: render,
        programarPeriodica: Listeners.programarPeriodica,
        intervaloMs: CLIMA_CONTEXTO_INTERVALO_MS
      });

      cargarMotorAmbientalDiferido();
      promoverCssEditorialDiferido();

      transicionarEstado(STATE.LOADING_CATALOG, 'startup');
      cargarCatalogo();

    } catch (e) {
      ErrorRecovery.procesar(e, ERROR_TYPE.UNKNOWN, 'inicializar');
      mostrarEstadoError(ERROR_TYPE.UNKNOWN, {
        mensaje: 'Error al inicializar la aplicación',
        detalles: e.message
      });
      throw e;
    }
  }

  /**
   * Limpia todos los listeners, timers y operaciones activas.
   */
  function limpiar() {
    transicionarEstado(STATE.CLEANUP, 'cleanup');

    OperationManager.cancelarTodas();

    Object.keys(activeOperations).forEach(function (key) {
      if (activeOperations[key]) {
        clearTimeout(activeOperations[key]);
        activeOperations[key] = null;
      }
    });

    AccesibilidadManager.limpiar();
    resetDynamicElements();
    vaciarLogEstado();
    RenderEngine.reiniciarCache();

    debugLog('[Cleanup] Aplicación finalizada correctamente');
  }

  /**
   * Reinicia la aplicación completamente.
   */
  function reiniciar() {
    limpiar();
    forzarEstado(STATE.UNINITIALIZED);
    inicializar();
  }

  // ───────────────────────────────────────────────────────────────────
  // 26. CICLO DE VIDA EXTENDIDO (LifecycleHooks)
  // ───────────────────────────────────────────────────────────────────
  // Extracción directa de app.js §26 — sin cambios de comportamiento.

  var LifecycleHooks = (function () {
    var hooks = {
      onReady: [],
      onError: [],
      onRender: [],
      onStateChange: [],
      onDestroy: []
    };

    return {
      on: function (evento, callback) {
        if (hooks[evento]) {
          hooks[evento].push(callback);
        }
      },
      off: function (evento, callback) {
        if (hooks[evento]) {
          var idx = hooks[evento].indexOf(callback);
          if (idx > -1) hooks[evento].splice(idx, 1);
        }
      },
      fire: function (evento, data) {
        if (hooks[evento]) {
          hooks[evento].forEach(function (cb) {
            try {
              cb(data);
            } catch (e) {
              console.error('Error en hook ' + evento + ':', e);
            }
          });
        }
      }
    };
  })();

  // ───────────────────────────────────────────────────────────────────
  // 23-25. WIRING DE APPTELEMETRIA
  // ───────────────────────────────────────────────────────────────────
  // Extracción directa de app.js §23-25 — mismo fail-open si
  // window.AppTelemetria no cargó (no-ops en vez de romper).

  var Telemetria = window.AppTelemetria || null;

  if (Telemetria) {
    Telemetria.configurar({
      obtenerDOM: function () { return DOM; },
      obtenerEstado: function () { return getEstado(); },
      obtenerEstadoUI: function () { return uiState; },
      obtenerEstadoMaquina: function () { return estadoActual(); },
      obtenerUltimoCambioDeEstado: function () { return obtenerUltimoCambioDeEstado(); },
      obtenerRegistro: function () { return obtenerRegistro(); },
      obtenerCacheRender: function () { return RenderEngine.obtenerCache(); },
      obtenerLogCambiosEstado: function () { return obtenerLogCambiosEstado(); },
      contarOperacionesActivas: function () { return OperationManager.contarActivas(); },
      validarEstadoInvariantes: function () { return ValidacionSuite.validarEstado(); },
      modulosDisponibles: function () { return { PLANO: !!getPLANO(), EXPO: !!getEXPO(), MAPA: !!getMAPA() }; },
      leerFavoritos: leerFavoritos,
      guardarFavoritos: guardarFavoritos,
      actualizarContadorGuardados: actualizarContadorGuardados,
      establecerConsultaBusqueda: function (consulta) {
        uiState.consultaActual = consulta;
        if (DOM.inputBuscar) DOM.inputBuscar.value = consulta;
      },
      establecerFiltroRubro: function (rubro) { uiState.filtroRubroActivo = rubro; },
      render: render
    });
  } else {
    console.error('[app-coordinator.js] AppTelemetria no está cargado — revisar que js/app-telemetria.js esté en index.html, antes de motor.bundle.js/app.min.js. window.URU_APP.metrics/testing/debug van a devolver no-ops.');
  }

  var TelemetriaMetrics = Telemetria ? Telemetria.metrics : {
    recordRender: function () {},
    recordNetworkRequest: function () {},
    recordError: function () {},
    getSummary: function () { return { renders: 0, avgRenderTime: 0, slowRenders: 0, networkRequests: 0, networkErrors: 0, totalErrors: 0, uptime: 0 }; },
    export: function () { return {}; }
  };

  var TelemetriaTesting = Telemetria ? Telemetria.testing : {
    runSmokeTesting: function () { return { total: 0, pasadas: 0, fallidas: 0, errores: ['AppTelemetria no cargado'] }; },
    validarContratoDOM: function () { return { requeridos: [], resultados: {} }; },
    validarRegistro: function () { return { total: 0, problemasEncontrados: 0, porcentajeIntegridad: '0.0' }; }
  };

  var TelemetriaDebug = Telemetria ? Telemetria.debug : {
    inspectarEstado: function () { return null; },
    simularBusqueda: function () {},
    simularFiltroRubro: function () {},
    simularGuardarFavorito: function () {},
    healthCheck: function () { return null; },
    exportDebugData: function () { return null; }
  };

  // ───────────────────────────────────────────────────────────────────
  // 27. API PÚBLICA (window.URU_APP)
  // ───────────────────────────────────────────────────────────────────
  // Extracción directa de app.js §27 — mismas 24 claves, mismo shape,
  // cero renombres (cualquier código externo/consola que ya use
  // window.URU_APP.x sigue funcionando idéntico).

  var api = {
    init: inicializar,
    destroy: limpiar,
    restart: reiniciar,

    getState: estadoActual,
    getUIState: function () { return JSON.parse(JSON.stringify(uiState)); },
    getRegistro: function () { return obtenerRegistro().slice(); },
    getStateLog: function () { return obtenerLogCambiosEstado().slice(); },
    canTransition: puedeTransicionar,

    validar: function () { return ValidacionSuite.validarEstado(); },
    reparar: function () { return ValidacionSuite.reparar(); },

    runTests: function () { return TelemetriaTesting.runSmokeTesting(); },
    validateContract: function () { return TelemetriaTesting.validarContratoDOM(); },
    validateRegistry: function () { return TelemetriaTesting.validarRegistro(); },

    debug: TelemetriaDebug,
    metrics: TelemetriaMetrics,
    testing: TelemetriaTesting,

    on: LifecycleHooks.on,
    off: LifecycleHooks.off,

    getActiveOperations: function () { return OperationManager.contarActivas(); },

    render: render,
    getVisualState: function () { return uiState.visualState; },

    getFavorites: leerFavoritos,
    toggleFavorite: function (id) {
      var favs = leerFavoritos();
      favs[id] = !favs[id];
      guardarFavoritos(favs);
      actualizarContadorGuardados();
      return favs[id];
    },

    buscar: function (consulta) {
      uiState.consultaActual = consulta;
      if (DOM.inputBuscar) DOM.inputBuscar.value = consulta;
      render();
    },
    limpiarBusqueda: function () {
      uiState.consultaActual = '';
      if (DOM.inputBuscar) DOM.inputBuscar.value = '';
      render();
    },

    filtrarPorRubro: function (rubro) {
      uiState.filtroRubroActivo = rubro;
      render();
    },
    limpiarFiltroRubro: function () {
      uiState.filtroRubroActivo = null;
      render();
    },

    activarCercaDeMi: function () {
      var dynamicElements = obtenerDynamicElements();
      if (dynamicElements.btnCercaDeMi) {
        activarCercaDeMi(dynamicElements.btnCercaDeMi);
      }
    },
    desactivarCercaDeMi: desactivarCercaDeMi,

    healthCheck: function () { return TelemetriaDebug.healthCheck(); },
    exportDebugData: function () { return TelemetriaDebug.exportDebugData(); },

    // Metadata — mismo criterio que el original: constante fija, no
    // `new Date()` (este repo no tiene build step/CI que la sellara en
    // el momento del deploy; se evaluaría en el navegador de cada
    // visitante). Actualizar a mano junto con cada release.
    version: '2.3.0',
    buildDate: '2026-07-25'
  };

  api.LifecycleHooks = LifecycleHooks;

  // ───────────────────────────────────────────────────────────────────
  // 28. PUNTO DE ENTRADA
  // ───────────────────────────────────────────────────────────────────
  // Extracción directa de app.js §28 — mismo guard de `document.readyState`,
  // mismo guard de bfcache (`event.persisted`) en 'pagehide' (ver
  // comentario original en app.js sobre por qué 'pagehide' y no
  // 'beforeunload': Safari/Firefox siguen bloqueando bfcache con un
  // listener de 'beforeunload', y este sitio tiene apple-mobile-web-app-*
  // en el <head>, así que le importa especialmente a iOS).

  function arrancar() {
    function arrancarApp() {
      try {
        inicializar();
        LifecycleHooks.fire('onReady', { timestamp: Date.now() });
      } catch (e) {
        console.error('Error fatal en inicialización:', e);
        LifecycleHooks.fire('onError', { error: e, timestamp: Date.now() });
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', arrancarApp);
    } else {
      arrancarApp();
    }

    window.addEventListener('pagehide', function (e) {
      if (e.persisted) return;
      limpiar();
      LifecycleHooks.fire('onDestroy', { timestamp: Date.now() });
    });
  }

  return {
    OperationManager: OperationManager,
    ValidacionSuite: ValidacionSuite,
    AccesibilidadManager: AccesibilidadManager,
    LifecycleHooks: LifecycleHooks,
    validarModulos: validarModulos,
    validarDOM: validarDOM,
    inicializarEstado: inicializarEstado,
    init: inicializar,
    destroy: limpiar,
    restart: reiniciar,
    api: api,
    arrancar: arrancar
  };
}

