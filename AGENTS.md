# AGENTS.md — URU SPOT
### Constitución técnica y de producto del repositorio `uruspotcdu-create/uruspot`

> **Este documento es la única fuente de verdad para cualquier IA (Claude, ChatGPT,
> Gemini, Copilot, Cursor, Windsurf o cualquier otra) que trabaje sobre este
> repositorio.** No es un README. No es un resumen. Es la constitución del
> proyecto: explica qué existe, por qué existe así, y qué reglas gobiernan
> cualquier cambio futuro.
>
> Redactado a partir de una auditoría directa del código real (clon de la rama
> `main`, verificado con `grep`, lectura de archivo y ejecución de la suite de
> tests: `node donde-comer-cdu/js/run-tests.js` → **5/5 suites en verde** al
> momento de escribir esto). Ninguna afirmación de este documento es una
> suposición: donde el propio código ya se documenta a sí mismo (y lo hace,
> extensamente — ver Capítulo 3), este documento resume y conecta esa
> documentación existente; donde no, cita el archivo y la línea concretos.
>
> **Antes de escribir una sola línea de código sobre este repositorio, leé
> este archivo entero.** Después, antes de tocar un módulo específico, leé
> también su cabecera — casi todos los archivos de este proyecto tienen su
> propia documentación interna extensa, y este AGENTS.md no la reemplaza, la
> indexa.

> **Segunda auditoría (2026-07):** se volvió a clonar el repo (`git
> archive`/tarball de `main`) y se re-corrió `node
> donde-comer-cdu/js/run-tests.js` → **siguen siendo 5/5 suites en
> verde**. Se recontaron a mano los inventarios citados en los Capítulos 1
> y 3 (`ls`/`find` sobre `donde-comer-cdu/js/`, `css/`, `locales/`,
> `los-mejores-restaurantes-cdu/`) y se corrigieron los que habían
> quedado desactualizados: la home real del sitio (`inicio/`, no
> `donde-comer-cdu/`, confirmado por `<link rel="canonical">` de cada
> archivo — ver §1.1), y los conteos de fichas/módulos/hojas de estilo
> (51 fichas / 45 con slug enlazado, 46 archivos en `js/`, 15 hojas en
> `css/` — antes decía 53 / ~35 / 16). El resto de las afirmaciones
> estructurales del documento (Ambient Engine, modelo del Plano continuo,
> seguridad, bugs históricos) no se volvió a auditar línea por línea en
> esta pasada; se mantienen como estaban, con el mismo nivel de confianza
> que tenían antes de esta revisión — no leas esto como una validación
> completa del resto del archivo.

---

## Índice

1. Visión del Proyecto
2. Filosofía del Producto
3. Arquitectura General
4. Tecnologías
5. Convenciones de Código
6. Design System
7. Principios de UX
8. Performance
9. Accesibilidad
10. Seguridad
11. Filosofía de Desarrollo
12. Qué está absolutamente prohibido
13. Cómo debe trabajar una IA en este repositorio
14. Errores históricos (reales, documentados en el propio código)
15. Checklist obligatorio
16. Roadmap Técnico
17. Glosario
18. Manual para futuras IA

---

## 1. Visión del Proyecto

### 1.1 Qué es URU SPOT

URU SPOT es **"la guía local de Concepción del Uruguay"** (Entre Ríos,
Argentina, ciudad ribereña sobre el río Uruguay) — así lo define
`package.json`: *"Sitio estático, sin build step"*. El producto principal
vive en `donde-comer-cdu/` (un `index.html` de ~2.700 líneas más su propio
motor de JS/CSS) y responde a la pregunta cotidiana "¿dónde como / dónde
estoy / dónde voy en esta ciudad?" con un catálogo curado y verificado de
lugares reales: gastronomía, alojamiento, salud, deporte, compras, y otros
11 rubros más (ver `css/tokens.css`, sección de colores por rubro, y
`js/rubros-meta.js`).

> **Corrección (auditoría 2026-07) — verificado contra `<link
> rel="canonical">` de cada archivo, no asumido:** el punto de entrada real
> del dominio (`https://uruspot.pages.dev/`) es `inicio/index.html`, **no**
> `donde-comer-cdu/index.html`. Se confirma comparando los propios tags
> canónicos de cada archivo: `inicio/index.html` declara
> `<link rel="canonical" href="https://uruspot.pages.dev/">` (la raíz),
> mientras que `donde-comer-cdu/index.html` declara
> `<link rel="canonical" href="https://uruspot.pages.dev/donde-comer-cdu/">`
> (una subruta). `donde-comer-cdu/` sigue siendo el producto principal en
> el sentido de "motor" (mapa, catálogo, buscador, ~2.700 líneas de
> `index.html` propio) — pero se **accede a él desde `inicio/`**, no al
> revés; `inicio/` es la portada/landing que lo enlaza. El `index.html`
> que está en la raíz del repositorio (junto al README) no es el que
> Cloudflare Pages sirve como home: es un script de redirect residual
> (`window.location.replace("https://uruspot.pages.dev/")`) que
> probablemente quedó de una configuración de deploy anterior — ver ítem
> de Roadmap en Capítulo 16. Cualquier IA que lea solo este capítulo antes
> de tocar el repo debe saber esto antes de asumir que "la home" es
> `donde-comer-cdu/`.

Alrededor de ese producto principal, el repositorio contiene un conjunto de
**landing pages SEO independientes** (`las-mejores-cafeterias-cdu/`,
`las-mejores-heladerias-cdu/`, `las-mejores-hosterias-cdu/`,
`las-mejores-panaderias-cdu/`, `los-mejores-bares-cdu/`,
`los-mejores-gimnasios-cdu/`, `los-mejores-restaurantes-cdu/`,
`mejores-veterinarias-cdu/`) — páginas estáticas de un solo rubro, pensadas
para capturar búsquedas específicas ("mejores restaurantes Concepción del
Uruguay") y derivar tráfico hacia el producto principal. Cada una de
`los-mejores-restaurantes-cdu/*` y `donde-comer-cdu/locales/*` es además una
**ficha individual por lugar** (51 fichas en
`donde-comer-cdu/locales/` al momento de esta auditoría — de esas, 45
tienen slug enlazado en `js/locales-slug.js`; las 6 restantes quedan
sin botón "ver ficha" a propósito, por casos ambiguos de sucursal/nombre
duplicado que el propio archivo documenta línea por línea — no es un bug,
es una decisión registrada. El número de fichas cambia con el tiempo a
medida que se cura el catálogo; si volvés a auditar esto, `ls
donde-comer-cdu/locales/ | wc -l` da el conteo real del momento), cada una
con `id="mapaContainer"`... en
realidad cada una con su propio `index.html` estático servido como página
propia, indexable y compartible — ver Capítulo 3.3).

### 1.2 Problema que resuelve

La ciudad no tiene una fuente confiable y centralizada de "qué hay y si
sigue existiendo". Google Maps y buscadores genéricos mezclan negocios
cerrados hace años con datos sin verificar. URU SPOT resuelve esto con un
proceso editorial real: alguien del equipo **camina el lugar o lo confirma
contra fuentes oficiales y Google Places** antes de marcarlo como
`Verificado` (ver Glosario, Capítulo 17, y el glosario real embebido en
`index.html` línea 1342).

### 1.3 Objetivos del producto

- Ser la fuente más confiable de lugares reales y activos de Concepción del
  Uruguay, no un directorio scrapeado sin curar.
- No abrumar: el usuario nuevo recibe **poco, elegido con cuidado** (región
  "Guía", máximo 4 lugares por iniciativa propia del sistema — ver Capítulo
  7) en vez del catálogo completo de una.
- Adaptarse al usuario real con el tiempo (más autonomía, menos curaduría)
  sin pedirle que configure nada explícitamente — ver el modelo de "Plano
  continuo" en el Capítulo 7.
- Funcionar sin conexión razonable (Service Worker, `sw.js`) y degradarse
  con gracia si algo falla (failsafe de 12s, `js/failsafe-reintentar.js`).

### 1.4 Público objetivo

Vecinos y visitantes de Concepción del Uruguay que buscan un lugar
concreto — no turistas de una gran ciudad ni un producto pensado para
escalar a otras ciudades por defecto (las coordenadas de referencia están
hardcodeadas para esta ciudad, ver `functions/weather.js`: `LAT = -32.4825,
LON = -58.2372`).

### 1.5 Identidad y experiencia que busca transmitir

El proyecto tiene, de forma explícita y documentada en
`donde-comer-cdu/assets/docs/visual-system-v1.0.md`, una identidad que **no
es genérica de "app de directorio"**: se define contra tres campos
semánticos — cartografía, hidrografía/río, orientación/tiempo — y en contra
explícita de la iconografía turística genérica (sin banderas, sin pines de
Google Maps, sin anclas ni timones literales). La experiencia buscada es la
de **"un mapa de datos reales con alma"**, no una ilustración ni un
directorio anónimo.

### 1.6 Principios de diseño que atraviesan todo el producto

Estos tres, citados textualmente del Capítulo 14 del documento de sistema
visual, son la raíz de todo lo demás y reaparecen en distintas formas en
casi cada archivo del repo:

1. **Todo asset/decisión nace de un vocabulario compartido reducido** (5
   primitivas de asset, un único archivo de tokens de color/tipografía/
   espaciado) — nunca se inventa una solución puntual por pantalla.
2. **Planos con reglas estrictas de quién reacciona a qué** — el sustrato
   nunca reacciona al usuario, el primer plano nunca reacciona al mundo
   directamente. Este principio se repite, con otras palabras, en la
   separación entre "recorte por iniciativa propia" (curaduría, silenciosa)
   y "búsqueda explícita" (el usuario decide, sin filtro).
3. **El silencio (espacio negativo / no-decisión) es una decisión de
   diseño más, no una ausencia** — el recorte de Guía muestra 4 lugares a
   propósito, no "todavía no cargamos el resto".

---

## 2. Filosofía del Producto

### 2.1 Qué representa el proyecto

La propia sección `#metodologia` del sitio lo resume como **"el orden no se
compra"**: la posición de un lugar en el recorte curado nunca depende de
si el negocio pagó, sino de señales de uso real (afinidad, proximidad,
frescura, contexto — ver `motor-exposicion.js` y Capítulo 7). Esto no es
un eslogan de marketing suelto: está implementado como una restricción de
diseño explícita en el motor de scoring
(`donde-comer-cdu/js/motor-config.js`, bloque `exposicion.scoring`) y
repetida como principio rector del Ambient Engine ("el engine responde a
datos de uso real... nunca a intereses de negocio", `visual-system-v1.0.md`
§11.3, punto 3).

### 2.2 Qué debe sentir el usuario

- **Confianza cartográfica**, no ilustración: la app se siente como "un
  instrumento de precisión geográfica", no como una app de recomendaciones
  genérica con íconos bonitos.
- **Curaduría honesta que no se siente impuesta**: el sistema empieza
  "guiado" (baja autonomía) pero nunca oculta el catálogo completo — Acción
  Directa (mapa + catálogo real) siempre está a un clic, nunca detrás de un
  paywall de interacción.
- **Un lugar vivo, no una foto fija**: el Ambient Engine (fondo que cambia
  con la hora real del día, corrientes, clima) existe para que la interfaz
  se sienta "en Concepción del Uruguay, hoy", no como un template genérico
  reusado de cualquier ciudad.

### 2.3 Qué cosas nunca deben perderse

Estas invariantes de producto están documentadas explícitamente en el
propio código y **cualquier cambio que las rompa debe tratarse como una
regresión de producto, no un simple bug**:

- El orden del recorte curado nunca puede depender de si un negocio pagó
  o de interés comercial del equipo (motor-config.js, comentario del
  bloque `scoring.pesos`; visual-system-v1.0.md §11.3).
- `Verificado` significa que alguien confirmó el lugar de verdad — nunca se
  relaja este criterio para inflar el catálogo más rápido.
- El Ambient Engine nunca comunica jerarquía de producto ("iluminar más una
  zona porque comercialmente interesa" está explícitamente prohibido,
  §11.3 punto 3 del documento de sistema visual).
- El sitio sigue funcionando (degradado, pero funcionando) sin JavaScript
  (`<noscript>`), sin red (Service Worker + `offline.html`), y con
  `prefers-reduced-motion` activo (Ambient Engine y coreografías de
  interfaz responden a esa preferencia en todos los módulos que animan
  algo).

---

## 3. Arquitectura General

### 3.1 Vista de carpetas (raíz del repositorio)

```
uruspot/
├── donde-comer-cdu/          ← producto principal (SPA-like, sin framework)
│   ├── index.html            ← cáscara + ~1000 líneas de documentación interna
│   ├── css/                  ← 15 hojas, tokens.css es la fuente de verdad
│   ├── js/                   ← 46 archivos (28 son el Ambient Engine
│   │                            "ambiente-*.js", 6 son tests — ver mapa
│   │                            de dependencias del pipeline core abajo)
│   ├── locales/              ← 51 fichas individuales, una carpeta por lugar
│   │                            (45 enlazadas con slug, ver §1.1)
│   ├── assets/docs/          ← especificación del Ambient Engine (Fase 3)
│   ├── lugares-core.json     ← dataset servido (campos mínimos, listado)
│   ├── lugares-detalles.json ← dataset servido (campos extendidos, ficha)
│   ├── lugares-estado.json   ← dataset servido (abierto/cerrado, tiempo real)
│   ├── lugares-mapa.json     ← dataset CRUDO editado a mano por DSA — NO se
│   │                           sirve nunca al cliente (ver §10 Seguridad)
│   └── split_dataset.py      ← genera los 3 JSON servidos desde el crudo
├── inicio/                   ← ★ HOME REAL DEL SITIO — canonical =
│   ├── index.html               https://uruspot.pages.dev/ (ver §1.1).
│   ├── css/                     Portada/landing que enlaza hacia
│   └── deferred-styles.min.css  donde-comer-cdu/; no es el motor en sí.
├── los-mejores-restaurantes-cdu/
│   ├── index.html             ← landing SEO de rubro
│   └── <slug>/index.html      ← 1 ficha estática por restaurante (paralela
│                                 a donde-comer-cdu/locales, ver nota abajo)
├── las-mejores-cafeterias-cdu/    ← landing SEO de un solo rubro (misma
├── las-mejores-heladerias-cdu/       lógica que arriba, sin sub-fichas)
├── las-mejores-hosterias-cdu/
├── las-mejores-panaderias-cdu/
├── los-mejores-bares-cdu/
├── los-mejores-gimnasios-cdu/
├── mejores-veterinarias-cdu/
├── img/                        ← imágenes de lugares (jpg/webp), planas
├── functions/weather.js        ← Cloudflare Pages Function (proxy de clima)
├── scripts/generar-sitemap.js  ← genera sitemap.xml desde los datos reales
├── docs/                       ← documentación de fases del Ambient Engine
├── sw.js                       ← Service Worker (network-first/cache-first)
├── offline.html                ← fallback del Service Worker sin red
├── _headers / _redirects       ← reglas de borde de Cloudflare Pages
├── manifest.json                ← manifiesto PWA
└── package.json                 ← scripts `sitemap` y `test`, sin build step
```

> **Nota real, no asumida:** existen dos catálogos de fichas de
> restaurantes que parecen redundantes —
> `donde-comer-cdu/locales/<slug>/` (51 carpetas) y
> `los-mejores-restaurantes-cdu/<slug>/` (61 carpetas). No se
> encontró en este repositorio un documento que explique formalmente la
> relación entre ambos. **Actualización (auditoría 2026-07):** se
> comparó el listado completo de slugs de ambas carpetas con `comm` y
> **no hay ni un solo slug compartido entre los dos catálogos** —
> tampoco `donde-comer-cdu/js/locales-slug.js` referencia en ningún punto
> al segundo catálogo. Es decir, no son la misma info duplicada: son dos
> conjuntos de negocios genuinamente distintos, curados por separado, sin
> ningún link de código entre ellos. Eso no explica *por qué* existen
> separados, pero descarta que sea una duplicación accidental del mismo
> dato — parecen decisiones editoriales independientes. Documentar esa
> relación (o consolidarla) sigue siendo candidato real de Roadmap — ver
> Capítulo 16.

### 3.2 El pipeline del producto principal: quién depende de quién

`donde-comer-cdu/index.html` es explícito en su propia documentación interna
(líneas ~1746 en adelante) sobre esto, y vale la pena repetirlo acá porque
es la pieza más importante de toda la arquitectura:

```
js/motor-config.js      → constantes y umbrales (única fuente numérica)
js/rubros-meta.js       → íconos/colores/nombres por rubro
js/locales-slug.js      → mapa id→slug para armar URLs de ficha
js/motor-plano.js       → estado de sesión persistido (el "Plano continuo")
js/motor-exposicion.js  → cuánto y qué mostrar según el plano/región
js/motor-mapa.js        → qué puntos georreferenciados le corresponden al mapa
js/proyeccion.js        → matemática lat/lng ↔ px, sin dependencias
js/motor-render.js      → CÓMO se dibuja el mapa (canvas propio, sin Leaflet
                           ni Mapbox — usa tiles CARTO Voyager crudos)
js/coreografias.js      → gramática de animación de transiciones de UI
js/app.js               → orquestador final: conecta todo lo anterior con
                           el DOM (~3.300 líneas, el módulo más grande)
```

Este orden **es el orden real de los `<script defer>` en `index.html`** y
codifica dependencias reales de ejecución, no una convención estética.
`defer` garantiza descarga paralela + ejecución en orden de documento. Si
`js/proyeccion.js` no cargó todavía cuando corre `motor-render.js`, este
último falla temprano y explícito (`console.error` + excepción) — un diseño
defensivo real, verificable en el propio archivo. **Reordenar estos
`<script>` sin entender el grafo de dependencias real puede romper el mapa
con un error de consola sutil.**

En paralelo, un segundo grupo de scripts (todos con prefijo `ambiente-`, 26
módulos) implementa el **Ambient Engine** — el fondo/capa ambiental
descrita en el Capítulo 6. Este grupo se carga **después** del motor de
mapa y **antes** de `app.js`, y su único punto de montaje real es
`js/ambiente-orquestador.js`, cargado último dentro de su propio grupo. El
Ambient Engine expone una superficie mínima en `window.AmbientEngine`
(`iniciarCarga()`, `finalizarCarga(exito)`, `entrarFoco()`, `salirFoco()`,
`reintentar()`, `setEscena(nombre)`, getter `.estado`) y **nunca** captura
eventos de puntero que compitan con la interfaz real (verificado: sin
`preventDefault`/`stopPropagation` en ningún módulo `ambiente-*.js`, según
`docs/integration-notes.md`).

### 3.3 Fichas de lugar (`locales/<slug>/`)

Cada carpeta de `donde-comer-cdu/locales/` es un documento HTML propio
(no una SPA con rutas de cliente), con su propio `js/ficha.js`. La
continuidad visual entre la tarjeta del índice y la ficha se resuelve con
`@view-transition` nativo del navegador (progresivo: sin soporte,
la navegación sigue funcionando exactamente igual, sin ningún cambio de
comportamiento — ver comentario en `css/tokens.css`, principio explícito
de "ningún elemento funcional depende exclusivamente del movimiento").
El puente es el nombre compartido `tarjeta-nombre`/`hero-title` entre
`app.js` y `ficha.js`.

### 3.4 Datos: el dataset real vs. el dataset editado a mano

- `lugares-mapa.json` (708 KB) es la fuente **cruda**, editada a mano por
  el equipo de datos (DSA), con 13 campos, incluyendo registros sin
  `estado_verificacion` todavía. **Nunca se sirve al cliente** (ver §10).
- `donde-comer-cdu/split_dataset.py` lee `lugares-mapa.json` con una ruta
  relativa fija (`BASE_DIR / "lugares-mapa.json"`) y genera los tres
  archivos que sí sirve el sitio en producción:
  `lugares-core.json` (listado), `lugares-detalles.json` (ficha),
  `lugares-estado.json` (abierto/cerrado, se refresca con más frecuencia
  que el resto — el Service Worker lo trata distinto, ver §8).
- **Ningún módulo `js/*.js` hace `fetch()` de `lugares-mapa.json`**
  (verificado con `grep`). Si algún cambio futuro necesitara ese archivo
  en el cliente, es una señal de que el pipeline de generación está mal
  diseñado, no una excusa para exponerlo.

### 3.5 Diagrama de capas (de más profundo a más superficial)

```
┌─────────────────────────────────────────────────────────┐
│ app.js (orquestador)                                     │  ← conecta todo
├─────────────────────────────────────────────────────────┤
│ motor-render.js │ ficha.js │ coreografias.js              │  ← presentación
├─────────────────────────────────────────────────────────┤
│ motor-mapa.js │ motor-exposicion.js │ proyeccion.js        │  ← lógica
├─────────────────────────────────────────────────────────┤
│ motor-plano.js (estado de sesión persistido)               │  ← estado
├─────────────────────────────────────────────────────────┤
│ motor-config.js (única fuente de constantes)                │  ← config
└─────────────────────────────────────────────────────────┘
        (paralelo, sin acoplarse al árbol de arriba)
┌─────────────────────────────────────────────────────────┐
│ ambiente-orquestador.js                                    │
├─────────────────────────────────────────────────────────┤
│ ambiente-planos / -reticula / -corrientes / -brujula /      │
│ -coordenadas / -particulas-deriva / -halos / -capa-fondo    │  ← 7 familias
├─────────────────────────────────────────────────────────┤
│ ambiente-movimiento / -estados / -ritmo / -gramatica          │  ← motion
├─────────────────────────────────────────────────────────┤
│ ambiente-clima / -horario-tinte                                │  ← contexto
├─────────────────────────────────────────────────────────┤
│ ambiente-accesibilidad / -rendimiento / -flags / -config         │  ← gobierno
└─────────────────────────────────────────────────────────┘
```

El contrato entre ambos árboles es exclusivamente vía atributos
`data-ambiente-*` en `<html>` — el Ambient Engine nunca expone sus capas
internas al resto de la app, y el resto de la app nunca importa nada de
`js/ambiente-*.js` directamente (cero imports cruzados verificados,
`docs/integration-notes.md` §3).

---

## 4. Tecnologías

### 4.1 Stack real

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | HTML + CSS + JavaScript vanilla, **sin framework, sin bundler, sin build step** | `package.json` lo declara explícitamente: *"Sitio estático, sin build step"*. Las dependencias entre módulos se resuelven con orden de `<script defer>`, no con imports de ES modules ni bundling — decisión consciente de simplicidad (ver §5 de la documentación interna de `index.html`). |
| Mapa | `<canvas>` propio (`motor-render.js`, ~2.700 líneas) sobre tiles CARTO Voyager | No usa Leaflet ni Mapbox. Los tiles se reparten entre 4 subdominios (`a/b/c/d.basemaps.cartocdn.com`) para paralelizar descargas por debajo del límite de conexiones concurrentes por host. |
| Hosting | Cloudflare Pages | `_headers`/`_redirects` son formato Cloudflare Pages; `functions/weather.js` usa el export `onRequestGet` de **Cloudflare Pages Functions**, no una API route de Next/Vercel. |
| Clima | MET Norway API (`api.met.no`), vía proxy propio en `functions/weather.js` | El comentario del propio archivo documenta que se migró desde Open-Meteo porque esa API devolvía 525 al ser llamada desde la red de Cloudflare hacia esta zona específica — es una decisión con motivo técnico real, no preferencia. |
| Datos | JSON estático generado por `split_dataset.py` (Python) desde un dataset editado a mano | Ver §3.4. |
| PWA / offline | Service Worker manual (`sw.js`, sin Workbox) | Estrategias diferenciadas por tipo de recurso — ver §8. |
| Testing | Suite propia en Node puro (`js/run-tests.js` + 5 archivos `*-tests.js`), sin framework de testing | `@playwright/test` está en `devDependencies` de `package.json` pero, al momento de esta auditoría, **no hay ningún test Playwright real en el repo** — es una dependencia declarada para un tipo de test (visual/e2e con navegador real) que `URUSPOT-PENDIENTES-VERIFICADO-287.md` marca explícitamente como pendiente (`baseline-visual-uruspot.js` y las capturas en `baseline/` son un punto de partida manual, no una suite automatizada corriendo en CI). |
| Fuentes | Google Fonts: Fraunces (display), IBM Plex Sans (UI), IBM Plex Mono (datos) | Cargadas vía `<link>`, permitidas explícitamente en la CSP (ver §10). |

### 4.2 Tecnologías permitidas

- HTML, CSS y JavaScript vanilla (ES5/ES6 compatible con `defer`, sin
  sintaxis de módulos ES).
- Node.js puro para scripts de build/test (`scripts/generar-sitemap.js`,
  `js/run-tests.js` y las suites `*-tests.js`) — sin dependencias de
  testing externas más allá de lo ya declarado.
- Python puro para el pipeline de datos (`split_dataset.py`) — sin
  dependencias externas más allá de la librería estándar, salvo que ya
  estén en uso.
- SVG para todos los assets del Ambient Engine, siguiendo estrictamente
  `visual-system-v1.0.md` (ver Capítulo 6).
- Cloudflare Pages Functions para lógica de servidor mínima (proxies,
  nunca lógica de negocio real — ver `functions/weather.js` como el único
  precedente).

### 4.3 Tecnologías prohibidas

- **Cualquier framework de frontend** (React, Vue, Svelte, Angular) o
  bundler (Webpack, Vite, Rollup, esbuild) sin una decisión de arquitectura
  explícita y documentada — el "sin build step" es una decisión de
  producto declarada en `package.json`, no un descuido.
- **Cualquier librería de mapas de terceros** (Leaflet, Mapbox GL, Google
  Maps JS SDK) — el motor de canvas propio es una decisión arquitectónica
  documentada (`index.html`, Bug E de la sección de diagnóstico), no
  ausencia de conocimiento de alternativas.
- **CSS-in-JS o metodologías de CSS que reemplacen `tokens.css`** — el
  propio archivo se declara "única fuente de verdad de color, tipografía,
  espaciado, radio, sombra y movimiento. Ninguna pantalla define estos
  valores por su cuenta".
- **CDN de terceros para JavaScript de negocio** — la CSP actual es
  `script-src 'self'` (ver §10); agregar un script externo requiere
  modificar la CSP y es, por definición, un cambio de seguridad que
  necesita revisión explícita, no un `<script src="https://...">` agregado
  sin más.
- **Cualquier mecanismo de estado de cliente que no sea `localStorage`/
  variables JS en memoria** (ya en uso real: `motor-plano.js` persiste el
  Plano en `localStorage`; `ambiente-flags.js` lee flags de
  `localStorage`) — no introducir IndexedDB, cookies de sesión propias, ni
  soluciones de estado externas sin justificar por qué `localStorage` no
  alcanza.

### 4.4 Cuándo una excepción podría estar justificada

Siguiendo el mismo criterio que ya usa el propio `visual-system-v1.0.md`
(§8.2, "excepciones versionadas"): una excepción a esta lista es válida
únicamente si (a) se documenta explícitamente en el commit/PR que la
introduce, con la razón técnica concreta (no de preferencia), y (b) no se
aplica en silencio esperando que nadie lo note. El precedente real de este
patrón en el repo es el propio `--easing-rebote` en `tokens.css`: un token
que se dejó de usar activamente tras una auditoría, mantenido documentado
"por si algún caso puntual y deliberado lo necesitara alguna vez — nunca
como default". Ese es el estándar: una excepción real queda **nombrada y
explicada**, nunca oculta dentro de un cambio que dice ser otra cosa.

---

## 5. Convenciones de Código

### 5.1 Idioma

**Todo el código de negocio está en español**: nombres de funciones,
variables, comentarios, mensajes de commit implícitos en el propio código.
Ejemplos reales: `recortePorIniciativaPropia()`, `pintarTarjetas()`,
`actualizarCabecera()`, `validarCombinacion()`. Esto es una convención
consistente en **todo** el repositorio, sin excepciones encontradas — un
nombre de función o variable en inglés dentro de `donde-comer-cdu/js/` sería
una inconsistencia real, no una mejora. `lang="es-AR"` en `<html>` confirma
que el idioma real de todo el contenido estático también es español
rioplatense (ver invariante I6 en `index.html`).

### 5.2 Nombres de archivo

- Módulos de motor: `motor-<responsabilidad>.js` (`motor-config`,
  `motor-plano`, `motor-exposicion`, `motor-mapa`, `motor-render`,
  `motor-test`).
- Módulos del Ambient Engine: `ambiente-<responsabilidad>.js`, siempre en
  minúsculas, sin camelCase en el nombre de archivo.
- CSS: un archivo por dominio de componente (`boton.css`, `chip.css`,
  `mapa.css`, `ficha.css`) — nunca un `styles.css` monolítico.
- Assets SVG del Ambient Engine: `familia—variante-semantica—peso.svg`, en
  minúsculas, guion simple como separador de palabra, **doble guion** como
  separador de segmento (regla explícita en `visual-system-v1.0.md` §3.5).
  Ejemplo real citado en el propio documento: `brujula—default—regular.svg`.

### 5.3 Comentarios

Este es, probablemente, el rasgo más distintivo de todo el repositorio: los
comentarios **no describen qué hace el código línea por línea** — explican
**por qué** existe una decisión, qué alternativa se descartó y por qué, y
qué señal futura debería hacer que se reconsidere. Patrón real, repetido
decenas de veces en `tokens.css` y `motor-config.js`:

```css
/* --tipo-cuerpo-xs: usada por botones (.btn, .tarjeta-btn) y el
   texto de mapa-info — faltaba por completo. Sin ella, cada botón
   del sitio caía al font UA del navegador en vez de IBM Plex Sans... */
--tipo-cuerpo-xs:   500 12.5px/1.4 var(--f-ui);
```

```js
// Recalibrar si: el dato real de uso 1 muestra que la mayoría
// abandona el arranque en Guía antes de dar ninguna señal.
```

**Cualquier IA que agregue código a este repositorio debe seguir este
mismo patrón de comentario**: no "qué hace esto" (eso ya lo dice el
código), sino "por qué existe" y "qué evidencia futura lo cambiaría". Un
comentario que solo repite el nombre de la variable en prosa
(`// contador de lugares`) no cumple el estándar real del repo.

### 5.4 Bugs reales se documentan como bugs reales, no se corrigen en
silencio

Patrón recurrente en `tokens.css`, `index.html` y los documentos de
`docs/historial/`: cuando se encuentra un bug real (una variable CSS que
nunca estuvo declarada, un `id` que se perdió en una revisión anterior), el
comentario dice explícitamente **"BUG REAL (auditoría Fase N)"**, describe
el síntoma observable, la causa raíz, y la corrección — nunca se corrige
sin dejar rastro de que había algo roto. Esto es intencional: preserva el
conocimiento de qué falló y por qué para que no se repita. Seguí este
mismo patrón al corregir cualquier bug real que encuentres.

### 5.5 JavaScript: convenciones concretas

- Namespace global vía IIFE + `global.URU_X = {...}` (ver
  `motor-config.js` línea 19: `(function (global) { 'use strict'; ... })`)
  — no hay imports de ES modules en ningún módulo de `donde-comer-cdu/js/`.
- Selección de DOM por `document.getElementById(...)`, no `querySelector`
  — documentado como decisión consciente en `index.html` §3: *"es lo que
  ya usa el 87% de la lógica en app.js — reescribirlo... para no ganar
  nada era el tipo de reescritura cosmética que este archivo evita"*.
- Todo acceso a un elemento del DOM está protegido defensivamente
  (`if (DOM.x) DOM.x....`) para que un `id` faltante degrade en silencio en
  vez de tirar una excepción que rompa el resto de la página — pero **esto
  no es excusa para dejar un `id` roto sin corregir**: ver Bug A/B en el
  Capítulo 14, que existieron precisamente porque el fallo silencioso
  ocultó el problema.
- `'use strict'` en todo módulo nuevo.

### 5.6 CSS: convenciones concretas

- **Todo valor de color, tipografía, espaciado, radio, sombra o duración de
  movimiento pasa por un token de `tokens.css`.** Un valor literal
  (`#9C3A46`, `16px`, `.42s`) fuera de `tokens.css` en una regla nueva es
  una violación de la convención central del proyecto, salvo que sea un
  valor genuinamente puntual sin vocación de reutilizarse (y en ese caso,
  documentá por qué no amerita ser un token).
- Escala de espaciado cerrada: `4/8/12/16/24/32/48/64` (`--esp-1` a
  `--esp-16`) — nada fuera de esa escala.
- `outline`/`box-shadow` de foco por teclado siempre vía
  `--anillo-foco`/`--anillo-foco-offset`, nunca un `outline` inline nuevo.
- Nomenclatura de clases en español, kebab-case (`.tarjeta-lugar`,
  `.mapa-container`, `.glosario-termino`).

### 5.7 Python: convenciones concretas

`split_dataset.py` usa rutas relativas fijas basadas en `BASE_DIR` — no
asumas que el script puede ejecutarse desde cualquier directorio de trabajo
sin verificar esa ruta primero.

---

## 6. Design System

### 6.1 Fuente de verdad

`donde-comer-cdu/css/tokens.css` (30 KB) es, textualmente, **"la única
fuente de verdad de color, tipografía, espaciado, radio, sombra y
movimiento"** de todo el sitio. Debe cargarse antes que cualquier otro CSS
de componentes. El archivo documenta su propio historial de auditorías
(Fase 1, 2, 4, 8) directamente en los comentarios — antes de agregar un
token nuevo, leé el archivo completo, no solo la parte que creas relevante,
porque es frecuente que el valor que necesitás ya exista con otro nombre.

### 6.2 Color

- **Modo real del producto: oscuro.** `--color-fondo: #0A0D13`,
  `--color-tinta: #ECEDEF` con escalones de opacidad (`-80`, `-60`, `-30`).
- **Color de marca:** granate (`--color-granate: #9C3A46`,
  `--color-granate-clara: #C97A83`) — es el único acento de marca en todo
  el sistema.
- **14 colores de rubro**, uno por categoría de negocio (gastronomía,
  alojamiento, salud, etc.) — mismos valores documentados en
  `js/rubros-meta.js`. Nunca inventar un color de rubro nuevo sin agregarlo
  primero a `tokens.css`.
- **Verde/rojo puro reservado exclusivamente para abierto/cerrado**
  (`--color-estado-abierto` / `--color-estado-cerrado`) — un error de red
  o un estado de alerta usa `--color-alerta` (el acento granate claro), a
  propósito, para no diluir el significado unívoco de verde/rojo. Esto es
  una regla explícita y documentada: **no reutilices verde/rojo para nada
  que no sea abierto/cerrado.**
- Los valores de `--color-estado-abierto`/`--color-estado-cerrado` fueron
  **ajustados en Fase 4 (26/07/2026)** porque los originales no alcanzaban
  WCAG AA 4.5:1 contra su propia píldora (medían 4.34:1 y 2.98:1) — ver
  Capítulo 14 para el detalle completo. **No revertir estos valores** sin
  volver a verificar el contraste.

### 6.3 Tipografía

Tres familias, cada una con un rol semántico fijo, nunca intercambiable:

| Token | Familia | Uso |
|---|---|---|
| `--f-display` | Fraunces (serif) | Títulos, nombres de lugar |
| `--f-ui` | IBM Plex Sans | Interfaz, cuerpo de texto |
| `--f-dato` | IBM Plex Mono | Metadatos: rubro, hora, distancia |

Usar IBM Plex Mono para un título o Fraunces para un dato de interfaz
rompe la jerarquía semántica del sistema, no solo la estética.

### 6.4 Espaciado, radio, sombra, movimiento

Ver tabla completa en `tokens.css`. Puntos que **no** están documentados en
ningún otro lugar y son fáciles de pasar por alto:

- `--dur-*` y `--easing-*` no son solo estética: la sección "Fase 4 (Motion
  Direction Bible v1.0)" de `tokens.css` mapea **tres registros de ritmo**
  (inmediato, conversacional, contemplativo) a esta escala, cada uno con
  asimetría entrada/salida deliberada (la salida siempre es igual o más
  rápida que la entrada, nunca al revés) — ver `--dur-conversacional-entrada`
  vs. `--dur-conversacional-salida` como ejemplo real.
- `--easing-rebote` existe pero **no tiene uso activo** — fue el causante
  de un anti-patrón documentado ("Rebotes innecesarios", Cap. 14 del Motion
  Bible) y ya se removió de las 12 declaraciones que lo usaban. No
  reintroducirlo como default de nada nuevo.

### 6.5 "Corriente" y el Ambient Engine

**"Corriente" no es un componente de UI — es una de las 7 familias de
assets visuales del Ambient Engine**, especificada en
`donde-comer-cdu/assets/docs/visual-system-v1.0.md`. Representa el río sin
literalidad (líneas de flujo tipo isolíneas de agua, plano P1, movimiento
de "deriva direccional continua": *"un río no oscila, fluye en una
dirección"*). Es, junto con la Brújula, una de las dos familias marcadas
como de mayor prioridad e identidad diferencial en el Roadmap del propio
documento (§12).

El Ambient Engine completo se rige por reglas estrictas que **cualquier
cambio visual debe respetar**:

- **7 familias activas**: Retícula cartográfica, Corrientes, Brújula,
  Coordenadas, Curvas topográficas, Partículas de deriva, Halos de
  posición. Cada una nace de 5 primitivas geométricas compartidas (arco,
  línea recta, sinusoide, círculo concéntrico, marca de coordenada) — nunca
  se inventa geometría nueva por asset.
- **4 planos de profundidad** (P0 Sustrato, P1 Corriente, P2 Orientación,
  P3 Foco), con una jerarquía estricta de reactividad: *"el sustrato
  (P0/P1) nunca reacciona al usuario; solo al tiempo y al mundo (clima,
  horario). El primer plano (P2/P3) nunca reacciona al mundo directamente;
  solo al usuario y a los datos activos"* (§6.2).
- **Silencio como asset**: ninguna escena debe superar 12–15% de
  superficie ocupada por trazos visibles, sumando todos los planos.
- **Presupuesto de rendimiento estricto**: máximo 80 nodos por asset SVG, 6
  grupos `<g>` por asset, 2 KB optimizado por archivo, 40 assets
  simultáneos visibles en viewport (el presupuesto es del sistema
  completo, no por familia — agregar una familia nueva resta presupuesto a
  las existentes, nunca amplía el total sin una revisión de rendimiento
  real).
- **Prohibido explícitamente** (§11.2 del documento): relleno sólido fuera
  del plano P0, iconografía figurativa reconocible (banderas, pines,
  comida, personas) dentro del engine, animar propiedades que disparan
  reflow, color fijo no tokenizado, mezclar dos temperaturas de color en
  la misma escena.
- **Feature flags reales ya implementados**: `js/ambiente-flags.js`
  permite apagar el motor completo, el sustrato visual, el clima o el
  tinte horario, individualmente, vía `localStorage` o parámetro de URL
  (`?ambiente_off=clima,horarioTinte`). Diseño fail-open: un flag
  desconocido o `localStorage` bloqueado nunca apaga nada por accidente.

### 6.6 Componentes documentados

`donde-comer-cdu/css/`: `boton.css`, `chip.css`, `badge-estado.css`,
`tarjeta-lugar.css`, `ficha.css`, `mapa.css`, `descubrimiento.css`,
`destacados.css`, `contenido-editorial.css`, `impresion.css` (media
`print`), `motion-gramatica.css` (registro de coreografías de interfaz,
distinto del motion del Ambient Engine — ver Capítulo 7). Cada archivo
nuevo de componente debe declarar sus propios estados (`:hover`,
`:focus-visible`, `[disabled]`) usando los tokens ya existentes, nunca
valores nuevos.

### 6.7 Responsive y grids

Breakpoints documentales (no usables dentro de `@media` como `var()`,
CSS no lo permite): `--bp-mobile: 720px`, `--bp-tablet: 960px`. Se repiten
como literal donde haga falta, pero **cualquier breakpoint nuevo que no
sea 720px o 960px debe justificarse** — no introducir un tercer breakpoint
sin revisar por qué los dos existentes no alcanzan.

---

## 7. Principios de UX

### 7.1 El modelo central: "el Plano continuo"

Este es el corazón de toda la experiencia de descubrimiento y **no está
documentado en ningún README** — vive en los comentarios de
`donde-comer-cdu/js/motor-config.js` y `motor-plano.js`. Cualquier IA que
toque la lógica de recomendación/curaduría debe entenderlo antes de tocar
una línea:

- El sistema modela a cada sesión en un **plano continuo de dos ejes**:
  `autonomía` (0 = guiado, 1 = autónomo) y `fricción` (0 = resolver ya, 1 =
  margen para explorar). Arranca en `autonomiaInicial: 0.15,
  friccionInicial: 0.55` — cerca de "guiado", con margen moderado para
  sorprender.
- Sobre ese plano continuo se leen **tres regiones con nombre**, que son
  fronteras de lectura, no casilleros de implementación separados:
  - **Guía** (autonomía baja): recorte de máximo 4 lugares por iniciativa
    propia del sistema.
  - **Exploración** (autonomía media/alta, fricción alta): recorte de
    hasta 10 lugares, más variedad, menos curaduría.
  - **Acción Directa** (autonomía alta, fricción baja): acceso directo al
    catálogo completo, mapa como herramienta principal, sin recorte
    curado.
- El plano se mueve con **seis acciones mínimas** del "Vocabulario de
  Interacción" (documentado íntegramente en `motor-config.js`):
  `permanecer` (empuja fricción tolerable con el tiempo), `aceptar`
  (empuja autonomía, afinidad positiva por rubro), `rechazar` (afinidad
  negativa, 3 rechazos del mismo rubro en 14 días = patrón estable),
  `nombrar` (salto categórico e inmediato a Acción Directa — sin
  calibración, buscar algo por nombre es intención explícita),
  `guardar` (2+ veces en 90s activa Curaduría, sin importar la región de
  origen), `abandonar` (no mueve el plano, solo persiste el punto de
  partida).
- **Madurez de sesión por contexto** (`usuarioId × ciudadId`, nunca un
  contador global): `anfitrión` (0 aperturas) → `conocido` (10) →
  `cómplice` (100) → `casa` (500). Los roles `anfitrión` y `conocido`
  tienen "reposo forzado"; `cómplice` y `casa` desactivan el cierre de
  sesión intencional.

### 7.2 El recorte por iniciativa propia (scoring)

`motor-exposicion.js`, calibrado desde `motor-config.js`, combina cuatro
señales opcionales (nunca penaliza a un lugar por falta de dato — se
renormalizan los pesos restantes): `afinidad` (0.35, la de más peso —
evidencia de comportamiento real), `proximidad` (0.25, decae a ~0 a 3km),
`frescura` (0.15, preferencia leve por lugares no vistos), `contexto`
(0.10, clima/hora — **hoy matemáticamente neutro a propósito**: la tabla
`afinidadClimaPorGrupo` está vacía hasta que haya evidencia real o una
decisión editorial explícita de producto, no una suposición del código).
Además: exclusión dura por "descanso" (72h sin repetirse un lugar en
Guía/Exploración), diversidad (ningún rubro ocupa más del 50% del cupo,
salvo que no haya alternativa), y una fracción reservada de "exploración"
(20% del cupo, elegida por semilla determinística, no aleatoria real).

**Este scoring aplica únicamente al recorte por iniciativa propia** — nunca
a búsqueda explícita de texto ni a Curaduría (la lista guardada del
usuario). No mezclar esta lógica con la de búsqueda.

### 7.3 Reglas de experiencia que deben mantenerse

- El recorte curado nunca decide por interés comercial — ver Capítulo 2.
- Búsqueda explícita y filtro de rubro siempre muestran el catálogo real,
  sin el recorte de exposición aplicado (documentado, aunque marcado como
  parcialmente sin resolver del todo — ver Capítulo 16, ítem sobre
  `hayBusquedaOFiltro()`).
- Ninguna animación de interfaz debe sentirse "elástica" ni con overshoot
  por defecto (anti-patrón "Rebotes innecesarios" ya corregido, Cap. 14 del
  Motion Direction Bible — no reintroducirlo).
- Elementos relacionados que animan juntos llevan un microdesfase
  (`--motion-desfase: .04s`) entre sí, salvo que el mensaje deseado sea
  explícitamente "esto es un solo bloque conceptual" (sincronización
  perfecta reservada para ese caso único).

### 7.4 Errores de UX a evitar (documentados como tales en el repo)

- Timings inconsistentes que hacen que dos registros de ritmo distintos
  (conversacional vs. contemplativo) terminen sintiéndose iguales.
- Mezclar curvas de easing distintas entre registros — la curva
  (`--easing-movimiento`) es siempre la misma; lo que cambia es la
  duración, nunca la personalidad del movimiento.
- Dejar contenido en estado "Cargando…" indefinidamente por un `id` roto
  en silencio — ver Bug B, Capítulo 14. Cualquier estado de carga nuevo
  debe tener un failsafe real (ver `js/failsafe-reintentar.js` como
  patrón de referencia: 12s de timeout, botón de reintentar, `role="alert"`).

---

## 8. Performance

### 8.1 Objetivos de rendimiento explícitos

- Máximo 40 assets del Ambient Engine simultáneos visibles en viewport,
  sumando todos los planos (presupuesto del sistema completo — ver
  Capítulo 6.5).
- Ningún asset SVG individual supera 80 nodos, 6 grupos `<g>`, 2 KB
  optimizado.
- El motor de mapa reparte tiles entre 4 subdominios CARTO para
  paralelizar descargas bajo el límite de conexiones concurrentes por
  host.
- `Cache-Control: public, max-age=0, must-revalidate` en el borde de
  Cloudflare (`_headers`) — prioriza que un deploy nuevo se refleje al
  instante por sobre el beneficio de un TTL de caché largo. Es un
  trade-off consciente, no un descuido de performance.

### 8.2 Prácticas a seguir

- **Nunca animar propiedades que disparan reflow** (`width`, `height`,
  `top`/`left`) — toda animación se resuelve por `transform` y `opacity`,
  regla dura tanto en el Ambient Engine (§9.1 del visual system) como en
  las coreografías de interfaz general.
- **Nunca usar `blur`/`filter` de SVG como recurso de estilo** — costoso
  en render, y además contradice el lenguaje lineal-nítido del sistema
  visual (la sensación de profundidad la dan opacidad y velocidad, nunca
  desenfoque).
- **Assets bajo demanda**, nunca cargar una familia completa del Ambient
  Engine si la escena solo necesita 2-3 instancias.
- **Una sola geometría por asset**, color por token — nunca duplicar
  geometría entre variantes de color/modo.
- Imágenes de lugares en formato WebP nativo cuando sea posible (`img/`
  mezcla `.webp` y `.jpg`/`.jpeg` — preferir WebP para archivos nuevos,
  siguiendo el patrón ya mayoritario).
- El Service Worker (`sw.js`) usa estrategia diferenciada por tipo de
  recurso — **respetar esta separación al agregar un recurso nuevo**:
  - Navegación (HTML): network-first, fallback a caché de esa misma URL,
    y si tampoco existe, `/offline.html`.
  - Datos de negocio (`lugares-*.json`): network-first **sin** fallback
    silencioso a caché viejo cuando hay red — `lugares-estado.json` en
    particular refleja abierto/cerrado en tiempo real y nunca debe
    preferirse el caché si la red responde.
  - Estáticos versionables (css/js/webp/png/jpg/svg/woff): cache-first —
    válido porque **este repo no reusa nombres de archivo al cambiar
    contenido**; si algún día se introduce hashing de nombre de archivo o
    se reutiliza un nombre con contenido nuevo sin cambiar el nombre, esta
    estrategia deja de ser segura.
  - Cualquier origen que no sea el propio se ignora por completo — no
    interceptar ni cachear CDN de terceros.

### 8.3 Prácticas a evitar

- No introducir un bundler "solo para optimizar" — el sitio ya resuelve
  performance sin build step; un cambio de esa magnitud es una decisión de
  arquitectura, no una optimización incremental (ver Capítulo 12).
- No cargar `lugares-mapa.json` (708 KB, dataset crudo) en ningún flujo de
  cliente — ya está bloqueado a nivel de borde (`_redirects`), pero
  tampoco debe referenciarse desde JS nuevo.

---

## 9. Accesibilidad

### 9.1 Estándar mínimo

WCAG AA como piso — verificado en la práctica, no solo declarado: la
corrección real de contraste de `--color-estado-abierto`/
`--color-estado-cerrado` en Fase 4 (Capítulo 6.2 y 14) llevó ambos colores
por encima de 4.5:1 con margen (4.72:1 y 4.74:1 respectivamente),
partiendo de valores que medían 4.34:1 y 2.98:1 — es decir, **el estándar
se aplica y se corrige activamente cuando falla**, no es aspiracional.

### 9.2 Foco (focus)

- `outline: 2px solid var(--color-granate-clara)` como color/grosor
  canónico de foco por teclado, vía el token `--anillo-foco` —
  documentado en `tokens.css` como fuente única, aunque al momento de esta
  auditoría **no todos los archivos lo consumen todavía** (varios declaran
  su propio `outline` con offsets distintos sin razón sistemática — ver
  Capítulo 16, candidato de limpieza real).
- `--anillo-foco-offset: 2px` fue, en su momento, una variable usada en
  `boton.css` sin estar nunca declarada (Bug real, Fase 8 — ver Capítulo
  14) — ya corregida, no revertir.
- El skip-link (`.skip-link`) debe seguir siendo el primer elemento
  enfocable del `<body>` — cualquier reordenamiento del `<body>` que lo
  mueva de esa posición rompe su propósito real.

### 9.3 Keyboard

- Landmarks reales: `role="search"` en el buscador, `role="status"` +
  `aria-live="polite"` en estadísticas rápidas y en `#estadoResultados`.
- El `<canvas>` del mapa es `aria-hidden` a nivel de implementación
  (`motor-render.js`, no en el HTML) porque siempre existe una lista
  paralela de tarjetas con la misma información — el canvas es
  redundancia visual, nunca la única fuente del dato.
- `#mapaHerramienta` usa **`role="region"`** (corrección — auditoría
  2026-07: este documento decía `role="application"`, pero el propio
  `index.html` registra que ese valor se cambió a `role="region"` en su
  "AUDITORÍA 5ª PASADA — WP0" del 24/07/2026, precisamente para alinear
  el HTML estático con lo que `motor-render.js` ya fijaba en tiempo de
  ejecución — ver línea ~2444 de `index.html` para el detalle completo
  del cambio. Verificado en el HTML real: `role="region"` está en el
  elemento hoy. La justificación de fondo sigue siendo válida — aloja
  gestos custom (arrastrar, zoom con rueda, click en marcador),
  combinado deliberadamente con el `aria-hidden` del canvas interno:
  *"esta región tiene su propia interacción" + "pero no obligues a un
  lector de pantalla a entrar en ella"* — pero **el valor concreto del
  atributo ya no es `application`, es `region`.** No revertir sin volver
  a leer la nota de la 5ª auditoría en `index.html`.

### 9.4 ARIA

- Emojis usados como ícono (🍽️, ☕, etc.) llevan `aria-hidden="true"` —
  el texto visible junto a cada uno ya transmite el significado; sin ese
  atributo, un lector de pantalla leería el nombre Unicode del emoji antes
  del texto real, duplicando información.
- Alertas de failsafe usan `role="alert"`.

### 9.5 Motion (movimiento reducido)

`prefers-reduced-motion: no-preference` es explícitamente la condición
para activar `@view-transition` entre índice y ficha — bajo movimiento
reducido, la navegación vuelve a ser instantánea sin ningún cambio de
comportamiento funcional. El mismo principio gobierna el Ambient Engine
completo: bajo reducción, el cambio de color de fondo se vuelve
instantáneo (en vez de la transición de ~58s normal) y las coreografías de
interfaz limitan su duración a ≤150ms tanto para el registro contemplativo
como el conversacional (verificado por test real en
`coreografias-tests.js`). **Una preferencia manual en `false` (activada
desde configuración de la app, si existiera) nunca debe anular la señal
real del sistema operativo** — regla verificada por test explícito.

### 9.6 Contraste

Ver Capítulo 6.2 y 9.1. Cualquier color nuevo agregado a `tokens.css` debe
verificarse contra WCAG AA (4.5:1 para texto normal) antes de aprobarse,
siguiendo el mismo criterio ya aplicado en Fase 4.

---

## 10. Seguridad

### 10.1 Content-Security-Policy real (documentada en `index.html` §8)

- `script-src 'self'` — todo el JS de negocio es propio, servido desde el
  mismo origen. **Bloquea inyección de script externo aunque haya un XSS
  en algún dato renderizado con `innerHTML`** en `app.js`. No agregar un
  `<script src="https://...">` de terceros sin revisar y actualizar esta
  directiva explícitamente.
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` — el
  `'unsafe-inline'` existe porque el motor de mapa fija colores por rubro
  con `style="background:..."` inline (`pintarLeyenda()` en `app.js`).
  Documentado como **deuda aceptada, no descuido**: migrar a clases CSS
  generadas dinámicamente sacaría la excepción, pero no es gratis (una
  clase por color de rubro).
- `img-src 'self' data: https:;` — deliberadamente amplio en `https:`
  porque tiles CARTO e imágenes de lugares pueden servirse desde distintos
  subdominios/CDN con el tiempo.
- `connect-src 'self' https:;` — los tiles se cargan como `<img src=...>`,
  no por `fetch` (así que en rigor los gobierna `img-src`); se deja
  `https:` amplio para no bloquear futuros `fetch()` de los JSON de datos
  si algún día se sirven desde otro dominio.

### 10.2 Regla dura sobre scripts inline

**Ningún `<script>` inline con lógica real** — un `<script>` sin `src`
necesita, además de `script-src 'self'`, un `'unsafe-inline'`, un
`'nonce-...'` que matchee, o un `'sha256-...'` del contenido exacto, y
ninguna de las tres cosas está en esta CSP. Precedente real: el script de
resiliencia de `index.html` se externalizó a
`js/failsafe-reintentar.js` precisamente porque un supuesto anterior
(que `script-src 'self'` bastaba para scripts inline del mismo documento)
era incorrecto y el `onclick="..."` inline que tenía era, además,
equivalente a inline para CSP por partida doble. **Todo script nuevo con
lógica real va con `src` en `js/`, nunca inline.**

### 10.3 Datos: qué nunca se expone

`lugares-mapa.json` (dataset crudo, editado a mano, con registros
potencialmente sin verificar) está bloqueado explícitamente a nivel de
borde en `_redirects` con un código 404/410 (no un redirect real: el
navegador nunca ve el contenido de destino como un 302). **No revertir
este bloqueo** ni servir ese archivo desde ningún endpoint nuevo — el
dataset público real es siempre `lugares-core.json` /
`lugares-detalles.json` / `lugares-estado.json`.

### 10.4 Buenas prácticas generales

- Nunca introducir dependencias de terceros (npm, CDN) sin evaluar su
  necesidad de red saliente y actualizar la CSP en el mismo cambio.
- `functions/weather.js` valida la forma de la respuesta upstream
  (`if (!ts) return 502...`) antes de normalizarla — seguir este patrón
  para cualquier proxy nuevo: nunca asumir la forma de una respuesta
  externa sin validarla.
- El User-Agent identificable hacia `api.met.no` es requerido por esa API
  (si no, bloquea) — cualquier integración nueva con una API externa debe
  revisar sus propios requisitos de este tipo antes de asumir que un
  `fetch()` simple alcanza.

### 10.5 Qué nunca hacer

- No debilitar la CSP para "hacer algo funcionar más rápido" sin
  documentar la razón técnica y evaluar alternativas.
- No hardcodear credenciales ni claves de API en el código de cliente —
  no se encontró ninguna en este repositorio; mantenelo así (el proxy de
  clima, por ejemplo, no requiere clave — MET Norway es de acceso libre
  con User-Agent).
- No exponer `lugares-mapa.json` ni ningún dataset crudo equivalente que
  se agregue en el futuro.

---

## 11. Filosofía de Desarrollo

Estos principios no son aspiracionales: se pueden verificar en el propio
historial del repositorio, que documenta explícitamente varias "fases" de
auditoría (Fase 0 a Fase 8, más rondas específicas del Ambient Engine)
donde cada cambio se acota, se verifica y se deja registrado.

### 11.1 Cambios pequeños y acotados

El patrón real observado en `docs/historial/` y en los propios comentarios
de auditoría es: **cada sesión de trabajo se limita a un alcance
declarado explícitamente al principio**, y cualquier hallazgo fuera de ese
alcance se documenta como pendiente, no se resuelve de paso. Ejemplo real:
`docs/integration-notes.md` marca 3 de 7 criterios de calidad como
"🔲 No verificado — requiere [X], fuera del alcance de esta auditoría de
integración", en vez de forzar una verificación superficial solo para
poder marcar la casilla.

### 11.2 Mejoras incrementales, nunca reescrituras masivas

Precedente explícito y citado textualmente en `index.html` §3: reescribir
`getElementById` a `querySelector` "para no ganar nada" se identifica
activamente como "el tipo de reescritura cosmética que este archivo
evita". **Una IA que proponga refactors amplios sin una razón funcional
concreta está violando un principio explícito del proyecto.**

### 11.3 Nunca romper funcionalidades existentes

El propio dataset de bugs históricos (Capítulo 14) existe porque una
revisión anterior, bien intencionada (reemplazar `id` por `data-*`), rompió
`app.js` sin darse cuenta porque no verificó el otro lado del contrato.
**Regla derivada, explícita en el proyecto:** cualquier cambio a un
contrato entre dos archivos (HTML↔JS, JS↔JS vía `window.URU_*`, JSON↔JS)
requiere verificar y actualizar **ambos lados en el mismo commit**, nunca
uno solo confiando en que "ya lo actualizo después".

### 11.4 Reutilizar componentes, nunca duplicar

Regla explícita del Ambient Engine (§8.1 del visual system): *"un asset
nuevo casi nunca debería fundar una familia nueva — casi siempre es una
variante de una de las 7"*. El mismo criterio aplica al CSS general:
antes de escribir una regla nueva, verificar si el valor/patrón ya existe
en `tokens.css` o en un componente existente.

### 11.5 Evitar deuda técnica — pero documentarla cuando es consciente

El proyecto distingue explícitamente entre **deuda accidental** (un bug
real, se corrige) y **deuda aceptada** (una excepción documentada con
razón técnica, como el `'unsafe-inline'` de estilos — Capítulo 10.1). Toda
deuda nueva que se introduzca debe caer en la segunda categoría, nunca en
la primera: si vas a dejar algo imperfecto, decilo explícitamente y por
qué, en el mismo lugar donde vive el código.

### 11.6 Mantener compatibilidad hacia atrás

- `@view-transition` es progresivo por diseño — sin soporte del navegador,
  el comportamiento es exactamente el de siempre, sin degradación
  funcional.
- El Service Worker tiene una lista `CACHES_VIGENTES` versionada (`VERSION
  = 'v2'`) — un cambio de estrategia de caché incrementa la versión, no
  sobrescribe el caché existente en silencio.
- Ningún cambio de arquitectura del Ambient Engine debe alterar el
  contrato mínimo (`window.AmbientEngine`, atributos `data-ambiente-*`)
  sin evaluar todos los consumidores existentes.

### 11.7 Excepciones versionadas, nunca silenciosas

Principio explícito, repetido en `visual-system-v1.0.md` §8.2 y en la
práctica de `tokens.css`: *"Una excepción no documentada, con el tiempo,
se convierte en la nueva regla de facto — y esa es la manera en que estos
sistemas se degradan."* Cualquier desviación de una regla de este
documento debe registrarse explícitamente en el código (comentario) y,
donde exista, en el documento de excepciones correspondiente.

---

## 12. Qué está absolutamente prohibido

Lista consolidada a partir de las reglas explícitas encontradas en el
código real (no genéricas — cada ítem tiene un origen concreto en el
repositorio):

1. **Cambiar de framework, agregar un bundler, o introducir un build
   step** sin una decisión de arquitectura explícita — contradice
   `package.json` (*"sin build step"*) y el patrón de todo el repo.
2. **Agregar librerías de mapas de terceros** (Leaflet, Mapbox, Google
   Maps SDK) — el motor de canvas propio es una decisión documentada, no
   una laguna.
3. **Romper la identidad visual del Ambient Engine**: iconografía
   figurativa (banderas, pines, comida, personas, animales) dentro del
   motor ambiental; relleno sólido fuera del plano P0; mezclar dos
   temperaturas de color en la misma escena; animar propiedades que
   disparan reflow; asignar color fijo no tokenizado a un asset (todas,
   reglas explícitas de `visual-system-v1.0.md` §11.2).
4. **Crear componentes CSS/JS duplicados** cuando ya existe uno
   equivalente en `tokens.css` o en los módulos `motor-*`/`ambiente-*` —
   ver principio de reutilización, Capítulo 11.4.
5. **Cambiar arquitectura sin analizar impacto real**: en particular,
   reordenar `<script defer>` sin entender el grafo de dependencias real
   (Capítulo 3.2), o tocar `motor-config.js` asumiendo que un número ahí
   es arbitrario cuando cada uno documenta su razón y su condición de
   recalibración.
6. **Modificar el Ambient Engine sin revisar sus consecuencias**: en
   particular, la matriz de reactividad (§6.1 del visual system) — nunca
   hacer que un asset de P0/P1 reaccione al usuario, ni que uno de P2/P3
   reaccione al clima/horario directamente, salvo la única excepción ya
   documentada y versionada (el halo de posición, P3, §13.3).
7. **Eliminar código sin entender su propósito**: en un repo con este
   nivel de comentarios explicativos, borrar algo sin leer el comentario
   que lo acompaña es, por definición, una decisión sin la información
   completa disponible.
8. **Hacer refactors masivos innecesarios**: ver precedente explícito
   citado en Capítulo 11.2.
9. **Reintroducir `--easing-rebote` (u overshoot equivalente) como
   default de cualquier animación nueva** — anti-patrón ya identificado y
   corregido explícitamente (Motion Direction Bible, Cap. 14).
10. **Reutilizar verde/rojo puro para algo que no sea el estado
    abierto/cerrado** — regla semántica explícita de `tokens.css`.
11. **Exponer `lugares-mapa.json`** (el dataset crudo) desde cualquier
    endpoint o referencia de cliente — ver Capítulo 10.3.
12. **Agregar cualquier `<script>` inline con lógica real** — regla de CSP
    explícita, Capítulo 10.2.
13. **Debilitar la CSP** (agregar `'unsafe-eval'`, ampliar `script-src` a
    un CDN externo, etc.) sin una razón documentada y una revisión de
    seguridad explícita.
14. **Superar los límites de complejidad de assets del Ambient Engine**
    (80 nodos, 6 grupos, 2 KB) "porque el asset lo necesita" — la regla
    explícita es: si un asset necesita más, el asset está mal planteado,
    no el límite (§11.2 del visual system, textual).
15. **Fundar una familia nueva de assets del Ambient Engine** sin repetir
    el ejercicio completo de justificación + qué se descarta a cambio
    (Capítulo 2 del visual system) — casi ningún asset nuevo debería
    fundar familia, casi siempre es variante de una existente.
16. **Tocar un `id` o `data-*` consumido por `js/app.js` sin actualizar
    la tabla de contrato de `index.html` §3 y el array `DOM` de `app.js`
    en el mismo commit** — es, literalmente, la causa raíz de los bugs
    históricos más graves del proyecto (Capítulo 14).
17. **Servir contenido en otro idioma cambiando el `lang` del documento
    completo** — un fragmento en otro idioma lleva su propio `lang`
    local, nunca se cambia `lang="es-AR"` del `<html>`.

---

## 13. Cómo debe trabajar una IA en este repositorio

### 13.1 Antes de escribir código, siempre

1. **Leer este AGENTS.md completo** — no solo la sección que parece
   relevante al pedido puntual, porque las conexiones entre capítulos
   (por ejemplo, un cambio de color toca simultáneamente Design System,
   Accesibilidad y potencialmente Seguridad si afecta a un dato dinámico)
   son reales en este proyecto.
2. **Leer la cabecera del archivo específico que vas a tocar.** Casi todo
   módulo de este repo (`motor-config.js`, `tokens.css`, `index.html`,
   `visual-system-v1.0.md`) tiene documentación interna extensa y
   actualizada — este AGENTS.md la indexa pero no la reemplaza.
3. **Correr `node donde-comer-cdu/js/run-tests.js` antes de tocar
   nada**, para tener una línea base real de qué pasa y qué no antes de
   tu cambio. Al momento de esta auditoría: 5/5 suites en verde.
4. **Buscar con `grep` antes de asumir**: el propio repo demuestra
   repetidamente (Capítulo 14, y el patrón de `URUSPOT-PENDIENTES-VERIFICADO
   -287.md` completo) que la única forma confiable de saber si algo
   "ya está hecho" es verificarlo contra el código real, nunca contra un
   documento de fase anterior sin re-chequear.

### 13.2 Al analizar impacto

- Si el cambio toca un `id`/`data-*`: identificá **todos** los
  consumidores reales (`grep -rn "getElementById('nombre')"` o
  equivalente) antes de tocar el HTML.
- Si el cambio toca `motor-config.js`: leé el comentario completo del
  valor que vas a cambiar — casi todos documentan explícitamente bajo qué
  evidencia futura deberían recalibrarse, y cambiarlos sin esa evidencia
  contradice el propio diseño del archivo.
- Si el cambio toca el Ambient Engine: verificá contra la matriz de
  reactividad (§6.1 de `visual-system-v1.0.md`) y el checklist de
  Capítulo 8.1 de ese mismo documento antes de aprobar un asset o
  comportamiento nuevo.
- Si el cambio toca CSS: buscá primero en `tokens.css` si el valor que
  necesitás ya existe con otro nombre — es un patrón real repetido
  (varios "bugs reales" del repo son, precisamente, tokens que ya
  deberían haber existido y no existían).

### 13.3 Buscar reutilización antes de crear algo nuevo

Antes de escribir un componente CSS, una función JS, o un asset SVG
nuevo, verificá explícitamente si ya existe algo equivalente. El criterio
del propio Ambient Engine (§8.1: *"¿A qué familia existente pertenece? Un
asset nuevo casi nunca debería fundar una familia nueva"*) es el estándar
a aplicar en todo el repositorio, no solo en assets visuales.

### 13.4 Pensar alternativas y explicar riesgos

Si el cambio es no trivial (toca más de un archivo, un contrato entre
módulos, o una regla del Design System), explicitá — en el propio
comentario del código, siguiendo el patrón del Capítulo 5.3 — qué
alternativa se descartó y por qué, tal como hace el resto del proyecto.
No lo dejes solo en la conversación con el usuario: el código debe poder
explicarse a sí mismo a la próxima IA que lo lea, sin necesitar esta
conversación.

### 13.5 Esperar aprobación si el cambio es grande

Un cambio se considera "grande" en este proyecto si:

- Toca más de un módulo de `motor-*.js` o cambia el orden de
  `<script defer>`.
- Introduce una tecnología nueva (Capítulo 4.2/4.3).
- Modifica una regla estructural del Design System (Capítulos 1, 3, 4 o 7
  del visual system — lo que ese mismo documento marca como "cambio
  mayor", §10.3).
- Cambia el modelo de scoring/exposición del Plano continuo (Capítulo 7).
- Afecta la CSP o cualquier regla de `_headers`/`_redirects`.

Para estos casos: presentá el plan, el riesgo y las alternativas
consideradas, y esperá confirmación explícita antes de aplicar el cambio
completo — no lo apliques de una junto con cambios menores no
relacionados.

### 13.6 Después de escribir código

- Volvé a correr `node donde-comer-cdu/js/run-tests.js` — las 5 suites
  deben seguir en verde, o el fallo nuevo debe estar explicado y ser
  esperado (por ejemplo, un test que ahora debe actualizarse porque el
  comportamiento que verificaba cambió intencionalmente).
- Si tocaste un `id`/`data-*`: actualizá la tabla de contrato en
  `index.html` §3 en el mismo cambio.
- Si tocaste un valor de `motor-config.js`: dejá el comentario de "por
  qué" y "bajo qué evidencia recalibrar", siguiendo el patrón existente.
- Si el cambio resuelve un hallazgo de
  `URUSPOT-PENDIENTES-VERIFICADO-287.md`: actualizá ese documento
  marcándolo como ✅ **YA APLICADO**, con la evidencia concreta (archivo y
  línea), siguiendo la metodología que el propio documento describe en su
  encabezado.

---

## 14. Errores históricos

Todos los siguientes son reales, verificables en el código y sus
comentarios de auditoría — no son ejemplos hipotéticos.

### 14.1 Bug A — "el mapa no se ve" (`index.html`, sección 2)

Una revisión anterior reemplazó varios `id` por `data-*` en el HTML
(argumento correcto: los `id` usados solo como hook de JS son peores que
atributos semánticos) **pero nunca actualizó `app.js`** (873 líneas en ese
momento), que seguía seleccionando por `getElementById`. Resultado:
`.mapa-container` (el contenedor padre del mapa, que nace con `hidden` en
el HTML crudo) no tenía `id`, así que `app.js` nunca lo vigilaba ni podía
sacarle el `hidden` — aunque `actualizarMapaHerramienta()` funcionara
perfecto sobre el `<div>` interno, el padre seguía oculto y el mapa nunca
se veía. **Lección aplicada como regla permanente:** todo cambio a un
contrato HTML↔JS actualiza ambos lados en el mismo commit (Capítulo 11.3 y
12, ítem 16).

### 14.2 Bug B — "los números quedan en cargando" (`index.html`, sección 2)

La misma revisión hizo perder el `id` de tres piezas de contenido dinámico
(contador de lugares verificados, contador de rubros, título/subtítulo de
región activa). Como cada asignación estaba protegida defensivamente
(`if (DOM.x)`), el fallo fue **completamente silencioso** — nada tiraba
una excepción en consola, así que el bug sobrevivió sin ninguna alarma
obvia. **Lección:** el diseño defensivo es correcto para no romper la
página entera, pero no reemplaza verificar explícitamente que el contrato
sigue intacto después de un cambio.

### 14.3 Variables CSS usadas sin estar nunca declaradas (Fase 8)

Tres casos reales encontrados en auditoría, todos con el mismo patrón: una
variable (`--glow-marca`/`--glow-marca-hover` en `mapa.css`,
`--glow-abierto` en `badge-estado.css`, `--anillo-foco-offset` en
`boton.css`, cuatro usos) se referenciaba con `var(--nombre)` **sin
fallback y sin que la variable existiera en ningún lado de `tokens.css`**.
Un `var()` que no resuelve y no tiene fallback invalida toda la
declaración CSS que lo contiene — no es que el efecto se viera "flojo", es
que directamente **no existía ningún box-shadow/outline-offset**, pese a
que el comentario del archivo lo daba por hecho. **Lección:** al escribir
`var(--nombre-nuevo)`, verificá primero que la variable ya esté declarada
en `tokens.css`, o declarala ahí mismo en el mismo commit.

### 14.4 `resolverVarCSS()` con nombre de token equivocado

`motor-render.js` (línea ~453) leía `--granate-clara` vía
`resolverVarCSS()` para el color de foco del canvas — **ese nombre nunca
existió**; el token real siempre fue `--color-granate-clara`. El mecanismo
caía en silencio a su fallback hardcodeado. Corregido y generalizado en
Fase 4 a 9 puntos de lectura distintos (fondo de mapa, texto de pin,
sombra de marcador, cluster, superficie flotante, trazo de conexión).
**Lección:** al puentear CSS custom properties hacia JS, verificá el
nombre exacto contra `tokens.css`, no contra la memoria de cómo "debería"
llamarse.

### 14.5 Contraste insuficiente en colores semánticos (Fase 4)

`--color-estado-abierto` (#40916C) y `--color-estado-cerrado` (#C1121F)
medían 4.34:1 y 2.98:1 contra su propia píldora — por debajo del mínimo
WCAG AA (4.5:1). Se corrigieron manteniendo el mismo matiz/saturación,
solo con más luminosidad, hasta pasar el mínimo con margen (4.72:1 /
4.74:1). **Lección:** cualquier color semántico nuevo debe verificarse
contra WCAG AA antes de aprobarse, no asumirse "suficientemente oscuro/
claro" a ojo.

### 14.6 `--easing-rebote` como default implícito de casi todo (Fase 1→4)

Una curva con rebote (`cubic-bezier(.22,1,.36,1)`) era la curva de entrada
por defecto de tarjetas, mapa, descubrimiento y `.u-reveal` — el ejemplo
textual del anti-patrón "Rebotes innecesarios" del Motion Direction Bible,
no un caso hipotético. Se corrigió reemplazando las 12 declaraciones que
la usaban por `--easing-movimiento` (ease-out sin overshoot). El token
sigue definido, sin uso activo, por si un caso puntual y deliberado
alguna vez lo necesitara — **nunca como default**.

### 14.7 Reglas CSS duplicadas entre archivos (2ª auditoría de `index.html`)

`#mapaHerramienta[hidden]{ display:none; }` vivía duplicada en
`css/mapa.css` y `css/descubrimiento.css`. **Nota de proceso real:** al
momento de la 2ª auditoría, el duplicado ya no existía en
`descubrimiento.css` — se dejó registro de que el hallazgo original estaba
desactualizado, **sin reabrir un problema que ya no era real**. Esto es en
sí mismo un patrón a imitar: verificar antes de "corregir" algo que quizás
ya se corrigió.

### 14.8 `lugares-mapa.json` público sin bloqueo explícito

El dataset crudo (708 KB, editado a mano, con registros potencialmente
sin verificar) permanecía en la carpeta pública del repo sin ningún
`_headers`/`_redirects`/`wrangler.toml` que confirmara su exclusión del
deploy — pese a que ningún módulo JS lo consumía. Se corrigió bloqueando
el acceso HTTP directo vía `_redirects` (Capítulo 10.3). **Lección:** que
un archivo no se use activamente en el código no significa que esté
protegido de exponerse igual — la protección tiene que ser explícita a
nivel de infraestructura, no implícita por "nadie lo llama".

### 14.9 Documentación arquitectónica enterrada al inicio del archivo

Una primera versión de la documentación interna de `index.html` vivía
al principio del `<head>`, antes del primer `<meta>` real — quien abría el
archivo para un cambio trivial (un `<title>`, revisar la CSP) tenía que
scrollear 519 líneas de comentarios primero. Se movió al final del
documento, justo antes de `</body>`, **sin cambiar una sola palabra del
contenido**. **Lección aplicable a este mismo AGENTS.md:** la
documentación exhaustiva es valiosa, pero su ubicación también importa —
si en el futuro este archivo crece demasiado para navegarse cómodo,
priorizá reorganizar el índice antes que recortar contenido real.

---

## 15. Checklist obligatorio

Toda IA debe repasar mentalmente esta lista antes de modificar **cualquier
archivo** de este repositorio. Es una síntesis de los checklists reales ya
existentes en el propio código (`index.html` §11, `visual-system-v1.0.md`
§8.1) más los puntos derivados de este documento.

**Antes de empezar:**
- [ ] Leí este AGENTS.md completo, no solo la sección aparentemente
      relevante.
- [ ] Leí la cabecera/documentación interna del archivo específico que
      voy a tocar.
- [ ] Corrí `node donde-comer-cdu/js/run-tests.js` y tengo la línea base
      real (5/5 suites, o sé exactamente qué falla y por qué antes de mi
      cambio).
- [ ] Busqué con `grep` si lo que quiero agregar ya existe (token CSS,
      función, asset, primitiva) antes de crear algo nuevo.

**Durante el cambio:**
- [ ] ¿Agregué o renombré un `id`/`data-*`? → actualicé la tabla de
      contrato de `index.html` §3 y el array `DOM` en `app.js`, en el
      mismo cambio.
- [ ] ¿Agregué un `<script defer>` nuevo? → lo ubiqué respetando sus
      dependencias reales de `window.URU_*`/`window.Ambiente*`, y
      documenté la dependencia en `index.html` §5.
- [ ] ¿Usé un color/tipografía/espaciado/sombra/duración? → viene de un
      token de `tokens.css`, no es un literal nuevo sin justificar.
- [ ] ¿Toqué un valor de `motor-config.js`? → dejé el comentario de "por
      qué" y "bajo qué evidencia recalibrar".
- [ ] ¿Agregué o modifiqué un asset del Ambient Engine? → pasa el
      checklist completo del Capítulo 8.1 de `visual-system-v1.0.md`
      (categoría semántica, primitivas compartidas, familia existente,
      plano/movimiento heredado, test de 3 escalas).
- [ ] ¿Modifiqué algo dentro de un `<template>`? → confirmé que el
      consumidor en JS sigue esperando esa misma estructura interna.
- [ ] ¿El cambio afecta contenido visible? → revisé que `<noscript>` y el
      JSON-LD (`FAQPage`, `Organization`) sigan siendo coherentes.
- [ ] ¿Toqué el `<head>` o agregué un origen externo nuevo? → actualicé la
      CSP explícitamente y documenté por qué.
- [ ] ¿El cambio introduce una excepción a alguna regla de este
      documento? → la documenté explícitamente en el código, como
      excepción versionada, nunca en silencio.
- [ ] ¿Escribí un comentario nuevo? → explica el "por qué", no repite el
      "qué" (Capítulo 5.3).

**Antes de terminar:**
- [ ] Volví a correr `node donde-comer-cdu/js/run-tests.js` — 5/5 suites
      en verde, o el cambio de resultado es esperado y explicado.
- [ ] Si mi cambio resuelve un ítem de
      `URUSPOT-PENDIENTES-VERIFICADO-287.md`, lo marqué como aplicado con
      evidencia concreta.
- [ ] No dejé ningún `<script>` inline con lógica real.
- [ ] No expuse `lugares-mapa.json` ni ningún dataset crudo equivalente.
- [ ] Verifiqué contraste WCAG AA si agregué un color nuevo con
      significado semántico.

---

## 16. Roadmap Técnico

Basado en `URUSPOT-PENDIENTES-VERIFICADO-287.md` (verificado contra el
repo real el 2026-07-29) y `docs/integration-notes.md` (Fase 5). Esta
sección resume qué **falta aplicar de verdad**, no qué "se podría hacer
algún día" — cada ítem está marcado ❌ en el documento fuente tras
verificación directa contra el código.

### 16.1 Prioridad alta — cambios de bajo riesgo, alto impacto de producto

1. **Conectar `recortePorIniciativaPropiaExplicado()` a `app.js`.** La
   función que da la *razón* de una recomendación ("está cerca tuyo", por
   ejemplo) ya existe y está probada en `motor-test.js`, pero `app.js`
   sigue llamando a la versión "muda" (`recortePorIniciativaPropia()`,
   sin razones), en la línea que puebla el flujo principal. Cero riesgo
   arquitectónico — es cambiar qué función se invoca, no crear lógica
   nueva.
2. **Mostrar el rating en la tarjeta del flujo principal.** El campo
   `rating`/`ratingCount` ya está disponible en el registro de datos; hoy
   solo se usa en `pintarDestacados()`. Falta la plantilla en
   `pintarTarjetas()`.
3. **Cambio de región perceptible.** `lastRenderCache.region` ya se
   guarda, pero ningún punto del código la compara contra el valor
   anterior para disparar una microseñal — sigue siendo un dato sin
   consumidor.

### 16.2 Prioridad media — requiere más diseño antes de implementar

4. **Diferenciación cualitativa real entre Guía y Exploración en el
   mapa** — hoy la única diferencia es la cantidad de resultados (4 vs.
   10); no hay tratamiento visual condicionado a la región activa.
5. **Baseline de tests visuales antes de tocar CSS/`motor-render.js`** —
   no hay Playwright/Puppeteer/axe-core corriendo en CI todavía (aunque
   `@playwright/test` ya está en `devDependencies`), pese a que existe un
   punto de partida manual (`baseline-visual-uruspot.js` + capturas en
   `baseline/`). Este es, además, el ítem de mayor apalancamiento para
   reducir el riesgo de reintroducir bugs como los del Capítulo 14.
6. **Distinguir "filtro dentro de curaduría" de "filtro tipo búsqueda"**
   en `hayBusquedaOFiltro()` — hoy el filtro de rubro abandona el recorte
   curado exactamente igual que una búsqueda de texto explícita. Requiere
   tests nuevos antes de tocar `ramaActual()`.
7. **Brújula funcional interactiva** (bearing en tiempo real hacia el
   spot seleccionado, consumida por `ficha.js`/`motor-mapa.js`) — hoy
   solo existe `ambiente-brujula.js`, que es la familia decorativa de
   fondo, no un widget de navegación real.
8. **"Carta de Posición" en fichas de lugar** (coordenadas, distancia,
   "cómo llegar" con mapa embebido) — hoy `info-strip` en las fichas solo
   tiene 3 celdas (estado, ubicación, contacto), sin mapa ni distancia.
9. **CTA sticky en mobile dentro de la ficha** — no existe ningún
   `position:sticky`/`fixed` en `ficha.css` al momento de esta auditoría.

### 16.3 Prioridad baja / mantenimiento recurrente

10. **Auditoría v1.1 del sistema visual completo** — el propio
    `visual-system-v1.0.md` §12 (Roadmap) la marca como "recurrente",
    prioridad baja pero impacto alto a largo plazo para mantenimiento de
    identidad. Debería re-ejecutarse contra el Capítulo 13 (Auditoría
    crítica) de ese documento en cada release mayor del engine.
11. **Consolidar la relación entre `donde-comer-cdu/locales/` y
    `los-mejores-restaurantes-cdu/<slug>/`** — ver nota del Capítulo 3.1;
    no se encontró documentación formal de por qué existen dos catálogos
    de fichas potencialmente superpuestos.
12. **Migrar `pintarLeyenda()` para eliminar `'unsafe-inline'` de la
    CSP de estilos** — deuda aceptada y documentada (Capítulo 10.1), no
    urgente pero es la única vía real para endurecer esa directiva.
13. **Unificar los `outline-offset` de foco por teclado** dispersos hoy
    en `boton.css`, `chip.css`, `mapa.css`, `descubrimiento.css` (1px, 2px,
    -2px, 4px sin criterio sistemático) contra el token `--anillo-foco`
    ya declarado.
14. **Auditar o eliminar el `index.html` de la raíz del repositorio** —
    hoy es un redirect residual (`window.location.replace(...)` hacia la
    misma URL `https://uruspot.pages.dev/` desde la que ya se sirve
    `inicio/index.html`, ver §1.1), probablemente un resabio de una
    configuración de deploy anterior. No rompe nada hoy porque Cloudflare
    Pages resuelve la home real vía `inicio/`, pero es confuso para
    cualquiera —humano o IA— que lea la raíz del repo esperando encontrar
    ahí el punto de entrada del sitio.

### 16.4 Qué NO vale la pena tocar sin una razón nueva y concreta

- El motor de canvas propio para el mapa — cambiarlo a una librería de
  terceros es un cambio de arquitectura mayor, no una optimización.
- El modelo del Plano continuo (autonomía/fricción) — sus umbrales están
  explícitamente marcados como "recalibrar con evidencia real de uso", no
  con intuición de diseño.
- La decisión de "sin build step" — es un principio de producto
  (simplicidad de despliegue, cero configuración de CI para servir el
  sitio), no una limitación técnica a resolver.

---

## 17. Glosario

Términos internos del proyecto — donde el propio producto ya expone una
definición pública (`index.html`, sección `#glosario`), se usa esa
definición textual como base; se agregan acá los términos internos de
código que no tienen equivalente público.

| Término | Significado |
|---|---|
| **Guía** | Región del Plano con menor autonomía: recorte curado de máximo 4 lugares por iniciativa propia del sistema. El punto de partida de cualquier sesión nueva. |
| **Exploración** | Región intermedia del Plano: recorte de hasta 10 lugares, más variedad y menos curaduría que Guía. |
| **Acción Directa** | Región de mayor autonomía: acceso directo al catálogo completo, mapa como herramienta principal, sin recorte curado. Tiene una variante "inferida" (el usuario llegó ahí por comportamiento) sin narrativa de cierre implementada todavía (ver Roadmap). |
| **Plano (continuo)** | El modelo central de personalización de la experiencia: dos ejes (autonomía, fricción) que se mueven con seis acciones mínimas del usuario. No confundir con "plano" en el sentido del Ambient Engine (P0-P3, planos de profundidad visual) — son dos usos distintos de la misma palabra en el proyecto. |
| **Curaduría** | La lista personal de lugares guardados por el usuario. Se activa al guardar 2+ veces dentro de una ventana de 90 segundos. |
| **Destacados** | El spotlight de lugares con mejor puntuación real y suficientes reseñas — no depende de la sesión ni ubicación del usuario, es el mismo para todos. |
| **Verificado** | Un lugar confirmado por el equipo (caminado o contra fuentes oficiales/Google Places), no completado a ojo ni scrapeado sin revisar. |
| **Rubro** | Categoría de negocio (Gastronomía, Alojamiento, Salud, etc.). Hoy son 14, cada uno con color propio en mapa y tarjetas (`tokens.css`, `rubros-meta.js`). |
| **"Cerca de mí"** | Modo de búsqueda espacial que ordena resultados por distancia real, cuando el lugar tiene coordenadas cargadas. |
| **Ambient Engine** | El sistema de capas visuales ambientales de fondo (7 familias de assets SVG en 4 planos de profundidad) que le da a la interfaz "sensación de lugar" — no es decoración, es identidad de marca implementada como sistema. Ver Capítulo 6.5. |
| **Corriente(s)** | Una de las 7 familias de assets del Ambient Engine: líneas de flujo tipo isolíneas de agua, representando el río sin literalidad. Plano P1, movimiento de deriva direccional continua. |
| **Escena** | Estado configurable del Ambient Engine, expuesto vía `AmbientEngine.setEscena(nombre)` — hoy activado según la rama de navegación (`buscando`, `explorando`, `sinResultados`). Corrección (auditoría 2026-07): `ambiente-escenas.js` es el *Scene Manager* — resuelve, carga y destruye la escena, pero él mismo declara que **no decide** qué escena corresponde al estado actual. Esa decisión (el catálogo `buscando`/`explorando`/`sinResultados` → configuración de escena) vive en `ambiente-config.js`; `ambiente-escenas.js` solo ejecuta el ciclo de vida sobre lo que `ambiente-config.js` define. |
| **Plano (P0-P3)** | En el contexto del Ambient Engine (no confundir con "el Plano" del modelo de producto): las 4 capas de profundidad visual — P0 Sustrato, P1 Corriente, P2 Orientación, P3 Foco. |
| **Coreografías** | La gramática de animación de transiciones de interfaz general (distinta del Ambient Engine), con 3 registros de ritmo (inmediato, conversacional, contemplativo) y reglas de fatiga (una misma acción repetida se degrada a un registro más rápido). Ver `js/coreografias.js`. |
| **Motor de mapa** | El conjunto `motor-mapa.js` (qué puntos corresponden) + `proyeccion.js` (matemática lat/lng↔px) + `motor-render.js` (dibujo real en `<canvas>`). |
| **Failsafe** | El mecanismo de `js/failsafe-reintentar.js`: si el placeholder de carga no fue reemplazado en 12 segundos, inyecta un aviso `role="alert"` con botón de reintentar. |
| **Contrato HTML↔JS** | La tabla documentada en `index.html` §3 que mapea cada `id`/`data-*` del HTML a la función de `app.js` que lo consume — el punto más frágil de todo el proyecto (ver Capítulo 14, Bugs A y B). |
| **Recorte por iniciativa propia** | El subconjunto de lugares que el sistema elige mostrar sin que el usuario haya buscado nada explícitamente (Guía/Exploración) — gobernado por el scoring de `motor-exposicion.js`. Nunca aplica a búsqueda de texto ni a Curaduría. |
| **Madurez de sesión** | Nivel de familiaridad del usuario con el producto, contado por `(usuarioId, ciudadId)`: Anfitrión (0+ aperturas) → Conocido (10+) → Cómplice (100+) → Casa (500+). |
| **Excepción versionada** | El mecanismo formal (documentado en `visual-system-v1.0.md` §8.2) para registrar una desviación deliberada de una regla del sistema, de forma explícita y nunca silenciosa. |

---

## 18. Manual para futuras IA

*Carta dirigida a cualquier IA que abra este proyecto, hoy o dentro de
cinco años.*

Si estás leyendo esto, alguien te acaba de pedir que toques URU SPOT.
Antes de escribir una sola línea, valga la redundancia con el resto de
este documento: este no es un proyecto que tolere bien los cambios
apurados, y no porque sea frágil, sino porque es exactamente lo contrario
— es un proyecto que **ya se explicó a sí mismo, extensamente, cada vez
que alguien tomó una decisión**. Ese es su activo más valioso, más que
cualquier línea de código individual. Cuando dudes entre escribir código
rápido sin contexto o tomarte cinco minutos más para leer el comentario
que ya existe al lado de lo que ibas a tocar, elegí lo segundo. Casi
siempre la respuesta a "¿por qué está hecho así?" ya está escrita a
quince líneas de distancia.

Vas a sentir, en algún momento, la tentación de "limpiar" algo que te
parece redundante, sobre-explicado, o hecho de una forma más artesanal de
lo que harías vos. Antes de ceder a esa tentación, notá que ese impulso ya
tiene un nombre dentro de este mismo proyecto: **"reescritura cosmética
que este archivo evita"** — es una frase real, tomada de la documentación
interna de `index.html`, escrita por alguien que ya pasó por ese mismo
impulso y decidió no actuar sobre él sin una razón funcional concreta.
Hacé lo mismo.

Cuando encuentres algo roto — y lo vas a encontrar, porque este es un
proyecto vivo con auditorías reales que siguen encontrando cosas — no lo
arregles en silencio. La cultura de este repositorio, visible en cada
"BUG REAL (auditoría Fase N)" de `tokens.css`, en cada bug documentado del
Capítulo 14 de este mismo archivo, es dejar rastro de qué estaba mal, por
qué, y cómo se supo. Eso no es burocracia — es lo que le permitió a este
proyecto sobrevivir varias rondas de revisión sin perder coherencia. Sé
la próxima persona (humana o IA) que continúa esa cadena, no la que la
corta.

Este proyecto tiene una identidad visual y de producto muy específica —
una ciudad de río, curaduría honesta que no se compra, un sistema visual
que se define tanto por lo que **no** incluye (iconografía turística
genérica, rebotes decorativos, verde/rojo usado sueltamente) como por lo
que sí. Es fácil, sin querer, ir empujando esa identidad hacia algo más
genérico — un botón "un poco más colorido", una animación "un poco más
llamativa", un ícono "más literal para que se entienda mejor". Cada una de
esas decisiones, tomada sola, parece inocua. El propio documento del
sistema visual lo dice explícitamente: *"Agregar assets decorativos
'porque queda vacío' sin pasar el checklist... es la puerta de entrada más
común a la degradación de un sistema visual."* Vale para el sistema visual
y vale, con las mismas palabras, para el resto del proyecto.

Si en algún momento este mismo archivo — AGENTS.md — te parece
desactualizado respecto al código real, no lo ignores ni lo reescribas
entero por las tuyas: verificalo contra el repositorio como hicimos acá
(clon real, `grep`, lectura de archivo, ejecución de tests), y actualizá
solo lo que efectivamente cambió, dejando registro de cuándo y por qué —
exactamente el mismo método que usa `URUSPOT-PENDIENTES-VERIFICADO-287.md`
para mantenerse honesto con el tiempo. Ese documento nació de la misma
necesidad que este: que "documentado en una fase anterior" y "cierto hoy"
no son la misma cosa, y la única forma de saber cuál de las dos es
verificar.

Por último: no le tengas miedo a decir "esto es grande, necesito
confirmación antes de aplicarlo completo". El costo de preguntar de más es
bajo. El costo de un cambio grande aplicado sin revisión, en un proyecto
que documenta sus propios bugs históricos con este nivel de detalle, ya
está medido — y es alto. Este documento existe, en última instancia, para
que no tengas que adivinar dónde está esa línea.

Bienvenida, bienvenido, a URU SPOT. Cuidalo con el mismo criterio con el
que fue construido.
