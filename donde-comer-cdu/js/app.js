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

// FASE 1 — cableado a módulos ES6 (constants.js, pure-utils.js,
// event-bus.js). Estos imports tienen que vivir acá, fuera de la IIFE:
// las declaraciones `import` de un ES module solo son válidas en el
// nivel superior del archivo, nunca dentro de una función. Esto exige
// que index.html cargue este archivo como `<script type="module">`
// (ver comentario junto a ese <script>) — un módulo ES, a diferencia
// de un script clásico, no puede tener imports si no lo es.
import {
  CIUDAD, TARJETAS_POR_PAGINA, DEBOUNCE_BUSQUEDA_MS, DEBOUNCE_FILTRO_MS,
  PERMANENCIA_TICK_MS, FOCUS_TRAP_DELAY_MS, ANIMATION_TIMEOUT_MS,
  GEOLOCATION_TIMEOUT_MS, ENTRADA_VIDRIO_TIMEOUT_MS, MAPA_PADDING_GUIA_PX,
  MAPA_PADDING_EXPLORACION_PX, GEOLOCATION_MAX_AGE_MS, TOOLTIP_TIMEOUT_MS,
  CAMBIO_REGION_AVISO_MS, NETWORK_RETRY_ATTEMPTS, NETWORK_RETRY_DELAY_MS,
  UMBRAL_RATING, UMBRAL_RESEÑAS, MAX_DESTACADOS, MIN_PARA_MOSTRAR_DESTACADOS,
  CLIMA_CONTEXTO_URL, CLIMA_CONTEXTO_TIMEOUT_MS, CLIMA_CONTEXTO_INTERVALO_MS,
  ROLES_NOMBRES, RAMA_CURADURIA, RAMA_BUSCADOR, STATE, ERROR_TYPE,
  VISUAL_STATE, debugLog
} from './constants.js';
import { calcularDistancia, razonesPorLugarId, hayCambioEnLista } from './pure-utils.js';
import { appEventBus } from './event-bus.js';
import { ordenarPorCercaniaConCache } from './cache.js';
import {
  leerFavoritos as _leerFavoritos,
  guardarFavoritos as _guardarFavoritos,
  invalidarCacheFavoritos
} from './favorites.js';
import {
  puedeTransicionar,
  transicionarEstado,
  estadoActual,
  obtenerUltimoCambioDeEstado,
  obtenerLogCambiosEstado,
  vaciarLog as _vaciarLogEstado,
  forzarEstado
} from './state-manager.js';
import {
  obtenerRegistro,
  obtenerPorId,
  establecerCatalogo
} from './catalog.js';
import { crearUIState } from './ui-state.js';
import { crearDataLoader } from './data-loader.js';
import { crearClimateContext } from './climate-context.js';
import { solicitarUbicacion, geolocationDisponible } from './geolocation.js';
import { crearErrorRecovery } from './error-recovery.js';
import { crearRenderEngine } from './render-engine.js';
import { crearDomPainter } from './dom-painter.js';

(function () {
  'use strict';

  // ───────────────────────────────────────────────────────────────────
  // 1. CONFIGURACIÓN Y CONSTANTES
  // ───────────────────────────────────────────────────────────────────

  // FASE 1 — CIUDAD, TARJETAS_POR_PAGINA, todos los *_MS/*_PX, UMBRAL_*,
  // MAX_DESTACADOS, MIN_PARA_MOSTRAR_DESTACADOS, CLIMA_CONTEXTO_*,
  // ROLES_NOMBRES, RAMA_*, STATE, ERROR_TYPE, ERROR_TYPES_FATALES,
  // VISUAL_STATE y debugLog() ahora vienen del import de constants.js
  // (ver arriba, fuera de la IIFE) — se retiran las var/function
  // locales para no tener dos fuentes de verdad. El resto de los
  // comentarios de auditoría de esta sección se conserva en
  // constants.js, junto a cada constante.
  // FASE 3 (paso 1, Plan Maestro de Modularización, 2026-08-06):
  // climaContextoCache ahora vive dentro de ClimateContext
  // (climate-context.js, ver import arriba) — mismo shape cacheado
  // ({ weather_code, temperature_2m, precipitation } | null), acá solo
  // queda la instancia con las constantes de config de siempre.
  var ClimateContext = crearClimateContext({
    url: CLIMA_CONTEXTO_URL,
    timeoutMs: CLIMA_CONTEXTO_TIMEOUT_MS
  });

  // Módulos inyectados globalmente (verificados al init)
  var PLANO = null;
  var EXPO = null;
  var MAPA = null;

  // ───────────────────────────────────────────────────────────────────
  // 2. CACHE Y ESTADO GLOBAL
  // ───────────────────────────────────────────────────────────────────

  // FASE 2 (Plan Maestro de Modularización, 2026-08-06): REGISTRO y
  // porId ahora viven en catalog.js (ver import arriba) — mismo
  // comportamiento, cero cambios funcionales.

  // ═══════════════════════════════════════════════════════════════════
  // TIER 1: CACHÉ DE DISTANCIAS Y SLUG (Perf, 2026-08-02)
  // ═══════════════════════════════════════════════════════════════════
  // Optimización quirúrgica: evita recalcular distancias y slugs en cada
  // búsqueda. Impacto: +25% (distancia) + 12% (slug) fluidez percibida.
  // Auditoría: confirmado que ordenarPorCercania() y slug() se llaman N
  // veces por sesión con los mismos datos — caché da hit 90%+ del tiempo.

  // TIER 1.2 — auditoría de cierre (Perf, 2026-08-02): acá existía un
  // SLUG_CACHE que nunca se conectaba a nada (variable muerta). Se
  // retira en vez de cablearla: slug() (más abajo) es un lookup directo
  // en el objeto estático URU_LOCALES_SLUGS, ya O(1) — no hay parsing
  // ni cómputo repetido que cachear. Envolver un lookup de objeto en
  // una capa de caché no ahorra trabajo, solo lo agrega (hash de clave
  // + escritura en el mapa de caché) sin beneficio medible.

  // FASE 1: calcularDistancia() ahora viene del import de pure-utils.js
  // (ver arriba, fuera de la IIFE).

  // FASE 2 (Plan Maestro de Modularización, 2026-08-06): DISTANCIA_CACHE
  // y ordenarPorCercaniaConCache() ahora viven en cache.js (ver import
  // arriba) — mismo comportamiento, cero cambios funcionales.

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
  // FASE 2 (paso 5, Plan Maestro de Modularización, 2026-08-06):
  // uiState ahora se construye en ui-state.js (ver import arriba) —
  // mismas propiedades y valores iniciales, ahora devueltas por un
  // Proxy que emite 'uiStateChanged' en cada asignación. app.js sigue
  // leyendo/escribiendo uiState.x exactamente igual que antes (ver
  // comentario de cabecera en ui-state.js para el detalle).
  var uiState = crearUIState();

  // Timers y operaciones async activas
  var activeOperations = {
    debounceBuscarId: null,
    debounceFiltroId: null,
    permanenciaTimer: null,
    climaContextoTimer: null,
    focusTrapTimer: null,
    geolocationRequest: null,
    pendingFetches: []
  };

  // Motor de mapa (inicializado perezosamente)
  var motorMapa = null;

  // FASE 2 (Plan Maestro de Modularización, 2026-08-06): currentState,
  // lastStateChange y stateChangeLog, junto con transicionarEstado(),
  // estadoActual() y puedeTransicionar() (antes sección 3, más abajo),
  // ahora viven en state-manager.js (ver import arriba) — mismo
  // comportamiento, cero cambios funcionales.

  // FASE 4a (Plan Maestro de Modularización, 2026-08-06): la cache de
  // renderizado anterior (antes `lastRenderCache`, con reasignación
  // completa en limpiar()) ahora es estado privado de RenderEngine
  // (render-engine.js, ver import arriba e instancia RenderEngine más
  // abajo, junto a render()) — se expone vía RenderEngine.obtenerCache()
  // para los mismos tres consumidores que ya la leían directo
  // (cargarDetallesEnSegundoPlano, tickPermanencia, AppTelemetria), y
  // se resetea vía RenderEngine.reiniciarCache() en vez de la
  // reasignación directa que hacía limpiar().

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
  // 3. (vacía) — máquina de estados movida a state-manager.js en
  //    Fase 2 del Plan Maestro de Modularización (2026-08-06); ver
  //    import arriba (transicionarEstado, estadoActual,
  //    puedeTransicionar, obtenerUltimoCambioDeEstado,
  //    obtenerLogCambiosEstado, vaciarLog, forzarEstado).
  // ───────────────────────────────────────────────────────────────────

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

  // FASE 1: razonesPorLugarId() y hayCambioEnLista() ahora vienen del
  // import de pure-utils.js (ver arriba, fuera de la IIFE).

  // Fase de deuda técnica (auditoría producción, 2026-07-30): se elimina
  // calcularDiferenciasRender() — motor de diff incremental (reconciliación
  // de itemsAgregados/itemsRemovidos/itemsActualizados) escrito pero jamás
  // invocado ni exportado; render() usa hayCambioEnLista() (hash de IDs) como
  // único chequeo real de cambio. Confirmado sin llamadores vía análisis
  // estático (0 referencias fuera de su propia definición) antes de borrar.


  // ───────────────────────────────────────────────────────────────────
  // 6. MANEJO DE ERRORES Y RECUPERACIÓN
  // ───────────────────────────────────────────────────────────────────

  // FASE 3 (paso 3, Plan Maestro de Modularización, 2026-08-06):
  // ErrorRecovery ahora se arma en error-recovery.js (ver import
  // arriba) — misma lógica, dependencias inyectadas explícitas.
  // pintarEsqueleto se pasa como thunk (function(){ pintarEsqueleto();
  // }) y no por valor: en este punto del archivo todavía es
  // `undefined` (var declarada más abajo, ver comentario de cabecera
  // en error-recovery.js) — el thunk preserva el mismo binding tardío
  // que tenía el closure original, resuelto recién cuando
  // recuperarDeCarguaCatalogo() se llama de verdad (mucho después).
  var ErrorRecovery = crearErrorRecovery({
    mostrarEstadoError: mostrarEstadoError,
    pintarEsqueleto: function () { pintarEsqueleto(); },
    cargarCatalogo: cargarCatalogo
  });

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
        if (obtenerRegistro().length > 0 && !estado) {
          errores.push('estado es null pero REGISTRO tiene ' + obtenerRegistro().length + ' items');
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
          if (favoritosActuales[id] && !obtenerPorId(id)) {
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

      // FIX (auditoría, hallazgo P0-1, 2026-08-05): antes esto no miraba
      // el retorno de inicializarEstado(). Si fallaba (p. ej. localStorage
      // no disponible o estado corrupto no cubierto por migrarEstado()),
      // `estado` quedaba en null, ErrorRecovery.procesar ya había hecho
      // transicionarEstado(STATE.ERROR, ...) puesto que STATE_INVALID es
      // fatal — pero el flujo seguía de largo hasta el
      // transicionarEstado(STATE.LOADING_CATALOG, ...) de más abajo, que
      // pisaba ese STATE.ERROR sin condición. El catálogo terminaba
      // cargando igual con `estado` null, y el TypeError real recién
      // aparecía minutos después, sin capturar, dentro de un listener de
      // input (ver despejarBusqueda/nombrar en motor-plano.js — su propio
      // comentario ya admitía esta causa raíz sin resolverla). Frenar acá
      // evita todo eso: el estado de error fatal que ErrorRecovery ya
      // mostró queda como la última palabra, no una que el código de abajo
      // sobreescribe dos líneas después.
      if (!inicializarEstado()) {
        return;
      }

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
      inicializarContextoClima();

      // Perf, Fase 2.1: el Ambient Engine ya no es <script defer> estático
      // en el documento — se agenda acá (idle) para no competir con la
      // carga del catálogo real, ver cargarMotorAmbientalDiferido() más
      // abajo. No depende de STATE.LOADING_CATALOG ni de cargarCatalogo():
      // es decorativo, no de negocio.
      cargarMotorAmbientalDiferido();

      // FIX Fase 5: promueve css/contenido-editorial.css de preload a
      // stylesheet activa — ver promoverCssEditorialDiferido() más abajo
      // para el bug real que esto corrige (afectaba a todo usuario con JS).
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
    _vaciarLogEstado();
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
  // 11. CARGA DE DATOS CON RESILIENCIA
  // ───────────────────────────────────────────────────────────────────

  // FASE 2 (paso 6, Plan Maestro de Modularización, 2026-08-06):
  // fetchJSON ahora viene de data-loader.js (ver import arriba) —
  // misma firma (url, intentosRestantes), mismos reintentos con
  // AbortController y tracking en OperationManager, inyectado acá
  // como dependencia explícita en vez de global (ver comentario de
  // cabecera en data-loader.js para el porqué).
  var fetchJSON = crearDataLoader({
    operationManager: OperationManager,
    retryAttempts: NETWORK_RETRY_ATTEMPTS,
    retryDelayMs: NETWORK_RETRY_DELAY_MS
  }).fetchJSON;

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

        var nuevoRegistro = core.map(function (l) {
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
          return reg;
        });
        // FASE 2 (Plan Maestro de Modularización, 2026-08-06):
        // establecerCatalogo() (catalog.js) reemplaza la asignación
        // directa a REGISTRO y el llenado de porId dentro del .map() de
        // arriba — mismo resultado final (REGISTRO con la lista,
        // porId[id] apuntando a cada registro), ahora en dos pasos en
        // vez de uno.
        establecerCatalogo(nuevoRegistro);

        // Índice invertido de búsqueda (perf, 2026-07-31): construido acá,
        // después de que REGISTRO ya tiene el catálogo real — construirlo
        // antes (como hacía la versión anterior) indexaba el REGISTRO
        // vacío/de la carga previa. Se reconstruye una segunda vez en
        // cargarDetallesEnSegundoPlano cuando `direccion` deja de ser
        // null, porque hay lugares que solo matchean por dirección
        // (rango 5 de rangoDeCoincidencia en motor-exposicion.js).
        if (window.IndiceInvertido) { window.IndiceInvertido.construir(obtenerRegistro()); }

        transicionarEstado(STATE.READY, 'catalogo_cargado');
        if (window.AmbientEngine) window.AmbientEngine.finalizarCarga(true);

        // Parallelizar carga de detalles (segundo plano)
        cargarDetallesEnSegundoPlano();
        DomPainter.pintarRubros();
        DomPainter.pintarStatsRapidas();
        DomPainter.pintarDestacados();
        DomPainter.pintarSugerenciasRapidas();
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
   * FIX (auditoría, hallazgo Fase 5, 2026-08-05): index.html precarga
   * css/contenido-editorial.css con `<link rel="preload" as="style">` y
   * documenta en un comentario que `js/lazy-css-editorial.js` es quien la
   * promueve a hoja activa. Ese archivo nunca llegó a existir (o se borró
   * como "código muerto huérfano" en una limpieza anterior sin notar que
   * era el único consumidor real del preload) — resultado: para CUALQUIER
   * visitante con JavaScript activado, un preload sin promoción a
   * stylesheet no aplica ningún estilo. Las 8 secciones editoriales que
   * dependen de esta hoja (Sobre la ciudad, Metodología, Guía de rubros,
   * Radiografía del padrón, Guía práctica, Glosario, Hoja de ruta,
   * Accesibilidad) se venían viendo sin grilla, sin tarjeta y sin color
   * de rubro para todo el tráfico real — solo el <noscript> (que promueve
   * la hoja a `rel="stylesheet"` directamente) cubría el caso, y ese caso
   * es una fracción mínima de las visitas.
   *
   * Se repone acá, respetando la CSP (`script-src 'self'`, sin
   * `unsafe-inline`): nada de `onload="..."` inline en el HTML, todo vive
   * en este archivo que ya está permitido. Mismo criterio de "decoración
   * no bloquea negocio" que cargarMotorAmbientalDiferido() de arriba: se
   * promueve recién en requestIdleCallback, después de que arrancó la
   * carga del catálogo, para no competir con lo que sí es above-the-fold.
   */
  var cssEditorialPromovido = false;
  function promoverCssEditorialDiferido() {
    if (cssEditorialPromovido) return; // idempotente
    cssEditorialPromovido = true;

    var promover = function () {
      var link = document.querySelector('link[rel="preload"][as="style"][href="css/contenido-editorial.css"]');
      if (!link) return; // ya promovido por el <noscript>, o el <link> no está — no-op seguro
      link.rel = 'stylesheet';
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(promover, { timeout: 1200 });
    } else {
      setTimeout(promover, 100);
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
        idsVisibles = new Set((RenderEngine.obtenerCache().lista || []).map(function (l) { return l.id; }));
      } catch (e) {
        idsVisibles = null;
      }

      Promise.all([
        fetchJSON('lugares-detalles.json')
          .then(function (det) {
            aplicarEnTandas(det, idsVisibles, function (d) {
              var reg = obtenerPorId(d.id);
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
              if (window.IndiceInvertido) { window.IndiceInvertido.construir(obtenerRegistro()); }
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
              var reg = obtenerPorId(m.id);
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
    var lista = EXPO.resultadosPorAccionExplicita(obtenerRegistro(), uiState.consultaActual);
    if (uiState.filtroRubroActivo) {
      lista = lista.filter(function (l) { return l.grupo === uiState.filtroRubroActivo; });
    }
    return lista;
  }

  /**
   * Verifica si hay búsqueda o filtro activo. Se mantiene tal cual
   * para sus consumidores existentes (visibilidad de sugerencias
   * rápidas, aria-expanded del buscador, copy del subtítulo cuando
   * se está viendo el catálogo completo) — ninguno de esos necesita
   * distinguir búsqueda de filtro de rubro. La única excepción es
   * ramaActual() (ver hayBusquedaTexto() y la nota ahí abajo).
   */
  function hayBusquedaOFiltro() {
    return hayBusquedaTexto() || !!uiState.filtroRubroActivo;
  }

  /**
   * Fase 4 — Journey/UX (hallazgo "el filtro de rubro abandona el
   * recorte curado", URUSPOT-PENDIENTES-VERIFICADO-287.md §3): antes,
   * ramaActual() usaba hayBusquedaOFiltro() para decidir si salir del
   * recorte por iniciativa propia (Guía/Exploración) hacia Acción
   * Directa — eso trataba "el usuario tocó el chip de un rubro"
   * exactamente igual que "el usuario escribió una búsqueda", pese a
   * que el Blueprint v2 (sección 4b) solo reserva Acción Directa para
   * una construcción EXPLÍCITA del usuario. Elegir un rubro desde los
   * chips de Guía/Exploración sigue siendo iniciativa propia del
   * sistema — con el universo acotado a ese rubro (ver render(): el
   * filtro ahora entra como `contexto.rubro` al motor de recorte, no
   * como un salto de rama). Solo la búsqueda de texto sigue forzando
   * el salto a Acción Directa: nombrar algo por escrito SÍ es la
   * acción explícita que el Vocabulario reserva para esa rama.
   */
  function hayBusquedaTexto() {
    return uiState.consultaActual.trim().length > 0;
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
    // Fase 4: hayBusquedaTexto() en vez de hayBusquedaOFiltro() — ver
    // el comentario largo junto a esa función. El filtro de rubro ya
    // NO fuerza la salida al buscador; se aplica dentro del recorte
    // (render(), rama 'recorte:*') vía contexto.rubro.
    if (reg.nombre === 'accionDirecta' || hayBusquedaTexto() || uiState.verCatalogoCompleto) {
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

  // FASE 2 (Plan Maestro de Modularización, 2026-08-06): favoritosCache,
  // leerFavoritos() y guardarFavoritos() ahora viven en favorites.js
  // (ver import arriba) — mismo comportamiento y misma firma de
  // llamada (leerFavoritos(), guardarFavoritos(f)) para no tocar
  // ninguno de los call sites existentes. Único cambio real: en vez de
  // llamar a ErrorRecovery.procesar() inline (ErrorRecovery vive acá
  // en app.js y todavía no está modularizado), favorites.js recibe un
  // callback onError — este wrapper es ese callback.
  function leerFavoritos() {
    return _leerFavoritos(function (e, contexto) {
      ErrorRecovery.procesar(e, ERROR_TYPE.STORAGE, contexto);
    });
  }

  function guardarFavoritos(f) {
    _guardarFavoritos(f, function (e, contexto) {
      ErrorRecovery.procesar(e, ERROR_TYPE.STORAGE, contexto);
    });
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
      invalidarCacheFavoritos();
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

  // FASE 4a (Plan Maestro de Modularización, 2026-08-06): la mitad
  // DECISORIA de render() (qué rama, qué lista, qué opts, si hubo
  // cambio real) vive ahora en render-engine.js — ver import arriba y
  // el comentario de cabecera de ese archivo para el contrato
  // completo y el porqué de cada getter. `estado`, PLANO y EXPO viajan
  // como funciones (no por valor): las tres cambian de contenido
  // durante la vida de la app (`estado` se reasigna en cada acción del
  // usuario; PLANO/EXPO se resuelven recién en validarModulos(),
  // después de que este RenderEngine ya fue construido) — un valor
  // capturado acá quedaría congelado en `null` o en la primera sesión.
  var RenderEngine = crearRenderEngine({
    obtenerRegistro: obtenerRegistro,
    razonesPorLugarId: razonesPorLugarId,
    hayCambioEnLista: hayCambioEnLista,
    RAMA_CURADURIA: RAMA_CURADURIA,
    RAMA_BUSCADOR: RAMA_BUSCADOR,
    obtenerEstado: function () { return estado; },
    obtenerPLANO: function () { return PLANO; },
    obtenerEXPO: function () { return EXPO; },
    uiState: uiState,
    ClimateContext: ClimateContext,
    ramaActual: function (reg) { return ramaActual(reg); },
    listaPorAccionExplicita: function () { return listaPorAccionExplicita(); },
    ordenarPorCercania: function (lista) { return ordenarPorCercania(lista); },
    ramaDistinta: function (rama) { return ramaDistinta(rama); },
    debugLog: debugLog
  });

  // FASE 4b (Plan Maestro de Modularización, 2026-08-06): mitad de
  // PINTADO de render() — funciones `pintar*`/`actualizar*` que
  // escriben directamente en el DOM. Extracción directa, una función
  // a la vez (ver dom-painter.js para el detalle y el progreso).
  // DOM y obtenerRegistro viajan por parámetro, no por closure —
  // mismo criterio que RenderEngine arriba.
  // NOTA (orden de ejecución): slug/mapsHref/escapeHTML NO se pasan acá
  // como los alias locales `var slug`/`mapsHref`/`escapeHTML` — esos
  // recién se asignan más abajo (bloque de AppFormato, después de este
  // punto en el cuerpo de la IIFE), así que en este momento todavía
  // valen `undefined` por hoisting de `var`. Se pasa `window.AppFormato`
  // directamente, que sí está garantizado disponible acá (se carga como
  // <script> propio antes que app.js, ver cabecera de app-formato.js).
  var DomPainter = crearDomPainter({
    DOM: DOM,
    obtenerRegistro: obtenerRegistro,
    UMBRAL_RATING: UMBRAL_RATING,
    UMBRAL_RESEÑAS: UMBRAL_RESEÑAS,
    MIN_PARA_MOSTRAR_DESTACADOS: MIN_PARA_MOSTRAR_DESTACADOS,
    MAX_DESTACADOS: MAX_DESTACADOS,
    uiState: uiState,
    slug: window.AppFormato && window.AppFormato.slug,
    mapsHref: window.AppFormato && window.AppFormato.mapsHref,
    escapeHTML: window.AppFormato && window.AppFormato.escapeHTML,
    geolocationDisponible: geolocationDisponible,
    hayBusquedaOFiltro: hayBusquedaOFiltro,
    VISUAL_STATE: VISUAL_STATE
  });

  /**
   * Función render() central: calcula qué mostrar, orquesta diferencias,
   * pinta solo lo necesario.
   */
  function render() {
    if (estadoActual() !== STATE.READY && estadoActual() !== STATE.LOADING_CATALOG) {
      return; // No renderizar en estados de error o cleanup
    }

    if (!obtenerRegistro().length || !DOM.panelDescubrimiento) return;

    try {
      actualizarBotonLimpiar();
      // Auditoría producción, 2026-07-30: actualizarVisibilidadSugerencias()
      // solo se llamaba una vez al cargar el catálogo (pintarSugerenciasRapidas),
      // pese a que su propio comentario documenta que debe decidirse "en cada
      // render()" — con eso, los chips de arranque no se ocultaban al buscar
      // o filtrar. pintarFiltrosActivos() directamente nunca se llamaba desde
      // ningún lado: la fila de píldoras de filtro activo estaba muerta.
      DomPainter.actualizarVisibilidadSugerencias();
      DomPainter.pintarFiltrosActivos();

      // 1 carácter, sin filtro de rubro: ni "cargando" ni "resultados",
      // un estado propio (ver pintarEstadoEscribiendo). Con 0, 2+
      // caracteres o un rubro activo, el pipeline sigue igual que
      // siempre más abajo.
      if (uiState.consultaActual.trim().length === 1 && !uiState.filtroRubroActivo) {
        DomPainter.pintarEstadoEscribiendo();
        return;
      }

      var favoritos = leerFavoritos();

      // FASE 4a: rama/lista/opts/detección-de-cambio ahora las calcula
      // RenderEngine.calcular() (ver render-engine.js) — devuelve null
      // exactamente en el mismo caso en que el render() original hacía
      // `return` temprano por "sin cambios" (mismo criterio: rama
      // distinta, lista distinta, o avance de página).
      var resultado = RenderEngine.calcular(favoritos);
      if (!resultado) {
        return;
      }
      var reg = resultado.reg;
      var rama = resultado.rama;
      var lista = resultado.lista;
      var opts = resultado.opts;

      // Actualizar encabezado, estado visual, tarjetas y mapa
      // FASE 4B: Llamadas a DomPainter (funciones migradas)
      DomPainter.actualizarCabecera(reg, rama);
      if (resultado.huboCambioDeRegion) {
        DomPainter.mostrarMicroSenalCambioRegion();
      }
      DomPainter.actualizarMapaTextura();
      DomPainter.actualizarBannerCuraduriaSugerida(reg);
      pintarTarjetas(lista, favoritos, opts);
      DomPainter.actualizarMapaHerramienta(reg.nombre, lista || []);

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
      // reasignado a `rama` dentro de RenderEngine.calcular() — la
      // condición era siempre true y esta rama de scroll se ejecutaba
      // en TODOS los renders con cambio, incluidos los que cambiaban
      // de rama/región. Compara contra `resultado.ramaAnterior`,
      // capturada por RenderEngine antes de esa reasignación.
      if (uiState.scrollPosition && rama === resultado.ramaAnterior) {
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

  // Render de tarjetas — extraído a js/app-tarjetas.js (auditoría de
  // ingeniería, Oportunidad 3, 2026-08-06). Empieza con
  // pintarEsqueleto (sin configurar(): recibe DOM.panelDescubrimiento
  // como parámetro en cada llamada, no lo captura por closure). Fail
  // hard-visible si el script no cargó, igual criterio que las
  // extracciones anteriores.
  var pintarEsqueleto;
  if (window.AppTarjetas) {
    pintarEsqueleto = function () { window.AppTarjetas.pintarEsqueleto(DOM.panelDescubrimiento); };
  } else {
    console.error('[app.js] AppTarjetas no está cargado — revisar que js/app-tarjetas.js esté en index.html, antes de motor.bundle.js/app.min.js.');
    pintarEsqueleto = function () {};
  }

  // pintarDestacados() — extraída a dom-painter.js (FASE 4b, ver
  // DomPainter.pintarDestacados() e instanciación de DomPainter más
  // arriba). Llamada real en cargarCatalogo(), ver más abajo.

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
      return;
    }
    var chipSorpresa = e.target.closest('[data-accion="sugerencia-sorprendeme"]');
    if (chipSorpresa && !uiState.sorprendemeActivo) {
      activarSorprendeme();
    }
  }

  /**
   * Fase 4 — "Sorprendeme": activa el modo y arranca una tanda nueva
   * desde cero (uiState.tandaRecorte = null, no un "más" que agregue
   * sobre lo que ya se estaba viendo — al activarse, TODO lo que se
   * muestra debería salir del pool de exploración, no solo lo nuevo).
   */
  function activarSorprendeme() {
    uiState.sorprendemeActivo = true;
    uiState.sorpresaSeed = 0;
    uiState.tandaRecorte = null;
    uiState.paginaTarjetas = 1;
    DomPainter.pintarFiltrosActivos();
    render();
  }

  /**
   * Pide una selección de sorpresa distinta a la actual, descartando
   * (no acumulando) lo que ya se estaba mostrando — a diferencia de
   * "ver más sugerencias" (que agrega), "sorprendeme otra vez" es un
   * reemplazo completo.
   */
  function rerollarSorpresa() {
    uiState.sorpresaSeed++;
    uiState.tandaRecorte = null;
    uiState.paginaTarjetas = 1;
    render();
  }

  function desactivarSorprendeme() {
    uiState.sorprendemeActivo = false;
    uiState.tandaRecorte = null;
    uiState.paginaTarjetas = 1;
    DomPainter.pintarFiltrosActivos();
    render();
  }

  /**
   * Click delegado en el resumen de filtros activos: cada × quita
   * únicamente su propia faceta.
   */
  function manejarClickFiltrosActivos(e) {
    var btnReroll = e.target.closest('[data-filtro-reroll]');
    if (btnReroll && btnReroll.dataset.filtroReroll === 'sorpresa') {
      rerollarSorpresa();
      return;
    }

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
      DomPainter.pintarRubros();
      render();
    } else if (cual === 'cerca') {
      desactivarCercaDeMi();
    } else if (cual === 'sorpresa') {
      desactivarSorprendeme();
    }
  }

  // pintarTarjetas — extraída a js/app-tarjetas.js (auditoría de
  // ingeniería, Oportunidad 3, 2026-08-06), segunda función del grupo
  // "render de tarjetas" tras pintarEsqueleto. A diferencia de esa, sí
  // lee y ESCRIBE uiState (scrollPosition, visualState) y usa tres
  // constantes de este archivo — mismo contrato que AppTelemetria:
  // configurar(contexto) con funciones de acceso, para que uiState que
  // ve el módulo sea siempre la instancia viva, nunca una foto vieja
  // capturada por closure. Fail hard-visible si el script no cargó,
  // mismo criterio que las extracciones anteriores.
  var pintarTarjetas;
  if (window.AppTarjetas) {
    window.AppTarjetas.configurar({
      obtenerDOM: function () { return DOM; },
      obtenerEstadoUI: function () { return uiState; },
      obtenerConstantes: function () {
        return {
          TARJETAS_POR_PAGINA: TARJETAS_POR_PAGINA,
          ENTRADA_VIDRIO_TIMEOUT_MS: ENTRADA_VIDRIO_TIMEOUT_MS,
          VISUAL_STATE: VISUAL_STATE
        };
      }
    });
    pintarTarjetas = window.AppTarjetas.pintarTarjetas;
  } else {
    console.error('[app.js] AppTarjetas no está cargado — revisar que js/app-tarjetas.js esté en index.html, antes de motor.bundle.js/app.min.js.');
    pintarTarjetas = function () {};
  }

  /**
   * Actualiza el encabezado (título, subtítulo) según rama y región.
   */
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
    DomPainter.pintarLeyenda(puntos);

    if (DOM.mapaInfo) {
      DOM.mapaInfo.textContent = recorte.length < conCoordenadas.length
        ? 'Mostrando ' + recorte.length + ' de ' + conCoordenadas.length + ' lugares con ubicación en el mapa.'
        : recorte.length + ' lugar' + (recorte.length === 1 ? '' : 'es') + ' en el mapa.';
    }
  }

  /**
   * Actualiza la textura ambiental del mapa de fondo.
   */
  function actualizarMapaTextura() {
    if (!DOM.mapaTextura || !obtenerRegistro().length) return;
    if (!window.URU_CONFIG.mapa.texturaSiempreVisible) return;
    if (DOM.mapaTextura.dataset.pintado === '1') return;

    var puntos = MAPA.puntosTextura(obtenerRegistro());
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
  // ───────────────────────────────────────────────────────────────────
  // FORMATO/ESCAPE — extraído a js/app-formato.js (auditoría de
  // ingeniería, Oportunidad 3, 2026-08-06). Estas siete funciones eran
  // 100% puras (sin acceso a `estado`/`uiState`/`DOM`/`REGISTRO`), así
  // que no necesitan configurar() ni contexto — solo alias locales
  // para no tocar los ~38 call sites de estas funciones en el resto
  // del archivo. Fail hard-visible si el script no cargó, igual
  // criterio que la extracción de AppTelemetria.
  var escapeHTML, cssEscape, slug, mapsHref, distanciaMetros, formatoDistancia, prefiereMovimientoReducido;
  if (window.AppFormato) {
    escapeHTML = window.AppFormato.escapeHTML;
    cssEscape = window.AppFormato.cssEscape;
    slug = window.AppFormato.slug;
    mapsHref = window.AppFormato.mapsHref;
    distanciaMetros = window.AppFormato.distanciaMetros;
    formatoDistancia = window.AppFormato.formatoDistancia;
    prefiereMovimientoReducido = window.AppFormato.prefiereMovimientoReducido;
  } else {
    console.error('[app.js] AppFormato no está cargado — revisar que js/app-formato.js esté en index.html, antes de motor.bundle.js/app.min.js.');
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
    // FIX (auditoría, hallazgo "procesos periódicos", Oportunidad 1,
    // 2026-08-05): antes esto era un setInterval desnudo, sin ninguna
    // gestión de segundo plano — corría cada 5s aunque la pestaña
    // estuviera oculta (a diferencia de, por ejemplo,
    // ambiente-clima.js:temporizadorClima, que sí pausa de verdad).
    // CicloVida.programarTareaPeriodica() (js/ciclo-vida.js, cargado
    // antes que este archivo) centraliza esa pausa/reanudación real.
    // tickPermanencia() ya no necesita cambiar: cada tick sigue siendo
    // trabajo independiente, no hay ticks "perdidos" que recuperar al
    // volver a foco.
    activeOperations.permanenciaTimer = programarPeriodica(tickPermanencia, PERMANENCIA_TICK_MS);

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

  function manejarClickPanel(e) {
    var btnAceptar = e.target.closest('[data-accion="aceptar"]');
    var btnRechazar = e.target.closest('[data-accion="rechazar"]');
    var btnGuardar = e.target.closest('[data-accion="guardar"]');
    var btnCompartir = e.target.closest('[data-accion="compartir"]');
    var btnCargarMas = e.target.closest('[data-accion="cargar-mas"]');
    var btnMasSugerenciasRecorte = e.target.closest('[data-accion="mas-sugerencias-recorte"]');
    var btnLimpiarBusqueda = e.target.closest('[data-accion="limpiar-busqueda"]');
    var btnLimpiarFiltro = e.target.closest('[data-accion="limpiar-filtro-rubro"]');
    var carta = e.target.closest('[data-lugar-id]');

    if (btnLimpiarBusqueda) {
      limpiarBusqueda();
      return;
    }

    if (btnLimpiarFiltro) {
      uiState.filtroRubroActivo = null;
      DomPainter.pintarRubros();
      render();
      return;
    }

    if (btnCompartir) {
      var cartaC = btnCompartir.closest('[data-lugar-id]');
      var lugarC = obtenerPorId(cartaC.dataset.lugarId);
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

    if (btnMasSugerenciasRecorte) {
      // Fase 4 — "Mostrar más" como nueva tanda real: a diferencia de
      // btnCargarMas (que solo avanza paginaTarjetas sobre una lista
      // que el motor YA calculó), este botón le pide a render() una
      // tanda NUEVA excluyendo todo lo mostrado hasta ahora — ver el
      // bloque de uiState.tandaRecorte dentro de render(). Si además
      // "Sorprendeme" está activo, cada tanda nueva es también una
      // sorpresa distinta a la anterior (sorpresaSeed avanza).
      uiState.pedirMasRecorte = true;
      if (uiState.sorprendemeActivo) uiState.sorpresaSeed++;
      render();
      return;
    }

    if (btnAceptar) {
      var id1 = btnAceptar.closest('[data-lugar-id]').dataset.lugarId;
      var porIniciativa = btnAceptar.dataset.origen === 'iniciativa_propia';
      var grupo1 = obtenerPorId(id1) ? obtenerPorId(id1).grupo : undefined;
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
      if (window.Coreografias && obtenerPorId(id1)) {
        window.Coreografias.aperturaFicha(slug(obtenerPorId(id1)));
      }
      return;
    }

    if (btnRechazar) {
      var id2 = btnRechazar.closest('[data-lugar-id]').dataset.lugarId;
      var grupo = obtenerPorId(id2) ? obtenerPorId(id2).grupo : 'sin_rubro';
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
    DomPainter.pintarRubros();

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
  // Fallback defensivo (auditoría, Oportunidad 1, 2026-08-05): mismo
  // criterio que ya usa este archivo para AmbientEngine/Coreografias —
  // CicloVida (js/ciclo-vida.js) debería cargar siempre antes que este
  // script (ver index.html), pero si por lo que sea no está disponible,
  // esto se degrada a un setInterval desnudo (el comportamiento de
  // antes de esta pasada) en vez de romper la inicialización de la app.
  function programarPeriodica(fn, ms) {
    if (typeof CicloVida !== 'undefined' && CicloVida && typeof CicloVida.programarTareaPeriodica === 'function') {
      return CicloVida.programarTareaPeriodica(fn, ms);
    }
    return setInterval(fn, ms);
  }

  function tickPermanencia() {
    if (estadoActual() !== STATE.READY) return;

    estado = PLANO.aplicarAccion(estado, 'permanecer', { segundos: 5 });
    PLANO.guardarEstado(estado);

    var regionNueva = PLANO.region(estado).nombre;
    if (regionNueva !== RenderEngine.obtenerCache().region) {
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
  // 20b. CONTEXTO DE CLIMA PARA EL RECORTE (Fase 4, Fase 3D §4)
  // ───────────────────────────────────────────────────────────────────

  // Trae { weather_code, temperature_2m, precipitation } y los deja en
  // climaContextoCache para que render() los pase como contexto.clima
  // a EXPO.recortePorIniciativaPropiaExplicado(). Si falla o tarda,
  // climaContextoCache simplemente queda como estaba (null la primera
  // vez) — condicionClimatica() en el motor ya sabe tratar null como
  // "sin señal de clima" y el scoring sigue funcionando sin esa señal,
  // exactamente como antes de esta conexión.
  // FASE 3 (paso 1, Plan Maestro de Modularización, 2026-08-06):
  // el fetch + caché ahora vive en ClimateContext.actualizar()
  // (climate-context.js) — acá solo queda pedirle que se actualice y
  // re-renderizar cuando trajo un dato nuevo, mismo comportamiento
  // observable que el actualizarClimaContexto() original.
  function actualizarClimaContexto() {
    ClimateContext.actualizar(function () {
      // Re-renderizar: el recorte por iniciativa propia (guia/exploracion)
      // puede cambiar de selección/razones ahora que hay señal de clima
      // real donde antes no la había.
      render();
    });
  }

  function inicializarContextoClima() {
    actualizarClimaContexto();
    // FIX (auditoría, Oportunidad 1, 2026-08-05): antes esto hacía un
    // fetch() de red real cada 5 minutos SIN IMPORTAR si la pestaña
    // estaba oculta — el único de los 5 setInterval del proyecto sin
    // ninguna gestión de segundo plano y, a la vez, el único con costo
    // de red real por tick (ver inventario completo del hallazgo).
    // Mismo helper que permanenciaTimer, arriba.
    activeOperations.climaContextoTimer = programarPeriodica(actualizarClimaContexto, CLIMA_CONTEXTO_INTERVALO_MS);
  }

  // ───────────────────────────────────────────────────────────────────
  // 21. GEOLOCALIZACIÓN AVANZADA
  // ───────────────────────────────────────────────────────────────────

  function inicializarGeolocation() {
    if (!geolocationDisponible() || !DOM.inputBuscar || !DOM.inputBuscar.parentNode) return;

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

    // FASE 3 (paso 2, Plan Maestro de Modularización, 2026-08-06):
    // solicitarUbicacion() (geolocation.js) reemplaza la llamada
    // directa a navigator.geolocation.getCurrentPosition() — mismas
    // opciones, mismo shape { lat, lng }, ahora como Promise.
    solicitarUbicacion(GEOLOCATION_TIMEOUT_MS, GEOLOCATION_MAX_AGE_MS)
      .then(function (ubicacion) {
        uiState.ubicacionUsuario = ubicacion;
        uiState.cercaTuyoActivo = true;
        btn.disabled = false;
        btn.textContent = '📍 Cerca de mí ✓';
        btn.setAttribute('aria-pressed', 'true');
        btn.classList.add('activo');
        render();
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.textContent = '📍 Cerca de mí';
        console.warn('Geolocation error:', err);
        mostrarTooltipGeolocation('No pudimos acceder a tu ubicación. Revisá los permisos del navegador.');
      });
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
  // 23-25. MÉTRICAS, TESTING Y DEBUG — extraídos a js/app-telemetria.js
  // ───────────────────────────────────────────────────────────────────
  // Auditoría de ingeniería, Oportunidad 3 (2026-08-06): primer módulo
  // real de la separación de app.js por responsabilidad, con el mismo
  // criterio que ya rige el Ambient Engine. Este archivo ya no define
  // MetricsCollector/TestingSuite/DebugHelper — le entrega su estado
  // interno a AppTelemetria, UNA sola vez, vía configurar(), con
  // funciones de acceso (nunca los valores directos, para no capturar
  // una foto vieja de algo que cambia con el tiempo, como `estado` o
  // `currentState` tras cada render/transición).
  //
  // Fail-open explícito si el script no está cargado (mismo criterio
  // que el resto del proyecto, p. ej. Cap. 1.4 del Ambient Engine):
  // window.URU_APP.metrics/testing/debug quedan con no-ops en vez de
  // tirar un ReferenceError contra `window.AppTelemetria` inexistente.
  var Telemetria = window.AppTelemetria || null;

  if (Telemetria) {
    Telemetria.configurar({
      obtenerDOM: function () { return DOM; },
      obtenerEstado: function () { return estado; },
      obtenerEstadoUI: function () { return uiState; },
      obtenerEstadoMaquina: function () { return estadoActual(); },
      obtenerUltimoCambioDeEstado: function () { return obtenerUltimoCambioDeEstado(); },
      obtenerRegistro: function () { return obtenerRegistro(); },
      obtenerCacheRender: function () { return RenderEngine.obtenerCache(); },
      obtenerLogCambiosEstado: function () { return obtenerLogCambiosEstado(); },
      contarOperacionesActivas: function () { return OperationManager.contarActivas(); },
      validarEstadoInvariantes: function () { return ValidacionSuite.validarEstado(); },
      modulosDisponibles: function () { return { PLANO: !!PLANO, EXPO: !!EXPO, MAPA: !!MAPA }; },
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
    console.error('[app.js] AppTelemetria no está cargado — revisar que js/app-telemetria.js esté en index.html, antes de motor.bundle.js/app.min.js. window.URU_APP.metrics/testing/debug van a devolver no-ops.');
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
    getRegistro: function () { return obtenerRegistro().slice(); },
    getStateLog: function () { return obtenerLogCambiosEstado().slice(); },
    canTransition: puedeTransicionar,

    // Validation
    validar: function () { return ValidacionSuite.validarEstado(); },
    reparar: function () { return ValidacionSuite.reparar(); },

    // Testing
    runTests: function () { return TelemetriaTesting.runSmokeTesting(); },
    validateContract: function () { return TelemetriaTesting.validarContratoDOM(); },
    validateRegistry: function () { return TelemetriaTesting.validarRegistro(); },

    // Debugging
    debug: TelemetriaDebug,
    metrics: TelemetriaMetrics,
    testing: TelemetriaTesting,

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
    healthCheck: function () { return TelemetriaDebug.healthCheck(); },
    exportDebugData: function () { return TelemetriaDebug.exportDebugData(); },

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
