# PROJECT_CONTEXT.md — URU SPOT

> Documento generado por auditoría directa del código real del repositorio
> `uruspotcdu-create/uruspot`, rama `main`, commit `1953504` (03-ago-2026).
> Metodología: clon del repo, ejecución de la suite de tests (`node
> donde-comer-cdu/js/run-tests.js` → **5/5 suites en verde**, 108 tests
> individuales), reconstrucción de los 4 bundles de build desde el fuente
> actual y diff contra lo commiteado, lectura directa de archivos clave
> (no resumen de documentación previa). Se usó `AGENTS.md` (documento
> previo de 92 KB ya existente en el repo) únicamente como referencia de
> contraste, no como fuente. Toda afirmación de este documento está
> respaldada por comando/archivo verificable; donde no pude verificar algo
> lo marco explícitamente con ⚠.

---

## 1. Identidad del proyecto

**Nombre:** URU SPOT
**Descripción (fuente: `package.json`):** *"URU SPOT — Guía local de
Concepción del Uruguay. Sitio estático; sin build step para el
HTML/CSS."*

**Qué es:** una guía local curada y verificada de Concepción del Uruguay
(Entre Ríos, Argentina) — un catálogo de lugares reales (gastronomía,
alojamiento, salud, deporte, compras, servicios, y más rubros) con datos
verificados por DSA a mano, no scrapeados ni generados.

**Problema que resuelve:** ayudar a alguien a decidir "¿dónde como / dónde
estoy / dónde voy en esta ciudad?" con información confiable, en un
mercado (ciudad chica de Entre Ríos) donde Google Maps y las redes
sociales tienen cobertura desigual, desactualizada o con negocios
fantasma.

**Usuarios objetivo:**
- Vecinos de Concepción del Uruguay buscando un lugar puntual (rubro,
  cercanía, tipo de comida).
- Turistas / visitantes ocasionales (la ciudad tiene fuerte perfil
  turístico ribereño), reflejado en el módulo `inicio/` con contenido
  editorial (Cocina del Río, guía universitaria, circuitos, cómo llegar).
- Usuarios recurrentes que vuelven a guardar/consultar lugares — el motor
  tiene un modelo explícito de "roles" según cantidad de aperturas
  (`anfitrion` → `conocido` → `complice` → `casa`, ver §6).

**Casos de uso principales** (verificados en `js/app.js`):
1. Descubrimiento sin intención explícita: el sitio decide qué mostrar
   ("iniciativa propia") vía un motor de recorte/exposición.
2. Búsqueda explícita por texto (con tolerancia a errores tipográficos,
   `distanciaAcotada`/Levenshtein acotado en `motor-exposicion.js`).
3. Filtro por rubro (chips).
4. "Cerca de mí" (geolocalización, ordena por distancia).
5. Guardar lugares favoritos (localStorage, sección "curaduría"/"tu
   lista").
6. Ver ficha de un lugar (51 páginas estáticas propias en `locales/`,
   con reseñas propias vía Cloudflare Functions + KV — ver §5 y
   ARCHITECTURE.md §8 sobre su estado real).
7. Ver el lugar en un mapa propio (Canvas, no Leaflet — motor propio, ver
   §6).

---

## 2. Visión del producto

- **Verificación real por encima de cobertura amplia**: el propio
  `_redirects` documenta la filosofía — los datos "crudos" (con estados
  `pendiente`/`no encontrado`) viven separados de los "servidos", y el
  pipeline (`split_dataset.py`) separa explícitamente lo verificado de lo
  que no.
- **Sitio estático, sin dependencia de un framework de UI.** Cero React,
  Vue, Svelte. HTML/CSS/JS vanilla con módulos IIFE + `window` namespace.
  Esta es una decisión arquitectónica deliberada, no una limitación —
  documentada explícitamente en varios archivos fuente (ver
  ARCHITECTURE.md).
- **Motor propio en vez de librerías de terceros para piezas centrales**:
  mapa propio en Canvas (no Leaflet/Mapbox — hay evidencia de que Leaflet
  se usó y se abandonó, ver §7 Historia), buscador propio con índice
  invertido y fuzzy matching propio (no Algolia/Fuse.js).
- **"Ambient Engine"**: un sistema de fondo decorativo/no-interactivo
  (partículas, clima, luz, ritmo de movimiento) que reacciona a
  clima real, hora del día y estado de sesión del usuario — 27 módulos
  bajo `donde-comer-cdu/js/ambiente-*.js` (contado por `find`, no
  asumido — el propio `AGENTS.md` señala que una versión previa de esa
  cifra, "30", ya estaba desactualizada).
- **Qué lo diferencia**: la combinación de (a) datos 100% verificados a
  mano en vez de importados de Google/redes, (b) un motor de
  descubrimiento con estado por sesión (roles, "recorte" con
  diversidad/exploración, no solo lista estática), y (c) una capa
  ambiental que hace que el mapa/fondo respire con clima y hora reales.

---

## 3. Estado actual

### Qué existe y funciona (verificado)
- **Motor de catálogo `donde-comer-cdu/`**: `index.html` (1.483 líneas,
  ver ⚠ nota de discrepancia abajo) + 46 archivos JS en `js/` (19.312
  líneas sumadas, sin contar bundles) + 19 hojas CSS (11.746 líneas
  sumadas). **5/5 suites de test pasan** (`motor-test.js`,
  `smoke-tests.js`, `contract-tests.js`, `ambiente-lifecycle-tests.js`
  50/50, `coreografias-tests.js` 33/33 — corridos por mí en esta
  auditoría, no asumidos).
- **Portada `inicio/`**: `index.html` de 4.812 líneas + `homepage.css`
  de 4.420 líneas — es la home real del dominio (confirmado por
  `<link rel="canonical" href="https://uruspot.pages.dev/">` dentro del
  archivo).
- **51 fichas de locales** (`donde-comer-cdu/locales/<slug>/index.html`,
  contadas por `find`), cada una con reseñas propias vía `fetch("/reviews
  ...")`.
- **7 landing pages temáticas de SEO** (`los-mejores-restaurantes-cdu`,
  `las-mejores-cafeterias-cdu`, `las-mejores-heladerias-cdu`,
  `las-mejores-hosterias-cdu`, `las-mejores-panaderias-cdu`,
  `los-mejores-bares-cdu`, `los-mejores-gimnasios-cdu`,
  `mejores-veterinarias-cdu`), la primera de ellas (restaurantes) con
  subpáginas propias por local (62 entradas bajo
  `los-mejores-restaurantes-cdu/`).
- **2 Cloudflare Pages Functions activas de verdad**: `functions/weather.js`
  (proxy a la API de MET Norway, corrige un 525 de Open-Meteo desde la red
  de Cloudflare — comentario explícito en el propio archivo) y las de
  reseñas, con la salvedad crítica de ubicación de archivo (ver §4 y
  ROADMAP P0).
- **Suite de tests visuales con Playwright** (`tests/visual/`, 5 estados ×
  3 viewports, baseline ya capturado — confirmado por memoria de sesiones
  previas, archivos presentes en el repo) + workflow de GitHub Actions
  (`.github/workflows/tests-visuales.yml`) que corre Playwright en cada
  push/PR a `main`.
- **`_redirects` bloquea el acceso directo a `lugares-mapa.json`** (fuente
  cruda editada a mano) con un 404 — cierra un pendiente de seguridad de
  datos que en auditorías anteriores estaba abierto.
- **No existe ya un `index.html` residual en la raíz del repo** — el
  script de redirect que documentaban auditorías previas ya no está
  presente (verificado: `ls index.html` falla, no existe).

### ⚠ Discrepancias detectadas contra el AGENTS.md existente
El `AGENTS.md` del repo (92 KB, con dos "pasadas" de auditoría propias)
afirma que `donde-comer-cdu/index.html` tiene ~2.663-2.700 líneas y que
`inicio/` es solo la landing. En esta auditoría:
- `donde-comer-cdu/index.html` mide **1.483 líneas** hoy — bajó
  significativamente desde la última pasada documentada en AGENTS.md
  (probablemente por la extracción de los ~1.006 líneas de comentarios de
  ingeniería a `docs/arquitectura-index.md`, que sí existe como línea de
  trabajo mencionada — aunque no encontré ese archivo específico en
  `docs/`, ⚠ no confirmado dónde terminó ese contenido).
- `inicio/index.html` mide **4.812 líneas** — mucho más grande que lo que
  documentaba cualquier pasada anterior. Esto es consistente con el
  trabajo de rediseño "Corriente"/Barrios+Mareas que se fue acumulando
  ahí.
- **No pude encontrar `docs/arquitectura-index.md`** que un trabajo previo
  documentado (fuera del repo, en contexto de sesión) decía haber creado.
  ⚠ Incertidumbre: no está en el `docs/` actual del repo.

### Qué está roto o necesita atención inmediata
Ver **ROADMAP.md** para el detalle completo con prioridades. Resumen:
1. **Bundles de producción desactualizados respecto al fuente** (P0,
   verificado reconstruyéndolos y diffeando — ver ARCHITECTURE.md §9 y
   PERFORMANCE_AUDIT.md).
2. **Cloudflare Pages Functions de reseñas mal ubicadas** — muy
   probablemente no están sirviendo `/reviews` en producción (P0, ver
   ARCHITECTURE.md §8).
3. Pendientes ya documentados por el propio repo en
   `URUSPOT-PENDIENTES-VERIFICADO-287.md` (287 líneas — ⚠ no leído línea
   por línea en esta pasada, recomendado como insumo directo para
   ROADMAP futuro).

---

## 4. Stack completo

**Lenguajes:** HTML5, CSS3, JavaScript vanilla (ES5/ES6 mixto,
IIFE + `window` namespace, sin módulos ES ni bundler de aplicación),
Python (un solo script utilitario, `donde-comer-cdu/split_dataset.py`).

**Sin framework de frontend.** Cero React/Vue/Angular/Svelte en el sitio
servido. (Nota: el propio entorno de Claude puede usar React para
artifacts, pero **no es parte del stack del proyecto real**.)

**Build/tooling (`package.json`, `devDependencies`):**
- `@playwright/test` ^1.62.0 — tests visuales de regresión.
- `http-server` ^14.1.1 — server local de desarrollo.
- `lighthouse` ^13.4.1 — auditoría de performance (`lighthouse-mobile-uruspot.js`
  en la raíz).
- `terser` ^5.49.0 — minificación de los bundles JS manuales.

**Scripts npm reales** (`package.json`):
```
sitemap          → node scripts/generar-sitemap.js
schema:restaurantes → node scripts/agregar-schema-restaurantes.js
build:bundles    → build-motor-bundle + build-ambiente-bundle + build-app-min + build-css-bundle
test             → node donde-comer-cdu/js/run-tests.js
perf:mobile      → node lighthouse-mobile-uruspot.js
```

**No hay build step para HTML/CSS individuales** — se editan y se sirven
directo. **Sí hay un build manual para 4 artefactos de producción**:
`js/motor.bundle.js`, `js/ambiente.bundle.js`, `js/app.min.js`,
`css/critical.bundle.css` — generados por los 4 scripts de `scripts/`,
concatenando y minificando con Terser. **Este build no es automático**:
no hay un hook de pre-commit ni un paso de CI que lo regenere — depende
de que quien commitea corra `npm run build:bundles` a mano antes. Esto ya
causó al menos un bug de producción documentado (pinch-zoom, por
bundles obsoletos) y **hoy mismo (esta auditoría) hay bundles
nuevamente desactualizados** — ver ARCHITECTURE.md §9.

**Hosting/deploy:** Cloudflare Pages (`uruspot.pages.dev`), sin
`wrangler.toml`. Configuración de build vive solo en el dashboard de
Cloudflare (⚠ no verificable desde este entorno sandboxeado, sin ruta de
red a `uruspot.pages.dev`).

**Backend/serverless:** Cloudflare Pages Functions (`functions/*.js`,
convención de ruteo por archivo). Dos funciones reales: `weather.js`
(proxy a MET Norway) y las de reseñas (`reviews.js`/`reviews-admin.js`,
con problema de ubicación — ver §8 de ARCHITECTURE.md). Persistencia:
Cloudflare KV (binding `REVIEWS_KV`, requerido en el dashboard, no en
código).

**CI:** GitHub Actions (`.github/workflows/tests-visuales.yml`) — corre
Playwright contra `main` en push/PR.

**Datos:** JSON estáticos servidos como archivos (`lugares-core.json`,
`lugares-detalles.json`, `lugares-estado.json`, más un sistema de tiles
`donde-comer-cdu/datos/lugares-mapa-tiles/*.json` para virtualización del
mapa por viewport). Fuente cruda editada a mano:
`donde-comer-cdu/.fuente/lugares-mapa.json`, separada por
`split_dataset.py` antes de cada deploy.

**Terceros externos reales:** MET Norway (clima, vía función propia),
basemaps de CartoDB (`a/b/c/d.basemaps.cartocdn.com`, dns-prefetch
confirmado en `index.html` — ⚠ no confirmé si el motor de mapa Canvas los
sigue usando como tiles base o son vestigio de un mapa anterior; el
motor de mapa (`motor-render.js`, 3.032 líneas) es Canvas puro, no un
mapa de tiles tradicional, así que esto podría ser vestigial).

---

## 5. Arquitectura general (resumen — detalle en ARCHITECTURE.md)

**Estructura de carpetas real** (verificada con `find`, no memoria):

```
/                            → sin index.html propio (ya no existe)
├── inicio/                  → HOME real del sitio (canonical "/")
│   ├── index.html (4.812 líneas)
│   ├── css/ (homepage.css, refactor-utilities.css, zonas-macroambiente.css)
│   └── js/verificar-mapa-circuitos.js
├── donde-comer-cdu/         → EL PRODUCTO (motor de catálogo/mapa/buscador)
│   ├── index.html (1.483 líneas)
│   ├── js/ (46 archivos — motor-*, ambiente-* ×27, app.js, ficha.js, tests)
│   ├── css/ (19 archivos + critical.bundle.css)
│   ├── locales/ (51 fichas estáticas)
│   ├── datos/lugares-mapa-tiles/ (tiles JSON del mapa)
│   ├── lugares-core.json / lugares-detalles.json / lugares-estado.json
│   └── .fuente/lugares-mapa.json (fuente cruda, bloqueada por _redirects)
├── los-mejores-*-cdu/, las-mejores-*-cdu/, mejores-veterinarias-cdu/
│                           → 8 landing pages SEO temáticas independientes
├── functions/               → Cloudflare Pages Functions (raíz correcta)
│   └── weather.js           → único archivo aquí (ver problema en §8 ARCHITECTURE)
├── scripts/                 → build de bundles + generación de sitemap/schema
├── tests/visual/            → Playwright (specs + baseline de screenshots)
├── img/                     → assets de imagen compartidos
├── docs/                    → documentación de fases previas (Ambient Engine, contratos)
└── AGENTS.md, README.md, manifest.json, sw.js, _headers, _redirects, robots.txt, sitemap.xml
```

**Patrón de módulos JS:** IIFE con export a `window.<Nombre>` (namespace
global), sin `import`/`export` de ES Modules, sin bundler tipo Webpack.
Cada módulo se referencia por `<script defer>` en orden explícito en el
`<head>`/`<body>` de cada HTML, y el orden importa (dependencias
implícitas por orden de carga, no declaradas).

**Núcleo puro vs. capas impuras** (patrón repetido y documentado dentro
del propio código, ej. en `motor-plano.js`): funciones de cálculo puras
(reciben estado, devuelven estado nuevo, testeables sin DOM) separadas
explícitamente de las funciones impuras (DOM, `fetch`, `localStorage`).
`motor-plano.js` es el ejemplo canónico: no depende de
`motor-exposicion.js` ni `motor-mapa.js` — éstos leen su estado, nunca al
revés.

**Flujo de datos de alto nivel** (donde-comer-cdu, verificado en
`app.js`):
```
lugares-core.json (fetch, bloqueante para primer render)
  → REGISTRO (array en memoria) + porId (índice)
  → IndiceInvertido.construir(REGISTRO)   [búsqueda]
  → render()
      → PLANO.region(estado)              [motor-plano.js: en qué "región" está la sesión]
      → rama = curaduria | buscador | recorte:<region>
      → según rama: EXPO.coleccionCurada | EXPO.resultadosPorAccionExplicita
                     | EXPO.recortePorIniciativaPropiaExplicado
      → pintarTarjetas() + actualizarMapaHerramienta() [motor-mapa.js + motor-render.js]
      → Coreografias.activarEscenaPorRama() [Ambient Engine, cargado diferido]
  (en paralelo, diferido con requestIdleCallback)
  → lugares-detalles.json + lugares-estado.json → completan REGISTRO → re-render
  → js/ambiente.bundle.js + js/coreografias.js → Ambient Engine (no bloquea la app)
```

---

## 6. Mapa del sistema

**Entrada del usuario:** `inicio/index.html` (home real, `/`) → enlaza a
`donde-comer-cdu/` (el motor) y a las landing pages SEO temáticas.

**Procesamiento (dentro de `donde-comer-cdu/`):**
1. Carga bloqueante de `lugares-core.json` (campos livianos: id, nombre,
   categoría, grupo, lat/lng, rating).
2. Estado de sesión persistido en `localStorage`
   (`PLANO.leerEstado`/`guardarEstado`, namespaced por ciudad —
   `concepcion-del-uruguay`), con un modelo de "plano continuo" de dos
   ejes (autonomía × fricción tolerable) en vez de estados discretos —
   decisión arquitectónica explícita documentada en `motor-plano.js`.
3. Motor de exposición (`motor-exposicion.js`, 803 líneas) decide qué
   recorte mostrar por iniciativa propia: scoring por afinidad,
   proximidad, frescura (cuántas veces ya se mostró) y contexto
   climático — con diversidad forzada por rubro y un "cupo de
   exploración" además de relevancia pura.
4. Render diferencial (`app.js`) evita repintar si nada cambió realmente
   (comparación por hash de IDs, no solo longitud de lista).
5. Mapa propio en Canvas (`motor-render.js`, `motor-mapa.js`) recibe los
   puntos ya filtrados/recortados y los dibuja, con clustering/tiles
   (`datos-virtualizador.js` fetchea tiles JSON por viewport).
6. Ambient Engine (27 módulos `ambiente-*.js`, orquestados por
   `ambiente-orquestador.js`) corre en paralelo, no bloqueante, cargado
   con `requestIdleCallback`.

**Componentes involucrados:** ver ARCHITECTURE.md para el detalle
completo módulo por módulo.

**Resultado final:** tarjetas de lugares interactivas (aceptar/rechazar/
guardar/compartir/llamar/ver en maps), mapa sincronizado, y — al abrir
una ficha — una página estática propia con reseñas propias (pendiente de
confirmar si funcionan en producción, ver §8 ARCHITECTURE) más botón a
Google Maps.

---

## 7. Funcionalidades (inventario, no exhaustivo por espacio — ver
ARCHITECTURE.md para el detalle técnico de cada una)

| Funcionalidad | Ubicación | Estado |
|---|---|---|
| Descubrimiento por iniciativa propia (recorte con scoring) | `motor-exposicion.js`, `motor-plano.js` | ✅ funcional, testeado |
| Búsqueda de texto con tolerancia a errores | `motor-exposicion.js` (`resultadosPorAccionExplicita`) + `motor-indice-busqueda.js` | ✅ funcional |
| Filtro por rubro | `app.js` (`seleccionarRubro`) | ✅ funcional |
| "Cerca de mí" (geolocalización) | `app.js` (`activarCercaDeMi`) | ✅ funcional, con manejo de error/permiso |
| Guardar favoritos / "tu lista" (curaduría) | `app.js` + `localStorage` | ✅ funcional |
| Compartir ficha (Web Share API + fallback clipboard) | `app.js` (`manejarClickPanel`, acción `compartir`) | ✅ funcional |
| Mapa propio en Canvas con clustering | `motor-render.js`, `motor-mapa.js` | ✅ funcional |
| Virtualización de datos del mapa por tiles | `datos-virtualizador.js` + `datos/lugares-mapa-tiles/*.json` | ✅ funcional (solo 10 tiles generados — ⚠ cobertura parcial, no confirmé si faltan tiles para toda la ciudad) |
| Ambient Engine (clima/hora/partículas/luz de fondo) | 27 módulos `ambiente-*.js` | ✅ funcional, 50/50 + 33/33 tests en verde |
| PWA (instalable, manifest, service worker) | `manifest.json`, `sw.js`, `pwa-instalar.js` | ✅ presente — ⚠ no auditado el contenido de `sw.js` en detalle esta pasada |
| Reseñas propias por lugar | `ficha.js` (fetch) + `functions/reviews.js` + KV | ⚠ **probablemente rota en producción** — ver ARCHITECTURE.md §8, P0 en ROADMAP |
| Clima en vivo | `functions/weather.js` | ✅ función ubicada correctamente, lógica clara — ⚠ no pude probar el endpoint en vivo (sin red al dominio desde este entorno) |
| Destacados (ranking por rating con rotación diaria pseudo-random) | `app.js` (`pintarDestacados`) | ✅ funcional, prioriza lugares con ficha propia en el fuente actual — **el bundle en producción no tiene aún este ajuste** |

---

## 8. Flujo del usuario

**Usuario nuevo (`aperturas` bajo — rol "Recién llegado"):**
`inicio/` → click a `donde-comer-cdu/` → ve "guía" (recorte chico,
curado, con explicación de por qué se le muestra cada lugar) → puede
aceptar/rechazar/guardar → si guarda 1+, aparece banner sugiriendo ver
"tu lista".

**Usuario recurrente (más aperturas → rol "Conocido"/"Cómplice"/"Casa"):**
El "plano" (`motor-plano.js`) cambia de región según aperturas y
comportamiento — más exploración, menos guía. El estado persiste entre
visitas vía `localStorage` namespaced por ciudad.

**Acciones principales:** aceptar (ver ficha), rechazar ("no me
interesa", con salida animada), guardar/quitar de favoritos, buscar,
filtrar por rubro, activar "cerca de mí", compartir, cargar más
(paginación de a 8), entrar/salir de "curaduría" (tu lista).

**Estados posibles de la app** (máquina de estados explícita en
`app.js`): `UNINITIALIZED → INITIALIZING → LOADING_CATALOG → READY`, más
`ERROR`, `RECOVERING`, `INTERACTION`, `CLEANUP` — con matriz de
transiciones válidas (`puedeTransicionar`) y recuperación automática de
errores fatales de catálogo con reintento.
