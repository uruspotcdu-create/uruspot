/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — js/constants.js
   FASE 1 del Plan Maestro de Modularización (ARQUITECTURA_MAESTRO_APP.md
   §7, "FASE 1: Infraestructura Base"). Extrae la Sección 1 de app.js
   ("CONFIGURACIÓN Y CONSTANTES", líneas 30-200 de la versión auditada)
   sin modificar ningún valor.

   NOTA DE INCONSISTENCIA (ver aviso previo a esta extracción): el resto
   de la modularización YA en curso en este repo (app-formato.js,
   app-tarjetas.js, app-telemetria.js, ciclo-vida.js) usa un patrón
   distinto — IIFE + `window.NombreModulo`, cargado por <script> plano,
   sin bundler. Este archivo sigue en cambio el plan original del
   documento (ES6 `export`), que requiere que el consumidor (app.js)
   se sirva como `<script type="module">` o pase por un bundler — hoy
   NO lo es. Por eso este módulo, aunque completo y correcto en sí
   mismo, todavía no está conectado a app.js. Ver el resumen al final
   de la respuesta para las dos formas de resolver esto.

   No se extraen acá REQUIRED_DOM_IDS / OPTIONAL_DOM_IDS (Sección 2 de
   app.js, "CACHE Y ESTADO GLOBAL") ni climaContextoCache/PLANO/EXPO/MAPA
   (mutables, no constantes) — quedan fuera del alcance de Fase 1 según
   el documento, que acota la extracción a las líneas 30-200.
   ═══════════════════════════════════════════════════════════════════ */

export const CIUDAD = 'concepcion-del-uruguay';
export const TARJETAS_POR_PAGINA = 8;
export const DEBOUNCE_BUSQUEDA_MS = 160;

// TIER 1.3 (Perf, 2026-08-02): más corto que el de búsqueda porque un
// click en un chip de rubro ya es una intención completa (a diferencia
// de una tecla dentro de una palabra que se sigue escribiendo) — solo
// necesita absorber dobles clicks/clicks en ráfaga entre chips distintos.
export const DEBOUNCE_FILTRO_MS = 80;

export const PERMANENCIA_TICK_MS = 5000;
export const FOCUS_TRAP_DELAY_MS = 100;
export const ANIMATION_TIMEOUT_MS = 260;
export const GEOLOCATION_TIMEOUT_MS = 8000;

// PERF (auditoría performance, 2026-08-02): red de seguridad para
// .tarjeta--entrando (ver pintarTarjetas/inicializarListeners). El caso
// normal saca la clase en 'animationend'; este timeout es solo por si
// esa animación nunca llega a completarse (interrumpida, pestaña oculta
// durante la animación, etc.) — sin él, una tarjeta podría quedar con
// el vidrio suprimido para siempre. Cubre el peor caso real: --dur-lenta
// (420ms) + el delay escalonado más largo (Math.min(i,24)*0.03s = 720ms)
// = 1140ms, con margen.
export const ENTRADA_VIDRIO_TIMEOUT_MS = 1500;

// Fase 4 — MUST HAVE #4 (Fase 3A §2, Fase 3D §7): encuadre del mapa por
// región. Antes `encuadrarTodos()` siempre recibía el mismo padding fijo
// (48px) sin importar la región activa — el mapa "protagonista" de
// Exploración no existía ni siquiera en cómo se encuadraba a sí mismo.
// Un padding mayor = más margen alrededor del conjunto de puntos = vista
// más abierta/alejada, coherente con "más variedad para curiosear"
// (mismo subtítulo que ya usa actualizarCabecera() para esta región).
// Guía mantiene el valor original: foco cerrado sobre una selección chica.
export const MAPA_PADDING_GUIA_PX = 48;
export const MAPA_PADDING_EXPLORACION_PX = 96;

export const GEOLOCATION_MAX_AGE_MS = 300000;
export const TOOLTIP_TIMEOUT_MS = 4000;

// Fase 4 — MUST HAVE #3 (Fase 3C §3, Fase 3D §7): duración del aviso
// transitorio de cambio de región. Más corto que TOOLTIP_TIMEOUT_MS a
// propósito — es un aviso pasivo ("cambió lo que ves"), no un mensaje
// de error que requiera acción del usuario, así que no necesita
// quedarse tanto tiempo en pantalla.
export const CAMBIO_REGION_AVISO_MS = 2600;

export const NETWORK_RETRY_ATTEMPTS = 2;
export const NETWORK_RETRY_DELAY_MS = 800;

// Auditoría producción, 2026-07-30: se eliminaron MAX_CONCURRENT_OPERATIONS
// y VIRTUAL_SCROLL_THRESHOLD — declaradas pero sin ningún consumidor real
// (OperationManager.crear() nunca comparaba contra un límite; el listado
// ya se pagina con TARJETAS_POR_PAGINA, así que la virtualización nunca
// llegó a evaluarse). No se reintroducen acá.

export const UMBRAL_RATING = 4.6;
export const UMBRAL_RESEÑAS = 15;
export const MAX_DESTACADOS = 6;
export const MIN_PARA_MOSTRAR_DESTACADOS = 3;

// Fase 4 — conexión real de contexto.clima al recorte por iniciativa
// propia (Fase 3D §4, "el por qué" — descubrimiento; motor-exposicion.js
// ya sabía puntuar por clima desde antes, pero nada en app.js le pasaba
// datos reales). Fetch propio y liviano a la misma Function
// (functions/weather.js) que ya consume js/ambiente-clima.js — no se
// reutiliza ese módulo porque es un efecto visual diferido (se carga
// recién en requestIdleCallback vía cargarMotorAmbientalDiferido()) y
// solo expone booleans (lluvia/niebla/viento), no los valores crudos
// que necesita calcularScore(). Mismo endpoint, mismo timeout, mismo
// intervalo de refresco (5 min) — dos consumidores distintos, sin
// acoplarlos entre sí.
export const CLIMA_CONTEXTO_URL = '/weather';
export const CLIMA_CONTEXTO_TIMEOUT_MS = 5000;
export const CLIMA_CONTEXTO_INTERVALO_MS = 5 * 60 * 1000;

// Constantes de rol por aperturas
export const ROLES_NOMBRES = {
  anfitrion: 'Recién llegado',
  conocido: 'Conocido',
  complice: 'Cómplice',
  casa: 'Casa'
};

// Ramas visuales posibles
export const RAMA_CURADURIA = 'curaduria';
export const RAMA_BUSCADOR = 'buscador';
// RAMA_RECORTE = 'recorte:guia' | 'recorte:exploracion'

// Estados de máquina
export const STATE = {
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
export const ERROR_TYPE = {
  CATALOG_FETCH: 'catalog_fetch',
  DETAILS_FETCH: 'details_fetch',
  STATE_INVALID: 'state_invalid',
  GEOLOCATION: 'geolocation',
  STORAGE: 'storage',
  UNKNOWN: 'unknown'
};

// AUDITORÍA — tipos de error que sí o sí deben detener la app
// (transicionar a STATE.ERROR y reemplazar el panel de resultados por
// un mensaje, vía mostrarEstadoError()). El resto de los tipos en
// ERROR_TYPE corresponden a fallos que el propio punto de origen YA
// maneja con un fallback seguro (leerFavoritos()/guardarFavoritos()
// devuelven `{}`/no-op ante un error de storage) — para esos alcanza
// con loguear, nunca hace falta apagar el resto de la aplicación por
// un subsistema no crítico que ya se recuperó solo.
export const ERROR_TYPES_FATALES = [
  ERROR_TYPE.CATALOG_FETCH,
  ERROR_TYPE.STATE_INVALID,
  ERROR_TYPE.UNKNOWN
];

// Flags de visualización
export const VISUAL_STATE = {
  LOADING: 'loading',
  EMPTY: 'empty',
  ERROR: 'error',
  SUCCESS: 'success',
  TRANSITION: 'transition',
  // 1 carácter en el buscador, por debajo del umbral de búsqueda
  // explícita (2). Ni "cargando" ni "sin resultados" — un estado
  // propio para no mentir sobre cuál de los dos es.
  TYPING: 'typing'
};

/**
 * Logging de diagnóstico del flujo normal (cambios de estado,
 * operaciones async, etc.), detrás de window.URU_CONFIG.debug — ver
 * motor-config.js §0. No reemplaza console.error/console.warn, que
 * siguen corriendo siempre porque señalan algo puntual.
 *
 * NOTA: no es una constante ni una función pura (lee window.URU_CONFIG
 * y hace I/O vía console.log), pero viaja en este módulo porque en
 * app.js está definida junto a las constantes de la Sección 1 y no
 * tiene otro hogar natural en el alcance de Fase 1.
 */
export function debugLog(...args) {
  if (typeof window !== 'undefined' && window.URU_CONFIG && window.URU_CONFIG.debug) {
    console.log(...args);
  }
}
