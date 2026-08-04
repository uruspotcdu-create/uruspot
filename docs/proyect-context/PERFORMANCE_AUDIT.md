# PERFORMANCE_AUDIT.md — URU SPOT

> ⚠ **Limitación metodológica explícita**: este entorno sandboxeado no
> tiene ruta de red hacia `uruspot.pages.dev` ni puede lanzar un
> navegador headless (Chromium no está preinstalado y no hay ruta de red
> para descargarlo — la misma limitación que documentaron sesiones
> previas). Por lo tanto **no pude correr Lighthouse ni Playwright real
> contra el sitio en vivo ni contra un build local servido**, y no
> reproduzco cifras de FPS/CPU en vivo. Lo que sigue combina: (a) análisis
> estático verificable de código/tamaños/build, que sí pude hacer
> directamente, y (b) una cifra histórica de una captura de dispositivo
> real de una sesión anterior, citada como tal y marcada como
> **no revalidada en esta pasada**. Cualquier cifra de FPS/CPU/memoria
> nueva requiere que DSA corra `npm run perf:mobile` o el script
> `baseline-visual-uruspot.js`/Lighthouse localmente y reporte el
> resultado, como ya se hizo en sesiones anteriores.

---

## 1. Rendimiento general — lo verificable estáticamente

**Carga inicial de `donde-comer-cdu/index.html` (verificado en el
`<head>`):**
- `css/critical.bundle.css` (73.849 bytes, 16 archivos fuente
  concatenados y minificados, -58,4% vs. sin minificar) cargado
  bloqueante — es el único CSS bloqueante, correcto para "critical CSS".
- `css/contenido-editorial.css` con `<link rel="preload" as="style">` +
  `<link rel="stylesheet">` — patrón de preload correcto para CSS no
  crítico pero necesario pronto.
- `js/motor.bundle.js` y `js/app.min.js` cargados con `defer` — no
  bloquean el parser de HTML, correcto.
- `lugares-core.json` con `<link rel="preload" as="fetch" crossorigin>`
  — adelanta la descarga del catálogo antes de que el JS lo pida,
  reduciendo el tiempo hasta el primer render de datos reales.
- `dns-prefetch` a los 4 subdominios de CartoDB — ⚠ posible vestigio: el
  motor de mapa actual es Canvas puro (`motor-render.js`), no un mapa de
  tiles tradicional que consuma esos subdominios como basemap. Si ya no
  se usan, esto es una micro-optimización trivial de limpieza (quitar
  prefetch innecesario) — no confirmé su uso real, ⚠ pendiente de
  `grep` cruzado contra `motor-render.js`.

**Ambient Engine — diseñado explícitamente para no competir por el hilo
principal en el arranque:** se inyecta con `<script>` dinámico solo
después de que el catálogo cargó, con `requestIdleCallback` (timeout de
1200ms como fallback) — es decir, la funcionalidad "core" (buscar, ver
lugares) no espera al Ambient Engine bajo ninguna circunstancia.

## 2. Mobile — gama baja/media

**Dato histórico (⚠ de una sesión anterior, NO revalidado en esta
auditoría, atribuido a una captura de 10 segundos en un Android de gama
media):** Ambient Engine completo ≈ 25,1 fps promedio, 14 "long tasks"
por 926ms totales en esos 10s; costo de frame del motor ambiental
completo ≈ 44,2 ms/frame vs. ≈ 17,9 ms/frame solo con mapa+lista (sin
ambiente) — es decir, el Ambient Engine agregaba ≈ 26,3 ms/frame en esa
medición, repartido ≈ 57% en módulos visuales (`sustratoVisual`) y ≈ 43%
en núcleo (Movimiento+Estados+Respiración). **Esta cifra puede estar
desactualizada** — hubo trabajo posterior de "Fidelidad real" +
"Desacople de frecuencias" y un Fase 6 de optimización de ciclo de vida
(idempotencia, pausa real por `visibilitychange`) commiteado
(`9795c46`, según contexto de sesión) después de esa medición. **No hay
una medición fresca posterior a esos cambios en este repo/sesión.**

**Lo que sí verifiqué en el código de esta pasada, relevante a
performance mobile:**
- Scheduler único compartido para las tareas animadas del Ambient Engine
  (un solo `requestAnimationFrame` activo para múltiples tareas, un solo
  listener de `visibilitychange` que pausa/reanuda todo el loop
  compartido) — confirmado por los 50/50 tests de
  `ambiente-lifecycle-tests.js` corridos en esta sesión.
- `prefers-reduced-motion` respetado explícitamente en varios puntos
  (`Coreografias.reducirMovimiento()`, con test que confirma que baja
  duración de coreografías a ≤150ms).
- Debounce de búsqueda (160ms) y de filtro (80ms, deliberadamente más
  corto porque un click en chip ya es una intención completa según
  comentario del propio código) — evita trabajo de render redundante en
  tecleo rápido.
- Carga de datos en tandas (`aplicarEnTandas`, tamaño de tanda 60,
  usando `requestIdleCallback`) al completar detalles/estado de
  lugares — evita bloquear el hilo principal con un solo loop síncrono
  sobre potencialmente miles de registros.
- Render diferencial con múltiples chequeos de "¿cambió algo de verdad?"
  antes de repintar (hash de IDs, no solo longitud).

## 3. Desktop

⚠ No auditado específicamente por separado en esta pasada — el código
no tiene ramas de comportamiento condicionadas a "desktop" salvo
`@media` en CSS (breakpoints estándar). No encontré indicios de
problemas de escalabilidad específicos de pantalla grande en el código
revisado, pero tampoco medí layout shift ni renderizado real en
viewport grande.

## 4. Código — hallazgos concretos

**🔴 Hallazgo principal (ver ARCHITECTURE.md §9, repetido acá por ser de
performance/entrega, no solo arquitectura):** los bundles de producción
(`motor.bundle.js`, `app.min.js`) están desactualizados respecto al
fuente. Esto no es un problema de *cuánto* pesa el bundle — es un
problema de que **el bundle servido no es el código que se auditó y
testeó**. Cualquier medición de performance contra producción hoy mide
código viejo.

**Tamaño de los bundles (medido directo, bytes reales del build
regenerado en esta sesión):**
| Bundle | Sin minificar | Minificado | Reducción |
|---|---|---|---|
| `motor.bundle.js` (10 módulos) | 319.900 B | 93.726 B | -70,7% |
| `ambiente.bundle.js` (30 módulos*) | 251.230 B | 71.998 B | -71,3% |
| `app.min.js` | 157.553 B | 68.648 B | -56,4% |
| `critical.bundle.css` (16 archivos) | 177.375 B | 73.849 B | -58,4% |

\* El script de build reporta "30 módulos" al bundlear `ambiente.bundle.js`
— cifra distinta a los "27 archivos `ambiente-*.js`" que cuenta `find`
en `js/`. ⚠ Diferencia no reconciliada en esta pasada: probablemente el
script de build cuenta algunos archivos no-`ambiente-*` que también
entran al bundle (ej. utilidades compartidas), pero no confirmé cuáles.

**Archivos más pesados del repo (sin contar bundles, que son
derivados):** `app.js` (3.975 líneas / 157 KB sin minificar) y
`motor-render.js` (3.032 líneas) — ninguno partido en módulos más chicos
todavía. No es necesariamente un problema (el propio código está
internamente organizado en secciones claras), pero es el candidato
natural si en el futuro se busca code-splitting real (hoy no hay ningún
mecanismo de carga condicional dentro de `app.js` — se carga entero
siempre).

**Código duplicado:** no audité esto exhaustivamente en esta pasada
(requeriría un análisis línea por línea o una herramienta tipo
jscpd). Sesiones previas documentadas ya hicieron un pase de
normalización de CSS (45 grupos de reglas duplicadas fusionadas) — no
reconfirmé si volvió a acumularse duplicación desde entonces.

## 5. Assets

- Imágenes: mezcla de `.webp` (mayoría) y algunos `.jpg`/`.jpeg`/`.png`
  legacy en `img/` — 48 `.webp`, 26 `.jpg`, 39 `.png` (conteo por
  extensión con `find`). La convención `.webp` para fotos nuevas parece
  seguirse, pero hay assets `.jpg` reales de locales (`danys1.jpg`,
  `lucianos1.jpg`, etc.) que no están en `.webp` — ⚠ no confirmé si es
  deliberado (fuente original solo disponible en jpg) o pendiente de
  conversión.
- Cache de imágenes de marca (favicons, logo, íconos de manifest):
  `Cache-Control: public, max-age=31536000, immutable` vía `_headers` —
  correcto y explícitamente documentado en el propio archivo con la
  razón (esos archivos nunca cambian de contenido bajo el mismo nombre).
- Fotos de locales (`img/*.jpg`/`.webp` de platos/lugares): **fuera** de
  esa excepción a propósito — quedan bajo la regla general
  `Cache-Control: public, max-age=0, must-revalidate`, porque sí se
  reemplazan a mano bajo el mismo nombre de archivo (documentado en
  `_headers`).
- No audité tamaño en KB de cada imagen individualmente en esta pasada.

## 6. Build

- Sin bundler de aplicación (Webpack/Vite/esbuild/Rollup) — el "build"
  real son 4 scripts a medida con Terser para JS y un concatenador
  propio para CSS (`scripts/build-*.js`).
- **El build no es parte de ningún hook automático** (sin pre-commit,
  sin paso de CI que lo ejecute o verifique) — es 100% responsabilidad
  manual de quien commitea correr `npm run build:bundles` antes de
  cada deploy que toque `js/` o los CSS bundleados. Esto es la causa
  raíz tanto del bug de pinch-zoom histórico como del drift detectado
  en esta auditoría (ARCHITECTURE.md §9). **Es la mejora de build de
  mayor impacto disponible** — ver ROADMAP P0.
- Dependencias de build (`terser`, `lighthouse`, `playwright`,
  `http-server`) son pocas y acotadas — no hay una cadena de
  dependencias transitivas de un framework grande que auditar.

---

## Resumen ejecutivo de performance

No hay evidencia de que el *diseño* del sistema tenga problemas
estructurales de performance — al contrario, hay decisiones deliberadas
y ya probadas (scheduler único, carga diferida, tandas con idle
callback, debounce, render diferencial, `prefers-reduced-motion`) que
son las correctas para este tipo de producto. **El riesgo real de
performance hoy no es de diseño, es de proceso**: el build manual sin
verificación automática significa que el código optimizado que existe
en el fuente puede no estar llegando a producción, y no hay forma de
detectarlo salvo que alguien lo note manualmente (como en esta
auditoría). Ver ROADMAP.md P0 para la propuesta concreta de safeguard.
