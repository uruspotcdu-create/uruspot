# ARCHITECTURE.md — URU SPOT

> Auditado directamente contra el código real (clon `main`, commit
> `1953504`). Cifras de líneas obtenidas con `wc -l` en esta sesión, no
> copiadas de documentación previa.

---

## 1. Arquitectura frontend

**Sin framework.** HTML servido tal cual (sin build step), CSS servido
tal cual salvo el bundle crítico de `donde-comer-cdu`, JS vanilla en
IIFEs colgando de `window`.

**Dos "aplicaciones" HTML independientes, no una SPA única:**
1. `inicio/index.html` (4.812 líneas) — home/landing, mayormente
   contenido editorial estático + algunas piezas interactivas (mapa de
   circuitos, verificación vía `inicio/js/verificar-mapa-circuitos.js`).
2. `donde-comer-cdu/index.html` (1.483 líneas) — el motor real
   (catálogo, buscador, mapa, curaduría).

Cada ficha de local (`locales/<slug>/index.html`, 51 en total) es un
**documento HTML propio**, no una vista de router — navegación real de
página completa, no cliente-side routing. La continuidad visual entre
tarjeta y ficha se logra con **View Transitions API nativa**
(`@view-transition{ navigation:auto; }` en `tokens.css`, con el mismo
`view-transition-name` compartido entre `.tarjeta-nombre` en `app.js` y
`.hero-title` en `ficha.js`) — no con JS de transición manual.

## 2. Arquitectura "backend" (Cloudflare Pages Functions)

No hay backend tradicional. Dos Functions serverless:

- **`functions/weather.js`** (ubicación correcta, raíz del proyecto) →
  mapea a la ruta `/weather`. Proxea la API de MET Norway
  (`api.met.no`) en vez de Open-Meteo porque, según el propio comentario
  del archivo, Open-Meteo devuelve 525 desde la red de Cloudflare hacia
  esa zona. Normaliza la respuesta a un shape estilo Open-Meteo
  (`current.temperature_2m`, `weather_code`, etc.) para que el consumidor
  del lado cliente no tenga que saber cuál proveedor está detrás.
  Traduce símbolos de MET Norway a códigos WMO con una función de mapeo
  manual (`symbolToWmo`).

- **`donde-comer-cdu/js/functions/reviews.js` y `reviews-admin.js`** —
  ⚠ **ubicación probablemente incorrecta**, ver §8 más abajo. Contiene
  lógica real y bien pensada: reseñas nuevas entran en estado
  "pendiente" y no cuentan en el promedio hasta aprobarse (separa el
  producto de un self-serving review), honeypot anti-bot en el campo
  `website`, sanitización de longitud/caracteres, validación estricta de
  formato de ID (`/^URU-\d{5}$/`), CORS abierto. Persistencia en
  Cloudflare KV bajo la key `reviews:<id>`, requiere el binding
  `REVIEWS_KV` configurado en el dashboard de Cloudflare (no en código —
  no hay `wrangler.toml`).

## 3. Comunicación entre capas

- HTML → CSS: `<link>` estándar, sin CSS-in-JS.
- HTML → JS: `<script defer src="...">` en orden explícito — el orden
  es una dependencia implícita (ej. `motor.bundle.js` antes que
  `app.min.js`, porque expone `window.URU_PLANO`/`URU_EXPOSICION`/etc.
  que `app.js` necesita en `validarModulos()`).
- JS → JS: namespace global (`window.URU_PLANO`, `window.URU_EXPOSICION`,
  `window.URU_MAPA`, `window.Coreografias`, `window.AmbientEngine`, etc.),
  nunca `import`. `app.js` valida explícitamente que los módulos
  requeridos existan al iniciar (`validarModulos()`), y si falta alguno
  lanza un error claro con los nombres faltantes — no falla en silencio.
- JS → datos: `fetch()` de archivos JSON estáticos servidos como
  cualquier asset (`lugares-core.json`, `lugares-detalles.json`,
  `lugares-estado.json`, tiles de mapa) + `fetch()` a las Functions
  (`/weather`, `/reviews`).
- JS → persistencia de sesión: `localStorage` (estado del "plano" por
  ciudad, favoritos, debug de errores).

## 4. Componentes críticos (núcleo del motor `donde-comer-cdu`)

| Archivo | Líneas | Rol |
|---|---|---|
| `js/app.js` | 3.975 | Orquestador de producción: máquina de estados, render diferencial, manejo de errores multinivel, accesibilidad (foco, teclado, live region), listeners, ciclo de vida completo. Documentado internamente como "v2.3 — Nivel Galáctico". |
| `js/motor-render.js` | 3.032 | Motor de renderizado del mapa en Canvas puro (no Leaflet). El archivo más grande del repo después de `app.js`. |
| `js/motor-test.js` | 1.239 | Suite de tests del núcleo `motor-plano`. |
| `js/motor-plano.js` | 1.054 | Núcleo puro del "plano continuo" (autonomía × fricción tolerable) que reemplaza cualquier máquina de estados discreta para decidir en qué "región" (guía/exploración/curaduría) está la sesión. Funciones puras, testeadas sin DOM. Contrato público verificado con `grep` contra call sites reales, documentado dentro del propio archivo. |
| `js/motor-exposicion.js` | 803 | Scoring y selección de qué mostrar: afinidad, proximidad, frescura, contexto climático, diversidad forzada por rubro, cupo de exploración. También resuelve búsqueda explícita (exact match → prefijo → substring → fuzzy con distancia de edición acotada). |
| `js/ambiente-clima.js` | 482 | Módulo más grande del Ambient Engine — integra clima real. |
| `js/ambiente-config.js` | 512 | Configuración central del Ambient Engine (umbrales, timeouts unificados — ej. `timeoutCargaMs: 12000` referenciado también por `failsafe-reintentar.js`, confirmado por test). |
| `js/ficha.js` | 393 | Lógica de la página de ficha individual: reseñas (fetch a `/reviews`), formulario de nueva reseña. |
| `js/motor-mapa.js` | 254 | Lógica de qué puntos mostrar en el mapa (`puntosHerramienta`, `puntosTextura`, `debeMostrarHerramienta`). |

**Ambient Engine — 27 módulos** bajo `js/ambiente-*.js` (contados con
`find`; el propio AGENTS.md ya señala que una cifra previa de "30" estaba
desactualizada — confirmo aquí que **27 es la cifra correcta hoy**),
orquestados centralmente por `ambiente-orquestador.js` (271 líneas) con
un scheduler compartido (`ambiente-scheduler.js`) que multiplexa varias
tareas (`ambiente-rendimiento.js`, `ambiente-respiracion.js`) sobre un
**único** `requestAnimationFrame` — confirmado explícitamente por los
tests de ciclo de vida (`ambiente-lifecycle-tests.js`, 50/50 en verde):
"dos tareas activas siguen compartiendo un único rAF (no uno por
tarea)".

## 5. Manejo de estado

Tres capas de estado, deliberadamente separadas:

1. **Estado de sesión de producto** (`motor-plano.js`): modelo de
   "plano continuo" persistido en `localStorage`
   (`leerEstado`/`guardarEstado`/`aplicarAccion`), namespaced por ciudad.
   Puramente funcional — `aplicarAccion(estado, accion, payload)` recibe
   estado y devuelve estado nuevo, sin mutación oculta.
2. **Estado de UI en memoria** (`app.js`, objeto `uiState`): consulta
   actual, filtro de rubro activo, ubicación, página de tarjetas, último
   estado visual, etc. — no persiste entre recargas (por diseño, es
   efímero).
3. **Estado de la máquina de estados de la aplicación** (`app.js`,
   `currentState`): `UNINITIALIZED/INITIALIZING/LOADING_CATALOG/READY/
   ERROR/RECOVERING/INTERACTION/CLEANUP`, con matriz explícita de
   transiciones válidas.

Favoritos: `localStorage` bajo la key `uruspot_favoritos`, con cache en
memoria (`favoritosCache`) invalidada por el evento `storage` (sincroniza
entre pestañas).

## 6. Manejo de datos

`REGISTRO` (array en memoria, poblado incrementalmente):
1. Carga bloqueante de `lugares-core.json` (campos livianos, necesarios
   para primer render).
2. Carga diferida (`requestIdleCallback`, prioriza por IDs visibles
   primero) de `lugares-detalles.json` (dirección, teléfono, descripción)
   y `lugares-estado.json` (estado de verificación).
3. Reconstrucción del índice invertido de búsqueda cada vez que
   `REGISTRO` cambia de forma relevante.

Datos del mapa: tiles JSON separados por celda (`datos-virtualizador.js`,
tamaño de tile `0.05°`, con buffer de 2 tiles alrededor del viewport) —
solo **10 archivos de tile** existen hoy en
`donde-comer-cdu/datos/lugares-mapa-tiles/` (⚠ no confirmé si esto cubre
toda el área servida o es una cobertura parcial/en progreso).

Fuente de la verdad editorial: `donde-comer-cdu/.fuente/lugares-mapa.json`
(editado a mano por DSA), transformado por `split_dataset.py` en los 3
JSON de producción antes de cada deploy. **Bloqueado de acceso HTTP
directo** vía `_redirects` (404 explícito, con justificación documentada
en el propio archivo).

## 7. Manejo de errores

Centralizado en `app.js` vía `ErrorRecovery`: clasifica errores por tipo
(`CATALOG_FETCH`, `DETAILS_FETCH`, `STATE_INVALID`, `GEOLOCATION`,
`STORAGE`, `UNKNOWN`), distingue fatales de no-fatales
(`ERROR_TYPES_FATALES`), transiciona el estado de la app solo ante
fatales, ofrece reintento con backoff (`NETWORK_RETRY_ATTEMPTS=2`,
`NETWORK_RETRY_DELAY_MS=800`), y registra un log acotado (10 entradas) en
`localStorage` para debug. Hay además una `ValidacionSuite` que
autochequea invariantes de estado (ej. conteo de favoritos vs. contador
en DOM) y puede auto-repararse (`reparar()`).

## 8. ⚠ Hallazgo P0 — Cloudflare Pages Functions de reseñas mal ubicadas

Cloudflare Pages Functions usa ruteo por convención de archivos: todo lo
que esté en `/functions` (raíz del proyecto desplegado) se mapea a rutas
HTTP (`/functions/reviews.js` → `/reviews`). El archivo real está en
`donde-comer-cdu/js/functions/reviews.js` — **fuera** del directorio que
Cloudflare Pages indexa. La única carpeta `functions/` en la raíz del
repo contiene únicamente `weather.js`.

`ficha.js` (línea 324 y 355, verificado) hace:
```js
fetch("/reviews?id=" + encodeURIComponent(DATA.uru_id))
fetch("/reviews", { method: "POST", ... })
```
Si mi lectura de la convención de Cloudflare es correcta, estas llamadas
devuelven 404 en producción, y toda la feature de reseñas propias
(mostrar reseñas + formulario de carga) está silenciosamente rota — el
propio `ficha.js` tiene un manejo de error que probablemente muestra
"No pudimos cargar las reseñas ahora" en cada visita a cualquier ficha.

**No pude confirmar esto contra producción real** (sin ruta de red desde
este entorno a `uruspot.pages.dev`). Es una inferencia de alta confianza
a partir de la convención documentada de Cloudflare Pages, no una
observación directa del comportamiento en vivo. **Verificación sugerida
inmediata:** abrir cualquier ficha en producción y ver si la sección de
reseñas carga o muestra el mensaje de error; o `curl -I
https://uruspot.pages.dev/reviews?id=URU-00120` y ver si da 404.

## 9. ⚠ Hallazgo P0 — Bundles de producción desactualizados

Reconstruí los 4 bundles (`node scripts/build-motor-bundle.js`,
`build-ambiente-bundle.js`, `build-app-min.js`, `build-css-bundle.js`)
desde el código fuente actual, en un checkout limpio, y los comparé
byte a byte contra lo commiteado:

- `donde-comer-cdu/css/critical.bundle.css`: **idéntico** salvo el
  timestamp del comentario de cabecera (no hay drift real).
- `donde-comer-cdu/js/motor.bundle.js`: **difiere de verdad**. El fuente
  de `locales-slug.js` tiene 6 slugs más que el bundle commiteado
  (`brode`, `cremolatti`, `el-conventillo-de-baco`, `gimnasio-538`,
  `justo-josé`, `lucero`). El fuente de `motor-exposicion.js` agregó
  funciones nuevas (`tieneFicha`, `ordenarFichaPrimero`) que priorizan en
  resultados de búsqueda los lugares que sí tienen ficha propia — el
  bundle servido hoy en producción **no tiene esta lógica**.
- `donde-comer-cdu/js/app.min.js`: **difiere de verdad** — el fuente de
  `pintarDestacados()` ahora también prioriza lugares con ficha
  (`fichaA`/`fichaB` en el criterio de sort) antes que por score de
  rating; el bundle commiteado no lo tiene.
- `donde-comer-cdu/js/ambiente.bundle.js`: diferencia mínima de tamaño
  (-1 byte), consistente con solo el timestamp — no verifiqué línea por
  línea si hay drift funcional real acá, ⚠ pendiente.

**Esto es el mismo patrón de bug que ya causó el problema de pinch-zoom
documentado previamente** (bundles generados antes del último commit de
fuente, nunca regenerados). No hay ningún paso de CI que verifique esto
— el workflow de GitHub Actions solo corre Playwright, no
`build:bundles` ni una comparación bundle-vs-fuente. Ver ROADMAP.md P0.

## 10. Convenciones de código (observadas, no inventadas)

- Identificadores, comentarios y mensajes de usuario en **español**
  (código y UI), consistente en los 46 archivos JS revisados.
- Namespace global con prefijo `URU_` o `Ambiente`/`AmbienteX` para todo
  lo expuesto a `window`.
- Cabeceras de archivo largas, en prosa, explicando el "por qué" de
  decisiones no obvias — no changelog por versión (política explícita en
  `motor-plano.js`: el historial vive en git, no en el comentario, porque
  un comentario desincronizado miente).
- Funciones puras separadas explícitamente de las impuras dentro del
  mismo archivo, con comentario de sección marcando el límite.
- Nombres de test en español, en primera persona del resultado ("✓ ...")
  — legibles como aserciones humanas, no solo IDs técnicos.
- Sin ningún framework de testing externo (no Jest/Mocha/Vitest) — los 5
  suites (`run-tests.js`, `motor-test.js`, `smoke-tests.js`,
  `contract-tests.js`, `ambiente-lifecycle-tests.js`,
  `coreografias-tests.js`) están escritos a mano contra Node puro.

## 11. Decisiones arquitectónicas importantes

- **Mapa propio en Canvas en vez de Leaflet.** Hay evidencia (archivos
  `repro-scroll-rama.js`, `repro-salidas-concurrentes.js`, y el propio
  `AGENTS.md`) de que hubo una implementación Leaflet-based abandonada
  por problemas de mapa oscuro/no-didáctico y scroll infinito; el motor
  actual es una reescritura completa desde cero.
- **"Plano continuo" en vez de máquina de estados discreta** para
  decidir qué región de contenido mostrar (documentado explícitamente
  como reemplazo intencional de "cualquier noción de estado discreto").
- **Carga diferida no bloqueante del Ambient Engine** — se agrega vía
  `<script>` dinámico después de que el catálogo cargó, con
  `requestIdleCallback`, específicamente para no bloquear el time-to-
  interactive de la funcionalidad core (buscar/filtrar/ver lugares).
- **Scheduler único compartido** para todas las tareas animadas del
  Ambient Engine (un solo listener de `visibilitychange`, un solo rAF
  activo) — decisión de performance explícita, verificada por tests.
- **Priorización de fichas propias sobre resultados de Maps genéricos**
  (cambio reciente en el fuente, aún no en producción — ver §9).

## 12. Qué NO debería modificarse sin entender las consecuencias

1. **El orden de `<script>` en `donde-comer-cdu/index.html`** — hay
   dependencias implícitas de inicialización (`motor.bundle.js` antes
   que `app.min.js`; `ambiente.bundle.js`/`coreografias.js` cargados
   deliberadamente después y de forma diferida).
2. **La firma pública de `motor-plano.js`** (`leerEstado`,
   `registrarApertura`, `guardarEstado`, `aplicarAccion`, `region`,
   `rolPorAperturas`) — consumida directamente por `app.js`; el propio
   archivo lo marca como contrato verificado con grep, "tocar su firma
   rompe la app".
3. **`_redirects`** (bloqueo de `lugares-mapa.json`) — no mover ese
   archivo de carpeta sin actualizar también `split_dataset.py`, que lo
   lee con ruta relativa fija.
4. **Los 4 bundles de producción no deben editarse a mano** — son
   generados, cualquier fix debe ir al fuente y luego regenerarse con
   `npm run build:bundles` (y, dado el hallazgo de §9, **regenerarse
   ahora mismo** antes de cualquier otro cambio).
5. **El view-transition-name compartido** entre `.tarjeta-nombre`
   (`app.js`) y `.hero-title` (`ficha.js`) — romper ese nombre compartido
   rompe la animación de continuidad entre catálogo y ficha, sin error
   visible (degrada en silencio a salto instantáneo).
6. **El esquema de `REQUIRED_DOM_IDS` en `app.js`** — si un ID cambia en
   el HTML sin actualizar esa lista, `validarDOM()` lanza error fatal al
   iniciar toda la app.
