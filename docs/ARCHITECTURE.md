# ARCHITECTURE.md — Estado del Plan Maestro de Modularización

**Referencia completa del plan:** `ARQUITECTURA_MAESTRO_APP.md` (auditoría original,
2026-08-06). Este documento es el checkpoint vivo de avance — se actualiza en cada
fase, el plan original no se toca.

**Último commit reflejado acá:** `77241a5` — Fase 3 (paso 3): extraer error-recovery.js.

---

## 1. Métricas

| | Antes (auditoría original) | Ahora |
|---|---|---|
| `js/app.js` | 4.039 líneas | **3.639 líneas** (−400, ~10%) |
| Módulos ES nuevos (Fases 2-3) | 0 | **9** |
| Tests | — | 6/6 suites en verde (`node js/run-tests.js`), verificado en cada commit |

## 2. Fases del plan y su estado real

| Fase | Objetivo | Estado |
|---|---|---|
| 1 | Infraestructura (constants, utils, types, event-bus) | ✅ completa (previa a esta sesión) |
| 2 | Estado centralizado | ✅ **completa** |
| 3 | Servicios de dominio | ✅ completa, con 2 módulos deliberadamente reasignados a Fase 4 (ver §4) |
| 4 | Renderizado desacoplado | 🔜 en curso |
| 5-7 | Listeners, módulos especializados, orquestación final | pendientes |

## 3. Módulos extraídos

| Módulo | Fase | Responsabilidad | Patrón |
|---|---|---|---|
| `state-manager.js` | 2 | máquina de estados validada | closure + `appEventBus` |
| `cache.js` | 2 | caché de distancias | función pura con caché interno |
| `favorites.js` | 2 | persistencia de favoritos | closure + callback `onError` inyectado |
| `catalog.js` | 2 | `REGISTRO` / `porId` | funciones puras (`obtenerRegistro`, `obtenerPorId`, `establecerCatalogo`) |
| `ui-state.js` | 2 | `uiState` (16 props) | `Proxy` — sin tocar call sites, emite `uiStateChanged` |
| `data-loader.js` | 2 | `fetchJSON` con reintentos | factory + inyección de `OperationManager` |
| `climate-context.js` | 3 | clima cacheado para el recorte | factory `{ actualizar, obtener }` |
| `geolocation.js` | 3 | `navigator.geolocation` | Promise wrapper + `geolocationDisponible()` |
| `error-recovery.js` | 3 | manejo/recuperación de errores | factory + inyección explícita de dependencias |

## 4. Decisiones de diseño relevantes

- **Inyección explícita de dependencias** (ADR-003 del plan original) en vez de
  globals, cada vez que un módulo nuevo necesita algo de `app.js` — callbacks para
  `favorites.js`/`error-recovery.js`, `OperationManager` para `data-loader.js`.
- **`Proxy` en vez de reescritura masiva** para `uiState`: 115+ usos en 20+
  funciones de `app.js` no se tocaron — se ganó el contrato de eventos del plan
  (`UIState.set()` emite `uiStateChanged`) sin el riesgo de tocar cada call site.
- **El bug del thunk** (`error-recovery.js`): `pintarEsqueleto` es un `var`
  asignado más abajo en `app.js` — pasarlo por valor en el punto de construcción
  de `ErrorRecovery` habría capturado `undefined`. Se resolvió con un thunk
  (`function () { pintarEsqueleto(); }`) que preserva el mismo binding tardío que
  tenía el closure original.
- **`domain/search.js` y `domain/discovery.js` (interfaz a EXPO) se posponen a
  Fase 4 a propósito.** No existen hoy como funciones aisladas — la lógica de
  búsqueda/recorte vive entrelazada dentro de `render()` (~280 líneas,
  complejidad ciclomática ~23, ver `ARQUITECTURA_MAESTRO_APP.md` §3.3). Extraerlos
  antes de tocar `render()` habría significado tocar esa función dos veces.

## 5. Validación en cada paso

Cada módulo se extrajo siguiendo el mismo checklist:

1. Localizar todos los call sites reales del bloque a extraer (`grep -n`).
2. Escribir el módulo nuevo documentando en su propia cabecera qué se extrajo,
   qué NO se extrajo (y por qué), y cualquier detalle de binding/orden no obvio.
3. Conectar en `app.js` con el mínimo diff posible.
4. `node --check` en los archivos tocados.
5. `node js/run-tests.js` — las 6 suites tienen que pasar.
6. Auditoría de residuos: ningún identificador crudo del bloque viejo debe seguir
   vivo fuera de comentarios; ningún import debe quedar huérfano.
7. Commit descriptivo + push.

## 6. Pendiente

- **Fase 4** (`ui/render-engine.js` + `ui/dom-painter.js`): la parte marcada como
  "⚠️ CRÍTICA" en el plan original — ahí vive `render()`, la función más grande y
  acoplada de toda la app.
- Fases 5-7 (listeners, módulos especializados, orquestación final).
