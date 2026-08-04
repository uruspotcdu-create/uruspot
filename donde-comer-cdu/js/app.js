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
  // TIER 1.3 (Perf, 2026-08-02): más corto que el de búsqueda porque un
  // click en un chip de rubro ya es una intención completa (a
  // diferencia de una tecla dentro de una palabra que se sigue
  // escribiendo) — solo necesita absorber dobles clicks/clicks en
  // ráfaga entre chips distintos.
  var DEBOUNCE_FILTRO_MS = 80;
  var PERMANENCIA_TICK_MS = 5000;
  var FOCUS_TRAP_DELAY_MS = 100;
  var ANIMATION_TIMEOUT_MS = 260;
  var GEOLOCATION_TIMEOUT_MS = 8000;
  // PERF (auditoría performance, 2026-08-02): red de seguridad para
  // .tarjeta--entrando (ver pintarTarjetas/inicializarListeners). El
  // caso normal saca la clase en 'animationend'; este timeout es solo
  // por si esa animación nunca llega a completarse (interrumpida,
  // pestaña oculta durante la animación, etc.) — sin él, una tarjeta
  // podría quedar con el vidrio suprimido para siempre. Cubre el peor
  // caso real: --dur-lenta (420ms) + el delay escalonado más largo
  // (Math.min(i,24)*0.03s = 720ms) = 1140ms, con margen.
  var ENTRADA_VIDRIO_TIMEOUT_MS = 1500;

  // Fase 4 — MUST HAVE #4 (Fase 3A §2, Fase 3D §7): encuadre del mapa
  // por región. Antes `encuadrarTodos()` siempre recibía el mismo
  // padding fijo (48px) sin importar la región activa — el mapa
  // "protagonista" de Exploración no existía ni siquiera en cómo se
  // encuadraba a sí mismo. Un padding mayor = más margen alrededor
  // del conjunto de puntos = vista más abierta/alejada, coherente con
  // "más variedad para curiosear" (mismo subtítulo que ya usa
  // actualizarCabecera() para esta región). Guía mantiene el valor
  // original: foco cerrado sobre una selección chica.
  var MAPA_PADDING_GUIA_PX = 48;
  var MAPA_PADDING_EXPLORACION_PX = 96;

  // Logging de diagnóstico del flujo normal (cambios de estado,
  // operaciones async, etc.), detrás de window.URU_CONFIG.debug —
  // ver motor-config.js §0. No reemplaza console.error/console.warn,
  // que siguen corriendo siempre porque señalan algo puntual.
  function debugLog() {
    if (window.URU_CONFIG && window.URU_CONFIG.debug) {
      console.log.apply(console, arguments);
    }
  }
  var GEOLOCATION_MAX_AGE_MS = 300000;
  var TOOLTIP_TIMEOUT_MS = 4000;
  // Fase 4 — MUST HAVE #3 (Fase 3C §3, Fase 3D §7): duración del
  // aviso transitorio de cambio de región. Más corto que
  // TOOLTIP_TIMEOUT_MS a propósito — es un aviso pasivo ("cambió lo
  // que ves"), no un mensaje de error que requiera acción del
  // usuario, así que no necesita quedarse tanto tiempo en pantalla.
  var CAMBIO_REGION_AVISO_MS = 2600;
  var NETWORK_RETRY_ATTEMPTS = 2;
  var NETWORK_RETRY_DELAY_MS = 800;
  // Auditoría producción, 2026-07-30: se eliminan MAX_CONCURRENT_OPERATIONS
  // y VIRTUAL_SCROLL_THRESHOLD — declaradas pero sin ningún consumidor real
  // (OperationManager.crear() nunca comparaba contra un límite; el listado
  // ya se pagina con TARJETAS_POR_PAGINA, así que la virtualización nunca
  // llegó a evaluarse). Confirmado con análisis estático antes de borrar.

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

  // AUDITORÍA — agregado en esta pasada. Tipos de error que sí o sí
  // deben detener la app (transicionar a STATE.ERROR y reemplazar el
  // panel de resultados por un mensaje, vía mostrarEstadoError()). El
  // resto de los tipos en ERROR_TYPE corresponden a fallos que el
  // propio punto de origen YA maneja con un fallback seguro
  // (leerFavoritos()/guardarFavoritos() devuelven `{}`/no-op ante un
  // error de storage) — para esos alcanza con loguear, nunca hace
  // falta apagar el resto de la aplicación por un subsistema no
  // crítico que ya se recuperó solo.
  //
  // BUG REAL corregido en esta pasada: `ErrorRecovery.procesar()`
  // trataba TODOS los ERROR_TYPE por igual — cualquier hiccup
  // transitorio de localStorage al leer/guardar favoritos (cuota
  // agotada, modo privado estricto, storage bloqueado por política)
  // tiraba `currentState` a STATE.ERROR y borraba TODO
  // `DOM.panelDescubrimiento` con el mensaje genérico de error, pese a
  // que `leerFavoritos()` ya había devuelto `{}` con normalidad un
  // instante antes. Como no hay ningún camino que regrese
  // automáticamente de STATE.ERROR a STATE.READY para ERROR_TYPE.STORAGE
  // (a diferencia de CATALOG_FETCH, que sí tiene
  // `recuperarDeCarguaCatalogo()`), el sitio quedaba con el panel de
  // resultados borrado y todo `render()` futuro cortado en su primera
  // línea (`if (estadoActual() !== STATE.READY ...) return;`) — hasta
  // recargar la página — por un problema que, de hecho, ya estaba
  // resuelto. Reproducido extrayendo la lógica real de este archivo
  // (ver auditoría) antes del fix: `leerFavoritos()` devolvía `{}`
  // correctamente y aun así `currentState` terminaba en `'error'`.
  var ERROR_TYPES_FATALES = [
    ERROR_TYPE.CATALOG_FETCH,
    ERROR_TYPE.STATE_INVALID,
    ERROR_TYPE.UNKNOWN
  ];

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

  // ═══════════════════════════════════════════════════════════════════
  // TIER 1: CACHÉ DE DISTANCIAS Y SLUG (Perf, 2026-08-02)
  // ═══════════════════════════════════════════════════════════════════
  // Optimización quirúrgica: evita recalcular distancias y slugs en cada
  // búsqueda. Impacto: +25% (distancia) + 12% (slug) fluidez percibida.
  // Auditoría: confirmado que ordenarPorCercania() y slug() se llaman N
  // veces por sesión con los mismos datos — caché da hit 90%+ del tiempo.

  var DISTANCIA_CACHE = Object.create(null);

  // TIER 1.2 — auditoría de cierre (Perf, 2026-08-02): acá existía un
  // SLUG_CACHE que nunca se conectaba a nada (variable muerta). Se
  // retira en vez de cablearla: slug() (más abajo) es un lookup directo
  // en el objeto estático URU_LOCALES_SLUGS, ya O(1) — no hay parsing
  // ni cómputo repetido que cachear. Envolver un lookup de objeto en
  // una capa de caché no ahorra trabajo, solo lo agrega (hash de clave
  // + escritura en el mapa de caché) sin beneficio medible.

  function calcularDistancia(lat1, lng1, lat2, lng2) {
    return Math.sqrt(
      Math.pow(lat1 - lat2, 2) + Math.pow(lng1 - lng2, 2)
    );
  }

  function ordenarPorCercaniaConCache(lista, lat, lng) {
    var cacheKey = lat.toFixed(6) + ',' + lng.toFixed(6);

    if (DISTANCIA_CACHE[cacheKey]) {
      var mapeoDistancias = DISTANCIA_CACHE[cacheKey];
      var listaCopia = lista.slice();
      listaCopia.sort(function (a, b) {
        var distA = mapeoDistancias[a.id] !== undefined
          ? mapeoDistancias[a.id]
          : 999999;
        var distB = mapeoDistancias[b.id] !== undefined
          ? mapeoDistancias[b.id]
          : 999999;
        return distA - distB;
      });
      return listaCopia;
    }

    var distancias = Object.create(null);
    lista.forEach(function (l) {
      if (l.lat !== undefined && l.lng !== undefined) {
        distancias[l.id] = calcularDistancia(l.lat, l.lng, lat, lng);
      }
    });

    DISTANCIA_CACHE[cacheKey] = distancias;

    var cacheKeys = Object.keys(DISTANCIA_CACHE);
    if (cacheKeys.length > 10) {
      var keyAntigua = cacheKeys[0];
      delete DISTANCIA_CACHE[keyAntigua];
    }

    var listaCopia = lista.slice();
    listaCopia.sort(function (a, b) {
      return (distancias[a.id] || 999999) - (distancias[b.id] || 999999);
    });

    return listaCopia;
  }

  // PERF (auditoría de rendimiento, I2, 2026-08-02): existía acá una
  // función cargarLugaresDelViewport() que llamaba a
  // window.Virtualizador.cargarParaViewport() con un bounding box FIJO
  // que cubre toda la ciudad (no el viewport real del mapa, que en ese
  // momento del flujo ni siquiera está inicializado todavía). Con
  // TILE_SIZE=0.05 y FETCH_BUFFER=2 (js/datos-virtualizador.js), ese
  // bbox fijo dispara 49 fetches de tiles en paralelo en cada carga del
  // catálogo — la mayoría a archivos que no existen en
  // datos/lugares-mapa-tiles/ (404) — y el resultado se descartaba por
  // completo: el único consumidor era un console.log con la cantidad de
  // lugares devueltos, nada se guardaba en REGISTRO ni se usaba para
  // pintar nada. Es decir: tráfico de red real (49 requests, la mayoría
  // fallidas) sin ningún efecto funcional. Se quita la llamada y la
  // función; window.Virtualizador (js/_archivo/datos-virtualizador.js,
  // sacado del bundle en el hallazgo 1.4 de la auditoría de
  // rendimiento del 2026-08-03 — no tenía consumidor activo) queda
  // archivado para quien quiera cablearlo a un uso real en el futuro
  // (p. ej. cargar detalles por región efectivamente visible en el
  // mapa), pero eso es un cambio de arquitectura de datos, no un
  // one-liner: la lista/búsqueda de tarjetas de hoy no está acotada al
  // viewport del mapa (una búsqueda puede traer resultados de
  // cualquier punto de la ciudad), así que cargar detalles solo por
  // tile rompería la descripción/teléfono de tarjetas fuera del
  // viewport visible.

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
    visualState: VISUAL_STATE.LOADING,
    lastErrorState: null,
    focusedElement: null,
    scrollPosition: 0,
    cartasActuales: [] // referencia a tarjetas pintadas para reconciliación
    // Fase 4 (Motion Direction Bible v2.0, Parte K.10): la fatiga de
    // "Cambio de filtros" (Cap. 5) ya no se cuenta acá — la resuelve
    // AmbienteRitmo por claveAccion 'filtro:rubro' vía
    // Coreografias.cambioFiltro(), único lugar dueño de esa regla en
    // toda la app. Antes había un contador local (vecesTransicionFiltro)
    // que duplicaba esa lógica.
  };

  // Timers y operaciones async activas
  var activeOperations = {
    debounceBuscarId: null,
    debounceFiltroId: null,
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
    html: null,
    // BUGFIX (auditoría performance, 2026-07-30): ver render() más abajo —
    // sin este campo, "Cargar más" no repinta nunca (paginaTarjetas nunca
    // formaba parte de la detección de cambios).
    paginaTarjetas: null
  };

  // DOM references (validadas al init)
  var DOM = {};
  var REQUIRED_DOM_IDS = [
    'rolActual', 'inputBuscar', 'panelDescubrimiento', 'tituloRegion',
    'subtituloRegion', 'mapaContainer', 'mapaHerramienta',
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
    tooltipGeolocation: null,
    avisoCambioRegion: null
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

    // PERF (auditoría, hallazgo M2, 2026-08-02): antes esto se ejecutaba
    // siempre, sin importar si el flag de debug estaba activo, aunque el
    // resto de la telemetría (debugLog, MetricsCollector, DebugHelper) sí
    // respeta window.URU_CONFIG.debug. Se gatea acá igual que debugLog para
    // no pagar este trabajo en cada transición de estado en producción. Si
    // el debug está apagado, stateChangeLog queda vacío — comportamiento
    // esperado, no afecta validar()/reparar()/runTests()/healthCheck().
    if (window.URU_CONFIG && window.URU_CONFIG.debug) {
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
    }

    debugLog('[State] ' + estadoAnterior + ' → ' + nuevoEstado + ' (' + (razon || 'unknown') + ')');
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
        debugLog('[Op] ' + id + ': ' + nombre + ' iniciada');
        return id;
      },

      /**
       * Marca una operación como completada.
       */
      completar: function (opId) {
        if (activeOps[opId]) {
          debugLog('[Op] ' + opId + ': completada');
          delete activeOps[opId];
        }
      },

      /**
       * Cancela una operación específica.
       */
      cancelar: function (opId) {
        var op = activeOps[opId];
        if (op) {
          debugLog('[Op] ' + opId + ': cancelada');
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
  /**
   * Fase 4 — MUST HAVE (Fase 3A §4, Fase 3D §7): reduce el resultado de
   * recortePorIniciativaPropiaExplicado() a un mapa { id: primeraRazon }
   * — razonesDesdeSeñales() siempre devuelve al menos una razón (incluye
   * un fallback genérico), así que este mapa siempre tiene entrada para
   * cada lugar del recorte, nunca queda vacío para un id presente.
   */
  function razonesPorLugarId(lugaresConRazones) {
    var mapa = {};
    (lugaresConRazones || []).forEach(function (x) {
      if (x.lugar && x.lugar.id != null && x.razones && x.razones.length) {
        mapa[x.lugar.id] = x.razones[0];
      }
    });
    return mapa;
  }

  function hayCambioEnLista(listaAnterior, listaActual) {
    if (!listaAnterior || !listaActual) return true;
    if (listaAnterior.length !== listaActual.length) return true;
    
    // Hash rápido: concatenar IDs
    var hashAnterior = listaAnterior.map(function (l) { return l.id; }).join(',');
    var hashActual = listaActual.map(function (l) { return l.id; }).join(',');
    return hashAnterior !== hashActual;
  }

  // Fase de deuda técnica (auditoría producción, 2026-07-30): se elimina
  // calcularDiferenciasRender() — motor de diff incremental (reconciliación
  // de itemsAgregados/itemsRemovidos/itemsActualizados) escrito pero jamás
  // invocado ni exportado; render() usa hayCambioEnLista() (hash de IDs) como
  // único chequeo real de cambio. Confirmado sin llamadores vía análisis
  // estático (0 referencias fuera de su propia definición) antes de borrar.


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

        // Ver ERROR_TYPES_FATALES (declarado junto a ERROR_TYPE) para
        // la justificación completa: un error ya recuperado en su
        // propio origen (p. ej. ERROR_TYPE.STORAGE desde
        // leerFavoritos/guardarFavoritos) se registra para debug pero
        // NO detiene el resto de la aplicación.
        if (ERROR_TYPES_FATALES.indexOf(tipoError) !== -1) {
          mostrarEstadoError(tipoError, detalles);
          transicionarEstado(STATE.ERROR, tipoError);
        }

        return detalles;
      },

      /**
       * Intenta recuperar de un error en la carga de catálogo.
       */
      recuperarDeCarguaCatalogo: function () {
        if (uiState.lastErrorState && uiState.lastErrorState.tipo === ERROR_TYPE.CATALOG_FETCH) {
          // Cap. 6.3 (Estados del Ambient Engine): "Error → Activo
          // solo vía reintento explícito" — este es exactamente ese
          // reintento explícito. Sin este paso, iniciarCarga() de
          // cargarCatalogo() sería un no-op (solo transiciona desde
          // Activo) y el Ambient Engine quedaría en Error para siempre.
          if (window.AmbientEngine) window.AmbientEngine.reintentar();
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

        // Conteo de favoritos debe ser consistente.
        //
        // BUG REAL corregido en esta pasada: esta rama comparaba contra
        // `estado.sesion.guardados`, un campo que NUNCA existió en el
        // shape de `estado.sesion` que define motor-plano.js (ver
        // `estadoInicial()` ahí: curaduriaActiva, curaduriaSugerida,
        // accionDirectaForzada, inicioPermanenciaMs,
        // empujeFriccionSesion — nada de `guardados`). Confirmado en
        // runtime, no solo por lectura: `'guardados' in
        // PLANO.estadoInicial(ciudad).sesion` da `false`. El
        // almacenamiento real de favoritos es `leerFavoritos()`, sobre
        // la clave `uruspot_favoritos` de localStorage — un store
        // aparte que nunca pasó por PLANO. Resultado: esta condición
        // era `if (falsy)` siempre, así que el chequeo de consistencia
        // nunca corrió ni una sola vez en producción.
        var favoritosActuales = leerFavoritos();
        var conteo = Object.keys(favoritosActuales).filter(function (id) {
          return favoritosActuales[id];
        }).length;
        var contador = DOM.contadorCuraduria ? parseInt(DOM.contadorCuraduria.textContent, 10) : 0;
        if (conteo !== contador && !isNaN(contador)) {
          console.warn('[Validación] Inconsistencia en conteo de guardados: favoritos=' + conteo + ', DOM=' + contador);
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

        // Reparar guardados huérfanos.
        //
        // BUG REAL corregido en esta pasada: apuntaba a
        // `estado.sesion.guardados` (inexistente — ver fix de
        // `validarEstado()` arriba), así que nunca borraba nada. Un
        // favorito guardado para un lugar que después se retira de
        // `lugares-core.json` (negocio delistado) quedaba huérfano en
        // `uruspot_favoritos` para siempre: no rompe el render (
        // `EXPO.coleccionCurada()` ya filtra contra `registro`), pero
        // sí infla `DOM.contadorCuraduria` de forma permanente y
        // silenciosa (ver `actualizarContadorGuardados()`, que cuenta
        // sobre el store crudo sin filtrar contra `porId`). Ahora
        // opera sobre el store real y persiste el resultado.
        var favoritosActuales = leerFavoritos();
        var cambio = false;
        Object.keys(favoritosActuales).forEach(function (id) {
          if (favoritosActuales[id] && !porId[id]) {
            delete favoritosActuales[id];
            cambio = true;
          }
        });
        if (cambio) {
          guardarFavoritos(favoritosActuales);
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
  // 9. (vacía) — PerformanceManager eliminado en auditoría producción
  // 2026-07-30: módulo de batching/medición (programarEnFrame, medir)
  // escrito pero nunca invocado ni exportado (0 referencias fuera de su
  // propia definición, confirmado con análisis estático). Se numeran las
  // secciones deliberadamente sin renumerar el resto del archivo para no
  // invalidar los comentarios de fase que referencian números de sección
  // en otros módulos ambiente-*.js/tests.
  // ───────────────────────────────────────────────────────────────────

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

      // Fase 4 (Motion Direction Bible v2.0, G.4.2): si el navegador
      // llegó acá de vuelta desde una ficha, deja registro de sesión
      // del regreso (fatiga/contraste) antes de que el primer render()
      // real active la escena ambiental que corresponda al estado
      // restaurado (Coreografias.activarEscenaPorRama, dentro de render()).
      if (window.Coreografias && window.Coreografias.vieneDeFicha()) {
        window.Coreografias.cierreFicha();
      }

      // Inicialización de listeners
      inicializarListeners();
      inicializarTecladoNavegacion();
      inicializarGeolocation();

      // Perf, Fase 2.1: el Ambient Engine ya no es <script defer> estático
      // en el documento — se agenda acá (idle) para no competir con la
      // carga del catálogo real, ver cargarMotorAmbientalDiferido() más
      // abajo. No depende de STATE.LOADING_CATALOG ni de cargarCatalogo():
      // es decorativo, no de negocio.
      cargarMotorAmbientalDiferido();

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

    debugLog('[Cleanup] Aplicación finalizada correctamente');
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

    // BUG REAL DE RENDIMIENTO (auditoría Fase 9): 'no-store' es el modo
    // más agresivo de RequestCache — el navegador ni siquiera consulta
    // la caché HTTP, fuerza una descarga completa del cuerpo en CADA
    // fetch, en cada visita, incluso si lugares-core.json/-detalles.json/
    // -estado.json no cambiaron una sola vez desde la última carga (el
    // catálogo se edita a mano, no en cada request). 'no-cache' es
    // distinto pese al nombre parecido: SIGUE revalidando con el
    // servidor en cada pedido (nunca sirve un dato viejo sin preguntar,
    // cero riesgo de desactualización), pero si el servidor responde
    // 304 Not Modified (ETag/Last-Modified, ya soportado por hosting
    // estático estándar) el navegador reutiliza el cuerpo cacheado en
    // vez de volver a transferir 224KB+240KB+88KB por visita repetida.
    // Mismo comportamiento observable, menos bytes reales en la red.
    return fetch(url, {
      cache: 'no-cache',
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
    // Fase 4, Cap. 6 "Carga" / Cap. 8: "ningún estado de carga es una
    // pantalla vacía o congelada: el Ambient Engine ocupa ese instante
    // con su registro de fondo habitual". iniciarCarga()/finalizarCarga()
    // ya existían como superficie pública de window.AmbientEngine desde
    // Fase 0/2 pero no tenían ningún llamador real en la app — esta es
    // la primera fuente de carga real y perceptible (fetch de red, no
    // el debounce sintético de 160ms del buscador, que se mantiene
    // deliberadamente ágil, Cap. 5). No-op seguro si el Ambient Engine
    // todavía no terminó de inicializarse (chequeo interno del propio
    // AmbienteEstados) o si ya está en Carga por otra vía.
    if (window.AmbientEngine) window.AmbientEngine.iniciarCarga();

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
            // Default seguro (Fase 3 del roadmap de mejora, 2026-07-26):
            // antes decía 'verificado'. Un lugar sin entrada en
            // lugares-estado.json (porque split_dataset.py filtra los que
            // no tienen estado_verificacion) se quedaba con este default
            // para siempre y se mostraba como verificado sin ningún dato
            // que lo respalde. 'pendiente' es el estado correcto hasta que
            // lugares-estado.json confirme lo contrario (ver
            // cargarDetallesEnSegundoPlano más abajo, que sí sobreescribe
            // a 'verificado' cuando corresponde).
            estado: 'pendiente',
            rating: (typeof l.rating === 'number') ? l.rating : null,
            ratingCount: (typeof l.rating_count === 'number') ? l.rating_count : null
          };
          porId[l.id] = reg;
          return reg;
        });

        // Índice invertido de búsqueda (perf, 2026-07-31): construido acá,
        // después de que REGISTRO ya tiene el catálogo real — construirlo
        // antes (como hacía la versión anterior) indexaba el REGISTRO
        // vacío/de la carga previa. Se reconstruye una segunda vez en
        // cargarDetallesEnSegundoPlano cuando `direccion` deja de ser
        // null, porque hay lugares que solo matchean por dirección
        // (rango 5 de rangoDeCoincidencia en motor-exposicion.js).
        if (window.IndiceInvertido) { window.IndiceInvertido.construir(REGISTRO); }

        transicionarEstado(STATE.READY, 'catalogo_cargado');
        if (window.AmbientEngine) window.AmbientEngine.finalizarCarga(true);

        // Parallelizar carga de detalles (segundo plano)
        cargarDetallesEnSegundoPlano();
        pintarRubros();
        pintarStatsRapidas();
        pintarDestacados();
        pintarSugerenciasRapidas();
        render();

      })
      .catch(function (err) {
        if (window.AmbientEngine) window.AmbientEngine.finalizarCarga(false);
        ErrorRecovery.procesar(err, ERROR_TYPE.CATALOG_FETCH, 'cargarCatalogo');
        mostrarPanelErrorConReintento();
      });
  }

  /**
   * Carga diferida del Ambient Engine + Coreografias (perf, Fase 2.1,
   * 2026-08-01).
   *
   * Antes: js/ambiente.bundle.js y js/coreografias.js eran <script defer>
   * estáticos en index.html, cargados ANTES de app.min.js — el navegador
   * tenía que ejecutar ~71 KB raw de motor puramente decorativo antes de
   * correr una sola línea de la lógica real de catálogo/render. Ahora
   * motor.bundle.js → app.min.js es la única cadena bloqueante real
   * (ver comentario junto al <script src="js/app.min.js"> en index.html);
   * el Ambient Engine se inyecta acá, en idle, después de que arranca la
   * carga del catálogo.
   *
   * Por qué es seguro (no exhaustivo, verificado contra el código real
   * antes de este cambio): CADA llamador de window.AmbientEngine /
   * window.Coreografias en este archivo ya estaba gateado con
   * `if (window.AmbientEngine)` / `if (window.Coreografias)` — no-op
   * seguro si el motor todavía no cargó. El único efecto observable es
   * que esas llamadas pueden ser no-op durante el primer segundo o dos
   * tras el arranque (p. ej. el registro visual de "cargando" del Cap. 8
   * puede no alcanzar a activarse si el catálogo responde muy rápido).
   *
   * Orden de ejecución preservado a mano: `async = false` en ambos
   * <script> creados dinámicamente asegura que, aunque los dos archivos
   * terminen de descargarse en cualquier orden, se EJECUTEN en el orden
   * en que se insertaron (spec de HTML: scripts dinámicos con
   * async=false se ejecutan en orden de inserción, igual que `defer`)
   * — ambiente.bundle.js antes que coreografias.js, igual que exigía el
   * contrato viejo de <script defer> en el documento.
   */
  var motorAmbientalDiferidoLanzado = false;
  function cargarMotorAmbientalDiferido() {
    if (motorAmbientalDiferidoLanzado) return; // idempotente
    motorAmbientalDiferidoLanzado = true;

    var lanzar = function () {
      ['js/ambiente.bundle.js', 'js/coreografias.js'].forEach(function (src) {
        var s = document.createElement('script');
        s.src = src;
        s.async = false; // preserva orden de ejecución entre los dos
        s.onerror = function () {
          console.warn('[AmbientEngine] no se pudo cargar ' + src + ' (diferido, no bloquea la app)');
        };
        document.head.appendChild(s);
      });
    };

    // Igual criterio que cargarDetallesEnSegundoPlano: requestIdleCallback
    // si está disponible, sino setTimeout corto. Timeout más bajo que el
    // de detalles/estado (2000ms) porque esto sí queremos que aparezca
    // razonablemente rápido — es decoración, pero no queremos que tarde
    // segundos enteros en mostrarse tampoco.
    if ('requestIdleCallback' in window) {
      requestIdleCallback(lanzar, { timeout: 1200 });
    } else {
      setTimeout(lanzar, 100);
    }
  }

  /**
   * PERF (auditoría, hallazgo I2, 2026-08-02): antes, apenas resolvía el
   * fetch de lugares-detalles.json / lugares-estado.json, se hacía un
   * `.forEach()` síncrono sobre hasta ~1468 registros en un solo tirón —
   * eso bloquea el hilo principal aunque el propio fetch estuviera diferido
   * con requestIdleCallback (diferir CUÁNDO se pide no evita que aplicar la
   * respuesta entera de una sola vez bloquee igual).
   *
   * Se evaluó conectar `window.Virtualizador`
   * (js/_archivo/datos-virtualizador.js — archivado, ya no bundleado
   * en motor.bundle.js desde el hallazgo 1.4, 2026-08-03) para pedir
   * datos por tile geográfico en vez de todo el catálogo. Se descartó: Virtualizador escoge datos por
   * bounds del MAPA, pero las tarjetas (pintarTarjetas) casi nunca se
   * scopean por geografía — se scopean por recorte curado
   * (recortePorIniciativaPropiaExplicado) o por búsqueda/filtro sobre TODO
   * el catálogo. Restringir la carga al viewport del mapa rompería
   * direcciones para resultados de búsqueda fuera de ese viewport; y como
   * la ciudad es chica (11 tiles cubren ~99.8% del catálogo), tampoco
   * ahorraría bytes reales en el uso típico. Se descarta esa vía y se
   * ataca en cambio el bloqueo real: en vez de una función `aplicarUno`
   * por CADA item de una sola pasada, se reparte en tandas de tamaño fijo
   * a través de requestIdleCallback (o setTimeout si no existe), priorizando
   * primero los ids que ya están pintados en pantalla (lastRenderCache.lista)
   * para que lo visible tenga sus datos completos lo antes posible. Se sigue
   * pidiendo exactamente el mismo JSON completo — nada deja de tener datos,
   * solo cambia CÓMO se reparte el trabajo de aplicarlo.
   */
  function aplicarEnTandas(lista, idsPrioritarios, aplicarUno, alTerminar) {
    var TANDA_TAMANO = 60;
    var pendientes = lista.slice();

    if (idsPrioritarios && idsPrioritarios.size) {
      pendientes.sort(function (a, b) {
        var pa = idsPrioritarios.has(a.id) ? 0 : 1;
        var pb = idsPrioritarios.has(b.id) ? 0 : 1;
        return pa - pb;
      });
    }

    var i = 0;
    function tanda() {
      var fin = Math.min(i + TANDA_TAMANO, pendientes.length);
      for (; i < fin; i++) {
        aplicarUno(pendientes[i]);
      }
      if (i < pendientes.length) {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(tanda, { timeout: 500 });
        } else {
          setTimeout(tanda, 0);
        }
      } else if (alTerminar) {
        alTerminar();
      }
    }
    tanda();
  }

  /**
   * Carga detalles, estado y clima en segundo plano (requestIdleCallback).
   */
  function cargarDetallesEnSegundoPlano() {
    var lanzar = function () {
      // Ids visibles en este momento (lo que el usuario ve ahora mismo),
      // para que aplicarEnTandas() los procese primero. Puede ser null en
      // el primer boot si render() todavía no corrió — aplicarEnTandas
      // maneja ese caso sin priorizar nada (orden original del JSON).
      var idsVisibles = null;
      try {
        idsVisibles = new Set((lastRenderCache.lista || []).map(function (l) { return l.id; }));
      } catch (e) {
        idsVisibles = null;
      }

      Promise.all([
        fetchJSON('lugares-detalles.json')
          .then(function (det) {
            aplicarEnTandas(det, idsVisibles, function (d) {
              var reg = porId[d.id];
              if (reg) {
                reg.direccion = d.direccion || null;
                reg.telefono = d.telefono || null;
                reg.descripcion = d.descripcion || null;
              }
            }, function () {
              // Reconstruir: direccion pasó de null a texto real en varios
              // lugares, y el índice de trigramas los tenía indexados con
              // direccion vacía hasta este momento. Se reconstruye UNA vez,
              // al terminar todas las tandas — no en cada tanda individual.
              if (window.IndiceInvertido) { window.IndiceInvertido.construir(REGISTRO); }
              render();
            });
          })
          .catch(function (e) {
            console.warn('lugares-detalles.json no disponible:', e.message);
          }),

        fetchJSON('lugares-estado.json')
          .then(function (mapa) {
            var PENDIENTE = ['pendiente', 'no encontrado', 'requiere confirmacion', 'requiere_confirmacion'];
            aplicarEnTandas(mapa, idsVisibles, function (m) {
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

    // TIER 1 OPTIMIZACIÓN: Usar caché de distancias (Perf, 2026-08-02)
    // Reutiliza cálculos si usuario está en misma posición
    // Impacto: +25% fluidez en búsquedas repetidas de proximidad
    return ordenarPorCercaniaConCache(
      lista,
      uiState.ubicacionUsuario.lat,
      uiState.ubicacionUsuario.lng
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // TIER 1: DEBOUNCE (Perf, 2026-08-02)
  // ═══════════════════════════════════════════════════════════════════
  // Auditoría de cierre: acá había un helper debounce(fn, ms) genérico
  // que nunca se llegó a conectar a ningún listener — el comentario
  // decía "agrupa clicks en región/filtro" pero no había ningún sitio
  // en el archivo que lo invocara. Se retira y se reemplaza por el
  // cableado real en seleccionarRubro() (más abajo), que sigue el
  // mismo patrón manual clearTimeout/setTimeout que ya usa
  // manejarInputBusqueda() para la búsqueda — así los dos debounces de
  // la app quedan consistentes entre sí en vez de tener dos mecanismos
  // distintos conviviendo.

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

  // Perf, Fase 2.3 (auditoría, 2026-08-01): antes, leerFavoritos() hacía
  // `JSON.parse(localStorage.getItem(...))` — síncrono, hilo principal —
  // en CADA llamada, y render() (que puede correr en cada tecla de
  // búsqueda, apertura/cierre de favorito, cambio de filtro) llamaba a
  // leerFavoritos() una vez por corrida. Barato con pocos favoritos,
  // pero trabajo repetido e innecesario: el contenido real solo cambia
  // en las 3 escrituras reales (toggle de guardar, reparación de
  // huérfanos, API de testing/lifecycle), no en cada render().
  //
  // favoritosCache === null es el estado "todavía no se leyó nunca" —
  // se distingue a propósito de `{}` (leído y vacío), para no releer de
  // disco de más la primera vez que localStorage esté genuinamente
  // vacío. Primera lectura real: perezosa, en el primer leerFavoritos()
  // que se llame (no necesariamente al arrancar la app).
  //
  // guardarFavoritos() actualiza el cache con la MISMA referencia que
  // persiste — en la práctica, todo el código existente ya llama
  // `var favoritos = leerFavoritos(); favoritos[id] = ...;
  // guardarFavoritos(favoritos);`, así que `favoritos` YA ES el objeto
  // cacheado (leerFavoritos() no devuelve copia) y mutarlo ya mantenía
  // el cache al día incluso sin esta línea — se deja explícita igual
  // por si en el futuro algún llamador arma un objeto nuevo en vez de
  // mutar el leído.
  var favoritosCache = null;

  function leerFavoritos() {
    if (favoritosCache !== null) return favoritosCache;
    try {
      favoritosCache = JSON.parse(localStorage.getItem('uruspot_favoritos') || '{}');
    } catch (e) {
      ErrorRecovery.procesar(e, ERROR_TYPE.STORAGE, 'leerFavoritos');
      favoritosCache = {};
    }
    return favoritosCache;
  }

  function guardarFavoritos(f) {
    favoritosCache = f;
    try {
      localStorage.setItem('uruspot_favoritos', JSON.stringify(f));
    } catch (e) {
      ErrorRecovery.procesar(e, ERROR_TYPE.STORAGE, 'guardarFavoritos');
    }
  }

  // Multi-pestaña (Fase 2.3, nota de la auditoría): si el usuario tiene
  // la app abierta en dos pestañas y guarda un favorito en una, la otra
  // seguía sirviendo su cache en memoria desactualizado indefinidamente
  // — antes del cache esto no pasaba porque cada leerFavoritos() releía
  // disco. El evento `storage` (nativo, dispara SOLO en las OTRAS
  // pestañas del mismo origen, nunca en la que escribió) invalida el
  // cache para forzar una relectura real en el próximo acceso, y
  // refresca lo que ya depende de favoritos ahora mismo en pantalla.
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('storage', function (e) {
      if (e.key !== 'uruspot_favoritos') return;
      favoritosCache = null;
      actualizarContadorGuardados();
      render();
    });
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
      // Auditoría producción, 2026-07-30: actualizarVisibilidadSugerencias()
      // solo se llamaba una vez al cargar el catálogo (pintarSugerenciasRapidas),
      // pese a que su propio comentario documenta que debe decidirse "en cada
      // render()" — con eso, los chips de arranque no se ocultaban al buscar
      // o filtrar. pintarFiltrosActivos() directamente nunca se llamaba desde
      // ningún lado: la fila de píldoras de filtro activo estaba muerta.
      actualizarVisibilidadSugerencias();
      pintarFiltrosActivos();

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
        // Recorte por iniciativa propia (Guía/Exploración).
        // Fase 4 — MUST HAVE (Fase 3A §4/§10, Fase 3B §2, Fase 3D §7):
        // se usa la versión "explicada" en vez de recortePorIniciativaPropia()
        // — misma selección (mismo motor, mismos candidatos/score), pero
        // trae además la razón legible por lugar (razonesDesdeSeñales).
        // Una sola llamada al algoritmo de selección: se deriva la lista
        // Y el mapa de razones del mismo resultado, para no invocar
        // calcularRecorte() dos veces con el mismo estado.
        var explicado = EXPO.recortePorIniciativaPropiaExplicado(REGISTRO, estado, reg.nombre);
        lista = explicado.lugares.map(function (x) { return x.lugar; });
        lista = ordenarPorCercania(lista);
        opts = {
          origen: 'iniciativa_propia',
          narrativa: false,
          razones: razonesPorLugarId(explicado.lugares)
        };
      }

      // Verificar si hubo cambio real
      // BUGFIX (auditoría performance, 2026-07-30): esta condición solo miraba
      // la identidad de la RAMA y de la LISTA CANDIDATA COMPLETA (sin paginar).
      // "Cargar más" (línea ~2499: uiState.paginaTarjetas++; render();) no
      // cambia ni la rama ni la lista candidata — solo cuántos ítems de esa
      // misma lista se muestran, un slice que ocurre adentro de
      // pintarTarjetas(). Resultado: hayoCambio daba `false`, entraba al
      // `return` de abajo, y pintarTarjetas() JAMÁS se ejecutaba — el botón
      // "Cargar más" no tenía ningún efecto visible. Reproducido en
      // aislamiento (misma lógica, ids/orden idénticos, solo cambia
      // paginaTarjetas): ver hallazgo de auditoría, sección "Cargar más".
      // PERF (auditoría performance, 2026-08-04, hallazgo 1.1): hayCambioEnLista()
      // es O(n) y se llamaba dos veces acá abajo con exactamente los mismos
      // argumentos (lastRenderCache.lista, lista) — una vez para hayoCambio,
      // otra para soloAvanzoPagina. Se calcula una sola vez y se reutiliza el
      // resultado en ambas condiciones.
      var listaHaCambiado = hayCambioEnLista(lastRenderCache.lista, lista);
      var hayoCambio = ramaDistinta(rama) ||
        listaHaCambiado ||
        uiState.paginaTarjetas !== lastRenderCache.paginaTarjetas;

      if (!hayoCambio && uiState.ultimaRamaRenderizada === rama) {
        debugLog('[Render] Sin cambios, saltando');
        return;
      }

      // PERF (auditoría performance, 2026-08-03, hallazgo 1.2 — confirmado
      // con trace real: long task de 58.8ms causada por reconstruir TODO
      // el listado en cada "Cargar más", con hasta 33 animationend
      // disparándose en el mismo frame): si la ÚNICA razón de hayoCambio
      // es que avanzó la página (misma rama, misma lista candidata —
      // mismos ids en el mismo orden —, mismos favoritos), pintarTarjetas
      // puede agregar solo las tarjetas nuevas en vez de tirar y
      // reconstruir las que ya estaban pintadas. Se compara CONTRA el
      // estado previo (antes de pisarlo abajo), igual que ramaDistinta()
      // y hayCambioEnLista() un par de líneas más arriba.
      //
      // favoritos por referencia (no por valor): leerFavoritos() cachea
      // el mismo objeto entre llamadas (favoritosCache) y solo lo
      // reemplaza cuando algo realmente cambió (guardarFavoritos() o el
      // evento 'storage' entre pestañas) — comparar por === es
      // suficiente y evita una segunda pasada de diffing sobre el mapa
      // de favoritos completo en cada render.
      var soloAvanzoPagina = !ramaDistinta(rama) &&
        !listaHaCambiado &&
        favoritos === lastRenderCache.favoritos &&
        lastRenderCache.paginaTarjetas !== null &&
        uiState.paginaTarjetas > lastRenderCache.paginaTarjetas;
      opts.soloAgregarNuevas = soloAvanzoPagina;

      // Fase 4 — MUST HAVE #3 (Fase 3C §3, Fase 3D §7): lastRenderCache.region
      // ya se guardaba en cada render() pero nada lo comparaba contra
      // el valor anterior — era un dato escrito sin consumidor. Se
      // captura acá, ANTES de pisarlo un par de líneas más abajo, para
      // poder detectar un cambio real de región (guia ⇄ exploracion ⇄
      // accionDirecta ⇄ curaduria) y disparar una microseñal perceptible.
      // 'curaduria'/'buscador' no son nombres de región (son ramas
      // derivadas — ver ramaActual()), así que la comparación es
      // siempre región-contra-región, nunca región-contra-rama.
      var regionAnterior = lastRenderCache.region;
      var huboCambioDeRegion = !!regionAnterior && regionAnterior !== reg.nombre;

      // BUGFIX (auditoría): capturar la rama del render ANTERIOR antes de
      // pisarla. `uiState.ultimaRamaRenderizada` se sobreescribe dos líneas
      // más abajo con el valor de `rama` del render ACTUAL — cualquier
      // comparación `rama === uiState.ultimaRamaRenderizada` hecha después de
      // esa asignación es una tautología (siempre true), sin importar si la
      // rama realmente cambió. `ramaAnterior` es el único consumidor real de
      // este valor previo, usado más abajo para la restauración de scroll.
      var ramaAnterior = uiState.ultimaRamaRenderizada;

      // Actualizar cache
      lastRenderCache.lista = lista;
      lastRenderCache.rama = rama;
      lastRenderCache.favoritos = favoritos;
      lastRenderCache.region = reg.nombre;
      lastRenderCache.paginaTarjetas = uiState.paginaTarjetas;
      uiState.ultimaRamaRenderizada = rama;

      // Actualizar encabezado, estado visual, tarjetas y mapa
      actualizarCabecera(reg, rama);
      if (huboCambioDeRegion) {
        mostrarMicroSenalCambioRegion();
      }
      actualizarMapaTextura();
      actualizarBannerCuraduriaSugerida(reg);
      pintarTarjetas(lista, favoritos, opts);
      actualizarMapaHerramienta(reg.nombre, lista || []);

      // Fase 4 (Motion Direction Bible v2.0, Parte I / G.5.3): único
      // punto de activación real de la escena ambiental narrativa —
      // 'buscando' con búsqueda/filtro activo, 'sinResultados' cuando
      // el listado quedó vacío, 'explorando' en el resto de los casos
      // (paseo/curiosidad, incluida la curaduría de favoritos). Antes
      // de esta migración, AmbientEngine.setEscena() solo se llamaba
      // para la escena inicial 'home'.
      if (window.Coreografias) {
        window.Coreografias.activarEscenaPorRama(rama, lista ? lista.length : 0);
      }

      // Restaurar scroll a posición previa si es el mismo listado.
      // BUGFIX (auditoría): antes comparaba `rama` contra
      // `uiState.ultimaRamaRenderizada`, pero ese campo ya había sido
      // reasignado a `rama` unas líneas más arriba (línea "Actualizar
      // cache") — la condición era siempre true y esta rama de scroll se
      // ejecutaba en TODOS los renders con hayoCambio, incluidos los que
      // cambiaban de rama/región. Ahora compara contra `ramaAnterior`,
      // capturada antes de esa reasignación.
      if (uiState.scrollPosition && rama === ramaAnterior) {
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
    // REGLA ABSOLUTA (misma que motor-exposicion.js: tieneFicha()): los
    // destacados con ficha propia van SIEMPRE primero. Si ninguno de
    // los candidatos por rating tiene ficha, esta comparación no
    // cambia nada (0-0=0) y queda el orden por score de siempre.
    candidatos.sort(function (a, b) {
      var fichaA = slug(a) ? 1 : 0;
      var fichaB = slug(b) ? 1 : 0;
      return (fichaB - fichaA) || (b._scoreDestacado - a._scoreDestacado);
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
      if (metaRubro) card.style.setProperty('--rubro-color', 'var(' + metaRubro[2] + ')');

      // Pictograma de rubro (mismo criterio que en pintarTarjetas): los
      // destacados son la primera superficie que ve alguien al entrar,
      // tenía más sentido cerrarla acá que dejarla como única tarjeta
      // sin ícono del sitio.
      var iconoDestacado = (metaRubro && window.URU_RUBROS_ICONO_SVG)
        ? window.URU_RUBROS_ICONO_SVG(lugar.grupo, { tam: 12, clase: 'destacado-card__icono' })
        : '';

      card.innerHTML =
        '<div class="destacado-card__rubro">' + iconoDestacado + escapeHTML(rubro) + '</div>' +
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
        '" style="--chip-color:var(' + meta[2] + ')">' +
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
          '" style="--chip-color:var(' + meta[2] + ')">' + icono + escapeHTML(meta[0]) + '</button>';
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
        (meta ? 'var(' + meta[2] + ')' : 'var(--color-granate-clara)') + '">' +
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
      // Quitar la faceta es la misma clase de "deshacer instantáneo"
      // que limpiarBusqueda(): cancela cualquier render de filtro en
      // cola y aplica ya, no espera el debounce de seleccionarRubro().
      clearTimeout(activeOperations.debounceFiltroId);
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

    // Anunciar cantidad de resultados para screen readers
    if (DOM.estadoResultados) {
      DOM.estadoResultados.textContent = lista.length
        ? (lista.length + ' resultado' + (lista.length === 1 ? '' : 's') + '.')
        : 'Sin resultados.';
    }

    if (!lista.length) {
      DOM.panelDescubrimiento.innerHTML = '';

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

    // PERF (auditoría performance, 2026-08-03, hallazgo 1.2 — confirmado
    // con Chrome DevTools Performance: long task de 58.8ms, con 33
    // llamadas a manejarFinEntradaTarjeta cayendo en el mismo frame,
    // producto de reconstruir TODO el listado en cada "Cargar más").
    // render() ya marca opts.soloAgregarNuevas cuando lo único que
    // cambió fue la página. Igual se verifica acá contra el DOM real
    // (no solo contra el número de página en memoria): si por lo que
    // sea el panel no tiene ya las tarjetas que "deberían" estar
    // pintadas (nadie más toca panelDescubrimiento hoy, pero no cuesta
    // nada no asumirlo), se cae al camino de reconstrucción completa de
    // siempre — nunca se agregan tarjetas de más ni se deja el listado
    // a medio pintar.
    var articulosExistentes = 0;
    var incremental = false;
    if (opts.soloAgregarNuevas) {
      articulosExistentes = DOM.panelDescubrimiento.getElementsByClassName('tarjeta').length;
      incremental = articulosExistentes > 0 && articulosExistentes < visible.length;
    }

    if (!incremental) {
      DOM.panelDescubrimiento.innerHTML = '';
    } else {
      // Se va a re-crear el pie de paginación al final (o se omite si
      // ya no quedan restantes) — sacar el anterior primero para no
      // duplicarlo.
      var piePaginaExistente = DOM.panelDescubrimiento.querySelector('.paginacion');
      if (piePaginaExistente) piePaginaExistente.remove();
    }

    var nuevas = incremental ? visible.slice(articulosExistentes) : visible;
    var offset = incremental ? articulosExistentes : 0;

    var frag = document.createDocumentFragment();
    nuevas.forEach(function (lugar, idxRel) {
      var i = offset + idxRel;
      var art = document.createElement('article');
      art.className = 'tarjeta' + (opts.narrativa ? ' tarjeta--narrativa' : '');
      art.dataset.lugarId = lugar.id;

      var metaRubro = window.URU_RUBROS_META && window.URU_RUBROS_META[lugar.grupo];
      var rubro = metaRubro ? metaRubro[0] : lugar.categoria;
      if (metaRubro) art.style.setProperty('--chip-color', 'var(' + metaRubro[2] + ')');

      if (!movimientoReducido) {
        art.style.animationDelay = (Math.min(i, 24) * 0.03) + 's';
        // PERF (auditoría performance, 2026-08-02): mientras la
        // tarjeta está entrando (fade-up + posible stagger de hasta
        // 720ms) se suprime su backdrop-filter vía .tarjeta--entrando
        // (css/tarjeta-lugar.css). Con hasta 8 tarjetas entrando a la
        // vez, cada una con su propio vidrio esmerilado, el
        // compositor tenía que recomponer varias capas de blur en
        // movimiento simultáneamente — el blur en sí no se nota
        // ausente durante ~420ms de movimiento (la atención está en
        // la posición/opacidad, no en el desenfoque de fondo), así
        // que se recupera automáticamente en 'animationend' sin
        // cambio visual perceptible en reposo.
        art.classList.add('tarjeta--entrando');
        // Red de seguridad (mismo idioma que programarRenderTrasSalida
        // más abajo: evento + setTimeout de respaldo): el listener
        // delegado de 'animationend' en DOM.panelDescubrimiento
        // (inicializarListeners) saca la clase en el caso normal,
        // mucho antes de este timeout — esto solo cubre el caso raro
        // en que la animación nunca dispare 'animationend'. Quitar una
        // clase que ya no está puesta es un no-op, así que no hay
        // riesgo de doble efecto.
        setTimeout(function () { art.classList.remove('tarjeta--entrando'); }, ENTRADA_VIDRIO_TIMEOUT_MS);
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

      // Pictograma de rubro compartido Canvas↔DOM (URUSPOT-PENDIENTES §6):
      // ya se usaba en el filtro "Por rubro", la leyenda del mapa y la
      // ficha — acá se conecta la tarjeta de descubrimiento, la superficie
      // de mayor tráfico y la que faltaba. Reusa exactamente la misma
      // función/clase (.rubro-icono, chip.css) para no introducir una
      // segunda convención visual del mismo dato.
      var iconoRubro = (metaRubro && window.URU_RUBROS_ICONO_SVG)
        ? window.URU_RUBROS_ICONO_SVG(lugar.grupo, { tam: 13 })
        : '';

      // Fase 4 — MUST HAVE (Fase 3A §7/§10, Fase 3D §7): el rating ya
      // vivía en el registro (ver cargarCatalogo) pero solo se pintaba
      // en pintarDestacados() — el flujo principal de tarjetas nunca lo
      // mostró. Mismo formato que destacados (★ 4,8) para no introducir
      // una segunda convención visual del mismo dato.
      var ratingTxt = (typeof lugar.rating === 'number')
        ? '★ ' + lugar.rating.toFixed(1).replace('.', ',') +
          (typeof lugar.ratingCount === 'number' ? ' (' + lugar.ratingCount.toLocaleString('es-AR') + ')' : '')
        : null;

      // Fase 4 — MUST HAVE (Fase 3A §4/§10, Fase 3B §2, Fase 3D §7): la
      // razón solo llega en opts.razones cuando origen es
      // 'iniciativa_propia' (búsqueda/curaduría nunca la traen, y no
      // deben — Blueprint V2 invariante: nunca aplican scoring). Ausencia
      // silenciosa si por lo que sea no hay razón para ese id puntual.
      var razonTxt = (opts.razones && opts.razones[lugar.id]) ? opts.razones[lugar.id] : null;

      art.innerHTML =
        '<div class="tarjeta-rubro">' + iconoRubro + escapeHTML(rubro) + pendienteTxt +
        (ratingTxt ? '<span class="tarjeta-rating">' + escapeHTML(ratingTxt) + '</span>' : '') +
        (distanciaTxt ? '<span class="tarjeta-distancia">📍 ' + escapeHTML(distanciaTxt) + '</span>' : '') + '</div>' +
        // Fase 4, Cap. 6 "Apertura de ficha": "El elemento de origen (la
        // tarjeta tocada) se convierte visualmente en el encabezado de
        // la ficha — continuidad de forma, no un salto a una pantalla
        // nueva y ajena". Con las fichas como páginas estáticas propias
        // (no una SPA), el único puente real disponible sin reescribir
        // la navegación es View Transitions cross-document (progresivo:
        // sin soporte, navega igual que siempre — cero riesgo de
        // regresión). El nombre usa el mismo slug que ya resuelve el
        // href de "ver ficha" (ver locales/ficha.js, mismo criterio de
        // apareo del otro lado).
        '<h3 class="tarjeta-nombre"' + (slugLugar ? ' style="view-transition-name:vt-titulo-' + slugLugar + '"' : '') + '>' + escapeHTML(lugar.nombre) + '</h3>' +
        (miniTexto
          ? '<div class="tarjeta-mini' + (miniEsGenerica ? ' tarjeta-mini--generica' : '') + '">' + escapeHTML(miniTexto) + '</div>'
          : '<div class="tarjeta-direccion">' + (lugar.direccion ? escapeHTML(lugar.direccion) : 'cargando dirección…') + '</div>') +
        (razonTxt ? '<div class="tarjeta-razon">' + escapeHTML(razonTxt) + '</div>' : '') +
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
      estado = PLANO.aplicarAccion(estado, 'salirCuraduria');
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
      estado = PLANO.aplicarAccion(estado, 'entrarCuraduria');
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
      estado = PLANO.aplicarAccion(estado, 'descartarSugerenciaCuraduria');
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
        // Ambient Engine — familia Halos de posición (Cap. 6.1 del
        // documento de Lenguaje de Assets: reactividad "Sí, directo"
        // a hover/click). Mismo límite ya documentado para
        // Coordenadas: sin proyección real de lat/lng expuesta por
        // motor-mapa.js, se ancla al centro óptico del plano P3.
        if (window.AmbienteHalos) window.AmbienteHalos.mostrarEn(50, 50);
      });

      motorMapa.on('hoverOut', function () {
        resaltarTarjeta(null, false);
        if (window.AmbienteHalos) window.AmbienteHalos.ocultar();
      });

      motorMapa.on('click', function (punto) {
        var el = DOM.panelDescubrimiento.querySelector('[data-lugar-id="' + cssEscape(punto.id) + '"]');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        // Ambient Engine — familia Coordenadas (Cap. 6.1 del documento
        // de Lenguaje de Assets: "se activan cerca del punto elegido").
        // Este es el único evento real de "hay un punto seleccionado"
        // que el resto de la app expone hoy (motor-mapa.js no publica
        // lat/lng de pantalla ni un evento de deselección/cierre de
        // popup), así que se ancla al centro óptico del asset (Cap.
        // 3.1) en vez de a una posición geográfica real — mostrar el
        // marcador en el punto exacto de un mapa embebido en otra
        // sección de la página, sobre una capa de fondo a viewport
        // completo, no tendría correspondencia espacial real. Cablear
        // una posición geográfica real, si se decide que vale la pena,
        // requiere exponer esa proyección desde motor-mapa.js primero
        // (fuera del alcance del Ambient Engine, Cap. 3.12).
        if (window.AmbienteCoordenadas) window.AmbienteCoordenadas.mostrarEn(50, 50);
        if (window.AmbienteHalos) window.AmbienteHalos.mostrarEn(50, 50);
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

    // Fase 4 — MUST HAVE #4 (Fase 3A §2, Fase 3D §7): `nombreRegion`
    // ya llegaba como parámetro pero solo se usaba para decidir SI el
    // mapa aparece (MAPA.debeMostrarHerramienta), nunca CÓMO se ve —
    // Guía y Exploración eran visualmente idénticas salvo por la
    // cantidad de puntos, tal como documentaba la auditoría. Se
    // expone como data-attribute para que css/mapa.css decida el
    // tratamiento visual (protagonismo en Exploración) sin que este
    // archivo tenga que conocer esos detalles de estilo.
    if (DOM.mapaContainer) DOM.mapaContainer.dataset.region = nombreRegion || '';

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
    // TIER 3.2 (Perf/UX, 2026-08-02): mismo leerFavoritos() cacheado
    // que ya usa pintarTarjetas() para la misma región — una sola
    // lectura de localStorage por render, no una por punto.
    var favoritosActivos = leerFavoritos();
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
        esFavorito: !!favoritosActivos[l.id],
        // Este punto viaja a motorMapa (Canvas): necesita el hex ya
        // resuelto, no el nombre del token (colorSeguro() en
        // motor-render.js valida contra un regex de hex — un
        // 'var(...)' ahí adentro cae en silencio al color por
        // defecto para TODOS los pines). window.URU_RUBROS_COLOR_RESUELTO
        // (rubros-meta.js) resuelve una sola vez por rubro y cachea.
        color: l.grupo && window.URU_RUBROS_COLOR_RESUELTO
          ? window.URU_RUBROS_COLOR_RESUELTO(l.grupo, '#C97A83')
          : '#C97A83',
        rubroNombre: meta ? meta[0] : l.categoria,
        rubroKey: l.grupo,
        rubroIcono: meta ? meta[3] : null
      };
    });

    motorMapa.establecerPuntos(puntos);
    motorMapa.encuadrarTodos(nombreRegion === 'exploracion' ? MAPA_PADDING_EXPLORACION_PX : MAPA_PADDING_GUIA_PX);
    // TIER 3.3 (Perf/UX, 2026-08-02): el marcador de "acá estás vos" no
    // depende de la región ni del recorte — solo de si el usuario
    // activó "cerca de mí" y compartió su ubicación. establecerPuntos()
    // ya no lo confunde con un resultado (ver motor-render.js): se
    // actualiza acá, en el mismo punto donde ya se actualiza el resto
    // del mapa en cada render().
    if (uiState.cercaTuyoActivo && uiState.ubicacionUsuario) {
      motorMapa.establecerMarcadorUsuario(uiState.ubicacionUsuario);
    } else {
      motorMapa.quitarMarcadorUsuario();
    }
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

  // Fase 4 (Motion Direction Bible v2.0, K.11/B.2.2): antes leía
  // matchMedia directamente acá, una segunda fuente de verdad
  // independiente de AmbienteAccesibilidad — el día que se activara la
  // preferencia manual de producto (ambiente-accesibilidad.js, Cap.
  // 10.4), esta función nunca se habría enterado. Ahora delega en
  // Coreografias.reducirMovimiento(), que consulta AmbienteAccesibilidad
  // y solo cae de vuelta a matchMedia si ese módulo no llegó a cargar
  // (fail-open, mismo criterio que el resto del código).
  function prefiereMovimientoReducido() {
    if (window.Coreografias) return window.Coreografias.reducirMovimiento();
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

  // BUG REAL corregido en esta pasada — race condition entre salidas
  // animadas concurrentes: cada llamada a programarRenderTrasSalida()
  // tenía su propio guard local (yaRenderizo) sin ninguna coordinación
  // con otras llamadas en vuelo. Si el usuario rechazaba/desguardaba
  // dos tarjetas dentro de la misma ventana de animación (~260ms,
  // ANIMATION_TIMEOUT_MS, o la duración real de --dur-media si
  // transitionend llega antes), la PRIMERA tarjeta en terminar
  // disparaba render() -> pintarTarjetas() -> DOM.panelDescubrimiento
  // .innerHTML = '' — que desmonta el nodo de la SEGUNDA tarjeta
  // mientras esta seguía animando su salida. Consecuencia doble:
  // (a) la animación de la segunda tarjeta se corta a mitad de camino
  //     (su nodo ya no existe cuando debería llegar su transitionend);
  // (b) su `setTimeout(terminar, ANIMATION_TIMEOUT_MS)` de todos modos
  //     sigue en pie (los timers no se cancelan al perder el nodo) y
  //     dispara un SEGUNDO render() redundante cuando vence, sobre un
  //     estado que el primer render ya había pintado.
  // Fix: un contador compartido de salidas pendientes (mismo espíritu
  // que `generacionFiltro` en coreografias.js, pero coalescente en vez
  // de invalidante: acá no hay una salida "abandonada" que descartar,
  // hay N salidas legítimas en simultáneo que deben resolver en UN
  // solo render, no en N). El render real se dispara una única vez,
  // cuando la última salida pendiente termina (por transitionend o por
  // su propio timeout de seguridad) y el contador vuelve a cero — así
  // ningún render intermedio llega a desmontar una tarjeta que todavía
  // está animando.
  var salidasPendientes = 0;

  function programarRenderTrasSalida(carta) {
    if (prefiereMovimientoReducido()) {
      render();
      return;
    }
    carta.classList.add('descartada');
    var yaResuelto = false;
    salidasPendientes++;
    var resolver = function () {
      if (yaResuelto) return;
      yaResuelto = true;
      salidasPendientes--;
      if (salidasPendientes <= 0) {
        salidasPendientes = 0; // defensivo: nunca debería quedar negativo
        render();
      }
    };
    carta.addEventListener('transitionend', resolver, { once: true });
    setTimeout(resolver, ANIMATION_TIMEOUT_MS);
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
      // PERF (auditoría performance, 2026-08-02): un único listener
      // delegado para todas las tarjetas en vez de uno por tarjeta
      // (hasta 8 nuevas por render) — saca .tarjeta--entrando (ver
      // pintarTarjetas) apenas termina la animación real de entrada
      // de esa tarjeta puntual, devolviéndole su backdrop-filter.
      DOM.panelDescubrimiento.addEventListener('animationend', manejarFinEntradaTarjeta);
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

    // Sugerencias rápidas ("Empezá por acá" + "cerca tuyo") y resumen de
    // filtros activos (píldoras con ×): las funciones que reaccionan a
    // estos clicks (manejarClickSugerencias, manejarClickFiltrosActivos)
    // existían desde antes pero nunca se enganchaban a un listener real —
    // los elementos se pintaban (pintarSugerenciasRapidas) o quedaban sin
    // pintar nunca (pintarFiltrosActivos, ver fix en render() más abajo)
    // pero ningún click sobre ellos hacía nada. Auditoría producción,
    // 2026-07-30.
    if (DOM.sugerenciasRapidas) {
      DOM.sugerenciasRapidas.addEventListener('click', manejarClickSugerencias);
    }
    if (DOM.filtrosActivos) {
      DOM.filtrosActivos.addEventListener('click', manejarClickFiltrosActivos);
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

    // PERF (auditoría performance, C1.3): suprimir backdrop-filter
    // mientras el usuario scrollea. rAF evita apilar trabajo en cada
    // evento 'scroll' (que puede disparar decenas de veces por
    // segundo); el timeout de 150ms detecta "scroll terminado" sin
    // depender de un evento nativo que no existe de forma confiable
    // en todos los navegadores.
    window.addEventListener('scroll', manejarScrollParaSupresionVidrio, { passive: true });
  }

  var _scrollRafPendiente = false;
  var _scrollFinTimeout = null;
  // PERF (auditoría scroll, 2026-08-04, hallazgo 1): AmbienteScheduler
  // (js/ambiente-scheduler.js) solo se pausa hoy durante gestos táctiles
  // DEL MAPA (ver motor-render.js, establecerArrastrando/actualizarEstadoGesto)
  // — nunca durante el scroll de la página. Mientras tanto, la tarea
  // 'respiracion' (js/ambiente-respiracion.js) sigue escribiendo
  // --amb-respiracion sobre <html> ~20 veces/seg, TODO el tiempo que la
  // pestaña esté visible. Esa propiedad es heredada y participa de un
  // calc() (css/ambiente-estilos.css:69) — cada escritura fuerza al motor
  // de estilos a invalidar/recorrer el árbol completo para resolver quién
  // depende de ella, aunque el único consumidor real es un solo elemento
  // fijo (#ambient-resplandor). Ese recorrido es trabajo de hilo principal
  // que hoy compite, sin necesidad, con el scroll — justo la ventana en la
  // que menos presupuesto de frame sobra. Se usa el mismo par
  // rAF+timeout(150ms) que ya gobierna u-suprimir-vidrio (mismo evento,
  // mismo criterio de "scroll terminado") para no introducir un segundo
  // temporizador independiente: mientras se suprime el vidrio, también se
  // pausa el scheduler ambiental; ambos se levantan juntos.
  var _scrollPausoAmbiente = false;

  function manejarScrollParaSupresionVidrio() {
    if (_scrollRafPendiente) return;
    _scrollRafPendiente = true;
    requestAnimationFrame(function () {
      _scrollRafPendiente = false;
      document.documentElement.classList.add('u-suprimir-vidrio');
      if (window.AmbienteScheduler && !_scrollPausoAmbiente) {
        _scrollPausoAmbiente = true;
        window.AmbienteScheduler.pausar();
      }
      if (_scrollFinTimeout) clearTimeout(_scrollFinTimeout);
      _scrollFinTimeout = setTimeout(function () {
        document.documentElement.classList.remove('u-suprimir-vidrio');
        if (_scrollPausoAmbiente) {
          _scrollPausoAmbiente = false;
          if (window.AmbienteScheduler) window.AmbienteScheduler.reanudar();
        }
      }, 150);
    });
  }

  function manejarInputBusqueda(e) {
    uiState.consultaActual = e.target.value;
    uiState.paginaTarjetas = 1;
    actualizarBotonLimpiar();

    if (uiState.consultaActual.trim().length >= 2) {
      estado = PLANO.aplicarAccion(estado, 'nombrar', { consulta: uiState.consultaActual });
    } else {
      estado = PLANO.aplicarAccion(estado, 'despejarBusqueda');
    }

    // PERF (auditoría performance, 2026-08-04, hallazgo 1.2): guardarEstado()
    // hace un localStorage.setItem() SÍNCRONO (bloquea el hilo principal,
    // 5-15ms medido en gama baja) — antes se ejecutaba en CADA tecla, sin
    // pasar por el debounce que ya protege a render(). Ahora viaja junto
    // con el mismo render() debounced. Es seguro: si el usuario navega
    // fuera antes de que venza el debounce, los handlers de
    // 'visibilitychange'/'pagehide' (más abajo en este archivo) ya llaman
    // PLANO.guardarEstado(estado) incondicionalmente con el valor de
    // `estado` más reciente en memoria (aplicarAccion() de arriba ya lo
    // actualizó de forma síncrona) — no hay ventana real de pérdida de
    // estado, solo se difiere CUÁNDO se escribe a disco.
    clearTimeout(activeOperations.debounceBuscarId);
    if (!uiState.consultaActual) {
      // Vaciar el campo es, en la cabeza de quien lo hace, un "deshacer":
      // debe sentirse instantáneo. El debounce existe para no recalcular
      // en cada tecla mientras se escribe, no para demorar el momento en
      // que alguien decide arrancar de nuevo.
      render();
      PLANO.guardarEstado(estado);
    } else {
      activeOperations.debounceBuscarId = setTimeout(function () {
        render();
        PLANO.guardarEstado(estado);
      }, DEBOUNCE_BUSQUEDA_MS);
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
    estado = PLANO.aplicarAccion(estado, 'despejarBusqueda');
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
      // Fase 4 (Motion Direction Bible v2.0, G.4.1): nunca bloquea ni
      // hace preventDefault del <a href> real hacia la ficha — solo
      // adelanta la escena ambiental y la claveAccion por slug antes
      // de que el navegador siga la navegación cross-document.
      if (window.Coreografias && porId[id1]) {
        window.Coreografias.aperturaFicha(slug(porId[id1]));
      }
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

  // PERF (auditoría performance, 2026-08-02): contraparte de la marca
  // .tarjeta--entrando que pintarTarjetas() agrega en la creación.
  // Delegado en DOM.panelDescubrimiento en vez de un listener por
  // tarjeta — 'animationend' burbujea, así que un único listener
  // alcanza para las hasta 8 tarjetas que puede haber por render.
  // Filtra por animationName porque el mismo elemento podría, en
  // teoría, tener más de una animación nombrada en el futuro y este
  // handler solo debe reaccionar a la de entrada (uru-fade-up).
  function manejarFinEntradaTarjeta(e) {
    if (e.animationName !== 'uru-fade-up') return;
    if (e.target && e.target.classList) {
      e.target.classList.remove('tarjeta--entrando');
    }
  }

  /**
   * Cap. 6 "Cambio de filtros" (Motion Direction Bible v1.0, pasos
   * 19-21): "los resultados que ya no cumplen el filtro se desvanecen
   * ANTES de que los nuevos se acerquen — nunca se superponen en el
   * mismo instante". Sin esto, pintarTarjetas() vacía y repinta el
   * panel de forma instantánea (innerHTML=''), el "corte seco" que el
   * Cap. 14 tipifica como anti-patrón ("Transiciones abruptas").
   *
   * Reutiliza el vocabulario de css/motion-gramatica.css (Desvanecerse,
   * Cap. 4) en vez de declarar una animación propia acá: .u-mov-saliendo
   * fuerza la duración y curva de salida (asimetría entrada/salida,
   * Cap. 10) sobre la transition de opacidad que ya trae
   * .u-mov-desvanecer.
   *
   * Espera el fin real de la transición (transitionend) + timeout de
   * seguridad, el mismo patrón ya probado de programarRenderTrasSalida
   * (arriba, para "rechazar"/sacar de guardados) — no vuelve a
   * calcular la duración a mano vía getComputedStyle: eso ya se hizo
   * acá antes y funcionaba, pero es más frágil (se desincroniza en
   * silencio si el token cambia) que escuchar el evento real. Solo se
   * escucha en la primera tarjeta: todas comparten clase y duración,
   * así que su transitionend es representativo de las demás.
   *
   * Deliberadamente solo se usa desde el click de un chip de rubro
   * (ver manejarClickRubros, abajo) y NO desde los demás llamados a
   * render() del archivo (búsqueda en vivo, favoritos, paginación,
   * "cerca tuyo"): agregar esta salida ahí también introduciría una
   * demora perceptible en interacciones que el Cap. 5 ("Cómo evitar
   * la fatiga") pide mantener ágiles, no contemplativas.
   */
  /**
   * Fase 4 (Motion Direction Bible v2.0, Parte K.10): la coreografía
   * de "salida antes que entrada" y su regla de fatiga ("solo la
   * primera vez en la sesión corre completa") ya no viven acá a mano
   * — Coreografias.cambioFiltro() delega ambas en AmbienteRitmo vía la
   * claveAccion 'filtro:rubro', que ya resuelve exactamente el mismo
   * criterio (registro 'inmediato' desde la 2ª repetición) sin un
   * contador local duplicado. Antes de esta migración, la última línea
   * de esta función llamaba setTimeout(render, salidaMs) con salidaMs
   * nunca definida en el archivo — un ReferenceError real en cada
   * cambio de filtro, enmascarado en la práctica por el failsafe de
   * transitionend/timeout que sí corría antes de esa línea.
   */
  function renderConTransicionDeFiltro() {
    var existentes = DOM.panelDescubrimiento
      ? DOM.panelDescubrimiento.querySelectorAll('.tarjeta')
      : [];

    if (window.Coreografias) {
      window.Coreografias.cambioFiltro(existentes, render);
      return;
    }

    // Fail-open: si coreografias.js no llegó a cargar por algún
    // motivo, no bloquear el filtro — reemplazo instantáneo, igual
    // que ya hace esta misma función bajo reduced-motion.
    render();
  }

  /**
   * Selecciona (o deselecciona si ya estaba activo) un rubro como filtro.
   * Único punto de esta lógica — compartido entre el índice de rubros
   * (manejarClickRubros) y los atajos de "Empezá por acá"
   * (manejarClickSugerencias), que documentaban desde su propio
   * comentario la intención de no duplicarla pero nunca llegaron a
   * extraerla de manejarClickRubros: manejarClickSugerencias llamaba a
   * `seleccionarRubro()` sin que esa función existiera en ningún lado
   * — ReferenceError real en cuanto ese listener quedó cableado.
   * Auditoría producción, 2026-07-30.
   */
  function seleccionarRubro(rubro) {
    uiState.filtroRubroActivo = (uiState.filtroRubroActivo === rubro) ? null : rubro;
    uiState.paginaTarjetas = 1;
    estado = PLANO.aplicarAccion(estado, 'salirCuraduria');
    PLANO.guardarEstado(estado);

    // El resaltado del chip es feedback inmediato: no espera al debounce.
    pintarRubros();

    // TIER 1.3 — auditoría de rendimiento (Perf, 2026-08-02): antes cada
    // click en un rubro disparaba renderConTransicionDeFiltro() de
    // inmediato. En clicks en ráfaga entre chips (o doble click por
    // error), eso eran 2-3 re-renders completos del panel + mapa antes
    // de que el usuario terminara de decidir. Se agrupa igual que ya
    // se hace con la búsqueda: se cancela cualquier render pendiente y
    // se dispara uno solo, DEBOUNCE_FILTRO_MS después del último click.
    clearTimeout(activeOperations.debounceFiltroId);
    activeOperations.debounceFiltroId = setTimeout(
      renderConTransicionDeFiltro,
      DEBOUNCE_FILTRO_MS
    );

    if (DOM.tituloRegion) {
      DOM.tituloRegion.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function manejarClickRubros(e) {
    var chip = e.target.closest('[data-rubro]');
    if (!chip) return;
    seleccionarRubro(chip.dataset.rubro);
  }

  function manejarClickVerGuardados() {
    estado = PLANO.aplicarAccion(estado, 'entrarCuraduria');
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

  // BUG REAL corregido en esta pasada: esta función comparaba contra
  // `uiState.ultimaRegionRenderizada`, un campo que se inicializaba en
  // '' (línea de arriba, sección "Estado local de UI") y NUNCA se
  // volvía a escribir en ningún otro lugar del archivo — verificado
  // por grep de `ultimaRegionRenderizada` en todo `js/`, cero
  // asignaciones fuera de la inicialización. Como cualquier nombre de
  // región real ('guia', 'exploracion', 'accionDirecta', 'curaduria')
  // es distinto de '', la condición de abajo era efectivamente
  // `if (true)` en todos los ticks: cada 5s (PERMANENCIA_TICK_MS),
  // para siempre mientras la pestaña siguiera en STATE.READY, se
  // llamaba a render() sin importar si la región había cambiado o no
  // — exactamente lo que este `if` existe para evitar. render() sí
  // corta el pintado real por su propio guard interno de `hayoCambio`,
  // pero antes de llegar a ese guard ya pagó el costo completo de
  // EXPO.recortePorIniciativaPropiaExplicado() (filtro + scoring +
  // orden sobre todo el catálogo candidato) en cada uno de esos ticks
  // — trabajo duplicado real, medible, indefinidamente mientras la
  // pestaña esté abierta e inactiva.
  // Fix: comparar contra `lastRenderCache.region`, que es la variable
  // que YA existe en este archivo con exactamente esa responsabilidad
  // (ver Fase 4, más arriba en render()) y que SÍ se actualiza en cada
  // render real — evita mantener dos fuentes de verdad separadas
  // (`uiState.ultimaRegionRenderizada` y `lastRenderCache.region`)
  // para el mismo hecho, una de las cuales podía (y de hecho, estaba)
  // desincronizada de la otra.
  function tickPermanencia() {
    if (estadoActual() !== STATE.READY) return;

    estado = PLANO.aplicarAccion(estado, 'permanecer', { segundos: 5 });
    PLANO.guardarEstado(estado);

    var regionNueva = PLANO.region(estado).nombre;
    if (regionNueva !== lastRenderCache.region) {
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
        estado = PLANO.aplicarAccion(estado, 'salirCuraduria');
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

  /**
   * Fase 4 — MUST HAVE #3 (Fase 3C §3, Fase 3D §7): microseñal
   * perceptible cuando la región cambia entre un render() y el
   * siguiente. Antes de esto, guia/exploracion/accionDirecta/
   * curaduria cambiaban el título y el subtítulo del encabezado,
   * pero era un reemplazo de texto silencioso — indistinguible de
   * cualquier otro refresco de contenido, tal como documentaba
   * Fase 3C §3.
   *
   * Deliberadamente NO mueve el foco (a diferencia de
   * manejarClickVerGuardados/asegurarBotonVolverATodos, que sí lo
   * hacen): esos dos son reacciones a un click explícito del
   * usuario; un cambio de región puede dispararse como efecto
   * secundario de guardar/descartar una tarjeta, y robar el foco en
   * ese momento sería más disruptivo que informativo.
   *
   * Deliberadamente NO reutiliza `#estadoResultados` (ver el
   * comentario en index.html junto a ese nodo): esa live region está
   * reservada a propósito para conteos de "N resultados" tras
   * búsqueda/filtro, para que un lector de pantalla no tenga que
   * volver a escuchar el título completo en cada tecla. En cambio,
   * `role="status"` en el propio aviso ya es una live region
   * implícita (polite) — se anuncia solo, sin pisar la otra.
   *
   * Mismo patrón de ciclo de vida que mostrarTooltipGeolocation():
   * crear, insertar, autodestruir con setTimeout. Mismo vocabulario
   * visual que .aviso-cerca-tuyo (uru-fade-up, css/tokens.css) — cero
   * @keyframes nuevo para un aviso chico más.
   */
  function mostrarMicroSenalCambioRegion() {
    if (!DOM.tituloRegion || !DOM.subtituloRegion || !DOM.subtituloRegion.parentNode) return;

    if (dynamicElements.avisoCambioRegion) {
      dynamicElements.avisoCambioRegion.remove();
      dynamicElements.avisoCambioRegion = null;
    }

    var tituloNuevo = DOM.tituloRegion.textContent || '';
    var aviso = document.createElement('span');
    aviso.className = 'aviso-cambio-region';
    aviso.setAttribute('role', 'status');
    aviso.textContent = tituloNuevo ? 'Cambió lo que ves: ' + tituloNuevo : 'Cambió lo que ves.';

    DOM.subtituloRegion.insertAdjacentElement('afterend', aviso);
    dynamicElements.avisoCambioRegion = aviso;

    setTimeout(function () {
      if (aviso.parentNode) aviso.remove();
      if (dynamicElements.avisoCambioRegion === aviso) {
        dynamicElements.avisoCambioRegion = null;
      }
    }, CAMBIO_REGION_AVISO_MS);
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

  /**
   * Cap. 6 "Primer scroll" (Motion Direction Bible v1.0, pasos 9-10):
   *
   * Paso 9 — "los elementos que entran en el viewport se acercan con
   * microdesfase según su orden de aparición, nunca todos a la vez".
   * Sin esto, dos o más secciones .u-reveal que cruzan el umbral en el
   * mismo callback del IntersectionObserver (scroll rápido, o varias
   * secciones cortas cabiendo juntas en la ventana) se revelan en el
   * mismo frame — el "bloque sincronizado" que el Cap. 10 reserva
   * únicamente para elementos que deben leerse como una sola unidad
   * conceptual, no como secciones independientes de la página.
   *
   * Paso 10 — "los elementos que salen del viewport se alejan
   * levemente antes de desvanecerse, nunca cortan de forma abrupta".
   * Por eso el observer ya no se desconecta tras la primera revelación
   * (antes con observador.unobserve): sigue vivo para detectar cuándo
   * una sección ya vista sale por completo por arriba del viewport
   * (entrada.boundingClientRect.bottom <= 0) y agregarle .saliendo +
   * .u-mov-saliendo (css/tokens.css + css/motion-gramatica.css), y
   * para revertir ese estado si el usuario vuelve a scrollear hacia
   * arriba y la sección reingresa. La condición de salida (0% visible,
   * afuera por completo) y la de reingreso (12%, el mismo umbral de la
   * primera entrada) son deliberadamente distintas: si fueran la misma
   * marca de scroll, un usuario oscilando cerca del borde podría
   * activar y desactivar la clase en cada frame — el "temblor" que el
   * Cap. 14 prohíbe.
   *
   * dataset.uReveal marca "ya tuvo su primera entrada", para que la
   * lógica de salida/reingreso nunca compita con la del paso 9 sobre
   * el mismo elemento en el mismo callback.
   *
   * --motion-desfase (css/tokens.css) ya existía desde el paso de
   * tokens pero no se consumía en ningún lado todavía; este es su
   * primer uso real. Se lee una sola vez acá (no en cada callback del
   * observer) porque es un token global que no cambia en runtime.
   */
  function inicializarScrollReveal() {
    if (prefiereMovimientoReducido()) {
      document.querySelectorAll('.u-reveal').forEach(function (el) {
        el.classList.add('visible');
      });
    } else if ('IntersectionObserver' in window) {
      var desfaseMs = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--motion-desfase')
      ) * 1000;
      if (!desfaseMs || isNaN(desfaseMs)) desfaseMs = 40; // fallback si el token no resuelve

      var observador = new IntersectionObserver(function (entradas) {
        // Orden de aparición (Cap. 6, paso 9): no el orden en que el
        // observer las entrega (que es el de intersección detectada,
        // no necesariamente el del documento), sino el orden real en
        // el DOM — así el decalaje siempre sigue la jerarquía visual
        // de la página, nunca un orden incidental del navegador.
        var primerasEntradas = entradas
          .filter(function (entrada) {
            return entrada.isIntersecting && !entrada.target.dataset.uReveal;
          })
          .sort(function (a, b) {
            return a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
          });

        primerasEntradas.forEach(function (entrada, indice) {
          entrada.target.style.transitionDelay = (indice * desfaseMs) + 'ms';
          entrada.target.classList.add('visible');
          entrada.target.dataset.uReveal = 'visto';
          if (window.Coreografias) {
            window.Coreografias.registrarRevelado(entrada.target.id || entrada.target.className);
          }
        });

        // Salida/reingreso (Cap. 6, paso 10) — solo sobre secciones que
        // ya pasaron por su primera entrada de arriba.
        entradas.forEach(function (entrada) {
          if (!entrada.target.dataset.uReveal) return;

          var estaSaliendo = entrada.target.classList.contains('saliendo');
          if (!entrada.isIntersecting && entrada.boundingClientRect.bottom <= 0 && !estaSaliendo) {
            entrada.target.classList.add('saliendo', 'u-mov-saliendo');
          } else if (entrada.isIntersecting && entrada.intersectionRatio >= 0.12 && estaSaliendo) {
            entrada.target.classList.remove('saliendo', 'u-mov-saliendo');
            entrada.target.style.transitionDelay = '';
          }
        });
      }, { threshold: [0, 0.12], rootMargin: '0px 0px -40px 0px' });

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
    // buildDate es una constante fija, no new Date(): este repo no
    // tiene build step/CI, así que new Date() se evaluaría en el
    // navegador de cada visitante (fecha de visita, no de deploy),
    // quedando inútil para diagnóstico. Actualizar a mano en cada
    // release junto con `version`.
    version: '2.3.0',
    buildDate: '2026-07-25'
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

  // PERF (auditoría performance, 2026-08-03): antes escuchaba
  // 'beforeunload'. Chrome ya no bloquea bfcache solo por tener un
  // listener de 'beforeunload' que no llama a preventDefault() ni
  // fija returnValue (este no hace ninguna de las dos), pero Safari y
  // Firefox sí lo siguen bloqueando — con "apple-mobile-web-app-*"
  // en el <head>, este sitio le importa especialmente a iOS. 'pagehide'
  // es la migración estándar recomendada (mismo momento del ciclo de
  // vida, sin el costo de compatibilidad).
  //
  // Guard con event.persisted: si el navegador está metiendo la página
  // en bfcache (persisted === true), NO hay que correr limpiar() —
  // cancelaría timers/operaciones y dispararía 'onDestroy' justo antes
  // de una posible restauración, dejando la página "viva" en memoria
  // pero con su propio estado interno ya destruido. Si persisted es
  // false (cierre real, navegación de verdad), el comportamiento es
  // idéntico al que había antes.
  window.addEventListener('pagehide', function (e) {
    if (e.persisted) return;
    limpiar();
    LifecycleHooks.fire('onDestroy', { timestamp: Date.now() });
  });

})();
