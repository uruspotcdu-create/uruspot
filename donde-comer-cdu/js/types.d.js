/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — js/types.d.js
   FASE 1 del Plan Maestro de Modularización (ARQUITECTURA_MAESTRO_APP.md
   §7). Documentación de tipos vía JSDoc — sin código en runtime, solo
   typedefs para que editores (VS Code, etc.) den autocompletado e
   IntelliSense sobre las formas de datos centrales de la app, y para
   que el resto de los módulos de Fase 2+ puedan referenciarlas con
   `@param {Lugar}`, etc.

   Reconstruido leyendo los consumidores reales de estos objetos en
   app.js (render(), pintarTarjetas() en app-tarjetas.js, favoritos,
   etc.) — no hay un "modelo" formal previo en el código, así que estos
   typedefs documentan el USO real observado, no un contrato impuesto
   desde afuera. Si algún campo no está siendo usado en ningún lugar
   real, no se incluye acá.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Un lugar del catálogo (registro devuelto por PLANO / cargarCatalogo()).
 * @typedef {Object} Lugar
 * @property {string|number} id
 * @property {string} nombre
 * @property {string} [rubro]
 * @property {string} [direccion]
 * @property {number} [lat]
 * @property {number} [lng]
 * @property {number} [rating]
 * @property {number} [reseñas]
 * @property {string} [descripcion]
 * @property {string} [telefono]
 * @property {Array<Object>} [horarios]
 */

/**
 * Estado de sesión persistente, gestionado por PLANO.guardarEstado.
 * @typedef {Object} EstadoSesion
 * @property {string} [region]
 * @property {string} [rol]
 * @property {Object} [favoritos]
 */

/**
 * Estado local de UI — no persistente, se resetea en cada carga.
 * Ver app.js Sección 2 ("CACHE Y ESTADO GLOBAL"), variable `uiState`.
 * @typedef {Object} UIState
 * @property {string} consultaActual
 * @property {string|null} filtroRubroActivo
 * @property {{lat: number, lng: number}|null} ubicacionUsuario
 * @property {boolean} cercaTuyoActivo
 * @property {boolean} verCatalogoCompleto
 * @property {number} paginaTarjetas
 * @property {string|null} ultimaRamaRenderizada
 * @property {VisualState} visualState
 * @property {ErrorType|null} lastErrorState
 * @property {Element|null} focusedElement
 * @property {number} scrollPosition
 * @property {Lugar[]} cartasActuales
 * @property {{clave: string, lista: Lugar[], razones: Object, hayMasCandidatos: boolean}|null} tandaRecorte
 * @property {boolean} pedirMasRecorte
 * @property {boolean} sorprendemeActivo
 * @property {number} sorpresaSeed
 */

/**
 * Timers y operaciones async activas. Ver app.js Sección 2,
 * variable `activeOperations`.
 * @typedef {Object} ActiveOperations
 * @property {number|null} debounceBuscarId
 * @property {number|null} debounceFiltroId
 * @property {number|null} permanenciaTimer
 * @property {number|null} climaContextoTimer
 * @property {number|null} focusTrapTimer
 * @property {*} geolocationRequest
 * @property {Array<*>} pendingFetches
 */

/**
 * Uno de los valores de STATE (constants.js) — estado de la
 * máquina de estados global de la app (currentState).
 * @typedef {'uninitialized'|'initializing'|'loading_catalog'|'ready'|'error'|'recovering'|'interaction'|'cleanup'} EstadoMaquina
 */

/**
 * Uno de los valores de ERROR_TYPE (constants.js).
 * @typedef {'catalog_fetch'|'details_fetch'|'state_invalid'|'geolocation'|'storage'|'unknown'} ErrorType
 */

/**
 * Uno de los valores de VISUAL_STATE (constants.js) — estado
 * visual mostrado al usuario, independiente del estado de máquina.
 * @typedef {'loading'|'empty'|'error'|'success'|'transition'|'typing'} VisualState
 */

/**
 * Resultado de un recorte por iniciativa propia (Guía/Exploración),
 * tal como lo devuelve EXPO.recortePorIniciativaPropiaExplicado().
 * @typedef {Object} RecorteConRazones
 * @property {Array<{lugar: Lugar, razones: string[]}>} lugares
 * @property {boolean} hayMasCandidatos
 */

export {};
