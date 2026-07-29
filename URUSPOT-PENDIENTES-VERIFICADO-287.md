# URU SPOT — Qué falta aplicar (verificado contra el repo real)

### Metodología: no se repite lo ya leído en las auditorías. Se clonó `github.com/uruspotcdu-create/uruspot` (rama `main`) el 2026-07-29 y se verificó, archivo por archivo y con `grep`/lectura directa, qué recomendaciones de Fase 1 → 3D ya están en el código y cuáles no. `node donde-comer-cdu/js/run-tests.js` → **5/5 suites en verde** sobre este mismo clon.

**Convención:**
- ✅ **YA APLICADO** — verificado en el código real, con evidencia.
- ❌ **FALTA APLICAR** — verificado que no existe todavía.
- 🟡 **PARCIAL** — existe la base pero no está conectado/terminado.

---

## 0. Hallazgo general: Fase 4 ya arrancó, parcialmente

El repo **no está en el mismo punto que describían las auditorías de Fase 1/1B/2C** — hay trabajo real de Fase 4 ya hecho, aunque incompleto:

- ✅ `css/tokens.css` ya tiene una sección explícita **"Tokens de Canvas (Fase 4, Blueprint V2 §2)"** (línea 353+), con `--canvas-color-fondo-mapa`, `--canvas-color-texto-pin`, `--canvas-color-pin-defecto`, `--canvas-color-foco`, `--canvas-color-onda-seleccion`, `--canvas-color-cluster-fondo/borde`, `--canvas-color-cluster-mixto-inicio/fin`, `--canvas-color-superficie-flotante`, `--canvas-color-trazo-conexion` — todos mapeados 1:1 a un semántico/primitivo existente, tal como pedía el Blueprint V2 §2-3.
- ✅ `motor-render.js` **ya generaliza `resolverVarCSS()`** más allá del color de foco (que era el único caso documentado en Fase 1B/Blueprint V2): hoy lo usa para fondo de mapa, texto de pin, sombra de marcador, cluster (fondo y degradado mixto), superficie flotante y trazo de conexión — 9 puntos de lectura distintos, no 1.
- ✅ Los 14 `--color-rubro-*` como tokens semánticos ya existen formalmente en `tokens.css` (línea 49-62).

Esto significa que **el P1 "generalizar `resolverVarCSS()`"** (Fase 1B §7, MUST HAVE #6 de Fase 3D, paso 4 del plan de implementación) **ya está resuelto**. Lo que sigue abajo es real y verificado como pendiente — no se repite este punto.

---

## 1. MUST HAVE de Fase 3D — estado real

| # | Ítem | Estado | Evidencia |
|---|---|---|---|
| 1 | Razón de recomendación visible (`recortePorIniciativaPropiaExplicado()` conectado a `app.js`) | ❌ **FALTA** | `grep` confirma: la función solo se llama desde `motor-test.js`. `app.js:1110` sigue usando `recortePorIniciativaPropia()` (la versión "muda", sin razones) |
| 2 | Rating visible en tarjeta del flujo principal | ❌ **FALTA** | `pintarTarjetas()` (`app.js:1470-1535`) no referencia `.rating` en ningún punto — el campo solo se usa en `pintarDestacados()` |
| 3 | Cambio de región perceptible (microseñal + reacción a `lastRenderCache.region`) | ❌ **FALTA** | `lastRenderCache.region` se guarda (`app.js:1127`) pero no hay ningún punto del código que la compare contra el valor anterior para disparar una señal — sigue siendo un dato sin consumidor, exactamente como documentaba Fase 3C §3 |
| 4 | Mapa protagonista real en Exploración (diferenciación cualitativa, no solo cantidad) | ❌ **FALTA** | Cero referencias a `'exploracion'` en `css/mapa.css`, `motor-render.js` o `motor-mapa.js` — el mapa sigue sin ningún tratamiento condicionado a la región activa |
| 5 | Baseline de tests visuales antes de tocar CSS/`motor-render.js` | ❌ **FALTA** | Sin Playwright/Puppeteer/axe-core en `package.json` ni en el repo — `package.json` solo define `test` (run-tests.js) y `sitemap` |
| 6 | `resolverVarCSS()` generalizado en `motor-render.js` | ✅ **YA APLICADO** | Ver §0 |

**3 de 6 MUST HAVE siguen pendientes** (#1, #2, #3, #4, #5 — 5 de 6, corrijo: solo #6 está resuelto).

---

## 2. Descubrimiento — "el por qué"

- ❌ **`recortePorIniciativaPropiaExplicado()` sin conectar.** La función existe, está probada (`motor-test.js`), pero `app.js` sigue llamando a la versión sin razones. Es, según las tres fases de UX (3A §4/§10, 3B §2, 3D §4), el cambio de mayor apalancamiento de todo el plan — cero riesgo arquitectónico, alto impacto.
- ❌ **Rating ausente en tarjetas del flujo principal.** Confirmado: solo aparece en `destacado-card__rating` dentro de `pintarDestacados()`. El campo `rating`/`ratingCount` ya está disponible en el registro (`app.js:898-899`) — falta solo la plantilla.
- ❌ **Serendipia sin control explícito ("sorprendeme").** Sin ningún rastro en `app.js`, `index.html` ni CSS — la fracción de exploración del scoring sigue siendo invisible dentro del recorte normal.
- ❌ **"Mostrar más" sigue siendo paginación simple**, no una nueva tanda con exclusión de lo ya visto (`estado.exposicion`). No se encontró ninguna llamada que recalcule `recortePorIniciativaPropia()` excluyendo `vecesMostrado`/`ultimaVez`.
- ❌ **`contexto.ubicacion`/`contexto.clima` reales siguen sin conectarse.** `app.js:1110` llama a `recortePorIniciativaPropia(REGISTRO, estado, reg.nombre)` — sin cuarto parámetro `contexto`. `functions/weather.js` sigue sin ningún `fetch()` que lo consuma en `js/*.js`.

---

## 3. Regiones — Guía / Exploración / Acción Directa

- ❌ **Sin diferenciación cualitativa entre Guía y Exploración.** Confirmado: cero referencias a `'exploracion'` en el CSS o JS de mapa — la única diferencia real sigue siendo la cantidad (4 vs. 10), tal como documentaba Fase 3A §2.
- ❌ **Filtro de rubro sigue abandonando el recorte curado.** `hayBusquedaOFiltro()` (`app.js:989`) sigue evaluando `filtroRubroActivo` exactamente igual que una búsqueda de texto — no existe el parámetro conceptual nuevo que Fase 3B §5/3C §3 proponían para distinguir "filtro dentro de curaduría" de "filtro tipo búsqueda". Esto además es un **MUST/SHOULD que requiere tests nuevos antes de tocar `ramaActual()`** (Fase 3D, paso 11) — no se detectó ningún test nuevo relacionado en `motor-test.js`.
- ❌ **Variante "inferida" de Acción Directa sigue sin narrativa de cierre.** No se encontró ningún texto tipo "ya no hay nada nuevo hoy" — sigue mostrando el catálogo completo sin explicar por qué salió del recorte curado.
- ❌ **Vista de Evaluación/comparación (etapa nueva del journey) no existe.** Sin componente, sin CSS, sin disparador nuevo sobre `curaduriaSugerida`.
- ❌ **Modificador de urgencia/"ahora"** (prioriza estado-abierto + distancia como primer dato) no está implementado.

---

## 4. El mapa como experiencia

- ❌ **Brújula funcional (widget interactivo) no existe.** Solo se encontró `ambiente-brujula.js` (la familia decorativa del Ambient Engine de fondo) y el asset `brujula--default--regular.svg`. El módulo nuevo que proponía Blueprint V2 Cap. 4.1 (bearing en tiempo real, consumido por `ficha.js` y `motor-mapa.js` en estado de foco) no está creado.
- ❌ **Halo de posición extendido a la tarjeta activa** (más allá del pin de Canvas) — sin evidencia en CSS ni JS.
- ❌ **Reordenamiento condicional del mapa en mobile por región** — no existe ninguna regla `@media` que condicione la posición del mapa según `guia`/`exploracion`/`descubrimiento`; el `@media (max-width:720px)` de `mapa.css` solo cambia altura/tamaño de botones, no orden.
- ❌ **Mapa embebido en fichas** — confirmado ausente: `locales/antigua-fonda/index.html` no tiene ninguna referencia a coordenadas, mapa ni canvas.

---

## 5. Fichas — "Carta de Posición"

Verificado sobre `locales/antigua-fonda/index.html` (misma ficha que citan las auditorías):

- ❌ **Carta de Posición no existe.** El `info-strip` solo tiene 3 celdas (`Estado actual`, `Ubicación`, `Contacto`) — ninguna celda nueva de coordenadas/distancia/"cómo llegar" con mapa.
- ❌ **Pictograma de rubro en `hero-eyebrow`** — el `hero-eyebrow` existe (línea 39) pero sin ícono SVG, solo texto.
- ❌ **Marca de coordenada sobre `hero-img`** — sin overlay SVG de posición.
- ❌ **CTA sticky en mobile** — sin ningún `position:sticky`/`fixed` en la ficha.
- ❌ **Vuelta simétrica con `view-transition-name`** — el mecanismo solo está implementado para la ida (`tarjeta-nombre` en `app.js:1556`); no hay contraparte para la navegación de regreso ni restauración de foco vía `restaurarFoco()` en ese punto específico.

---

## 6. Componentes / Design System

- 🟡 **Pictograma de rubro compartido Canvas↔DOM: 3 de 5 superficies, no 5 de 5.** Confirmado exactamente lo que decía Blueprint V2: `URU_RUBROS_ICONO_SVG()` ya se usa en el filtro "Por rubro" (`app.js:1309,1347`) y en la leyenda del mapa (`app.js:1919`) — pero **no** en la tarjeta de descubrimiento (`pintarTarjetas`) ni en la ficha (`hero-eyebrow`). Sigue siendo la misma brecha, sin avance.
- ❌ **`rubros-meta.js` sigue portando el hex directamente**, no el nombre del token semántico. Confirmado: cada entrada sigue con `['Alojamiento', 'descripción', '#E0C46C', 'd...']` en vez de `'--color-rubro-alojamiento'`. Esto es exactamente el "problema puntual #3" que Blueprint V2 §3 marcaba para resolver — sigue sin resolverse, **a pesar de que `tokens.css` ya tiene el token semántico listo y esperando** (`--color-rubro-alojamiento: #E0C46C`, línea 49). Es decir: la mitad de la solución está lista, falta la migración de `rubros-meta.js` para consumirla en vez de duplicar el valor.
- ❌ **Isolínea como borde de superficie** — sin rastro en `tarjeta-lugar.css` (`grep` de "isolinea" no devuelve nada).

---

## 7. SEO / Infraestructura (heredado de Fase 1 / 1B)

- ❌ **Los 6 canonical rotos hacia GitHub Pages siguen exactamente igual**, sin ninguna corrección — confirmado por archivo:
  `los-mejores-bares-cdu/index.html`, `las-mejores-hosterias-cdu/index.html`, `las-mejores-heladerias-cdu/index.html`, `los-mejores-gimnasios-cdu/index.html`, `las-mejores-panaderias-cdu/index.html`, `los-mejores-restaurantes-cdu/index.html` — todos con `canonical` hacia `uruspotcdu-create.github.io`.
- ❌ **El typo de `donde-comer-cdu/locales/parrilla-la-gruta/index.html` sigue sin corregir**: `canonical` apunta a `/locales/la-gruta/` (carpeta inexistente) en vez de `/locales/parrilla-la-gruta/`.
- ❌ **Las 61 subpáginas de `los-mejores-restaurantes-cdu/*/`** (ej. `el-moro-pizza/index.html`) siguen con `canonical` hacia `donde-comer-cdu/locales/<nombre>/`, ruta que sigue sin existir en el filesystem — confirmado con el mismo archivo citado en la contraauditoría (Fase 1B §2).
- ✅ **El generador de sitemap (`scripts/generar-sitemap.js`) sigue excluyendo correctamente** estas páginas rotas — `sitemap.xml` tiene 48 URLs, 0 de las 61 subpáginas de restaurantes están incluidas (comportamiento defensivo ya documentado, sigue vigente).
- ❌ **No existe Service Worker.** Confirmado: `find` sin resultados para `sw.js` ni registro de `serviceWorker` en ningún JS. Sigue siendo PWA "solo de nombre".
- ❌ **`manifest.json` sigue sin `purpose: "maskable"`** en el ícono declarado.
- ❌ **`lugares-mapa.json` (722K) sigue presente en la carpeta pública del repo**, sin ningún `_headers`/`_redirects`/`wrangler.toml` que confirme su exclusión del deploy — sigue siendo imposible de verificar desde el repo si está expuesto en producción (Fase 1B §1, sigue como P2 sin resolver, no como P1).
- ❌ **`index.html` (2.663 líneas) sigue sin separar contenido editorial de la app** — confirmado, mismo tamaño exacto que documentaba Fase 1 §6/§19, decisión de arquitectura de información que las Fases 3A-3D dejaron explícitamente pendiente (Fase 3D §10, punto 1).

---

## 8. QA / Accesibilidad — brechas que siguen abiertas

- ❌ **Cero tests visuales, E2E o de accesibilidad automatizados** (Playwright, Puppeteer, axe-core) — confirmado en `package.json` y por ausencia total en el repo. Sigue siendo el **P0 heredado desde Fase 1 §19**, nunca resuelto en ninguna fase posterior.
- ❌ **Lighthouse nunca corrido sobre el sitio real** (no verificable desde el repo, pero ninguna fase documenta haberlo corrido; Fase 3D §5 lo deja como paso 21, al final del plan).
- 🟡 **Contraste WCAG AA de colores nuevos** — no aplica todavía porque los componentes nuevos (rating badge, indicador de región) no existen aún; queda pendiente por definición, no es una regresión.

---

## 9. Resumen ejecutivo — qué priorizar

Ordenado según el propio plan de implementación de Fase 3D (§5), marcando qué pasos ya están cubiertos:

| Bloque | Paso | Estado |
|---|---|---|
| **Preparación** | Baseline de tests visuales | ❌ Falta |
| **Preparación** | Confirmar exposición de `lugares-mapa.json` en Cloudflare Pages | ❌ Falta (no verificable desde el repo) |
| **Preparación** | Decidir separación editorial/app en `index.html` | ❌ Falta (decisión de producto, no de código) |
| **Fundaciones** | Generalizar `resolverVarCSS()` | ✅ **Hecho** |
| **Fundaciones** | Conectar `recortePorIniciativaPropiaExplicado()` | ❌ Falta |
| **Fundaciones** | Agregar `rating` a la plantilla de tarjeta | ❌ Falta |
| **Componentes** | Tarjeta rediseñada (razón + rating) | ❌ Falta |
| **Componentes** | Vista de Evaluación/comparación | ❌ Falta |
| **Componentes** | Mapa embebido en ficha | ❌ Falta |
| **Experiencia** | Cambio de región perceptible | ❌ Falta |
| **Experiencia** | Filtro de rubro sin abandonar el recorte | ❌ Falta |
| **Experiencia** | "Mostrar más" como nueva tanda | ❌ Falta |
| **Experiencia** | Conectar `contexto.ubicacion`/`contexto.clima` | ❌ Falta |
| **Motion** | Momentos wow #1/#2/#7 | ❌ Falta |
| **Responsive** | Reordenamiento del mapa en mobile por región | ❌ Falta |
| **Responsive** | Bottom sheet de Evaluación / CTA sticky en ficha | ❌ Falta |
| **QA** | Contraste, a11y, Lighthouse sobre componentes nuevos | ❌ Falta (no aplica aún, nada nuevo que verificar) |
| — | Migrar `rubros-meta.js` a portar token en vez de hex (problema puntual #3, Blueprint V2 §3) | ❌ Falta — **el token ya existe en `tokens.css`, solo falta la migración** |
| — | Pictograma de rubro en tarjeta y ficha (2 superficies de 5 que faltan) | ❌ Falta |
| — | Isolínea como borde de superficie | ❌ Falta |
| — | Brújula funcional (widget nuevo) | ❌ Falta |
| — | 6 canonical rotos + typo de `parrilla-la-gruta` + 61 subpáginas sin URL válida | ❌ Falta |
| — | Service Worker | ❌ Falta |
| — | `manifest.json` con `purpose: maskable` | ❌ Falta |

**Único ítem verificado como completado en todo el corpus de auditorías: la generalización de `resolverVarCSS()` en `motor-render.js` (§0).** Todo lo demás —desde el nivel de journey/UX (Fase 3B/3C/3D) hasta las deudas técnicas más antiguas de Fase 1/1B (SEO, Service Worker, tests visuales)— sigue exactamente en el estado que las auditorías describían, sin ninguna otra implementación adicional detectada.

---

**Este documento es un diagnóstico de brechas, no una implementación.** No se modificó ningún archivo del repositorio durante esta verificación — solo se clonó en modo lectura (`/home/claude/uruspot`) para correr `grep`/`node run-tests.js` y contrastar contra las 7 auditorías previas.
