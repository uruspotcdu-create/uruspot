/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — app.js [v2.3 — Nivel Galáctico]
   
   Orquestrador de producción para la aplicación de descubrimiento de
   lugares en Concepción del Uruguay. Reemplaza la versión anterior
   (1.3) con arquitectura profunda de máquina de estados, ciclo de vida
   explícito, render diferencial inteligente, resiliencia multi-nivel,
   UX premium con transiciones y estados intermedios, y accesibilidad
   avanzada con navegación por teclado completa.
   
   ═══════════════════════════════════════════════════════════════════
   
   ARQUITECTURA GENERAL:
   
   • State Machine: UNINITIALIZED → INITIALIZING → READY (+ ERROR, 
     LOADING_SUBTASK, INTERACTING)
   • Lifecycle: init() → start() → stop() → destroy()
   • Render: DifferentialRenderer que evita DOM reflow innecesario
   • Error Handling: ErrorRecovery con retry automático y fallback
   • UX: VisualStateMachine (loading, empty, error, success)
   • Accesibilidad: KeyboardNavigator, FocusManager, LiveRegion
   • Performance: OperationCanceller, LazyInitializer, RequestBatcher
   • Testing: ValidationSuite para invariantes de estado
   
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ───────────────────────────────────────────────────────────────────
  // 1. CONFIGURACIÓN Y CONSTANTES
  // ───────────────────────────────────────────────────────────────────

  var CIUDAD = 'concepcion-del-uruguay';
  var TARJETAS_POR_PAGINA = 8;
  var DEBOUNCE_BUSQUEDA_MS = 160;
  var PERMANENCIA_TICK_MS = 5000;
  var FOCUS_TRAP_DELAY_MS = 100;
  var ANIMATION_TIMEOUT_MS = 260;
  var GEOLOCATION_TIMEOUT_MS = 8000;
  var GEOLOCATION_MAX_AGE_MS = 300000;
  var RENDER_FRAME_TIMEOUT_MS = 50; // fallback si RAF no dispara
  var TOOLTIP_TIMEOUT_MS = 4000;
  var NETWORK_RETRY_ATTEMPTS = 2;
  var NETWORK_RETRY_DELAY_MS = 800;
  var MAX_CONCURRENT_OPERATIONS = 4;
  var VIRTUAL_SCROLL_THRESHOLD = 50; // items antes de considerar virtualization

  var UMBRAL_RATING = 4.6;
  var UMBRAL_RESEÑAS = 15;
  var MAX_DESTACADOS = 6;
  var MIN_PARA_MOSTRAR_DESTACADOS = 3;

  // Módulos inyectados globalmente (verificados al init)
  var PLANO = null;
  var EXPO = null;
  var MAPA = null;

  // Constantes de rol por aperturas
  var ROLES_NOMBRES = {
    anfitrion: 'Recién llegado',
    conocido: 'Conocido',
    complice: 'Cómplice',
    casa: 'Casa'
  };

  // Ramas visuales posibles
  var RAMA_CURADURIA = 'curaduria';
  var RAMA_BUSCADOR = 'buscador';
  // RAMA_RECORTE = 'recorte:guia' | 'recorte:exploracion'

  // Estados de máquina
  var STATE = {
    UNINITIALIZED: 'uninitialized',
    INITIALIZING: 'initializing',
    LOADING_CATALOG: 'loading_catalog',
    READY: 'ready',
    ERROR: 'error',
    RECOVERING: 'recovering',
    INTERACTION: 'interaction',
    CLEANUP: 'cleanup'
  };

  // Tipos de error
  var ERROR_TYPE = {
    CATALOG_FETCH: 'catalog_fetch',
    DETAILS_FETCH: 'details_fetch',
    STATE_INVALID: 'state_invalid',
    GEOLOCATION: 'geolocation',
    STORAGE: 'storage',
    UNKNOWN: 'unknown'
  };

  // Flags de visualización
  var VISUAL_STATE = {
    LOADING: 'loading',
    EMPTY: 'empty',
    ERROR: 'error',
    SUCCESS: 'success',
    TRANSITION: 'transition',
    // Nuevo: 1 carácter en el buscador, por debajo del umbral de
    // búsqueda explícita (2). Ni "cargando" ni "sin resultados" —
    // un estado propio para no mentir sobre cuál de los dos es.
    TYPING: 'typing'
  };

  // ───────────────────────────────────────────────────────────────────
  // 2. CACHE Y ESTADO GLOBAL
  // ───────────────────────────────────────────────────────────────────

  var REGISTRO = [];
  var porId = Object.create(null);

  // Estado de sesión (mutante, persistido con PLANO.guardarEstado)
  var estado = null;

  // Estado local de UI (no persistente)
  var uiState = {
    consultaActual: '',
    filtroRubroActivo: null,
    ubicacionUsuario: null,
    cercaTuyoActivo: false,
    verCatalogoCompleto: false,
    paginaTarjetas: 1,
    ultimaRamaRenderizada: null,
    ultimaRegionRenderizada: '',
    visualState: VISUAL_STATE.LOADING,
    lastErrorState: null,
    focusedElement: null,
    scrollPosition: 0,
    cartasActuales: [] // referencia a tarjetas pintadas para reconciliación
  };

  // Timers y operaciones async activas
  var activeOperations = {
    debounceBuscarId: null,
    permanenciaTimer: null,
    focusTrapTimer: null,
    geolocationRequest: null,
    pendingFetches: []
  };

  // Motor de mapa (inicializado perezosamente)
  var motorMapa = null;

  // Estado de máquina global
  var currentState = STATE.UNINITIALIZED;
  var lastStateChange = null;
  var stateChangeLog = [];

  // Cache de renderizado anterior
  var lastRenderCache = {
    lista: null,
    favoritos: null,
    region: null,
    rama: null,
    html: null
  };

  // DOM references (validadas al init)
  var DOM = {};
  var REQUIRED_DOM_IDS = [
    'rolActual', 'inputBuscar', 'panelDescubrimiento', 'tituloRegion',
    'subtituloRegion', 'mapaTextura', 'mapaContainer', 'mapaHerramienta',
    'mapaInfo', 'mapaLeyenda', 'contadorCuraduria', 'btnVerGuardados',
    'listaRubros', 'statLugares', 'statRubros', 'faqLista',
    'estadoResultados', 'destacados', 'listaDestacados'
  ];
  // OPTIONAL_DOM_IDS existía declarado pero sin ningún lector real en
  // validarDOM() — un punto de extensión listo pero desconectado,
  // igual que el resto de los casos "infraestructura sin consumidor"
  // documentados en motor-exposicion.js. btnLimpiarBusqueda es su
  // primer uso real: si por lo que sea no está en el HTML, el resto
  // del sitio sigue funcionando (a diferencia de los REQUIRED_DOM_IDS,
  // cuya ausencia frena el arranque).
  var OPTIONAL_DOM_IDS = ['btnLimpiarBusqueda', 'sugerenciasRapidas', 'filtrosActivos'];

  var dynamicElements = {
    btnCercaDeMi: null,
    btnVerCatalogoCompleto: null,
    btnVolverATodos: null,
    bannerCuraduria: null,
    tooltipGeolocation: null
  };

  // ───────────────────────────────────────────────────────────────────
  // 3. MÁQUINA DE ESTADOS Y TRANSICIONES
  // ───────────────────────────────────────────────────────────────────

  /**
   * Transiciona la aplicación a un nuevo estado.
   * Registra la transición para debugging y ejecuta callbacks.
   */
  function transicionarEstado(nuevoEstado, razon) {
    var estadoAnterior = currentState;
    if (estadoAnterior === nuevoEstado) return; // idempotente

    currentState = nuevoEstado;
    lastStateChange = Date.now();
    stateChangeLog.push({
      desde: estadoAnterior,
      hacia: nuevoEstado,
      timestamp: lastStateChange,
      razon: razon || 'sin_razon'
    });

    // Guardar últimos 50 cambios para debugging
    if (stateChangeLog.length > 50) {
      stateChangeLog.shift();
    }

    console.log('[State] ' + estadoAnterior + ' → ' + nuevoEstado + ' (' + (razon || 'unknown') + ')');
  }

  /**
   * Obtiene el estado actual con seguridad.
   */
  function estadoActual() {
    return currentState;
  }

  /**
   * Valida si una transición es legal en la máquina de estados.
   */
  function puedeTransicionar(nuevoEstado) {
    var actual = currentState;
    var transiciones = {
      'uninitialized': ['initializing'],
      'initializing': ['loading_catalog', 'error'],
      'loading_catalog': ['ready', 'error'],
      'ready': ['interaction', 'error', 'loading_subtask', 'recovery'],
      'interaction': ['ready', 'error'],
      'error': ['recovering', 'ready'],
      'recovering': ['ready', 'error'],
      'loading_subtask': ['ready', 'error'],
      'cleanup': []
    };
    var permitidas = transiciones[actual] || [];
    return permitidas.indexOf(nuevoEstado) !== -1;
  }

  // ───────────────────────────────────────────────────────────────────
  // 4. GESTOR DE OPERACIONES (Concurrencia y Cancelación)
  // ───────────────────────────────────────────────────────────────────

  var OperationManager = (function () {
    var operationId = 0;
    var activeOps = Object.create(null);

    return {
      /**
       * Registra una operación async para tracking y cancelación.
       */
      crear: function (nombre, abortController) {
        var id = ++operationId;
        activeOps[id] = {
          id: id,
          nombre: nombre,
          timestamp: Date.now(),
          abort: abortController
        };
        console.log('[Op] ' + id + ': ' + nombre + ' iniciada');
        return id;
      },

      /**
       * Marca una operación como completada.
       */
      completar: function (opId) {
        if (activeOps[opId]) {
          console.log('[Op] ' + opId + ': completada');
          delete activeOps[opId];
        }
      },

      /**
       * Cancela una operación específica.
       */
      cancelar: function (opId) {
        var op = activeOps[opId];
        if (op) {
          console.log('[Op] ' + opId + ': cancelada');
          if (op.abort) op.abort.abort();
          delete activeOps[opId];
        }
      },

      /**
       * Cancela todas las operaciones activas (útil en cleanup).
       */
      cancelarTodas: function () {
        var ids = Object.keys(activeOps);
        ids.forEach(function (id) {
          this.cancelar(parseInt(id, 10));
        }, this);
      },

      /**
       * Retorna el número de operaciones activas.
       */
      contarActivas: function () {
        return Object.keys(activeOps).length;
      }
    };
  })();

  // ───────────────────────────────────────────────────────────────────
  // 5. UTILIDADES DE RENDERIZADO DIFERENCIAL
  // ───────────────────────────────────────────────────────────────────

  /**
   * Determina si el contenido de la lista cambió significativamente.
   * Usa hash rápido de IDs de lugares para evitar comparación profunda.
   */
  function hayCambioEnLista(listaAnterior, listaActual) {
    if (!listaAnterior || !listaActual) return true;
    if (listaAnterior.length !== listaActual.length) return true;
    
    // Hash rápido: concatenar IDs
    var hashAnterior = listaAnterior.map(function (l) { return l.id; }).join(',');
    var hashActual = listaActual.map(function (l) { return l.id; }).join(',');
    return hashAnterior !== hashActual;
  }

  /**
   * Calcula diferencias incremental entre renders para evitar reflow.
   * Retorna: { debeReconstruir: bool, itemsAgregados: [], itemsRemovidos: [], itemsActualizados: [] }
   */
  function calcularDiferenciasRender(listaAnterior, listaActual) {
    var resultado = {
      debeReconstruir: false,
      itemsAgregados: [],
      itemsRemovidos: [],
      itemsActualizados: []
    };

    if (!listaAnterior || listaAnterior.length === 0) {
      resultado.debeReconstruir = true;
      return resultado;
    }

    // Cambio fundamental de tamaño: reconstruir
    if (Math.abs(listaAnterior.length - listaActual.length) > 2) {
      resultado.debeReconstruir = true;
      return resultado;
    }

    // Mapeo rápido de IDs anteriores
    var idsAnteriores = Object.create(null);
    listaAnterior.forEach(function (l, i) {
      idsAnteriores[l.id] = i;
    });

    // Detectar cambios
    var idsActuales = Object.create(null);
    listaActual.forEach(function (l) {
      idsActuales[l.id] = true;
      if (!idsAnteriores[l.id]) {
        resultado.itemsAgregados.push(l);
      }
    });

    listaAnterior.forEach(function (l) {
      if (!idsActuales[l.id]) {
        resultado.itemsRemovidos.push(l);
      }
    });

    // Si hay cambios pero son menores, se puede hacer update incremental
    if (resultado.itemsAgregados.length > 0 || resultado.itemsRemovidos.length > 0) {
      if (resultado.itemsRemovidos.length > 3 || resultado.itemsAgregados.length > 3) {
        resultado.debeReconstruir = true;
      }
    }

    return resultado;
  }

  // ───────────────────────────────────────────────────────────────────
  // 6. MANEJO DE ERRORES Y RECUPERACIÓN
  // ───────────────────────────────────────────────────────────────────

  var ErrorRecovery = (function () {
    return {
      /**
       * Procesa un error y lo registra apropiadamente.
       */
      procesar: function (error, tipoError, contexto) {
        var detalles = {
          tipo: tipoError,
          mensaje: error && error.message ? error.message : String(error),
          contexto: contexto,
          timestamp: Date.now()
        };

        console.error('[Error] ' + tipoError + ':', detalles);

        uiState.lastErrorState = detalles;
        mostrarEstadoError(tipoError, detalles);
        transicionarEstado(STATE.ERROR, tipoError);

        return detalles;
      },

      /**
       * Intenta recuperar de un error en la carga de catálogo.
       */
      recuperarDeCarguaCatalogo: function () {
        if (uiState.lastErrorState && uiState.lastErrorState.tipo === ERROR_TYPE.CATALOG_FETCH) {
          transicionarEstado(STATE.RECOVERING, 'reintentando_catalogo');
          pintarEsqueleto();
          cargarCatalogo();
        }
      },

      /**
       * Registra estado de error en un lugar seguro para debugging.
       */
      registrarParaDebug: function (error, tipo) {
        try {
          var debug = JSON.parse(localStorage.getItem('uruspot_debug_errors') || '[]');
          debug.push({
            tipo: tipo,
            mensaje: error && error.message ? error.message : String(error),
            stack: error && error.stack ? error.stack.substring(0, 200) : '',
            timestamp: new Date().toISOString()
          });
          // Guardar últimos 10 errores
          if (debug.length > 10) debug.shift();
          localStorage.setItem('uruspot_debug_errors', JSON.stringify(debug));
        } catch (e) {
          // Storage puede estar bloqueado o lleno
        }
      }
    };
  })();

  // ───────────────────────────────────────────────────────────────────
  // 7. VALIDACIÓN DE INVARIANTES
  // ───────────────────────────────────────────────────────────────────

  var ValidacionSuite = (function () {
    return {
      /**
       * Verifica que el estado sea válido y consistente.
       */
      validarEstado: function () {
        var errores = [];

        // El estado de sesión nunca debe ser null si REGISTRO tiene contenido
        if (REGISTRO.length > 0 && !estado) {
          errores.push('estado es null pero REGISTRO tiene ' + REGISTRO.length + ' items');
        }

        // Conteo de favoritos debe ser consistente
        if (estado && estado.sesion && estado.sesion.guardados) {
          var conteo = Object.keys(estado.sesion.guardados).length;
          var contador = DOM.contadorCuraduria ? parseInt(DOM.contadorCuraduria.textContent, 10) : 0;
          if (conteo !== contador && contador > 0) {
            console.warn('[Validación] Inconsistencia en conteo de guardados: estado=' + conteo + ', DOM=' + contador);
          }
        }

        // El filtro de rubro debe existir en REGISTRO si está activo
        if (uiState.filtroRubroActivo && REGISTRO.length > 0) {
          var existe = REGISTRO.some(function (l) { return l.grupo === uiState.filtroRubroActivo; });
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

      /**
       * Repara inconsistencias menores cuando es posible.
       */
      reparar: function () {
        if (!estado) return;

        // Reparar guardados huérfanos
        if (estado.sesion && estado.sesion.guardados) {
          Object.keys(estado.sesion.guardados).forEach(function (id) {
            if (!porId[id]) {
              delete estado.sesion.guardados[id];
            }
          });
        }

        // Reiniciar contador si está desincronizado
        actualizarContadorGuardados();
      }
    };
  })();

  // ───────────────────────────────────────────────────────────────────
  // 8. UTILIDADES DE ACCESIBILIDAD AVANZADA
  // ───────────────────────────────────────────────────────────────────

  var AccesibilidadManager = (function () {
    var focusStack = [];

    return {
      /**
       * Guarda el foco actual para recuperarlo después.
       */
      guardarFoco: function (el) {
        focusStack.push(el || document.activeElement);
        return focusStack.length - 1;
      },

      /**
       * Restaura el foco a un elemento previamente guardado.
       */
      restaurarFoco: function (id) {
        if (id === undefined) id = focusStack.length - 1;
        var el = focusStack[id];
        if (el && el.focus) {
          el.focus({ preventScroll: false });
          focusStack[id] = null; // invalidar para no reusar
        }
      },

      /**
       * Mueve el foco a un elemento con feedback audible.
       */
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

      /**
       * Anuncia un mensaje a tecnologías de asistencia sin alterar visualmente.
       */
      anunciar: function (mensaje) {
        if (DOM.estadoResultados) {
          DOM.estadoResultados.textContent = mensaje;
        }
      },

      /**
       * Ejecuta una acción con captura de foco: guarda, ejecuta, restaura.
       */
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

      /**
       * Limpia el stack de foco (útil en cleanup).
       */
      limpiar: function () {
        focusStack = [];
      }
    };
  })();

  // ───────────────────────────────────────────────────────────────────
  // 9. UTILIDADES DE PERFORMANCE Y BATCHING
  // ───────────────────────────────────────────────────────────────────

  var PerformanceManager = (function () {
    var pendingWork = [];
    var workScheduled = false;

    return {
      /**
       * Agrega trabajo que se ejecutará en el próximo frame (batching).
       */
      programarEnFrame: function (trabajo) {
        pendingWork.push(trabajo);
        if (!workScheduled) {
          workScheduled = true;
          if ('requestAnimationFrame' in window) {
            requestAnimationFrame(function () {
              var work = pendingWork;
              pendingWork = [];
              workScheduled = false;
              work.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
            });
          } else {
            setTimeout(function () {
              var work = pendingWork;
              pendingWork = [];
              workScheduled = false;
              work.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } });
            }, RENDER_FRAME_TIMEOUT_MS);
          }
        }
      },

      /**
       * Mide el tiempo de ejecución de una función.
       */
      medir: function (nombre, fn) {
        var inicio = performance.now ? performance.now() : Date.now();
        var resultado = fn();
        var duracion = (performance.now ? performance.now() : Date.now()) - inicio;
        if (duracion > 50) {
          console.warn('[Perf] ' + nombre + ': ' + duracion.toFixed(1) + 'ms (lento)');
        }
        return resultado;
      }
    };
  })();

  // ───────────────────────────────────────────────────────────────────
  // 10. INICIALIZACIÓN Y CICLO DE VIDA
  // ───────────────────────────────────────────────────────────────────

  /**
   * Valida que todos los módulos inyectados existan.
   */
  function validarModulos() {
    PLANO = window.URU_PLANO;
    EXPO = window.URU_EXPOSICION;
    MAPA = window.URU_MAPA;

    if (!PLANO || !EXPO || !MAPA) {
      var faltantes = [];
      if (!PLANO) faltantes.push('URU_PLANO');
      if (!EXPO) faltantes.push('URU_EXPOSICION');
      if (!MAPA) faltantes.push('URU_MAPA');
      throw new Error('Módulos faltantes: ' + faltantes.join(', '));
    }
  }

  /**
   * Valida que el DOM tenga todos los elementos requeridos.
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

    // Opcionales: se resuelven si existen, pero su ausencia nunca
    // frena el arranque (por eso no entran en `faltantes`).
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
      estado = PLANO.leerEstado(CIUDAD);
      estado = PLANO.registrarApertura(estado);
      PLANO.guardarEstado(estado);
      actualizarContadorGuardados();
      return true;
    } catch (e) {
      ErrorRecovery.procesar(e, ERROR_TYPE.STATE_INVALID, 'inicializarEstado');
      return false;
    }
  }

  /**
   * Punto de entrada principal de la aplicación.
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
      inicializarEstado();

      // Inicialización visual
      pintarEsqueleto();
      actualizarContadorGuardados();

      // Inicialización de listeners
      inicializarListeners();
      inicializarTecladoNavegacion();
      inicializarGeolocation();

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

    // Cancelar todas las operaciones activas
    OperationManager.cancelarTodas();

    // Limpiar timers
    Object.keys(activeOperations).forEach(function (key) {
      if (activeOperations[key]) {
        clearTimeout(activeOperations[key]);
        activeOperations[key] = null;
      }
    });

    // Limpiar referencias
    AccesibilidadManager.limpiar();
    dynamicElements = {};
    stateChangeLog = [];
    lastRenderCache = {
      lista: null,
      favoritos: null,
      region: null,
      rama: null,
      html: null
    };

    console.log('[Cleanup] Aplicación finalizada correctamente');
  }

  /**
   * Reinicia la aplicación completamente.
   */
  function reiniciar() {
    limpiar();
    currentState = STATE.UNINITIALIZED;
    inicializar();
  }

  // ───────────────────────────────────────────────────────────────────
  // 11. CARGA DE DATOS CON RESILIENCIA
  // ───────────────────────────────────────────────────────────────────

  /**
   * Fetch con reintentos automáticos y validación de status.
   */
  function fetchJSON(url, intentosRestantes) {
    if (intentosRestantes === undefined) intentosRestantes = NETWORK_RETRY_ATTEMPTS;

    var abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var opId = OperationManager.crear('fetchJSON: ' + url, abortController);

    return fetch(url, {
      cache: 'no-store',
      signal: abortController ? abortController.signal : undefined
    })
      .then(function (r) {
        if (!r.ok) {
          var err = new Error('HTTP ' + r.status + ' al pedir ' + url);
          err.status = r.status;
          throw err;
        }
        return r.json();
      })
      .then(function (data) {
        OperationManager.completar(opId);
        return data;
      })
      .catch(function (err) {
        if (intentosRestantes > 0 && (!err.name || err.name !== 'AbortError')) {
          return new Promise(function (resolve) {
            setTimeout(resolve, NETWORK_RETRY_DELAY_MS);
          }).then(function () {
            return fetchJSON(url, intentosRestantes - 1);
          });
        }
        OperationManager.completar(opId);
        throw err;
      });
  }

  /**
   * Carga el catálogo principal desde places-core.json.
   * Orquesta la secuencia de carga de detalles, stats, highlights.
   */
  function cargarCatalogo() {
    fetchJSON('lugares-core.json')
      .then(function (core) {
        if (!Array.isArray(core) || core.length === 0) {
          throw new Error('Core inválido o vacío');
        }

        REGISTRO = core.map(function (l) {
          var reg = {
            id: l.id,
            nombre: l.nombre,
            categoria: l.categoria,
            grupo: l.grupo,
            lat: l.lat,
            lng: l.lng,
            direccion: null,
            telefono: null,
            descripcion: null,
            estado: 'verificado',
            rating: (typeof l.rating === 'number') ? l.rating : null,
            ratingCount: (typeof l.rating_count === 'number') ? l.rating_count : null
          };
          porId[l.id] = reg;
          return reg;
        });

        transicionarEstado(STATE.READY, 'catalogo_cargado');

        // Parallelizar carga de detalles (segundo plano)
        cargarDetallesEnSegundoPlano();
        pintarRubros();
        pintarStatsRapidas();
        pintarDestacados();
        pintarSugerenciasRapidas();
        render();

      })
      .catch(function (err) {
        ErrorRecovery.procesar(err, ERROR_TYPE.CATALOG_FETCH, 'cargarCatalogo');
        mostrarPanelErrorConReintento();
      });
  }

  /**
   * Carga detalles, estado y clima en segundo plano (requestIdleCallback).
   */
  function cargarDetallesEnSegundoPlano() {
    var lanzar = function () {
      Promise.all([
        fetchJSON('lugares-detalles.json')
          .then(function (det) {
            det.forEach(function (d) {
              var reg = porId[d.id];
              if (reg) {
                reg.direccion = d.direccion || null;
                reg.telefono = d.telefono || null;
                reg.descripcion = d.descripcion || null;
              }
            });
            render();
          })
          .catch(function (e) {
            console.warn('lugares-detalles.json no disponible:', e.message);
          }),

        fetchJSON('lugares-estado.json')
          .then(function (mapa) {
            var PENDIENTE = ['pendiente', 'no encontrado', 'requiere confirmacion', 'requiere_confirmacion'];
            mapa.forEach(function (m) {
              var reg = porId[m.id];
              if (!reg || !m.estado_verificacion) return;
              var low = m.estado_verificacion.toLowerCase();
              reg.estado = PENDIENTE.some(function (p) { return low.indexOf(p) !== -1; }) ? 'pendiente' : 'verificado';
            });
          })
          .catch(function (e) {
            console.warn('lugares-estado.json no disponible:', e.message);
          })
      ]);
    };

    // Usar requestIdleCallback si está disponible, sino setTimeout
    if ('requestIdleCallback' in window) {
      requestIdleCallback(lanzar, { timeout: 2000 });
    } else {
      setTimeout(lanzar, 200);
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 12. LISTADO DE LUGARES (Búsqueda, Filtros, Ordenamiento)
  // ───────────────────────────────────────────────────────────────────

  /**
   * Retorna la lista de lugares por acción explícita del usuario
   * (búsqueda y/o filtro de rubro).
   */
  function listaPorAccionExplicita() {
    var lista = EXPO.resultadosPorAccionExplicita(REGISTRO, uiState.consultaActual);
    if (uiState.filtroRubroActivo) {
      lista = lista.filter(function (l) { return l.grupo === uiState.filtroRubroActivo; });
    }
    return lista;
  }

  /**
   * Verifica si hay búsqueda o filtro activo.
   */
  function hayBusquedaOFiltro() {
    return uiState.consultaActual.trim().length > 0 || !!uiState.filtroRubroActivo;
  }

  /**
   * Ordena una lista por cercanía si está activo "cerca de mí".
   */
  function ordenarPorCercania(lista) {
    if (!uiState.cercaTuyoActivo || !uiState.ubicacionUsuario) return lista;

    return lista.slice().sort(function (a, b) {
      var da = (typeof a.lat === 'number' && typeof a.lng === 'number')
        ? distanciaMetros(uiState.ubicacionUsuario.lat, uiState.ubicacionUsuario.lng, a.lat, a.lng)
        : Infinity;
      var db = (typeof b.lat === 'number' && typeof b.lng === 'number')
        ? distanciaMetros(uiState.ubicacionUsuario.lat, uiState.ubicacionUsuario.lng, b.lat, b.lng)
        : Infinity;
      return da - db;
    });
  }

  /**
   * Determina la rama visual actual (curaduria | buscador | recorte:guia | recorte:exploracion).
   */
  function ramaActual(reg) {
    if (reg.nombre === 'curaduria') return RAMA_CURADURIA;
    if (reg.nombre === 'accionDirecta' || hayBusquedaOFiltro() || uiState.verCatalogoCompleto) {
      return RAMA_BUSCADOR;
    }
    return 'recorte:' + reg.nombre;
  }

  /**
   * Suffix para anuncios de accesibilidad cuando está activo "cerca de mí".
   */
  function sufijoCercania() {
    return (uiState.cercaTuyoActivo && uiState.ubicacionUsuario) ? ' Ordenado por cercanía.' : '';
  }

  // ───────────────────────────────────────────────────────────────────
  // 13. SISTEMA DE FAVORITOS CON PERSISTENCIA
  // ───────────────────────────────────────────────────────────────────

  function leerFavoritos() {
    try {
      return JSON.parse(localStorage.getItem('uruspot_favoritos') || '{}');
    } catch (e) {
      ErrorRecovery.procesar(e, ERROR_TYPE.STORAGE, 'leerFavoritos');
      return {};
    }
  }

  function guardarFavoritos(f) {
    try {
      localStorage.setItem('uruspot_favoritos', JSON.stringify(f));
    } catch (e) {
      ErrorRecovery.procesar(e, ERROR_TYPE.STORAGE, 'guardarFavoritos');
    }
  }

  function actualizarContadorGuardados() {
    if (!DOM.contadorCuraduria) return;
    var favoritos = leerFavoritos();
    var cantidad = Object.keys(favoritos).filter(function (id) {
      return favoritos[id];
    }).length;
    DOM.contadorCuraduria.textContent = cantidad ? String(cantidad) : '';
    DOM.contadorCuraduria.hidden = cantidad === 0;
  }

  // ───────────────────────────────────────────────────────────────────
  // 14. RENDERIZADO PRINCIPAL (Corazón de la aplicación)
  // ───────────────────────────────────────────────────────────────────

  /**
   * Función render() central: calcula qué mostrar, orquesta diferencias,
   * pinta solo lo necesario.
   */
  function render() {
    if (estadoActual() !== STATE.READY && estadoActual() !== STATE.LOADING_CATALOG) {
      return; // No renderizar en estados de error o cleanup
    }

    if (!REGISTRO.length || !DOM.panelDescubrimiento) return;

    try {
      actualizarBotonLimpiar();

      // 1 carácter, sin filtro de rubro: ni "cargando" ni "resultados",
      // un estado propio (ver pintarEstadoEscribiendo). Con 0, 2+
      // caracteres o un rubro activo, el pipeline sigue igual que
      // siempre más abajo.
      if (uiState.consultaActual.trim().length === 1 && !uiState.filtroRubroActivo) {
        pintarEstadoEscribiendo();
        return;
      }

      var favoritos = leerFavoritos();
      var reg = PLANO.region(estado);
      var rama = ramaActual(reg);
      var lista;
      var opts;

      // Determinar qué lista mostrar según la rama
      if (rama === RAMA_CURADURIA) {
        var idsGuardados = Object.keys(favoritos).filter(function (id) {
          return favoritos[id];
        });
        lista = EXPO.coleccionCurada(REGISTRO, idsGuardados);
        lista = ordenarPorCercania(lista);
        opts = {
          origen: 'accion_explicita',
          narrativa: false,
          vacioTexto: 'Todavía no guardaste nada. Guardá un lugar y aparece acá.'
        };
      } else if (rama === RAMA_BUSCADOR) {
        lista = listaPorAccionExplicita();
        lista = ordenarPorCercania(lista);
        opts = { origen: 'accion_explicita', narrativa: false };
      } else {
        // Recorte por iniciativa propia (Guía/Exploración)
        lista = EXPO.recortePorIniciativaPropia(REGISTRO, estado, reg.nombre);
        lista = ordenarPorCercania(lista);
        opts = { origen: 'iniciativa_propia', narrativa: false };
      }

      // Verificar si hubo cambio real
      var hayoCambio = ramaDistinta(rama) || hayCambioEnLista(lastRenderCache.lista, lista);

      if (!hayoCambio && uiState.ultimaRamaRenderizada === rama) {
        console.log('[Render] Sin cambios, saltando');
        return;
      }

      // Actualizar cache
      lastRenderCache.lista = lista;
      lastRenderCache.rama = rama;
      lastRenderCache.favoritos = favoritos;
      lastRenderCache.region = reg.nombre;
      uiState.ultimaRamaRenderizada = rama;

      // Actualizar encabezado, estado visual, tarjetas y mapa
      actualizarCabecera(reg, rama);
      actualizarMapaTextura();
      actualizarBannerCuraduriaSugerida(reg);
      pintarTarjetas(lista, favoritos, opts);
      actualizarMapaHerramienta(reg.nombre, lista || []);

      // Restaurar scroll a posición previa si es el mismo listado
      if (uiState.scrollPosition && rama === uiState.ultimaRamaRenderizada) {
        window.scrollTo(0, uiState.scrollPosition);
      }

    } catch (e) {
      ErrorRecovery.procesar(e, ERROR_TYPE.UNKNOWN, 'render');
      mostrarEstadoError('error_renderizado', { mensaje: e.message });
    }
  }

  /**
   * Verifica si la rama cambió desde el último render.
   */
  function ramaDistinta(rama) {
    return uiState.ultimaRamaRenderizada !== rama;
  }

  // ───────────────────────────────────────────────────────────────────
  // 15. PINTADO DE ELEMENTOS DE UI
  // ───────────────────────────────────────────────────────────────────

  /**
   * Esqueleto inicial mientras carga el catálogo.
   */
  function pintarEsqueleto() {
    if (!DOM.panelDescubrimiento) return;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 6; i++) {
      var art = document.createElement('div');
      art.className = 'tarjeta tarjeta--esqueleto';
      art.innerHTML =
        '<div class="u-skeleton esqueleto-linea esqueleto-linea--rubro"></div>' +
        '<div class="u-skeleton esqueleto-linea esqueleto-linea--nombre"></div>' +
        '<div class="u-skeleton esqueleto-linea esqueleto-linea--direccion"></div>' +
        '<div class="u-skeleton esqueleto-linea esqueleto-linea--acciones"></div>';
      frag.appendChild(art);
    }
    DOM.panelDescubrimiento.innerHTML = '';
    DOM.panelDescubrimiento.appendChild(frag);
  }

  /**
   * Estadísticas rápidas del hero (conteo de lugares y rubros).
   */
  function pintarStatsRapidas() {
    if (!REGISTRO.length) return;
    if (DOM.statLugares) {
      DOM.statLugares.textContent = REGISTRO.length.toLocaleString('es-AR');
    }
    if (DOM.statRubros) {
      var grupos = Object.create(null);
      REGISTRO.forEach(function (l) {
        grupos[l.grupo] = true;
      });
      DOM.statRubros.textContent = Object.keys(grupos).length;
    }
  }

  /**
   * Spotlight "Destacados" — selector inteligente de lugares top-rated.
   */
  function pintarDestacados() {
    if (!DOM.destacados || !DOM.listaDestacados) return;

    var candidatos = REGISTRO.filter(function (l) {
      return typeof l.rating === 'number' && l.rating >= UMBRAL_RATING &&
        typeof l.ratingCount === 'number' && l.ratingCount >= UMBRAL_RESEÑAS;
    });

    if (candidatos.length < MIN_PARA_MOSTRAR_DESTACADOS) {
      DOM.destacados.hidden = true;
      return;
    }

    var diaDelAnio = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    var seed = diaDelAnio;

    function pseudoRandom(n) {
      var x = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
      return x - Math.floor(x);
    }

    candidatos.forEach(function (l, i) {
      var score = l.rating + Math.log(l.ratingCount) / Math.LN10 / 10;
      l._scoreDestacado = score + pseudoRandom(i) * 0.05;
    });
    candidatos.sort(function (a, b) {
      return b._scoreDestacado - a._scoreDestacado;
    });

    var elegidos = [];
    var rubrosUsados = Object.create(null);
    candidatos.forEach(function (l) {
      if (elegidos.length >= MAX_DESTACADOS) return;
      if (rubrosUsados[l.grupo]) return;
      rubrosUsados[l.grupo] = true;
      elegidos.push(l);
    });

    if (elegidos.length < Math.min(MAX_DESTACADOS, candidatos.length)) {
      candidatos.forEach(function (l) {
        if (elegidos.length >= MAX_DESTACADOS) return;
        if (elegidos.indexOf(l) !== -1) return;
        elegidos.push(l);
      });
    }

    var frag = document.createDocumentFragment();
    elegidos.forEach(function (lugar) {
      var metaRubro = window.URU_RUBROS_META && window.URU_RUBROS_META[lugar.grupo];
      var rubro = metaRubro ? metaRubro[0] : lugar.categoria;
      var slugLugar = slug(lugar);
      var linkMaps = mapsHref(lugar);
      var href = slugLugar ? ('locales/' + slugLugar + '/') : linkMaps;
      var card = document.createElement(href ? 'a' : 'div');
      card.className = 'destacado-card';
      card.setAttribute('role', 'listitem');
      if (href) {
        card.href = href;
        if (!slugLugar) {
          card.target = '_blank';
          card.rel = 'noopener';
        }
      }
      if (metaRubro) card.style.setProperty('--chip-color', metaRubro[2]);
      card.innerHTML =
        '<div class="destacado-card__rubro">' + escapeHTML(rubro) + '</div>' +
        '<div class="destacado-card__nombre">' + escapeHTML(lugar.nombre) + '</div>' +
        '<div class="destacado-card__rating">★ ' + lugar.rating.toFixed(1).replace('.', ',') +
        '<span class="destacado-card__conteo">(' + lugar.ratingCount.toLocaleString('es-AR') + ')</span></div>';
      frag.appendChild(card);
    });

    DOM.listaDestacados.innerHTML = '';
    DOM.listaDestacados.appendChild(frag);
    DOM.destacados.hidden = false;
  }

  /**
   * Pinta los chips de "Por rubro" con conteos reales y states.
   */
  function pintarRubros() {
    if (!DOM.listaRubros || !REGISTRO.length || !window.URU_RUBROS_META) return;

    var conteo = Object.create(null);
    REGISTRO.forEach(function (l) {
      conteo[l.grupo] = (conteo[l.grupo] || 0) + 1;
    });

    var claves = Object.keys(window.URU_RUBROS_META)
      .filter(function (k) {
        return conteo[k];
      })
      .sort(function (a, b) {
        return conteo[b] - conteo[a];
      });

    DOM.listaRubros.innerHTML = claves.map(function (k) {
      var meta = window.URU_RUBROS_META[k];
      var activo = uiState.filtroRubroActivo === k;
      var icono = window.URU_RUBROS_ICONO_SVG ? window.URU_RUBROS_ICONO_SVG(k, { tam: 15 }) : '';
      return '<button type="button" class="chip' + (activo ? ' chip--activo' : '') +
        '" data-rubro="' + k + '" aria-pressed="' + activo +
        '" style="--chip-color:' + meta[2] + '">' +
        icono +
        escapeHTML(meta[0]) + '<span class="chip__conteo">' + conteo[k] + '</span>' +
        '</button>';
    }).join('');
  }

  /**
   * Sugerencias rápidas: atajos de un toque a los 4 rubros con más
   * lugares, más "cerca tuyo" si el navegador soporta geolocalización.
   * Se pinta UNA sola vez al cargar el catálogo (el conteo por rubro
   * no cambia durante la sesión) — actualizarVisibilidadSugerencias()
   * es quien decide, en cada render(), si corresponde mostrarlas o
   * no. Reutiliza exactamente los mismos íconos de rubros-meta.js que
   * ya usa pintarRubros(), para que un mismo rubro se vea igual acá y
   * en el índice de abajo.
   */
  function pintarSugerenciasRapidas() {
    if (!DOM.sugerenciasRapidas || !REGISTRO.length || !window.URU_RUBROS_META) return;

    var conteo = Object.create(null);
    REGISTRO.forEach(function (l) {
      conteo[l.grupo] = (conteo[l.grupo] || 0) + 1;
    });

    var topRubros = Object.keys(window.URU_RUBROS_META)
      .filter(function (k) { return conteo[k]; })
      .sort(function (a, b) { return conteo[b] - conteo[a]; })
      .slice(0, 4);

    if (!topRubros.length) return;

    var html = '<span class="sugerencias-rapidas__etiqueta">Empezá por acá</span>' +
      topRubros.map(function (k) {
        var meta = window.URU_RUBROS_META[k];
        var icono = window.URU_RUBROS_ICONO_SVG ? window.URU_RUBROS_ICONO_SVG(k, { tam: 15 }) : '';
        return '<button type="button" class="sugerencia-chip" data-rubro="' + k +
          '" style="--chip-color:' + meta[2] + '">' + icono + escapeHTML(meta[0]) + '</button>';
      }).join('');

    if (navigator.geolocation) {
      html += '<button type="button" class="sugerencia-chip sugerencia-chip--cerca" data-accion="sugerencia-cerca-tuyo">' +
        '📍 cerca tuyo</button>';
    }

    DOM.sugerenciasRapidas.innerHTML = html;
    actualizarVisibilidadSugerencias();
  }

  /**
   * Alterna la visibilidad de las sugerencias rápidas sin reconstruir
   * su contenido: en cuanto hay búsqueda, filtro de rubro o "cerca
   * tuyo" activo, el atajo de arranque ya cumplió su función.
   */
  function actualizarVisibilidadSugerencias() {
    if (!DOM.sugerenciasRapidas) return;
    DOM.sugerenciasRapidas.hidden = hayBusquedaOFiltro() || uiState.cercaTuyoActivo;
  }

  /**
   * Resumen de filtros activos: una píldora por faceta (búsqueda,
   * rubro, cerca-tuyo), cada una con su propia × para sacarse esa
   * faceta de encima sin tocar las otras. Antes la única forma de
   * quitar UN filtro puntual era vaciar el campo a mano o reabrir el
   * índice de rubros — acá queda a la vista, en el mismo lugar donde
   * se está mirando el resultado que esos filtros produjeron.
   */
  function pintarFiltrosActivos() {
    if (!DOM.filtrosActivos) return;

    var pills = [];
    var consulta = uiState.consultaActual.trim();

    if (consulta) {
      pills.push(
        '<span class="filtro-pill" data-filtro="busqueda">' +
        '<span class="filtro-pill__texto">“' + escapeHTML(consulta) + '”</span>' +
        '<button type="button" class="filtro-pill__quitar" data-filtro-quitar="busqueda" ' +
        'aria-label="Quitar búsqueda de ' + escapeHTML(consulta) + '">×</button>' +
        '</span>'
      );
    }

    if (uiState.filtroRubroActivo) {
      var meta = window.URU_RUBROS_META && window.URU_RUBROS_META[uiState.filtroRubroActivo];
      var nombreRubro = meta ? meta[0] : uiState.filtroRubroActivo;
      pills.push(
        '<span class="filtro-pill" data-filtro="rubro" style="--chip-color:' +
        (meta ? meta[2] : 'var(--color-granate-clara)') + '">' +
        '<span class="filtro-pill__texto">' + escapeHTML(nombreRubro) + '</span>' +
        '<button type="button" class="filtro-pill__quitar" data-filtro-quitar="rubro" ' +
        'aria-label="Quitar filtro de rubro ' + escapeHTML(nombreRubro) + '">×</button>' +
        '</span>'
      );
    }

    if (uiState.cercaTuyoActivo) {
      pills.push(
        '<span class="filtro-pill filtro-pill--cerca" data-filtro="cerca">' +
        '<span class="filtro-pill__texto">📍 cerca tuyo</span>' +
        '<button type="button" class="filtro-pill__quitar" data-filtro-quitar="cerca" ' +
        'aria-label="Dejar de ordenar por cercanía">×</button>' +
        '</span>'
      );
    }

    if (!pills.length) {
      DOM.filtrosActivos.hidden = true;
      DOM.filtrosActivos.innerHTML = '';
      return;
    }

    DOM.filtrosActivos.hidden = false;
    DOM.filtrosActivos.innerHTML = pills.join('');
  }

  /**
   * Click delegado en las sugerencias rápidas: un rubro reusa
   * exactamente `seleccionarRubro()` (mismo camino que el índice de
   * rubros de más abajo); "cerca tuyo" reusa `activarCercaDeMi()`
   * sobre el botón real ya creado por inicializarGeolocation() —
   * ninguna de las dos rutas duplica lógica de selección.
   */
  function manejarClickSugerencias(e) {
    var chipRubro = e.target.closest('[data-rubro]');
    if (chipRubro) {
      seleccionarRubro(chipRubro.dataset.rubro);
      return;
    }
    var chipCerca = e.target.closest('[data-accion="sugerencia-cerca-tuyo"]');
    if (chipCerca && dynamicElements.btnCercaDeMi && !uiState.cercaTuyoActivo) {
      activarCercaDeMi(dynamicElements.btnCercaDeMi);
    }
  }

  /**
   * Click delegado en el resumen de filtros activos: cada × quita
   * únicamente su propia faceta.
   */
  function manejarClickFiltrosActivos(e) {
    var btn = e.target.closest('[data-filtro-quitar]');
    if (!btn) return;
    var cual = btn.dataset.filtroQuitar;
    if (cual === 'busqueda') {
      limpiarBusqueda();
    } else if (cual === 'rubro') {
      uiState.filtroRubroActivo = null;
      pintarRubros();
      render();
    } else if (cual === 'cerca') {
      desactivarCercaDeMi();
    }
  }

  /**
   * Pinta las tarjetas de lugares en el panel de descubrimiento.
   * Con stagger, paginación, favoritos y acciones contextuales.
   */
  function pintarTarjetas(lista, favoritos, opts) {
    if (!DOM.panelDescubrimiento) return;

    // Guardar scroll actual
    uiState.scrollPosition = window.scrollY || document.documentElement.scrollTop;

    DOM.panelDescubrimiento.innerHTML = '';

    // Anunciar cantidad de resultados para screen readers
    if (DOM.estadoResultados) {
      DOM.estadoResultados.textContent = lista.length
        ? (lista.length + ' resultado' + (lista.length === 1 ? '' : 's') + '.')
        : 'Sin resultados.';
    }

    if (!lista.length) {
      var tieneBusqueda = uiState.consultaActual.trim().length > 0;
      var tieneFiltroRubro = !!uiState.filtroRubroActivo;
      var acciones = '';

      if (tieneBusqueda) {
        acciones += '<button type="button" class="btn" data-accion="limpiar-busqueda">Limpiar búsqueda</button>';
      }
      if (tieneFiltroRubro) {
        var metaFiltro = window.URU_RUBROS_META && window.URU_RUBROS_META[uiState.filtroRubroActivo];
        acciones += '<button type="button" class="btn" data-accion="limpiar-filtro-rubro">' +
          (metaFiltro ? 'Salir de "' + escapeHTML(metaFiltro[0]) + '"' : 'Ver todos los rubros') + '</button>';
      }

      DOM.panelDescubrimiento.innerHTML =
        '<div class="vacio">' +
        '<p>' + (opts.vacioTexto || 'No encontramos lugares con esos criterios.') + '</p>' +
        (acciones ? '<div class="vacio-acciones">' + acciones + '</div>' : '') +
        '</div>';
      uiState.visualState = VISUAL_STATE.EMPTY;
      return;
    }

    uiState.visualState = VISUAL_STATE.SUCCESS;
    var limite = TARJETAS_POR_PAGINA * uiState.paginaTarjetas;
    var visible = lista.slice(0, limite);
    var restantes = lista.length - visible.length;
    var movimientoReducido = prefiereMovimientoReducido();

    var frag = document.createDocumentFragment();
    visible.forEach(function (lugar, i) {
      var art = document.createElement('article');
      art.className = 'tarjeta' + (opts.narrativa ? ' tarjeta--narrativa' : '');
      art.dataset.lugarId = lugar.id;

      var metaRubro = window.URU_RUBROS_META && window.URU_RUBROS_META[lugar.grupo];
      var rubro = metaRubro ? metaRubro[0] : lugar.categoria;
      if (metaRubro) art.style.setProperty('--chip-color', metaRubro[2]);

      if (!movimientoReducido) {
        art.style.animationDelay = (Math.min(i, 24) * 0.03) + 's';
      }

      var linkMaps = mapsHref(lugar);
      var linkTel = lugar.telefono ? 'tel:' + lugar.telefono.replace(/[^\d+]/g, '') : null;
      var slugLugar = slug(lugar);
      var primaria = slugLugar ? 'ficha' : (linkMaps ? 'maps' : (linkTel ? 'tel' : null));

      var miniTexto = lugar.descripcion ||
        (lugar.categoria && rubro !== lugar.categoria ? rubro + ' · ' + lugar.categoria : lugar.categoria || rubro);
      var miniEsGenerica = !lugar.descripcion;

      var distanciaTxt = (uiState.cercaTuyoActivo && uiState.ubicacionUsuario &&
        typeof lugar.lat === 'number' && typeof lugar.lng === 'number')
        ? formatoDistancia(distanciaMetros(uiState.ubicacionUsuario.lat, uiState.ubicacionUsuario.lng, lugar.lat, lugar.lng))
        : null;

      var pendienteTxt = lugar.estado === 'pendiente' ? '<span class="tarjeta-pendiente">en revisión</span>' : '';

      art.innerHTML =
        '<div class="tarjeta-rubro">' + escapeHTML(rubro) + pendienteTxt + (distanciaTxt ? '<span class="tarjeta-distancia">📍 ' + escapeHTML(distanciaTxt) + '</span>' : '') + '</div>' +
        '<h3 class="tarjeta-nombre">' + escapeHTML(lugar.nombre) + '</h3>' +
        (miniTexto
          ? '<div class="tarjeta-mini' + (miniEsGenerica ? ' tarjeta-mini--generica' : '') + '">' + escapeHTML(miniTexto) + '</div>'
          : '<div class="tarjeta-direccion">' + (lugar.direccion ? escapeHTML(lugar.direccion) : 'cargando dirección…') + '</div>') +
        '<div class="tarjeta-acciones">' +
        (slugLugar ? '<a class="tarjeta-btn' + (primaria === 'ficha' ? ' tarjeta-btn--primaria' : '') + '" data-accion="aceptar" data-origen="' + opts.origen + '" href="locales/' + slugLugar + '/">ver ficha</a>' : '') +
        (linkMaps ? '<a class="tarjeta-btn tarjeta-btn--maps' + (primaria === 'maps' ? ' tarjeta-btn--primaria' : '') + '" data-accion="maps" href="' + linkMaps + '" target="_blank" rel="noopener" aria-label="Abrir en Google Maps">' + (primaria === 'maps' ? '📍 cómo llegar' : '📍 mapa') + '</a>' : '') +
        (linkTel ? '<a class="tarjeta-btn tarjeta-btn--tel' + (primaria === 'tel' ? ' tarjeta-btn--primaria' : '') + '" data-accion="llamar" href="' + linkTel + '" aria-label="Llamar">📞 llamar</a>' : '') +
        '<button class="tarjeta-btn tarjeta-btn--fav' + (favoritos[lugar.id] ? ' activo' : '') + '" type="button" data-accion="guardar" aria-pressed="' + (favoritos[lugar.id] ? 'true' : 'false') + '" aria-label="' + (favoritos[lugar.id] ? 'Quitar de guardados' : 'Guardar') + '">' + (favoritos[lugar.id] ? '★ guardado' : '☆ guardar') + '</button>' +
        (slugLugar ? '<button class="tarjeta-btn tarjeta-btn--compartir" type="button" data-accion="compartir" aria-label="Compartir">🔗</button>' : '') +
        '<button class="tarjeta-btn tarjeta-btn--descartar" type="button" data-accion="rechazar">no me interesa</button>' +
        '</div>';

      frag.appendChild(art);
    });

    DOM.panelDescubrimiento.appendChild(frag);

    if (restantes > 0) {
      var piePagina = document.createElement('div');
      piePagina.className = 'paginacion';
      piePagina.innerHTML =
        '<button type="button" class="btn" data-accion="cargar-mas">Cargar ' + Math.min(restantes, TARJETAS_POR_PAGINA) + ' más</button>' +
        '<span class="paginacion-conteo">' + visible.length + ' de ' + lista.length + '</span>';
      DOM.panelDescubrimiento.appendChild(piePagina);
    }
  }

  /**
   * Actualiza el encabezado (título, subtítulo) según rama y región.
   */
  function actualizarCabecera(reg, rama) {
    if (DOM.rolActual) {
      var rol = PLANO.rolPorAperturas(estado.aperturas);
      DOM.rolActual.textContent = ROLES_NOMBRES[rol] || rol;
    }

    if (!DOM.tituloRegion || !DOM.subtituloRegion) return;

    if (dynamicElements.btnVerCatalogoCompleto) {
      dynamicElements.btnVerCatalogoCompleto.hidden = true;
    }
    asegurarBotonVolverATodos();

    if (reg.nombre === 'curaduria') {
      DOM.tituloRegion.textContent = 'Tu lista';
      DOM.subtituloRegion.textContent = 'Lo que guardaste, sin recorte ni rotación.' + sufijoCercania();
      if (dynamicElements.btnVolverATodos) {
        dynamicElements.btnVolverATodos.hidden = false;
      }
      return;
    }

    if (dynamicElements.btnVolverATodos) {
      dynamicElements.btnVolverATodos.hidden = true;
    }

    var rubroMeta = uiState.filtroRubroActivo && window.URU_RUBROS_META
      ? window.URU_RUBROS_META[uiState.filtroRubroActivo]
      : null;

    var esRecorteReal = (reg.nombre === 'guia' || reg.nombre === 'exploracion') &&
      !hayBusquedaOFiltro() && !uiState.verCatalogoCompleto;

    if (!esRecorteReal) {
      if (uiState.consultaActual.trim()) {
        DOM.tituloRegion.textContent = 'Resultados';
        DOM.subtituloRegion.textContent = (rubroMeta
          ? 'Coincidencias con "' + uiState.consultaActual.trim() + '" en ' + rubroMeta[0] + '.'
          : 'Esto es lo que coincide con lo que escribiste.') + sufijoCercania();
      } else if (rubroMeta) {
        DOM.tituloRegion.textContent = rubroMeta[0];
        DOM.subtituloRegion.textContent = 'Todos los lugares verificados de este rubro.' + sufijoCercania();
      } else {
        DOM.tituloRegion.textContent = 'Todos los lugares';
        DOM.subtituloRegion.textContent = 'El padrón completo (' + REGISTRO.length + ' lugares).' + sufijoCercania();
      }

      if (uiState.verCatalogoCompleto && !hayBusquedaOFiltro() && reg.nombre !== 'accionDirecta') {
        asegurarBotonVerCatalogoCompleto();
        if (dynamicElements.btnVerCatalogoCompleto) {
          dynamicElements.btnVerCatalogoCompleto.textContent = '← Volver a lo sugerido';
          dynamicElements.btnVerCatalogoCompleto.hidden = false;
        }
      }
      return;
    }

    asegurarBotonVerCatalogoCompleto();
    if (dynamicElements.btnVerCatalogoCompleto) {
      dynamicElements.btnVerCatalogoCompleto.textContent = 'Ver catálogo completo →';
      dynamicElements.btnVerCatalogoCompleto.hidden = false;
    }

    if (reg.nombre === 'guia') {
      DOM.tituloRegion.textContent = 'Para arrancar';
      DOM.subtituloRegion.textContent = 'Una selección chica para no abrumar. Guardá o descartá para afinarla.' + sufijoCercania();
    } else {
      DOM.tituloRegion.textContent = 'Para explorar';
      DOM.subtituloRegion.textContent = 'Más variedad para curiosear. Buscá si ya sabés qué querés.' + sufijoCercania();
    }
  }

  /**
   * Asegura que exista el botón "ver catálogo completo" (creado por JS).
   */
  function asegurarBotonVerCatalogoCompleto() {
    if (dynamicElements.btnVerCatalogoCompleto || !DOM.subtituloRegion || !DOM.subtituloRegion.parentNode) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--link-volver';
    btn.addEventListener('click', function () {
      uiState.verCatalogoCompleto = !uiState.verCatalogoCompleto;
      uiState.paginaTarjetas = 1;
      render();
    });
    DOM.subtituloRegion.insertAdjacentElement('afterend', btn);
    dynamicElements.btnVerCatalogoCompleto = btn;
  }

  /**
   * Asegura que exista el botón "volver a todos" (desde curaduría).
   */
  function asegurarBotonVolverATodos() {
    if (dynamicElements.btnVolverATodos || !DOM.subtituloRegion || !DOM.subtituloRegion.parentNode) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--link-volver';
    btn.textContent = '← Ver todos los lugares';
    btn.hidden = true;
    btn.addEventListener('click', function () {
      estado.sesion.curaduriaActiva = false;
      PLANO.guardarEstado(estado);
      uiState.paginaTarjetas = 1;
      render();
      if (DOM.tituloRegion) {
        DOM.tituloRegion.setAttribute('tabindex', '-1');
        DOM.tituloRegion.focus({ preventScroll: false });
      }
    });
    DOM.subtituloRegion.insertAdjacentElement('afterend', btn);
    dynamicElements.btnVolverATodos = btn;
  }

  /**
   * Banner discreto "armaste una lista" tras 2+ guardados.
   */
  function actualizarBannerCuraduriaSugerida(reg) {
    var debeMostrar = estado.sesion.curaduriaSugerida && reg.nombre !== 'curaduria';

    if (!debeMostrar) {
      if (dynamicElements.bannerCuraduria) {
        dynamicElements.bannerCuraduria.hidden = true;
      }
      return;
    }

    if (!dynamicElements.bannerCuraduria) {
      asegurarBannerCuraduria();
    }

    if (dynamicElements.bannerCuraduria) {
      dynamicElements.bannerCuraduria.hidden = false;
    }
  }

  /**
   * Crea el banner "armaste una lista" si no existe.
   */
  function asegurarBannerCuraduria() {
    if (dynamicElements.bannerCuraduria || !DOM.panelDescubrimiento || !DOM.panelDescubrimiento.parentNode) {
      return;
    }

    var banner = document.createElement('div');
    banner.className = 'mapa-info';
    banner.setAttribute('role', 'status');
    banner.hidden = true;

    var texto = document.createElement('span');
    texto.textContent = 'Armaste el comienzo de una lista. ';

    var btnIr = document.createElement('button');
    btnIr.type = 'button';
    btnIr.className = 'btn btn--activo';
    btnIr.textContent = 'Ver tus guardados';
    btnIr.addEventListener('click', function () {
      estado.sesion.curaduriaActiva = true;
      estado.sesion.curaduriaSugerida = false;
      PLANO.guardarEstado(estado);
      uiState.paginaTarjetas = 1;
      render();
    });

    var btnCerrar = document.createElement('button');
    btnCerrar.type = 'button';
    btnCerrar.className = 'btn btn--icono';
    btnCerrar.setAttribute('aria-label', 'Descartar aviso');
    btnCerrar.textContent = '✕';
    btnCerrar.addEventListener('click', function () {
      estado.sesion.curaduriaSugerida = false;
      PLANO.guardarEstado(estado);
      banner.hidden = true;
    });

    banner.appendChild(texto);
    banner.appendChild(btnIr);
    banner.appendChild(btnCerrar);
    DOM.panelDescubrimiento.insertAdjacentElement('beforebegin', banner);

    dynamicElements.bannerCuraduria = banner;
  }

  // ───────────────────────────────────────────────────────────────────
  // 16. MAPA Y VISUALIZACIÓN ESPACIAL
  // ───────────────────────────────────────────────────────────────────

  /**
   * Inicializa el motor de mapa (lazy init).
   */
  function inicializarMotorMapa() {
    if (motorMapa || !DOM.mapaHerramienta || !window.URU_MOTOR_MAPA_RENDER) return;

    try {
      motorMapa = window.URU_MOTOR_MAPA_RENDER.crear(DOM.mapaHerramienta, {
        lat: -32.4833,
        lng: -58.2333,
        zoom: 14,
        ariaLabel: 'Mapa de los resultados de tu búsqueda'
      });

      motorMapa.on('hover', function (punto) {
        resaltarTarjeta(punto.id, true);
      });

      motorMapa.on('hoverOut', function () {
        resaltarTarjeta(null, false);
      });

      motorMapa.on('click', function (punto) {
        var el = DOM.panelDescubrimiento.querySelector('[data-lugar-id="' + cssEscape(punto.id) + '"]');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    } catch (e) {
      console.error('Error al inicializar motor de mapa:', e);
      motorMapa = null;
    }
  }

  /**
   * Resalta una tarjeta visualmente.
   */
  function resaltarTarjeta(id, activo) {
    var previa = DOM.panelDescubrimiento.querySelector('.tarjeta--resaltada');
    if (previa) previa.classList.remove('tarjeta--resaltada');
    if (activo && id) {
      var el = DOM.panelDescubrimiento.querySelector('[data-lugar-id="' + cssEscape(id) + '"]');
      if (el) el.classList.add('tarjeta--resaltada');
    }
  }

  /**
   * Actualiza la herramienta del mapa según la rama y la lista.
   */
  function actualizarMapaHerramienta(nombreRegion, lista) {
    if (!DOM.mapaHerramienta) return;

    var debeMostrar = MAPA.debeMostrarHerramienta(nombreRegion, lista);

    if (!debeMostrar) {
      DOM.mapaHerramienta.hidden = true;
      if (DOM.mapaInfo) DOM.mapaInfo.hidden = true;
      if (DOM.mapaLeyenda) DOM.mapaLeyenda.hidden = true;
      if (DOM.mapaContainer) DOM.mapaContainer.hidden = true;
      return;
    }

    if (DOM.mapaContainer) DOM.mapaContainer.hidden = false;
    DOM.mapaHerramienta.hidden = false;
    if (DOM.mapaInfo) DOM.mapaInfo.hidden = false;

    inicializarMotorMapa();
    if (!motorMapa) return;

    var conCoordenadas = lista.filter(function (l) {
      return typeof l.lat === 'number' && typeof l.lng === 'number';
    });

    var recorte = MAPA.puntosHerramienta(conCoordenadas);
    var puntos = recorte.map(function (l) {
      var meta = window.URU_RUBROS_META && window.URU_RUBROS_META[l.grupo];
      var slugL = slug(l);
      return {
        id: l.id,
        lat: l.lat,
        lng: l.lng,
        nombre: l.nombre,
        direccion: l.direccion,
        href: slugL ? 'locales/' + slugL + '/' : null,
        color: meta ? meta[2] : '#C97A83',
        rubroNombre: meta ? meta[0] : l.categoria,
        rubroKey: l.grupo,
        rubroIcono: meta ? meta[3] : null
      };
    });

    motorMapa.establecerPuntos(puntos);
    motorMapa.encuadrarTodos(48);
    pintarLeyenda(puntos);

    if (DOM.mapaInfo) {
      DOM.mapaInfo.textContent = recorte.length < conCoordenadas.length
        ? 'Mostrando ' + recorte.length + ' de ' + conCoordenadas.length + ' lugares con ubicación en el mapa.'
        : recorte.length + ' lugar' + (recorte.length === 1 ? '' : 'es') + ' en el mapa.';
    }
  }

  /**
   * Pinta la leyenda del mapa.
   */
  function pintarLeyenda(puntos) {
    if (!DOM.mapaLeyenda) return;

    var vistos = Object.create(null);
    var unicos = [];
    puntos.forEach(function (p) {
      if (vistos[p.rubroNombre]) return;
      vistos[p.rubroNombre] = true;
      unicos.push(p);
    });

    if (unicos.length < 2) {
      DOM.mapaLeyenda.hidden = true;
      return;
    }

    DOM.mapaLeyenda.innerHTML = unicos.map(function (p) {
      var icono = (p.rubroKey && window.URU_RUBROS_ICONO_SVG)
        ? window.URU_RUBROS_ICONO_SVG(p.rubroKey, { tam: 13 })
        : '';
      var marca = icono || '<span class="mapa-leyenda-punto" style="background:' + p.color + '"></span>';
      return '<span class="mapa-leyenda-chip" style="--chip-color:' + p.color + '">' +
        marca + escapeHTML(p.rubroNombre) + '</span>';
    }).join('');

    DOM.mapaLeyenda.hidden = false;
  }

  /**
   * Actualiza la textura ambiental del mapa de fondo.
   */
  function actualizarMapaTextura() {
    if (!DOM.mapaTextura || !REGISTRO.length) return;
    if (!window.URU_CONFIG.mapa.texturaSiempreVisible) return;
    if (DOM.mapaTextura.dataset.pintado === '1') return;

    var puntos = MAPA.puntosTextura(REGISTRO);
    var meta = window.URU_RUBROS_META || {};
    var frag = document.createDocumentFragment();
    var i = 0;

    puntos.forEach(function (l) {
      if (typeof l.lat !== 'number' || typeof l.lng !== 'number') return;
      var p = document.createElement('div');
      p.className = 'punto-textura';
      p.style.left = (Math.random() * 100) + '%';
      p.style.top = (Math.random() * 100) + '%';
      p.style.setProperty('--i', i);
      var colorRubro = meta[l.grupo] && meta[l.grupo][2];
      if (colorRubro) p.style.setProperty('--dot-color', colorRubro);
      i++;
      frag.appendChild(p);
    });

    DOM.mapaTextura.appendChild(frag);
    DOM.mapaTextura.dataset.pintado = '1';
  }

  // ───────────────────────────────────────────────────────────────────
  // 17. UTILIDADES VARIAS
  // ───────────────────────────────────────────────────────────────────

  function prefiereMovimientoReducido() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function slug(lugar) {
    var mapa = window.URU_LOCALES_SLUGS;
    return (mapa && mapa[lugar.id]) || null;
  }

  function mapsHref(lugar) {
    if (typeof lugar.lat === 'number' && typeof lugar.lng === 'number') {
      return 'https://www.google.com/maps/search/?api=1&query=' + lugar.lat + ',' + lugar.lng;
    }
    if (lugar.direccion) {
      return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lugar.nombre + ', ' + lugar.direccion);
    }
    return null;
  }

  function distanciaMetros(lat1, lng1, lat2, lng2) {
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatoDistancia(m) {
    if (m < 1000) return Math.round(m / 10) * 10 + ' m';
    return (m / 1000).toFixed(1).replace('.0', '') + ' km';
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function cssEscape(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function programarRenderTrasSalida(carta) {
    if (prefiereMovimientoReducido()) {
      render();
      return;
    }
    carta.classList.add('descartada');
    var yaRenderizo = false;
    var terminar = function () {
      if (yaRenderizo) return;
      yaRenderizo = true;
      render();
    };
    carta.addEventListener('transitionend', terminar, { once: true });
    setTimeout(terminar, ANIMATION_TIMEOUT_MS);
  }

  // ───────────────────────────────────────────────────────────────────
  // 18. GESTIÓN DE ERRORES VISUAL
  // ───────────────────────────────────────────────────────────────────

  function mostrarEstadoError(tipoError, detalles) {
    if (!DOM.panelDescubrimiento) return;

    var mensaje = '';
    switch (tipoError) {
      case ERROR_TYPE.CATALOG_FETCH:
        mensaje = 'No se pudo cargar el catálogo de lugares.';
        break;
      case ERROR_TYPE.GEOLOCATION:
        mensaje = 'No pudimos acceder a tu ubicación.';
        break;
      case ERROR_TYPE.STORAGE:
        mensaje = 'No se pueden guardar datos localmente.';
        break;
      default:
        mensaje = 'Algo salió mal. Intenta recargando la página.';
    }

    uiState.visualState = VISUAL_STATE.ERROR;
    DOM.panelDescubrimiento.innerHTML = '<p class="vacio error" role="alert">' + mensaje + '</p>';
  }

  function mostrarPanelErrorConReintento() {
    if (!DOM.panelDescubrimiento) return;

    DOM.panelDescubrimiento.innerHTML =
      '<p class="vacio error" role="alert">No se pudo cargar la información. ' +
      '<button type="button" class="btn" data-accion="reintentar-carga">Reintentar</button></p>';

    var btnReintentar = DOM.panelDescubrimiento.querySelector('[data-accion="reintentar-carga"]');
    if (btnReintentar) {
      btnReintentar.addEventListener('click', function () {
        ErrorRecovery.recuperarDeCarguaCatalogo();
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 19. INICIALIZACIÓN DE LISTENERS Y EVENTOS
  // ───────────────────────────────────────────────────────────────────

  function inicializarListeners() {
    // Input de búsqueda
    if (DOM.inputBuscar) {
      DOM.inputBuscar.addEventListener('input', manejarInputBusqueda);
      DOM.inputBuscar.addEventListener('keydown', manejarKeydownBuscar);
    }

    // Botón de limpiar interno del campo
    if (DOM.btnLimpiarBusqueda) {
      DOM.btnLimpiarBusqueda.addEventListener('click', limpiarBusqueda);
    }

    // Acciones en panel de descubrimiento
    if (DOM.panelDescubrimiento) {
      DOM.panelDescubrimiento.addEventListener('click', manejarClickPanel);
      DOM.panelDescubrimiento.addEventListener('mouseover', manejarHoverPanel);
      DOM.panelDescubrimiento.addEventListener('mouseout', manejarHoverOutPanel);
      DOM.panelDescubrimiento.addEventListener('keydown', manejarKeydownPanel);
    }

    // Chips de rubro
    if (DOM.listaRubros) {
      DOM.listaRubros.addEventListener('click', manejarClickRubros);
    }

    // Botón "ver guardados"
    if (DOM.btnVerGuardados) {
      DOM.btnVerGuardados.addEventListener('click', manejarClickVerGuardados);
    }

    // FAQ accordion
    if (DOM.faqLista) {
      DOM.faqLista.addEventListener('click', manejarClickFAQ);
    }

    // Permanencia y sesión
    activeOperations.permanenciaTimer = setInterval(tickPermanencia, PERMANENCIA_TICK_MS);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        estado = PLANO.aplicarAccion(estado, 'abandonar');
        PLANO.guardarEstado(estado);
      }
    });

    window.addEventListener('pagehide', function () {
      estado = PLANO.aplicarAccion(estado, 'abandonar');
      PLANO.guardarEstado(estado);
    });

    // Ripple sutil en botones
    document.addEventListener('pointerdown', manejarPointerDownParaRipple);

    // Progressive enhancement: scroll reveal
    inicializarScrollReveal();
  }

  function manejarInputBusqueda(e) {
    uiState.consultaActual = e.target.value;
    uiState.paginaTarjetas = 1;
    actualizarBotonLimpiar();

    if (uiState.consultaActual.trim().length >= 2) {
      estado = PLANO.aplicarAccion(estado, 'nombrar', { consulta: uiState.consultaActual });
    } else {
      estado.sesion.accionDirectaForzada = null;
    }
    PLANO.guardarEstado(estado);

    clearTimeout(activeOperations.debounceBuscarId);
    if (!uiState.consultaActual) {
      // Vaciar el campo es, en la cabeza de quien lo hace, un "deshacer":
      // debe sentirse instantáneo. El debounce existe para no recalcular
      // en cada tecla mientras se escribe, no para demorar el momento en
      // que alguien decide arrancar de nuevo.
      render();
    } else {
      activeOperations.debounceBuscarId = setTimeout(render, DEBOUNCE_BUSQUEDA_MS);
    }
  }

  /**
   * Muestra/oculta el botón de limpiar y mantiene aria-expanded del
   * input sincronizado con si hay una búsqueda/filtro gobernando el
   * panel de resultados ahora mismo.
   */
  function actualizarBotonLimpiar() {
    if (DOM.btnLimpiarBusqueda) {
      DOM.btnLimpiarBusqueda.hidden = !uiState.consultaActual;
    }
    if (DOM.inputBuscar) {
      DOM.inputBuscar.setAttribute('aria-expanded', hayBusquedaOFiltro() ? 'true' : 'false');
    }
  }

  /**
   * Limpia la búsqueda actual. Única función para las tres formas de
   * disparar la misma acción (botón interno del campo, acción del
   * estado vacío, y en el futuro cualquier otra): antes cada una
   * repetía su propia versión de estas cinco líneas por separado.
   */
  function limpiarBusqueda() {
    uiState.consultaActual = '';
    uiState.paginaTarjetas = 1;
    if (DOM.inputBuscar) {
      DOM.inputBuscar.value = '';
      DOM.inputBuscar.focus();
    }
    actualizarBotonLimpiar();
    estado.sesion.accionDirectaForzada = null;
    PLANO.guardarEstado(estado);
    clearTimeout(activeOperations.debounceBuscarId);
    render();
  }

  /**
   * Todos los controles focuseables "principales" de las tarjetas
   * visibles, en orden de aparición — para la navegación por teclado
   * entre resultados (flechas arriba/abajo desde el buscador o entre
   * tarjetas). Toma el primer link/botón de cada tarjeta en vez de
   * todos los suyos: moverse "a la tarjeta siguiente" con una sola
   * tecla, no a su quinto botón interno.
   */
  function elementosNavegablesDelPanel() {
    if (!DOM.panelDescubrimiento) return [];
    var tarjetas = Array.prototype.slice.call(DOM.panelDescubrimiento.querySelectorAll('.tarjeta'));
    var focos = [];
    tarjetas.forEach(function (t) {
      var primero = t.querySelector('a.tarjeta-btn, button.tarjeta-btn, a, button');
      if (primero) focos.push(primero);
    });
    return focos;
  }

  /**
   * Teclado desde el input: flecha abajo salta al primer resultado
   * (evita tener que Tabular uno por uno para llegar), Escape limpia
   * si hay texto. El resto (Enter, Tab) queda con su comportamiento
   * nativo — no hay nada que interceptar ahí.
   */
  function manejarKeydownBuscar(e) {
    if (e.key === 'ArrowDown') {
      var focos = elementosNavegablesDelPanel();
      if (focos.length) {
        e.preventDefault();
        focos[0].focus();
      }
    } else if (e.key === 'Escape' && uiState.consultaActual) {
      e.preventDefault();
      limpiarBusqueda();
    }
  }

  /**
   * Teclado dentro del panel de resultados: flechas arriba/abajo
   * recorren tarjetas (sin tener que Tabular por cada botón interno de
   * cada una), Escape vuelve al buscador. Delegado en el panel para
   * no atar un listener por tarjeta — el panel se repinta seguido.
   */
  function manejarKeydownPanel(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Escape') return;
    if (!e.target.closest('.tarjeta')) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      if (DOM.inputBuscar) DOM.inputBuscar.focus();
      return;
    }

    var focos = elementosNavegablesDelPanel();
    var idx = focos.indexOf(e.target);
    if (idx === -1) return;
    e.preventDefault();

    if (e.key === 'ArrowDown' && focos[idx + 1]) {
      focos[idx + 1].focus();
    } else if (e.key === 'ArrowUp') {
      if (focos[idx - 1]) {
        focos[idx - 1].focus();
      } else if (DOM.inputBuscar) {
        DOM.inputBuscar.focus();
      }
    }
  }

  /**
   * Estado "seguí escribiendo": 1 carácter, por debajo del umbral de
   * búsqueda explícita (2). Antes ese carácter ya disparaba un filtro
   * real —contra casi todo el catálogo, ruido puro— sin avisar que
   * faltaba una letra más. Ahora hay una respuesta inmediata y honesta
   * en vez de silencio o resultados que no dicen nada.
   */
  function pintarEstadoEscribiendo() {
    if (!DOM.panelDescubrimiento) return;
    DOM.panelDescubrimiento.innerHTML =
      '<p class="escribiendo"><span class="escribiendo__punto" aria-hidden="true"></span>' +
      'Seguí escribiendo — buscamos a partir de 2 letras.</p>';
    if (DOM.estadoResultados) {
      DOM.estadoResultados.textContent = 'Escribiendo. Hacen falta al menos 2 letras para buscar.';
    }
    uiState.visualState = VISUAL_STATE.TYPING;
  }

  function manejarClickPanel(e) {
    var btnAceptar = e.target.closest('[data-accion="aceptar"]');
    var btnRechazar = e.target.closest('[data-accion="rechazar"]');
    var btnGuardar = e.target.closest('[data-accion="guardar"]');
    var btnCompartir = e.target.closest('[data-accion="compartir"]');
    var btnCargarMas = e.target.closest('[data-accion="cargar-mas"]');
    var btnLimpiarBusqueda = e.target.closest('[data-accion="limpiar-busqueda"]');
    var btnLimpiarFiltro = e.target.closest('[data-accion="limpiar-filtro-rubro"]');
    var carta = e.target.closest('[data-lugar-id]');

    if (btnLimpiarBusqueda) {
      limpiarBusqueda();
      return;
    }

    if (btnLimpiarFiltro) {
      uiState.filtroRubroActivo = null;
      pintarRubros();
      render();
      return;
    }

    if (btnCompartir) {
      var cartaC = btnCompartir.closest('[data-lugar-id]');
      var lugarC = porId[cartaC.dataset.lugarId];
      var urlFicha = window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'locales/' + slug(lugarC) + '/';
      var payload = { title: lugarC.nombre + ' — URU SPOT', text: lugarC.categoria || '', url: urlFicha };

      if (navigator.share) {
        navigator.share(payload).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(urlFicha).then(function () {
          var txtOriginal = btnCompartir.innerHTML;
          btnCompartir.innerHTML = '✓';
          setTimeout(function () { btnCompartir.innerHTML = txtOriginal; }, 1600);
        });
      }
      return;
    }

    if (btnCargarMas) {
      uiState.paginaTarjetas++;
      render();
      return;
    }

    if (btnAceptar) {
      var id1 = btnAceptar.closest('[data-lugar-id]').dataset.lugarId;
      var porIniciativa = btnAceptar.dataset.origen === 'iniciativa_propia';
      var grupo1 = porId[id1] ? porId[id1].grupo : undefined;
      estado = PLANO.aplicarAccion(estado, 'aceptar', {
        lugarId: id1,
        porIniciativaPropia: porIniciativa,
        grupo: grupo1
      });
      PLANO.guardarEstado(estado);
      return;
    }

    if (btnRechazar) {
      var id2 = btnRechazar.closest('[data-lugar-id]').dataset.lugarId;
      var grupo = porId[id2] ? porId[id2].grupo : 'sin_rubro';
      estado = PLANO.aplicarAccion(estado, 'rechazar', { grupo: grupo });
      PLANO.guardarEstado(estado);
      programarRenderTrasSalida(btnRechazar.closest('[data-lugar-id]'));
      return;
    }

    if (btnGuardar) {
      var cartaG = btnGuardar.closest('[data-lugar-id]');
      var id3 = cartaG.dataset.lugarId;
      var favoritos = leerFavoritos();
      favoritos[id3] = !favoritos[id3];
      guardarFavoritos(favoritos);

      var quedoGuardado = !!favoritos[id3];
      estado = PLANO.aplicarAccion(estado, 'guardar', { lugarId: id3, guardado: quedoGuardado });
      PLANO.guardarEstado(estado);

      btnGuardar.classList.toggle('activo', quedoGuardado);
      btnGuardar.setAttribute('aria-pressed', String(quedoGuardado));
      btnGuardar.setAttribute('aria-label', quedoGuardado ? 'Quitar de guardados' : 'Guardar');
      btnGuardar.textContent = quedoGuardado ? '★ guardado' : '☆ guardar';
      actualizarContadorGuardados();

      if (estado.sesion.curaduriaActiva && !quedoGuardado) {
        programarRenderTrasSalida(cartaG);
      }
      return;
    }

    if (carta && motorMapa) {
      motorMapa.enfocar(carta.dataset.lugarId);
    }
  }

  function manejarHoverPanel(e) {
    var carta = e.target.closest('[data-lugar-id]');
    if (carta && motorMapa) motorMapa.resaltar(carta.dataset.lugarId);
  }

  function manejarHoverOutPanel(e) {
    var carta = e.target.closest('[data-lugar-id]');
    if (carta && motorMapa) motorMapa.quitarResaltado();
  }

  function manejarClickRubros(e) {
    var chip = e.target.closest('[data-rubro]');
    if (!chip) return;
    var rubro = chip.dataset.rubro;
    uiState.filtroRubroActivo = (uiState.filtroRubroActivo === rubro) ? null : rubro;
    uiState.paginaTarjetas = 1;
    estado.sesion.curaduriaActiva = false;
    PLANO.guardarEstado(estado);
    pintarRubros();
    render();
    if (DOM.tituloRegion) {
      DOM.tituloRegion.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function manejarClickVerGuardados() {
    estado.sesion.curaduriaActiva = true;
    PLANO.guardarEstado(estado);
    uiState.paginaTarjetas = 1;
    render();
    if (DOM.tituloRegion) {
      DOM.tituloRegion.setAttribute('tabindex', '-1');
      DOM.tituloRegion.focus({ preventScroll: false });
    }
  }

  function manejarClickFAQ(e) {
    var pregunta = e.target.closest('.faq-pregunta');
    if (!pregunta) return;
    var item = pregunta.closest('.faq-item');
    var abierta = pregunta.getAttribute('aria-expanded') === 'true';
    pregunta.setAttribute('aria-expanded', String(!abierta));
    item.classList.toggle('faq-item--abierta', !abierta);
  }

  function manejarPointerDownParaRipple(e) {
    if (prefiereMovimientoReducido()) return;
    var btn = e.target.closest('.btn');
    if (!btn) return;
    var rect = btn.getBoundingClientRect();
    var span = document.createElement('span');
    var lado = Math.max(rect.width, rect.height);
    span.className = 'btn__ripple';
    span.style.width = span.style.height = lado + 'px';
    span.style.left = (e.clientX - rect.left - lado / 2) + 'px';
    span.style.top = (e.clientY - rect.top - lado / 2) + 'px';
    btn.appendChild(span);
    span.addEventListener('animationend', function () { span.remove(); });
  }

  function tickPermanencia() {
    if (estadoActual() !== STATE.READY) return;

    estado = PLANO.aplicarAccion(estado, 'permanecer', { segundos: 5 });
    PLANO.guardarEstado(estado);

    var regionNueva = PLANO.region(estado).nombre;
    if (regionNueva !== uiState.ultimaRegionRenderizada) {
      render();
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 20. NAVEGACIÓN POR TECLADO AVANZADA
  // ───────────────────────────────────────────────────────────────────

  function inicializarTecladoNavegacion() {
    document.addEventListener('keydown', manejarTecladoGlobal);
  }

  function manejarTecladoGlobal(e) {
    // Escape: salir de modal/curaduría
    if (e.key === 'Escape') {
      if (estado && estado.sesion.curaduriaActiva) {
        estado.sesion.curaduriaActiva = false;
        PLANO.guardarEstado(estado);
        uiState.paginaTarjetas = 1;
        render();
        e.preventDefault();
      }
      return;
    }

    // Ctrl+K o Cmd+K: enfocar búsqueda
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      if (DOM.inputBuscar) {
        DOM.inputBuscar.focus();
        e.preventDefault();
      }
      return;
    }

    // Alt+L: enfocar lista de rubros
    if (e.altKey && e.key === 'l') {
      var primerChip = DOM.listaRubros && DOM.listaRubros.querySelector('[data-rubro]');
      if (primerChip) {
        primerChip.focus();
        e.preventDefault();
      }
      return;
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 21. GEOLOCALIZACIÓN AVANZADA
  // ───────────────────────────────────────────────────────────────────

  function inicializarGeolocation() {
    if (!navigator.geolocation || !DOM.inputBuscar || !DOM.inputBuscar.parentNode) return;

    var TEXTO_DEFECTO = '📍 Cerca de mí';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--cerca-tuyo';
    btn.textContent = TEXTO_DEFECTO;
    btn.setAttribute('aria-pressed', 'false');
    DOM.inputBuscar.insertAdjacentElement('afterend', btn);
    dynamicElements.btnCercaDeMi = btn;

    btn.addEventListener('click', function () {
      if (uiState.cercaTuyoActivo) {
        desactivarCercaDeMi();
      } else {
        activarCercaDeMi(btn);
      }
    });
  }

  function activarCercaDeMi(btn) {
    btn.disabled = true;
    btn.textContent = 'Ubicándote…';

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        uiState.ubicacionUsuario = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
        uiState.cercaTuyoActivo = true;
        btn.disabled = false;
        btn.textContent = '📍 Cerca de mí ✓';
        btn.setAttribute('aria-pressed', 'true');
        btn.classList.add('activo');
        render();
      },
      function (err) {
        btn.disabled = false;
        btn.textContent = '📍 Cerca de mí';
        console.warn('Geolocation error:', err);
        mostrarTooltipGeolocation('No pudimos acceder a tu ubicación. Revisá los permisos del navegador.');
      },
      {
        enableHighAccuracy: false,
        timeout: GEOLOCATION_TIMEOUT_MS,
        maximumAge: GEOLOCATION_MAX_AGE_MS
      }
    );
  }

  function desactivarCercaDeMi() {
    uiState.cercaTuyoActivo = false;
    uiState.ubicacionUsuario = null;
    var btn = dynamicElements.btnCercaDeMi;
    if (btn) {
      btn.textContent = '📍 Cerca de mí';
      btn.setAttribute('aria-pressed', 'false');
      btn.classList.remove('activo');
    }
    render();
  }

  function mostrarTooltipGeolocation(texto) {
    if (dynamicElements.tooltipGeolocation) {
      dynamicElements.tooltipGeolocation.remove();
    }

    var tooltip = document.createElement('span');
    tooltip.className = 'aviso-cerca-tuyo';
    tooltip.setAttribute('role', 'status');
    tooltip.textContent = texto;

    var btn = dynamicElements.btnCercaDeMi;
    if (btn && btn.parentNode) {
      btn.insertAdjacentElement('afterend', tooltip);
      dynamicElements.tooltipGeolocation = tooltip;
      setTimeout(function () {
        if (tooltip.parentNode) tooltip.remove();
        dynamicElements.tooltipGeolocation = null;
      }, TOOLTIP_TIMEOUT_MS);
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 22. SCROLL REVEAL (Progressive Enhancement)
  // ───────────────────────────────────────────────────────────────────

  function inicializarScrollReveal() {
    if (prefiereMovimientoReducido()) {
      document.querySelectorAll('.u-reveal').forEach(function (el) {
        el.classList.add('visible');
      });
    } else if ('IntersectionObserver' in window) {
      var observador = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (entrada) {
          if (entrada.isIntersecting) {
            entrada.target.classList.add('visible');
            observador.unobserve(entrada.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

      document.querySelectorAll('.u-reveal').forEach(function (el) {
        el.classList.add('u-reveal--armado');
        observador.observe(el);
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // 23. SISTEMA DE MÉTRICAS Y PERFORMANCE MONITORING
  // ───────────────────────────────────────────────────────────────────

  var MetricsCollector = (function () {
    var metrics = {
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

    return {
      recordRender: function (startTime, endTime) {
        metrics.totalRenders++;
        var duration = endTime - startTime;
        metrics.totalRenderTime += duration;
        metrics.lastRenderTime = duration;
        if (duration > 100) {
          metrics.slowRenders++;
          console.warn('[Metrics] Render lento: ' + duration.toFixed(1) + 'ms');
        }
      },

      recordNetworkRequest: function (duration, success) {
        metrics.networkRequests++;
        if (success) {
          metrics.networkTime += duration;
        } else {
          metrics.networkErrors++;
        }
      },

      recordError: function (tipo) {
        metrics.errorCount++;
      },

      getSummary: function () {
        return {
          renders: metrics.totalRenders,
          avgRenderTime: metrics.totalRenders > 0 ? (metrics.totalRenderTime / metrics.totalRenders).toFixed(1) : 0,
          slowRenders: metrics.slowRenders,
          networkRequests: metrics.networkRequests,
          networkErrors: metrics.networkErrors,
          totalErrors: metrics.errorCount,
          uptime: Date.now() - (lastStateChange || Date.now())
        };
      },

      export: function () {
        return JSON.parse(JSON.stringify(metrics));
      }
    };
  })();

  // ───────────────────────────────────────────────────────────────────
  // 24. SUITE DE TESTING Y VALIDACIÓN
  // ───────────────────────────────────────────────────────────────────

  var TestingSuite = (function () {
    return {
      runSmokeTesting: function () {
        var resultados = {
          total: 0,
          pasadas: 0,
          fallidas: 0,
          errores: []
        };

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
          if (!PLANO || !EXPO || !MAPA) {
            throw new Error('Módulos no inyectados');
          }
          resultados.pasadas++;
        } catch (e) {
          resultados.fallidas++;
          resultados.errores.push('Módulos: ' + e.message);
        }

        resultados.total++;
        try {
          var favs = leerFavoritos();
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
          if (!ValidacionSuite.validarEstado()) {
            throw new Error('Validación fallida');
          }
          resultados.pasadas++;
        } catch (e) {
          resultados.fallidas++;
          resultados.errores.push('Validación: ' + e.message);
        }

        resultados.total++;
        try {
          if (OperationManager.contarActivas() < 0) {
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
        var contrato = {
          requeridos: ['inputBuscar', 'panelDescubrimiento', 'tituloRegion', 'subtituloRegion'],
          resultados: {}
        };

        contrato.requeridos.forEach(function (id) {
          var el = DOM[id];
          contrato.resultados[id] = !!el;
        });

        var todoOK = Object.keys(contrato.resultados).every(function (k) {
          return contrato.resultados[k];
        });

        console.log('[Testing] Contrato DOM: ' + (todoOK ? 'OK' : 'FALLIDO'));
        return contrato;
      },

      validarRegistro: function () {
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
          porcentajeIntegridad: ((REGISTRO.length - problemas.length) / REGISTRO.length * 100).toFixed(1)
        };
      }
    };
  })();

  // ───────────────────────────────────────────────────────────────────
  // 25. HELPERS DE DEBUGGING Y DESARROLLO
  // ───────────────────────────────────────────────────────────────────

  var DebugHelper = (function () {
    return {
      inspectarEstado: function () {
        return {
          current: currentState,
          uiState: uiState,
          estado: estado,
          registroSize: REGISTRO.length,
          cacheInfo: lastRenderCache,
          operacionesActivas: OperationManager.contarActivas()
        };
      },

      simularBusqueda: function (consulta) {
        uiState.consultaActual = consulta;
        if (DOM.inputBuscar) DOM.inputBuscar.value = consulta;
        render();
      },

      simularFiltroRubro: function (rubro) {
        uiState.filtroRubroActivo = rubro;
        render();
      },

      simularGuardarFavorito: function (lugarId) {
        var favoritos = leerFavoritos();
        favoritos[lugarId] = !favoritos[lugarId];
        guardarFavoritos(favoritos);
        actualizarContadorGuardados();
        render();
      },

      healthCheck: function () {
        var testing = TestingSuite.runSmokeTesting();
        var metrics = MetricsCollector.getSummary();
        var registro = TestingSuite.validarRegistro();
        var contrato = TestingSuite.validarContratoDOM();

        return {
          estado: currentState,
          testing: testing,
          metrics: metrics,
          registro: registro,
          contrato: contrato,
          timestamp: new Date().toISOString()
        };
      },

      exportDebugData: function () {
        return {
          version: '2.3.0',
          timestamp: new Date().toISOString(),
          health: this.healthCheck(),
          stateLog: stateChangeLog.slice(-20),
          metricsExport: MetricsCollector.export(),
          registroMuestraSize10: REGISTRO.slice(0, 10)
        };
      }
    };
  })();

  // ───────────────────────────────────────────────────────────────────
  // 26. MANAGEMENT DE CICLO DE VIDA EXTENDIDO
  // ───────────────────────────────────────────────────────────────────

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
  // 27. API PÚBLICA EXTENDIDA Y PUNTO DE ENTRADA
  // ───────────────────────────────────────────────────────────────────

  window.URU_APP = {
    // Lifecycle
    init: inicializar,
    destroy: limpiar,
    restart: reiniciar,

    // State management
    getState: estadoActual,
    getUIState: function () { return JSON.parse(JSON.stringify(uiState)); },
    getRegistro: function () { return REGISTRO.slice(); },
    getStateLog: function () { return stateChangeLog.slice(); },
    canTransition: puedeTransicionar,

    // Validation
    validar: function () { return ValidacionSuite.validarEstado(); },
    reparar: function () { return ValidacionSuite.reparar(); },

    // Testing
    runTests: function () { return TestingSuite.runSmokeTesting(); },
    validateContract: function () { return TestingSuite.validarContratoDOM(); },
    validateRegistry: function () { return TestingSuite.validarRegistro(); },

    // Debugging
    debug: DebugHelper,
    metrics: MetricsCollector,
    testing: TestingSuite,

    // Hooks
    on: LifecycleHooks.on,
    off: LifecycleHooks.off,

    // Operations
    getActiveOperations: function () { return OperationManager.contarActivas(); },

    // Render y estado visual
    render: render,
    getVisualState: function () { return uiState.visualState; },

    // Favoritos
    getFavorites: leerFavoritos,
    toggleFavorite: function (id) {
      var favs = leerFavoritos();
      favs[id] = !favs[id];
      guardarFavoritos(favs);
      actualizarContadorGuardados();
      return favs[id];
    },

    // Búsqueda
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

    // Filtros
    filtrarPorRubro: function (rubro) {
      uiState.filtroRubroActivo = rubro;
      render();
    },
    limpiarFiltroRubro: function () {
      uiState.filtroRubroActivo = null;
      render();
    },

    // Geolocalización
    activarCercaDeMi: function () {
      if (dynamicElements.btnCercaDeMi) {
        activarCercaDeMi(dynamicElements.btnCercaDeMi);
      }
    },
    desactivarCercaDeMi: desactivarCercaDeMi,

    // Health check
    healthCheck: function () { return DebugHelper.healthCheck(); },
    exportDebugData: function () { return DebugHelper.exportDebugData(); },

    // Metadata
    version: '2.3.0',
    buildDate: new Date().toISOString()
  };

  window.URU_APP.LifecycleHooks = LifecycleHooks;

  // ───────────────────────────────────────────────────────────────────
  // 28. PUNTO DE ENTRADA FINAL
  // ───────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      try {
        inicializar();
        LifecycleHooks.fire('onReady', { timestamp: Date.now() });
      } catch (e) {
        console.error('Error fatal en inicialización:', e);
        LifecycleHooks.fire('onError', { error: e, timestamp: Date.now() });
      }
    });
  } else {
    try {
      inicializar();
      LifecycleHooks.fire('onReady', { timestamp: Date.now() });
    } catch (e) {
      console.error('Error fatal en inicialización:', e);
      LifecycleHooks.fire('onError', { error: e, timestamp: Date.now() });
    }
  }

  window.addEventListener('beforeunload', function () {
    limpiar();
    LifecycleHooks.fire('onDestroy', { timestamp: Date.now() });
  });

})();
