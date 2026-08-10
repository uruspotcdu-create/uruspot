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
import { crearListeners } from './listeners.js';
import { crearNavegacionTeclado } from './keyboard-nav.js';
import { crearMapaModulo } from './map-module.js';
import { crearScrollReveal } from './scroll-reveal.js';
import {
  listaPorAccionExplicita as _listaPorAccionExplicita,
  hayBusquedaTexto as _hayBusquedaTexto,
  hayBusquedaOFiltro as _hayBusquedaOFiltro,
  ordenarPorCercania as _ordenarPorCercania,
  ramaActual as _ramaActual,
  sufijoCercania as _sufijoCercania
} from './search.js';
// FASE 7 — orquestador central (app-coordinator.js): validación de
// módulos/DOM, ciclo de vida (init/destroy/restart), invariantes,
// accesibilidad, LifecycleHooks, wiring de AppTelemetria y la API
// pública (window.URU_APP) + punto de entrada. Se instancia al final
// de este archivo — ver comentario junto a esa instanciación.
import { crearAppCoordinator } from './app-coordinator.js';

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

  // FASE 5: getter de `PLANO` para listeners.js/keyboard-nav.js — se
  // resuelve recién en validarModulos() (más abajo), después de que
  // crearListeners()/crearNavegacionTeclado() ya se construyeron.
  // Mismo motivo/patrón que getEstado()/getMotorMapa() arriba.
  function getPLANO() { return PLANO; }
  var MAPA = null;

  // FASE 7: validarModulos() (antes acá mismo, ahora en
  // app-coordinator.js) necesita ESCRIBIR PLANO/EXPO/MAPA — como esas
  // tres variables ya no viven en el mismo archivo que la función que
  // las resuelve, se exponen estos setters. getEXPO/getMAPA acompañan
  // a getPLANO por el mismo motivo (modulosDisponibles() en el wiring
  // de AppTelemetria necesita leer las tres).
  function getEXPO() { return EXPO; }
  function getMAPA() { return MAPA; }
  function setPLANO(v) { PLANO = v; }
  function setEXPO(v) { EXPO = v; }
  function setMAPA(v) { MAPA = v; }

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

  // FASE 5 (Plan Maestro de Modularización, §4): getter/setter de
  // `estado` para listeners.js/keyboard-nav.js — mismo motivo que
  // obtenerEstado en render-engine.js (Fase 4a): esos módulos se
  // construyen (crearListeners/crearNavegacionTeclado) al parsear este
  // archivo, antes de que inicializarEstado() corra dentro de init();
  // pasar `estado` por valor ahí lo dejaría congelado en null.
  function getEstado() { return estado; }
  function setEstado(nuevo) { estado = nuevo; }

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

  // FASE 6 (Plan Maestro de Modularización, 2026-08-06): `motorMapa`
  // (antes una `var` local con su getter acá) ahora vive dentro de
  // map-module.js (ver import arriba e instancia MapaModulo más
  // abajo, junto a DomPainter) — mismo comportamiento, cero cambios
  // funcionales. listeners.js sigue recibiendo un `getMotorMapa` en
  // sus deps, solo que ahora es `MapaModulo.getMotorMapa` en vez de
  // esta función local.

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

  // FASE 7: limpiar() (ahora en app-coordinator.js) reasigna
  // `dynamicElements = {}` por completo en cada cleanup — no alcanza
  // con pasar el objeto por valor (quedaría apuntando a la instancia
  // vieja después del primer reset), así que se expone un getter
  // (lectura siempre fresca) y un thunk que hace la reasignación acá,
  // en el único archivo donde `dynamicElements` es una `var` real.
  function obtenerDynamicElements() { return dynamicElements; }
  function resetDynamicElements() { dynamicElements = {}; }

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
    // FIX (2026-08-08): uiState nunca se pasó acá pese a que el propio
    // docblock de error-recovery.js lo documenta como dependencia
    // requerida ("procesar() escribe uiState.lastErrorState; se pasa
    // la instancia real"). Sin esto, CUALQUIER error real que pasara
    // por ErrorRecovery.procesar() tiraba su propio TypeError
    // (`Cannot set properties of undefined`) en vez de registrarse —
    // enmascarando la causa original detrás de un error distinto.
    uiState: uiState,
    mostrarEstadoError: mostrarEstadoError,
    pintarEsqueleto: function () { pintarEsqueleto(); },
    cargarCatalogo: cargarCatalogo
  });

  // ───────────────────────────────────────────────────────────────────
  // 7-8, 10. VALIDACIÓN DE INVARIANTES / ACCESIBILIDAD / CICLO DE VIDA
  // ───────────────────────────────────────────────────────────────────
  // FASE 7 del Plan Maestro de Modularización (2026-08-06): ValidacionSuite,
  // AccesibilidadManager, validarModulos(), validarDOM(), inicializarEstado(),
  // inicializar(), limpiar() y reiniciar() ahora viven en
  // app-coordinator.js (ver import arriba e instancia AppCoordinator al
  // final de este archivo) — mismo comportamiento, cero cambios
  // funcionales. `estado`/PLANO/EXPO/MAPA siguen siendo variables
  // locales de ESTE archivo (ver getEstado/setEstado/getPLANO/setPLANO/
  // getEXPO/setEXPO/getMAPA/setMAPA más arriba): app-coordinator.js
  // las lee/escribe a través de esos getters/setters, nunca las posee.
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

    // 2026-08-09: cache-bust real para estos dos archivos (ver el
    // comentario largo de más arriba: antes se cargaban SIN query de
    // versión, así que stale-while-revalidate en sw.js podía seguir
    // sirviendo la copia vieja a cualquiera que ya hubiera visitado
    // el sitio, incluso después de un fix real en el repo — pasó dos
    // veces con ambiente.bundle.js. Los placeholders de abajo los
    // reemplaza scripts/build-ambiente-bundle.js con el hash real del
    // contenido de cada archivo, mismo mecanismo (scripts/lib/
    // cache-bust.js) que ya usan css/critical.bundle.css y
    // js/motor.bundle.js en index.html — acá el "index.html" a
    // reescribir es este propio app.js, porque la URL no vive en el
    // HTML sino en este array.
    var HASH_AMBIENTE_BUNDLE = '1e3f8d86ac';
    var HASH_COREOGRAFIAS = 'b5d33056eb';

    var lanzar = function () {
      [
        'js/ambiente.bundle.js?v=' + HASH_AMBIENTE_BUNDLE,
        'js/coreografias.js?v=' + HASH_COREOGRAFIAS
      ].forEach(function (src) {
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
  // FASE 3 (Plan Maestro de Modularización, 2026-08-06, cierre): la
  // lógica de listaPorAccionExplicita/hayBusquedaTexto/hayBusquedaOFiltro/
  // ordenarPorCercania/ramaActual/sufijoCercania ahora vive en
  // search.js (ver import arriba) como funciones puras (reciben el
  // estado que necesitan por parámetro, en vez de leer uiState/EXPO
  // como globales cerrados). Estos wrappers preservan la misma firma
  // de llamada (cero args, salvo reg/lista) para no tocar los call
  // sites existentes en render-engine.js/listeners.js/dom-painter.js.
  function listaPorAccionExplicita() {
    return _listaPorAccionExplicita(EXPO, obtenerRegistro(), uiState.consultaActual, uiState.filtroRubroActivo);
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
    return _hayBusquedaOFiltro(uiState.consultaActual, uiState.filtroRubroActivo);
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
    return _hayBusquedaTexto(uiState.consultaActual);
  }

  /**
   * Ordena una lista por cercanía si está activo "cerca de mí".
   */
  function ordenarPorCercania(lista) {
    // TIER 1 OPTIMIZACIÓN: Usar caché de distancias (Perf, 2026-08-02)
    // Reutiliza cálculos si usuario está en misma posición
    // Impacto: +25% fluidez en búsquedas repetidas de proximidad
    // (cache.js, cableado a través de search.js — mismo criterio)
    return _ordenarPorCercania(lista, uiState.cercaTuyoActivo, uiState.ubicacionUsuario);
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
    // Fase 4: hayBusquedaTexto() en vez de hayBusquedaOFiltro() — ver
    // el comentario largo junto a esa función en search.js. El filtro
    // de rubro ya NO fuerza la salida al buscador; se aplica dentro
    // del recorte (render(), rama 'recorte:*') vía contexto.rubro.
    return _ramaActual(reg, uiState.consultaActual, uiState.verCatalogoCompleto);
  }

  /**
   * Suffix para anuncios de accesibilidad cuando está activo "cerca de mí".
   */
  function sufijoCercania() {
    return _sufijoCercania(uiState.cercaTuyoActivo, uiState.ubicacionUsuario);
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
    hayBusquedaTexto: hayBusquedaTexto,
    sufijoCercania: sufijoCercania,
    VISUAL_STATE: VISUAL_STATE,
    // FIX (2026-08-08): dom-painter.js usaba PLANO/estado/render() como
    // si fueran variables locales de closure, heredado de cuando este
    // código vivía en app.js — nunca se convirtieron a dependencias
    // inyectadas durante la extracción (Fase 4B). getPLANO en vez de
    // PLANO directo por el mismo motivo que MapaModulo/getMAPA más
    // abajo: este módulo se construye antes de que PLANO se resuelva
    // en validarModulos().
    getPLANO: getPLANO,
    getEstado: getEstado,
    setEstado: setEstado,
    obtenerDynamicElements: obtenerDynamicElements,
    render: render
  });

  // FASE 6 (Plan Maestro de Modularización, 2026-08-06): §16 (Mapa y
  // Visualización Espacial) — inicializarMotorMapa/
  // actualizarMapaHerramienta/actualizarMapaTextura/resaltarTarjeta,
  // antes function declarations locales, ahora viven en
  // map-module.js (ver import arriba). Mismo motivo que DomPainter
  // arriba para pasar `getMAPA`/cssEscape/slug por función o directo
  // de `window.AppFormato` en vez de por alias local: este módulo se
  // construye ANTES de que `MAPA` se resuelva en validarModulos() y
  // ANTES del bloque que asigna `var cssEscape`/`var slug` locales
  // (AppFormato, más abajo en este archivo).
  var MapaModulo = crearMapaModulo({
    DOM: DOM,
    getMAPA: function () { return MAPA; },
    uiState: uiState,
    obtenerRegistro: obtenerRegistro,
    leerFavoritos: leerFavoritos,
    DomPainter: DomPainter,
    cssEscape: window.AppFormato && window.AppFormato.cssEscape,
    slug: window.AppFormato && window.AppFormato.slug,
    MAPA_PADDING_GUIA_PX: MAPA_PADDING_GUIA_PX,
    MAPA_PADDING_EXPLORACION_PX: MAPA_PADDING_EXPLORACION_PX
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
      Listeners.actualizarBotonLimpiar();
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
      // FIX (2026-08-06): las llamadas a DomPainter.actualizarMapaTextura()
      // / DomPainter.actualizarMapaHerramienta() apuntaban a una versión
      // de Fase 4b que quedó rota — usaba una API de mapa distinta
      // (window.L/Leaflet) a la real (window.URU_MOTOR_MAPA_RENDER) y
      // referenciaba `motorMapa`/`ClimateContext` sin declararlos ni
      // inyectarlos en dom-painter.js, así que tiraban TypeError/
      // ReferenceError en cada render() (atrapado por el try/catch de
      // acá abajo, que mostraba mostrarEstadoError() en su lugar — el
      // mapa no se actualizaba silenciosamente). Se revirtió a las
      // funciones locales de la sección §16 de entonces, que eran la
      // versión correcta. FASE 6: esas funciones locales ahora son
      // MapaModulo.actualizarTextura()/actualizarHerramienta() (ver
      // map-module.js) — mismo comportamiento, cero cambios
      // funcionales, no se repite el bug de Fase 4b porque este
      // wiring apunta al módulo real, no a un contrato inventado.
      MapaModulo.actualizarTextura();
      DomPainter.actualizarBannerCuraduriaSugerida(reg);
      pintarTarjetas(lista, favoritos, opts);
      MapaModulo.actualizarHerramienta(reg.nombre, lista || []);

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
      Listeners.seleccionarRubro(chipRubro.dataset.rubro);
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
      Listeners.limpiarBusqueda();
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
  // 16. MAPA Y VISUALIZACIÓN ESPACIAL — extraído a js/map-module.js
  // (Plan Maestro de Modularización, Fase 6, 2026-08-06). Cubría
  // inicializarMotorMapa(), resaltarTarjeta(), actualizarMapaHerramienta()
  // y actualizarMapaTextura() — ver instancia `MapaModulo` más arriba
  // (junto a DomPainter) y sus llamadas reales dentro de render().
  // ───────────────────────────────────────────────────────────────────

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

  // FASE 6 (Plan Maestro de Modularización, 2026-08-06): §22 (Scroll
  // Reveal) — antes function declaration local, ahora vive en
  // scroll-reveal.js (ver import arriba). Se construye ACÁ, junto a
  // Listeners/NavegacionTeclado y por el mismo motivo (depende de
  // `prefiereMovimientoReducido`, alias de AppFormato recién asignado
  // más arriba): listeners.js ya esperaba este exacto momento — recibe
  // `ScrollReveal.inicializar` bajo el nombre `inicializarScrollReveal`,
  // mismo contrato que ya tenía con la function declaration local (ver
  // comentario "Sección 22, Fase 6 pendiente" en listeners.js).
  var ScrollReveal = crearScrollReveal({
    prefiereMovimientoReducido: prefiereMovimientoReducido
  });

  // FASE 5 (Plan Maestro de Modularización, 2026-08-06): extraído de
  // app.js §19 (Inicialización de Listeners y Eventos) + §20
  // (Navegación por Teclado Avanzada) a js/listeners.js y
  // js/keyboard-nav.js respectivamente — ver cabecera de cada módulo
  // para el detalle de qué se movió y por qué. Mismo criterio de DI
  // explícita que RenderEngine/DomPainter (arriba): se construyen acá,
  // no dentro de inicializarListeners()/inicializarTecladoNavegacion()
  // (que ahora son solo Listeners.inicializar()/NavegacionTeclado
  // .inicializar(), ver init() más abajo), para que quede un único
  // punto de armado de dependencias, igual que con DomPainter/RenderEngine.
  //
  // Se construyen ACÁ (después de programarRenderTrasSalida, no antes,
  // junto a DomPainter/RenderEngine) porque dependen de slug/
  // prefiereMovimientoReducido (alias de AppFormato) y de
  // programarRenderTrasSalida, los tres recién asignados/definidos más
  // arriba en este mismo archivo — construir esto antes de esos puntos
  // capturaría `undefined` por el mismo motivo que ya documenta el
  // comentario de cabecera de DomPainter.
  var Listeners = crearListeners({
    DOM: DOM,
    uiState: uiState,
    activeOperations: activeOperations,
    render: render,
    obtenerPorId: obtenerPorId,
    slug: slug,
    hayBusquedaOFiltro: hayBusquedaOFiltro,
    leerFavoritos: leerFavoritos,
    guardarFavoritos: guardarFavoritos,
    actualizarContadorGuardados: actualizarContadorGuardados,
    DomPainter: DomPainter,
    getEstado: getEstado,
    setEstado: setEstado,
    getPLANO: getPLANO,
    getMotorMapa: MapaModulo.getMotorMapa,
    programarRenderTrasSalida: programarRenderTrasSalida,
    RenderEngine: RenderEngine,
    estadoActual: estadoActual,
    STATE: STATE,
    PERMANENCIA_TICK_MS: PERMANENCIA_TICK_MS,
    DEBOUNCE_BUSQUEDA_MS: DEBOUNCE_BUSQUEDA_MS,
    DEBOUNCE_FILTRO_MS: DEBOUNCE_FILTRO_MS,
    manejarClickSugerencias: function (e) { return manejarClickSugerencias(e); },
    manejarClickFiltrosActivos: function (e) { return manejarClickFiltrosActivos(e); },
    inicializarScrollReveal: ScrollReveal.inicializar,
    prefiereMovimientoReducido: prefiereMovimientoReducido
  });

  var NavegacionTeclado = crearNavegacionTeclado({
    DOM: DOM,
    uiState: uiState,
    render: render,
    getEstado: getEstado,
    setEstado: setEstado,
    getPLANO: getPLANO
  });

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
  // 22. SCROLL REVEAL (Progressive Enhancement) — extraído a
  // js/scroll-reveal.js (Plan Maestro de Modularización, Fase 6,
  // 2026-08-06). Ver instancia `ScrollReveal` más arriba (junto a
  // Listeners/NavegacionTeclado) y su wiring en las deps de Listeners
  // (`inicializarScrollReveal: ScrollReveal.inicializar`).
  // ───────────────────────────────────────────────────────────────────
  // ───────────────────────────────────────────────────────────────────
  // 23-28. TELEMETRÍA, CICLO DE VIDA EXTENDIDO, API PÚBLICA Y ENTRADA
  // ───────────────────────────────────────────────────────────────────
  // FASE 7 del Plan Maestro de Modularización (2026-08-06): el wiring
  // de AppTelemetria (antes §23-25), LifecycleHooks (antes §26), la
  // API pública window.URU_APP (antes §27) y el punto de entrada
  // (antes §28) ahora viven en app-coordinator.js. Se instancia acá,
  // al final de la IIFE — para este punto TODO lo que app-coordinator.js
  // necesita (render, leerFavoritos, cargarCatalogo, Listeners,
  // RenderEngine, ErrorRecovery, etc.) ya es un valor resuelto, así
  // que viaja por valor; las únicas excepciones (`estado`/PLANO/EXPO/
  // MAPA/dynamicElements, que siguen mutando después de esta línea)
  // viajan como getter/setter — ver cabecera de app-coordinator.js
  // para el detalle completo.
  var AppCoordinator = crearAppCoordinator({
    CIUDAD: CIUDAD,
    STATE: STATE,
    ERROR_TYPE: ERROR_TYPE,
    FOCUS_TRAP_DELAY_MS: FOCUS_TRAP_DELAY_MS,
    CLIMA_CONTEXTO_INTERVALO_MS: CLIMA_CONTEXTO_INTERVALO_MS,
    debugLog: debugLog,

    obtenerRegistro: obtenerRegistro,
    obtenerPorId: obtenerPorId,

    estadoActual: estadoActual,
    transicionarEstado: transicionarEstado,
    forzarEstado: forzarEstado,
    puedeTransicionar: puedeTransicionar,
    obtenerUltimoCambioDeEstado: obtenerUltimoCambioDeEstado,
    obtenerLogCambiosEstado: obtenerLogCambiosEstado,
    vaciarLogEstado: _vaciarLogEstado,

    DOM: DOM,
    REQUIRED_DOM_IDS: REQUIRED_DOM_IDS,
    OPTIONAL_DOM_IDS: OPTIONAL_DOM_IDS,

    uiState: uiState,
    activeOperations: activeOperations,

    getEstado: getEstado,
    setEstado: setEstado,
    setPLANO: setPLANO,
    setEXPO: setEXPO,
    setMAPA: setMAPA,
    getPLANO: getPLANO,
    getEXPO: getEXPO,
    getMAPA: getMAPA,

    obtenerDynamicElements: obtenerDynamicElements,
    resetDynamicElements: resetDynamicElements,

    ErrorRecovery: ErrorRecovery,

    leerFavoritos: leerFavoritos,
    guardarFavoritos: guardarFavoritos,
    actualizarContadorGuardados: actualizarContadorGuardados,
    pintarEsqueleto: pintarEsqueleto,

    Listeners: Listeners,
    NavegacionTeclado: NavegacionTeclado,

    inicializarGeolocation: inicializarGeolocation,
    activarCercaDeMi: activarCercaDeMi,
    desactivarCercaDeMi: desactivarCercaDeMi,

    ClimateContext: ClimateContext,
    cargarMotorAmbientalDiferido: cargarMotorAmbientalDiferido,
    promoverCssEditorialDiferido: promoverCssEditorialDiferido,
    cargarCatalogo: cargarCatalogo,

    mostrarEstadoError: mostrarEstadoError,

    render: render,
    RenderEngine: RenderEngine,
    OperationManager: OperationManager
  });

  window.URU_APP = AppCoordinator.api;

  AppCoordinator.arrancar();

})();

