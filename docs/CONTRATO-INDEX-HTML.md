# Contrato HTML↔JS de `donde-comer-cdu/index.html`

> Extraído de `index.html` (líneas 1719–2687) el 2026-08-01 para sacar ~66 KB de comentarios del critical path de red. Contenido copiado tal cual, sin editar una palabra.

```html
<!-- ═══════════════════════════════════════════════════════════════════════
     DOCUMENTACIÓN COMPLETA DE index.html (donde-comer-cdu)
     Reubicada acá, al final del documento, en la 2ª auditoría — ver
     nota al principio del <head> para el motivo. Contenido idéntico
     al original, sin editar una sola palabra de las 12 secciones.
     ═══════════════════════════════════════════════════════════════════════ -->
<!-- ═══════════════════════════════════════════════════════════════════════
     URU SPOT — index.html (donde-comer-cdu)
     Reconstrucción arquitectónica: 2026-07-22

     ESTE BLOQUE ES EL PUNTO DE ENTRADA A LA DOCUMENTACIÓN DEL ARCHIVO.
     Léelo antes de tocar cualquier `id`, `data-*` o `<script src>` de
     acá abajo. La sección 3 (CONTRATO HTML↔JS) es la que más deuda
     técnica genera si se ignora — es, literalmente, la causa de los
     dos bugs que motivaron esta revisión.

     ÍNDICE DE ESTA DOCUMENTACIÓN
       1. Qué es este archivo y qué NO es
       2. Diagnóstico: por qué el mapa no se veía y por qué los
          números quedaban en "cargando" (root cause, con evidencia)
       3. Contrato HTML↔JS — tabla completa de hooks (id / data-*)
          que js/app.js consume, y qué pasa si se rompen
       4. Invariantes del documento (lo que nunca debe dejar de ser
          cierto, aunque cambie el contenido)
       5. Orden de carga de <script> y por qué es una dependencia dura
       6. Accesibilidad: decisiones y su justificación
       7. Resiliencia: qué pasa cuando algo falla
       8. Seguridad: CSP y por qué estos orígenes y no otros
       9. Puntos de extensión pensados para quien agregue features
      10. Deuda técnica conocida, fuera del alcance de este archivo
      11. Checklist para quien vaya a modificar este archivo
      12. Expansión de contenido editorial (esta revisión) — qué se
          agregó, por qué, y qué NO cambia de la arquitectura
      13. Auditoría 3ª pasada — cambios acotados a este archivo
      14. Auditoría 4ª pasada — dos hojas de estilo referenciadas que
          nunca existieron, expansión de contenido y tema claro
      15. Auditoría 5ª pasada — WP0, limpieza previa al Ambient Engine

     ───────────────────────────────────────────────────────────────
     1. QUÉ ES ESTE ARCHIVO Y QUÉ NO ES
     ───────────────────────────────────────────────────────────────
     Este HTML es la CÁSCARA de la landing "Dónde comer" de URU SPOT.
     No contiene lógica de negocio, no contiene datos de lugares, no
     decide qué se muestra ni cuándo. Su único trabajo es:

       (a) declarar los ELEMENTOS ESTABLES que el JavaScript necesita
           encontrar para poder pintar contenido dinámico sobre ellos
           (buscador, panel de descubrimiento, mapa, stats, FAQ);
       (b) declarar el contenido ESTÁTICO que no cambia con datos
           (manifiesto, accesos por categoría, preguntas frecuentes);
       (c) cargar, en el orden correcto, los módulos de JS que sí
           tienen la lógica real (ver sección 5);
       (d) exponer metadatos para buscadores y redes sociales.

     Si estás buscando la lógica de "cuántos lugares mostrar", "qué
     región del usuario aplica", "cómo se calcula el mapa" o "qué
     pasa cuando guardás un lugar" — no está acá. Está en, en este
     orden de responsabilidad:
       js/motor-config.js      → constantes y umbrales, un solo lugar
       js/motor-plano.js       → estado de sesión persistido (PLANO)
       js/motor-exposicion.js  → cuánto mostrar según el "plano"
       js/motor-mapa.js        → QUÉ puntos le corresponden al mapa
       js/proyeccion.js        → matemática de proyección lat/lng→px
       js/motor-render.js      → CÓMO se dibuja el mapa (canvas propio)
       js/app.js               → orquestador: conecta todo lo anterior
                                  con el DOM que este archivo declara

     ───────────────────────────────────────────────────────────────
     2. DIAGNÓSTICO — POR QUÉ EL MAPA NO SE VEÍA Y LOS NÚMEROS
        QUEDABAN PEGADOS EN "CARGANDO" (bugs reales, corregidos acá)
     ───────────────────────────────────────────────────────────────
     Una revisión anterior de este archivo ("REDISEÑO ARQUITECTÓNICO
     2026-07-22" original) reemplazó varios `id` por atributos
     `data-*`, con el argumento correcto de que los `id` usados solo
     para hooks de JS son peores que atributos semánticos dedicados.
     El principio es válido — el problema es que esa revisión NUNCA
     tocó js/app.js, que es un módulo mucho más grande y con lógica
     real (873 líneas) y que sigue seleccionando elementos por
     `document.getElementById(...)`. El resultado: varios `id` que
     app.js necesita dejaron de existir en el HTML, y las funciones
     que dependían de ellos empezaron a fallar EN SILENCIO, porque
     todas están escritas defensivamente (`if (DOM.x) DOM.x....`).
     Nada tira una excepción visible en consola — por eso el bug
     sobrevivió sin que saltara ninguna alarma obvia.

     Bug A — "el mapa no se ve":
       `.mapa-container` es el contenedor que envuelve el mapa, su
       cartel informativo y su leyenda. Nace con el atributo `hidden`
       en el propio HTML (correcto: no debe verse hasta que haya
       datos con coordenadas). El problema es que:
         · no tenía `id`, así que js/app.js no podía referenciarlo, y
         · js/app.js NUNCA lo tenía en su lista de elementos vigilados
           (solo vigilaba `#mapaHerramienta`, el `<div>` interno).
       `[hidden]` en el contenedor padre oculta a TODOS sus hijos sin
       importar el estado individual de cada uno — así que aunque
       `actualizarMapaHerramienta()` hiciera bien su trabajo y pusiera
       `mapaHerramienta.hidden = false`, el padre seguía oculto y el
       mapa jamás llegaba a pintarse en pantalla. Confirmado también
       revisando css/mapa.css: `.mapa-container` no tiene NINGUNA
       regla propia — su visibilidad depende 100% del atributo
       `hidden`, que nadie quitaba.
       Arreglo en este archivo: se agrega `id="mapaContainer"`. Ese id
       por sí solo no alcanza — hace falta que app.js lo agregue a su
       lista de elementos vigilados y alterne su `.hidden` junto con
       el de `mapaHerramienta`. Ese cambio, mínimo y quirúrgico, se
       entrega junto con este archivo (ver parche a js/app.js más
       abajo en la respuesta — no se reescribió el resto del módulo).

     Bug B — "los números quedan en cargando":
       Tres piezas de contenido dinámico perdieron su `id` en la
       misma revisión, y quedaron atascadas en su valor de placeholder
       para siempre porque `DOM.x` es `null` y cada asignación está
       protegida por `if (DOM.x)`:
         · el contador "lugares verificados"     (quedaba en "—")
         · el contador "rubros distintos"        (quedaba en "—")
         · el título/subtítulo de la región activa, que arranca en
           "Para empezar" / "Cargando…" y nunca se actualiza — este
           es, con altísima probabilidad, el "cargando" que se ve
           pegado en pantalla.
         · como efecto secundario menos visible: "tu relación con
           esta ciudad" en el header tampoco se actualiza nunca.
       Arreglo en este archivo: se restituye el `id` histórico que
       app.js espera en cada uno de estos elementos, MANTENIENDO el
       atributo `data-*` correspondiente (no se revierte la mejora
       semántica — conviven ambos, ver sección 3 para el porqué).

     Bug C — hallado en la misma auditoría, mismo patrón exacto:
       `.mapa-info` (el cartel "Clickeá un lugar en el mapa…") tenía
       clase pero no `id` → `DOM.mapaInfo` también era `null` → el
       texto "Mostrando X de Y lugares en el mapa" nunca se pintaba.
       Se agrega `id="mapaInfo"`.

     Bug D — elemento faltante, no solo `id` perdido:
       js/app.js tiene una función completa,
       `actualizarContadorGuardados()`, que pinta cuántos lugares
       tiene guardados el usuario en un badge `#contadorCuraduria`
       — pero ese elemento no existía en ningún punto del HTML. Se
       agrega el `<span id="contadorCuraduria">` junto al botón
       "tu lista guardada", con un parche de estilo mínimo y
       explícitamente marcado como deuda a migrar (ver sección 10).

     Bug E — metadato incorrecto, sin impacto funcional pero sí de
       mantenibilidad:
       `data-map-provider="mapbox"` y el `dns-prefetch` a
       `api.mapbox.com` son ambos falsos: el motor de mapa
       (js/motor-render.js) dibuja tiles raster de CARTO (Voyager)
       directamente sobre un `<canvas>` propio, sin ninguna
       dependencia de Mapbox. Se corrige el valor del atributo y se
       reemplaza el `dns-prefetch` por los subdominios reales que usa
       el motor (a/b/c/d.basemaps.cartocdn.com — ver
       js/motor-render.js:126, array SUBDOMINIOS). Este tipo de
       metadato "de mentira" es peligroso porque un mantenedor futuro
       puede leerlo, confiar en él y perder tiempo buscando una
       integración de Mapbox que no existe.

     ───────────────────────────────────────────────────────────────
     3. CONTRATO HTML↔JS — TODO hook que js/app.js consume por id
        (revisar `js/app.js`, línea ~83, array de `DOM`)
     ───────────────────────────────────────────────────────────────
     Regla de oro: cada fila de esta tabla es una promesa. Si cambiás
     el `id` de un elemento sin actualizar `js/app.js` en el mismo
     commit, revivís exactamente los bugs A-D de arriba, y lo harás
     EN SILENCIO — nada va a fallar ruidosamente, solo un pedazo de
     la interfaz va a dejar de actualizarse. La única forma confiable
     de detectarlo es una revisión manual comparando este bloque
     contra el array `DOM` de app.js, o un test que lo automatice
     (ver sección 10 — no existe ese test todavía).

       id                    │ dueño en app.js         │ qué controla
       ──────────────────────┼─────────────────────────┼──────────────────────────────
       rolActual              │ actualizarCabecera()     │ texto "tu relación con esta
                               │                          │ ciudad" en el header
       inputBuscar            │ listener de búsqueda     │ valor del buscador
       btnVerGuardados        │ listener de click        │ activa la región "curaduría"
       contadorCuraduria      │ actualizarContadorGuard. │ badge con cantidad guardada
       panelDescubrimiento    │ render()                 │ grilla de tarjetas de lugares
       tituloRegion           │ actualizarCabecera()     │ título de la región activa
       subtituloRegion        │ actualizarCabecera()     │ subtítulo de la región activa
       mapaTextura            │ actualizarMapaTextura()  │ capa ambiental no interactiva
       mapaContainer          │ actualizarMapaHerram.()  │ visibilidad de TODO el bloque
                               │                          │ de mapa (contenedor padre)
       mapaHerramienta        │ inicializarMotorMapa() + │ el <canvas> del mapa en sí
                               │ actualizarMapaHerram.()  │
       mapaInfo               │ actualizarMapaHerram.()  │ cartel "mostrando X de Y…"
       mapaLeyenda             │ pintarLeyenda()          │ leyenda de colores por rubro
       listaRubros            │ pintarIndiceRubros()     │ grilla "Por rubro"
       statLugares             │ pintarStatsRapidas()     │ contador "lugares verificados"
       statRubros              │ pintarStatsRapidas()     │ contador "rubros distintos"
       faqLista                │ (reservado, ver §9)      │ contenedor de FAQ dinámicas
       destacados              │ pintarDestacados()       │ visibilidad de TODO el spotlight
                                │                          │ de mejor puntuados (agregado en
                                │                          │ auditoría Fase 4 — ver más abajo)
       listaDestacados         │ pintarDestacados()       │ strip de tarjetas destacadas
       sugerenciasRapidas      │ pintarSugerenciasRapidas(│ atajos "empezá por acá" +
                                │ ) / actualizarVisibil.() │ cerca tuyo (agregado en
                                │                          │ auditoría 4ª pasada — ver §14;
                                │                          │ el `id` ya estaba en
                                │                          │ OPTIONAL_DOM_IDS de app.js
                                │                          │ desde antes, sin elemento)
       filtrosActivos          │ pintarFiltrosActivos()   │ píldoras de filtro activo con
                                │                          │ su × (mismo origen que la fila
                                │                          │ de arriba — ver §14)

     Elementos que NO están en esta tabla (mapa-container, sección
     manifiesto, accesos por categoría, footer) son intencionalmente
     estáticos: js/app.js no los toca, y no deberían empezar a
     necesitar un `id` salvo que se vuelvan dinámicos — en ese caso,
     agregalos a esta tabla en el mismo commit que los conecte.

     Por qué conviven `id` y `data-*` en el mismo elemento en vez de
     elegir uno solo: el `id` es el contrato de bajo nivel con
     `getElementById` (rápido, sin ambigüedad, es lo que ya usa el
     87% de la lógica en app.js — reescribirlo a `querySelector`
     para no ganar nada era el tipo de reescritura cosmética que este
     archivo evita). El `data-*` es semántico: describe QUÉ es el dato
     ("total-places", "region-title") independientemente de cómo se
     lo localiza, y es lo que usarían tests end-to-end, lectores de
     pantalla con software de terceros, o una futura migración a un
     framework de componentes. Ninguno reemplaza al otro.

     ───────────────────────────────────────────────────────────────
     4. INVARIANTES DEL DOCUMENTO
        (verdades que este archivo garantiza; romperlas rompe algo
        que no es obvio desde el diff que las rompió)
     ───────────────────────────────────────────────────────────────
     I1. Todo `id` listado en la sección 3 existe exactamente una vez
         en este documento y nunca dentro de un `<template>` (los
         `<template>` no forman parte del DOM activo — un `id`
         adentro es invisible para `getElementById` hasta que se
         clona, y si ese clon no le asigna un id ÚNICO por instancia,
         terminás con ids duplicados en el documento real).
     I2. `.mapa-container` empieza con `hidden` en el marcado crudo.
         Es un invariante deliberado (no un placeholder que "alguien
         se olvidó de sacar"): el mapa no debe existir visualmente
         hasta que `js/motor-mapa.js` confirme que hay al menos un
         resultado georreferenciado. Si algún día se decide que el
         mapa debe verse siempre (aunque vacío), sacar el `hidden` acá
         NO alcanza — hay que revisar `actualizarMapaHerramienta()` en
         app.js para que no vuelva a esconderlo cuando no hay puntos.
     I3. Cada `<template>` tiene un propósito documentado en el punto
         donde se declara. Un `<template>` sin consumidor conocido en
         JS es deuda muerta — antes de agregar uno nuevo, confirmá que
         algo en app.js/motor-render.js lo va a clonar.
     I4. El orden de los `<script defer>` codifica dependencias reales
         entre módulos (ver sección 5) — no es orden alfabético ni
         cosmético. Reordenarlos sin entender esas dependencias puede
         romper el mapa con un error de consola sutil
         ("URU_MOTOR_MAPA_RENDER: falta URU_PROYECCION...").
     I5. CORREGIDO (auditoría posterior): el único `<script>` inline
         que queda a propósito es el bloque de documentación de
         lazy-loading (comentario puro, sin código ejecutable, así
         que no importa que la CSP lo trate como inline). El de
         resiliencia (sección 7) YA NO es inline — se externalizó a
         `js/failsafe-reintentar.js` porque el supuesto anterior acá
         era incorrecto: `script-src 'self'` cubre *fuentes* (URLs
         de `<script src>`), NO autoriza automáticamente bloques
         `<script>` sin `src` solo por ser del mismo documento. Un
         `<script>` inline necesita además `'unsafe-inline'`, un
         `'nonce-...'` que matchee, o un `'sha256-...'` del contenido
         exacto — ninguna de las tres cosas está en esta CSP. El
         bloque de resiliencia además tenía un `onclick="..."`, que
         para CSP es equivalente a inline (doble motivo de bloqueo).
         Regla práctica: si un `<script>` de acá ejecuta lógica real,
         va con `src` en `js/`, no inline. Ver sección 8 para el
         detalle de la CSP.
     I6. `lang="es-AR"` en `<html>` es el idioma real de TODO el
         contenido estático de este archivo. Si en el futuro se agrega
         contenido en otro idioma (una guía en inglés, por ejemplo),
         ese fragmento necesita su propio `lang="en"` — no cambiar el
         `lang` del documento entero.

     ───────────────────────────────────────────────────────────────
     5. ORDEN DE CARGA DE <script defer> — POR QUÉ ES UNA DEPENDENCIA
        DURA Y NO UNA CONVENCIÓN
     ───────────────────────────────────────────────────────────────
     `defer` garantiza dos cosas: (a) la descarga es paralela — el
     orden en el HTML no afecta cuándo termina de bajar cada archivo,
     y (b) la EJECUCIÓN respeta el orden del documento, siempre
     después de parsear el HTML y siempre antes de `DOMContentLoaded`.
     Este documento se apoya en (b) para resolver dependencias entre
     módulos sin usar un bundler ni imports de ES modules — es una
     decisión consciente de simplicidad (sin build step), pero exige
     que el orden de abajo se respete al pie de la letra:

       1. motor-config.js     — no depende de nada. Define URU_CONFIG.
       2. rubros-meta.js      — no depende de nada. Define
                                 URU_RUBROS_META (íconos, colores,
                                 nombres por rubro).
       3. locales-slug.js     — no depende de nada. Define
                                 URU_LOCALES_SLUGS (mapa id→slug para
                                 armar URLs de ficha).
       4. motor-plano.js      — usa URU_CONFIG. Define URU_PLANO
                                 (estado de sesión persistido).
       5. motor-exposicion.js — usa URU_CONFIG y URU_PLANO. Define
                                 URU_EXPOSICION.
       6. motor-mapa.js       — usa URU_CONFIG. Define URU_MAPA
                                 (qué puntos le corresponden al mapa).
       7. proyeccion.js       — no depende de nada. Define
                                 URU_PROYECCION (matemática lat/lng↔px
                                 y tiles). DEBE ir antes que #8: ver
                                 motor-render.js línea ~103-120, que
                                 falla temprano y explícito
                                 (`console.error` + `crear()` lanza
                                 excepción) si URU_PROYECCION no
                                 existe todavía — un diseño defensivo
                                 correcto que solo funciona si el
                                 orden acá es el correcto.
       8. motor-render.js     — usa URU_PROYECCION. Define
                                 URU_MOTOR_MAPA_RENDER (el motor de
                                 canvas del mapa).
       9. app.js              — usa TODOS los anteriores. Es el
                                 último a propósito: si algún módulo
                                 de arriba no cargó, app.js encuentra
                                 `window.URU_X` como `undefined` y
                                 sus propios chequeos (`if (!PROY)...`,
                                 `if (!window.URU_MOTOR_MAPA_RENDER)
                                 return;`) evitan que el resto de la
                                 página se rompa — se degrada, no
                                 explota.

     Si agregás un módulo nuevo: identificá de qué `window.URU_*`
     depende, ubicalo después de esas dependencias y antes de
     app.js, y agregá una línea a esta lista en el mismo commit.

     ───────────────────────────────────────────────────────────────
     6. ACCESIBILIDAD — decisiones y su justificación
     ───────────────────────────────────────────────────────────────
     · El `<canvas>` del mapa es `aria-hidden` a nivel de
       implementación en motor-render.js (no en este HTML) porque el
       mapa siempre tiene una lista paralela de tarjetas con la misma
       información — el canvas es una redundancia visual, no la única
       fuente de la información. Por eso `#mapaHerramienta` acá se
       declara con `role="application"`: ese rol es correcto para el
       contenedor que EN LA PRÁCTICA aloja gestos custom (arrastrar,
       zoom con rueda, click en marcador), aunque el propio motor
       luego marque el `<canvas>` interno como no navegable por
       teclado/lector — la combinación es intencional, no
       contradictoria: "esta región tiene su propia interacción" +
       "pero no obligues a un lector de pantalla a entrar en ella".
     · `role="search"` en el buscador y `role="status"` +
       `aria-live="polite"` en las estadísticas rápidas y en
       `#estadoResultados` siguen el patrón WCAG de landmarks +
       regiones vivas: un lector de pantalla puede saltar directo al
       buscador, y se entera de cambios de resultados sin que el
       foco se mueva solo.
     · El skip-link (`.skip-link`) es el primer elemento
       enfocable del `<body>` — cualquier reordenamiento del `<body>`
       que lo mueva de esa posición rompe su propósito (dejar de ser
       lo primero que un usuario de teclado tabula).
     · Los emojis usados como ícono (🍽️, ☕, etc.) llevan
       `aria-hidden="true"` porque son decorativos — el texto visible
       junto a cada uno ya transmite el significado; sin ese atributo,
       un lector de pantalla leería en voz alta el nombre Unicode del
       emoji antes del texto real, duplicando la información.

     ───────────────────────────────────────────────────────────────
     7. RESILIENCIA — qué pasa cuando algo falla
     ───────────────────────────────────────────────────────────────
     Dos capas de defensa, en orden de exigencia creciente:
       (1) `<noscript>` — cubre el caso "JS deshabilitado", con un
           mensaje claro y un contacto por email.
       (2) El script de failsafe al final del `<body>` — cubre el
           caso "JS está habilitado pero algo se colgó" (falla de
           red, un módulo que tira una excepción antes de terminar
           de pintar, una API caída). Después de 12s sin que el
           placeholder de carga haya sido reemplazado, inyecta un
           aviso `role="alert"` con un botón de reintentar. El
           timeout se limpia en `unload` para no dejar timers vivos
           si el usuario navega antes de que se cumplan los 12s.
     Ninguna de las dos capas depende de que el resto del sistema
     funcione — están escritas para ser lo último que falla.

     ───────────────────────────────────────────────────────────────
     8. SEGURIDAD — CSP y por qué estos orígenes y no otros
     ───────────────────────────────────────────────────────────────
     `script-src 'self'` — todo el JS de negocio es propio y se sirve
       desde el mismo origen (`js/*.js`); no hay CDN de terceros para
       lógica. Esto bloquea inyección de script externo aunque haya
       un XSS en algún dato renderizado con `innerHTML` en app.js.
     `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` —
       `'unsafe-inline'` es necesario porque el motor de mapa fija
       colores por rubro con `style="background:..."` inline (ver
       `pintarLeyenda()` en app.js) — migrar eso a clases CSS
       generadas dinámicamente sacaría esta excepción, pero no es
       gratis (habría que generar una clase por color de rubro). Se
       documenta como deuda aceptada, no como descuido.
     `img-src 'self' data: https:;` — deliberadamente amplio en
       `https:` porque los tiles del mapa (CARTO) y las imágenes de
       lugares pueden servirse desde distintos subdominios/CDNs con
       el tiempo; `data:` cubre placeholders inline si el motor de
       render los usara. Es el trade-off correcto para un sitio que
       consume tiles de mapa de un proveedor externo sin
       autenticación por origen.
     `connect-src 'self' https:;` — los tiles se cargan como
       `<img src=...>`, no por `fetch`, así que en rigor `connect-src`
       no los gobierna (los gobierna `img-src`, ya cubierto); se deja
       `https:` amplio acá para no bloquear los `fetch()` a
       `lugares-core.json` / `lugares-detalles.json` si algún día se
       sirven desde un dominio distinto (hoy son relativos a
       `'self'`, que ya está permitido).

     ───────────────────────────────────────────────────────────────
     9. PUNTOS DE EXTENSIÓN
     ───────────────────────────────────────────────────────────────
     · `#faqLista` ya existe como contenedor con un `<template
       id="template-faq-item">` listo para clonar. Hoy las 5 FAQ están
       escritas a mano como contenido crítico/estático (para que
       existan incluso si JS no corre — buscadores y `<noscript>` las
       ven igual). Si el número de preguntas crece, el patrón correcto
       es: agregar las nuevas al array `mainEntity` del JSON-LD +
       clonar `template-faq-item` desde JS, no seguir copiando bloques
       `<article class="faq-item">` a mano indefinidamente.
     · `data-map-provider` en `#mapaContainer` queda como hook
       reservado: hoy nada lo lee, pero si en el futuro se soporta más
       de un proveedor de tiles (por ejemplo, para tener un fallback
       si CARTO cae), este atributo es el lugar natural para que
       `motor-render.js` decida qué URL de tiles usar sin tener que
       tocar este HTML de nuevo.
     · `<template id="template-rubros">` en `#listaRubros` está
       reservado para cuando `pintarIndiceRubros()` necesite un layout
       más complejo por ítem que un simple `innerHTML +=`; hoy la
       función arma el HTML directamente en JS por simplicidad.

     ───────────────────────────────────────────────────────────────
     10. DEUDA TÉCNICA CONOCIDA (actualizado en la 2ª auditoría)
     ───────────────────────────────────────────────────────────────
     · No existe ningún test (ni manual con checklist, ni automatizado)
       que verifique que la tabla de la sección 3 sigue siendo cierta.
       Hoy la única defensa es la revisión humana. Un test e2e mínimo
       (Playwright/Puppeteer) que cargue la página y assert-ee
       `document.getElementById(x) !== null` para cada fila de la
       tabla sería barato y hubiera atrapado los bugs A-D antes de
       producción. SIGUE PENDIENTE — fuera del alcance de este archivo.
     · RESUELTO (2ª auditoría): la regla duplicada
       `#mapaHerramienta[hidden]{ display:none; }` que esta misma
       sección reportaba en `css/mapa.css` Y `css/descubrimiento.css`
       ya NO existe en `css/descubrimiento.css` al momento de esta
       revisión — solo vive en `css/mapa.css:22`. No se tocó nada para
       "resolverlo": el duplicado ya no estaba. Se deja esta nota para
       que quede registro de que el hallazgo original estaba
       desactualizado, no para reabrir un problema inexistente.
     · RESUELTO (2ª auditoría): `#contadorCuraduria` y los nuevos
       patches de esta revisión (`.indice-pagina__grupo-titulo`,
       `.rubros-detalle__resumen`) ya NO usan `<style>` embebido en
       este documento — se migraron a `css/boton.css` (bloque "BADGE Y
       PATCHES MIGRADOS DESDE index.html"), con los tokens reales del
       proyecto (`--anillo-foco`, `--color-tinta-60`, `--radio-full`,
       `--glass-borde`) en vez de los fallbacks genéricos que tenía el
       parche original.
     · NUEVO (2ª auditoría): `#rubros-guia` (ficha editorial por
       rubro) y `#radiografia` (composición del padrón) viven ahora
       dentro de un `<details class="rubros-detalle">` colapsado por
       defecto, ubicado después de la grilla dinámica `#rubros`. Sus
       `id` no cambiaron, su contenido no cambió, siguen siendo
       estáticos y visibles con `<noscript>` (un `<details>` cerrado
       igual expone su contenido en el DOM/HTML servido, solo lo
       oculta visualmente hasta que se abre — buscadores y lectores de
       pantalla lo siguen viendo). Si en el futuro se decide que
       deben volver a estar siempre expandidos, alcanza con agregar
       el atributo `open` al `<details>` — no hace falta deshacer la
       estructura.
     · NUEVO (2ª auditoría): la tarjeta "tus rechazos pesan poco" del
       Manifiesto se retiró por ser un duplicado casi literal de la
       tarjeta ⑥ de Metodología. El hecho no se perdió — se cuenta una
       sola vez, en la sección que lo explica con más detalle.

     ───────────────────────────────────────────────────────────────
     11. CHECKLIST PARA QUIEN MODIFIQUE ESTE ARCHIVO
     ───────────────────────────────────────────────────────────────
     [ ] ¿Agregaste o renombraste un `id`? → actualizá la tabla de la
         sección 3 Y el array `DOM` en js/app.js, en el mismo commit.
     [ ] ¿Agregaste un `<script defer>` nuevo? → ubicalo respetando
         sus dependencias reales (sección 5) y documentá la
         dependencia acá.
     [ ] ¿Modificaste algo dentro de un `<template>`? → confirmá en
         app.js/motor-render.js que el consumidor sigue esperando esa
         misma estructura interna.
     [ ] ¿Tocaste el `<head>`? → correlo por un validador de HTML y
         confirmá que la CSP sigue permitiendo todo lo que este
         documento carga (fonts, tiles, JSON de datos).
     [ ] ¿El cambio afecta contenido visible? → revisá que el
         `<noscript>` y el JSON-LD (FAQPage, Organization) sigan
         siendo coherentes con lo que un usuario ve.

     ───────────────────────────────────────────────────────────────
     12. EXPANSIÓN DE CONTENIDO EDITORIAL (esta revisión)
     ───────────────────────────────────────────────────────────────
     Contexto: una auditoría previa (documentada en las secciones 1-11
     de este mismo archivo) corrigió contratos rotos (bugs A-E) y
     dejó la arquitectura sólida. Esta revisión NO toca esa
     arquitectura ni el motor — agrega contenido editorial 100%
     estático, sin nuevos hooks que `js/app.js` necesite leer, para
     que el `index` deje de sentirse como una landing corta y pase a
     ser una guía completa de la ciudad y del producto.

     Secciones nuevas, en orden de aparición en el documento:
       · `#sobre-la-ciudad`  — contexto histórico/geográfico real de
         Concepción del Uruguay (fundación 1783, Urquiza, Ramírez,
         río, termas, patrimonio). Hechos verificados contra fuentes
         públicas; se evitaron a propósito cifras con fuentes
         contradictorias entre sí (p. ej. distancias exactas a sitios
         cercanos).
       · `#metodologia`      — profundiza "el orden no se compra" con
         el CÓMO real (Guía → Exploración → Acción Directa), en
         lenguaje llano, sin exponer nombres de variables internas.
       · `#rubros-guia`      — contenido de lectura por rubro,
         complementario (no sustituto) de la sección dinámica
         `#rubros` que puebla `pintarIndiceRubros()`.
       · `#guia-practica`    — información orientativa para visitantes,
         deliberadamente sin cifras que se desactualizan solas
         (horarios exactos, precios, tarifas).
       · `#glosario`         — vocabulario propio del producto (Guía,
         Exploración, Acción Directa, Curaduría, Destacados,
         Verificado, Rubro), alineado 1:1 con los nombres que ya usa
         el código.
       · FAQ ampliado de 5 a 10 preguntas (`faq-panel-6` a
         `faq-panel-10`), con el JSON-LD `FAQPage` actualizado en el
         mismo commit — mismo patrón exacto que los 5 originales.
       · `#hoja-de-ruta`     — transparencia sobre qué existe hoy y
         qué no todavía (fotos propias, horarios en tiempo real, test
         e2e del contrato §3), sin comprometer fechas.
       · `#accesibilidad`    — hace visible en la página lo que antes
         solo vivía en comentarios de código; cada ítem listado
         corresponde a un mecanismo real ya implementado (no es
         aspiracional).
       · `.indice-pagina`    — nav de anclas después del hero: con 12
         secciones en vez de 6, sin un mapa de contenido explícito el
         glosario y la hoja de ruta quedarían invisibles a varios
         scrolls de profundidad.

     Invariante que esta revisión agrega (I7): ninguna sección nueva
     de las listadas arriba tiene ni necesita un `id` en la tabla de
     contrato de la sección 3 — son estáticas por diseño. Si en el
     futuro alguna de ellas necesita volverse dinámica (por ejemplo,
     "Hoja de ruta" alimentada desde un JSON real), agregar su `id` a
     esa tabla en el mismo commit que la conecte, igual que exige el
     resto del documento.

     CSS: todo el contenido nuevo se apoya en componentes que ya
     existían (`.manifiesto-card` de `descubrimiento.css`) en vez de
     clonarlos — la única hoja nueva, `css/contenido-editorial.css`,
     define exclusivamente lo que no tenía equivalente (índice de
     anclas, ficha de rubro, lista de glosario, estado de hoja de
     ruta, checklist de accesibilidad). Ver el encabezado de ese
     archivo para el detalle.

     ───────────────────────────────────────────────────────────────
     13. AUDITORÍA 3ª PASADA — alcance deliberadamente acotado a
         index.html, sin tocar css/ ni js/
     ───────────────────────────────────────────────────────────────
     Esta pasada revisó arquitectura, flujo de datos, dependencias,
     CSS, JS y el contrato de la sección 3 completo antes de tocar
     una sola línea. Con el alcance limitado a este archivo (por
     pedido explícito), los cambios reales y seguros que quedaban
     disponibles sin CSS nuevo fueron estos cuatro, cada uno con
     causa verificada, no cosmética:

     · `<meta name="color-scheme">` pasó de `"dark light"` a `"dark"`.
       Verificado por grep: ningún archivo de `css/` define un tema
       claro real (no existe un solo `@media (prefers-color-scheme:
       light)` en el proyecto). Declarar soporte de tema claro que no
       existe hace que un navegador en modo claro pinte sus controles
       nativos (inputs, selects, scrollbar) en claro sobre un fondo
       de página que sigue siendo `--color-fondo` oscuro — un defecto
       visual real, no hipotético. Cambio de una palabra, cero riesgo.
     · `.indice-pagina` y `#region-descubrimiento` ganaron la clase
       `u-reveal`, la misma que ya usan el resto de las secciones del
       documento (`destacados`, `sobre-la-ciudad`, `manifiesto`,
       `metodologia`, `rubros`, `rubros-guia`, `radiografia`,
       `accesos`, `guia-practica`, `glosario`, `faq`, `hoja-de-ruta`,
       `accesibilidad`). Eran las únicas dos secciones del `<main>`
       sin el tratamiento de entrada que ya tiene todo lo demás — una
       inconsistencia real de tratamiento visual, corregida con una
       clase que ya existe en `tokens.css` (I5 no se toca: sigue sin
       haber `<style>` embebido nuevo).
     · El footer sumó un cuarto link, "Volver arriba ↑", con el mismo
       patrón `.footer__meta` de separador " • " que ya usan los tres
       links existentes. Con 12 secciones editoriales el documento es
       un scroll largo; no había forma de volver al inicio sin usar
       el scroll nativo del navegador. Apunta a `#siteHeader`, un id
       que ya existe en este mismo documento — no se agregó ningún id
       nuevo.

     Lo que esta pasada NO hizo, a propósito: no se tocó ningún `id`
     de la tabla de la sección 3, ningún `<script defer>`, ningún
     `<template>`, ningún texto de FAQ/JSON-LD, ninguna clase que
     dependiera de una regla CSS inexistente, y no se introdujeron
     encabezados (`<h3>`, etc.) nuevos dentro de `.manifiesto-card`:
     se verificó que esa clase solo define tipografía para `<p>` y
     `<a>` en `descubrimiento.css`, así que un `<h3>` ahí adentro
     habría heredado el tamaño y peso por defecto del user-agent en
     vez de un estilo propio — una regresión visual silenciosa
     exactamente del tipo que este archivo pide evitar.

     Si se quiere la reingeniería visual más profunda que se pidió
     originalmente (mejor composición, microdetalles, transiciones e
     identidad visual nuevas), la mayoría de ese trabajo vive
     estructuralmente en `css/*.css`, no en este HTML — ese es el
     alcance natural para continuar, no una limitación de este
     archivo en particular.

     ───────────────────────────────────────────────────────────────
     14. AUDITORÍA 4ª PASADA — dos hojas de estilo referenciadas que
         nunca existieron, más expansión de contenido y tema claro
     ───────────────────────────────────────────────────────────────
     Punto de partida de esta pasada: ANTES de tocar una sola línea
     de contenido, se verificó con grep cada clase que usa este
     documento contra las hojas reales del repositorio. Resultado:
     `<link rel="stylesheet" href="css/destacados.css">` (línea del
     `<head>`, comentado como "Fase 4") y
     `<link rel="preload" href="css/contenido-editorial.css">` +
     su inyección por `<script>` más abajo apuntaban a DOS archivos
     que jamás se crearon. No es un matiz de estilo: son ocho
     secciones completas del documento — Destacados, Sobre la ciudad,
     Cómo funciona, Cómo pensamos el orden, Guía de rubros,
     Radiografía del padrón, Guía práctica, Glosario, Hoja de ruta y
     Accesibilidad — que se venían sirviendo con el estilo por
     defecto del navegador (letra corrida, sin grilla, sin tarjeta,
     sin barra de progreso, sin color de rubro) desde que se agregó
     ese contenido en la 2ª/3ª pasada. Cualquier revisión visual
     previa que haya evaluado "cómo se ve la página" evaluó, sin
     saberlo, una versión con dos hojas de estilo faltantes.

     Cambios de esta pasada, en orden de impacto:

     · **Bug real, no cosmético**: `js/app.js` tiene dos funciones
       completas y ya cableadas al resto del flujo —
       `pintarSugerenciasRapidas()` (atajos de un toque a los 4
       rubros con más lugares + "cerca tuyo") y
       `pintarFiltrosActivos()` (píldoras de qué filtro está aplicado
       ahora, cada una con su × para sacarse esa faceta puntual) —
       que dependen de `DOM.sugerenciasRapidas` y `DOM.filtrosActivos`
       (ver `OPTIONAL_DOM_IDS`, línea ~176 de `js/app.js`). NINGUNO
       de los dos `id` existía en este documento. Al estar en la
       lista de IDs "opcionales", cada función hace
       `if (!DOM.x) return;` y no falla — simplemente no hace nada,
       en cada `render()`, desde que se escribió ese código. Se
       agregan ambos contenedores dentro de `.buscador` (el único
       lugar con sentido semántico: sugerencias y filtros son parte
       del flujo de búsqueda) y su CSS completo en `css/chip.css`
       (antes ausente por la misma razón — una clase que nunca se
       pinta no genera urgencia de estilo hasta que el bug que la
       bloquea se corrige). Este es, de las dos rondas de auditoría
       que agregaron contenido a este archivo, el primer hallazgo que
       reactiva una FUNCIONALIDAD real en vez de agregar solo texto o
       estilo — ver la tabla de la sección 3 para el detalle exacto
       de qué controla cada `id`.
     · Dos hojas de estilo enteras que `index.html` ya referenciaba
       nunca existieron en el repositorio: `css/destacados.css`
       (`<link>` desde la auditoría "Fase 4") y
       `css/contenido-editorial.css` (precargada e inyectada por el
       `<script>` inline, documentada como la hoja que "gobierna
       'Sobre la ciudad' en adelante"). No es un matiz de estilo: son
       ocho secciones completas del documento — Destacados, Sobre la
       ciudad, Cómo funciona, Cómo pensamos el orden, Guía de rubros,
       Radiografía del padrón, Guía práctica, Glosario, Hoja de ruta
       y Accesibilidad — que se venían sirviendo con el estilo por
       defecto del navegador (letra corrida, sin grilla, sin tarjeta,
       sin barra de progreso, sin color de rubro) desde que se agregó
       ese contenido en la 2ª/3ª pasada. Cualquier revisión visual
       previa que haya evaluado "cómo se ve la página" evaluó, sin
       saberlo, una versión con dos hojas de estilo faltantes. Se
       agregan `css/destacados.css` (estilo completo de `#destacados`
       y `.destacado-card`: tira horizontal con scroll-snap, filete de
       color por rubro vía `--rubro-color` inline) y
       `css/contenido-editorial.css` (estilo de las ocho secciones de
       arriba, más las tres secciones nuevas de esta misma pasada —
       reutiliza `.manifiesto-card` tal como ya documentaba este
       archivo, no la redefine).
     · `css/impresion.css` (NUEVO) — el documento no tenía ninguna
       hoja `media="print"`; con contenido de referencia real (Sobre
       la ciudad, Guía práctica, Glosario) tiene sentido que alguien
       quiera imprimirlo o guardarlo como PDF. Oculta lo que no
       aplica en papel (mapa, buscador, chips, botones interactivos),
       fuerza las respuestas de FAQ y el detalle de rubros a verse
       (dependen de `hidden`/`<details>` sin `open`, invisibles al
       imprimir sin esta hoja) y pasa a paleta blanco/negro.
     · `css/tokens.css` — tema claro real vía
       `@media (prefers-color-scheme: light)`, redefiniendo
       exactamente los mismos tokens de superficie/tinta/vidrio que ya
       consume cada componente del sitio (ningún componente necesitó
       una línea nueva para heredarlo). Cierra la brecha que la
       auditoría 3ª pasada dejó documentada a propósito: en ese
       momento era cierto que `color-scheme` debía decir solo `"dark"`
       porque no existía tema claro; ahora que existe, `<meta
       name="color-scheme">` pasa a `"dark light"` y `theme-color` se
       divide en una entrada por esquema con `media=`.
     · Contenido nuevo, 100% estático, mismo criterio sin-id que el
       resto de la expansión editorial (invariante I7): `#testimonios`
       ("Cómo lo usa la gente", tres perfiles ilustrativos sin
       apellido ni foto — a propósito, para no simular una reseña
       verificada que no es tal), `#para-locales` ("Para dueños de
       locales", la pregunta "¿cómo aparezco?" llevada de una
       respuesta de FAQ a una sección propia con CTA de contacto) y
       `#privacidad-datos` ("Privacidad y tus datos", el detalle
       completo detrás de la respuesta corta de FAQ, en dos listas
       simétricas de qué se hace y qué no).
     · FAQ ampliado de 10 a 14 preguntas (`faq-panel-11` a
       `faq-panel-14`), JSON-LD `FAQPage` actualizado en el mismo
       commit, mismo patrón exacto que las ampliaciones anteriores.
     · `.indice-pagina` ganó las tres anclas nuevas en el grupo
       "Conocé el proyecto" — mismas dos columnas de siempre, sin
       agregar un tercer grupo que hubiera roto el layout de dos
       columnas ya establecido.

     Invariantes verificadas sin cambios: ningún `id` de la tabla de
     contrato de la sección 3 se tocó, ningún `<script defer>` cambió
     de orden, ningún `<template>` cambió su estructura interna, y el
     texto de FAQ que ya existía (paneles 1-10) permanece carácter por
     carácter igual — solo se agregó al final. Los `--color-rubro-*`
     de tokens.css no se redefinieron para tema claro: se verificaron
     contra el nuevo `--color-fondo` claro antes de decidir que ya
     pasan contraste sin ajuste (ver el comentario en tokens.css para
     el caso límite documentado).

     Lo que esta pasada NO hizo, a propósito: no se implementó un
     toggle manual de tema (el tema claro sigue siendo 100%
     `prefers-color-scheme`, sin botón ni `localStorage` nuevo) para
     no introducir un `id` ni un contrato JS nuevo sin que estuviera
     pedido; si en el futuro se quiere ese control manual, es la
     extensión natural de este trabajo, no algo que faltó por
     descuido.
     ═══════════════════════════════════════════════════════════════════════ -->

     <!-- ═══════════════════════════════════════════════════════════════════════
     15. AUDITORÍA 5ª PASADA — WP0, limpieza previa al Ambient Engine (24/07/2026)
     ═══════════════════════════════════════════════════════════════════════

     Contexto: previo a implementar el Ambient Engine (sistema de 7
     documentos oficiales, Fases 1-7 + Playbook de Ingeniería Fase 6),
     el propio Playbook exige resolver primero la deuda técnica ya
     identificada por la Auditoría de Repositorio (Fase 7), como Work
     Package 0, bloqueante e independiente de cualquier código nuevo.
     Detalle completo, con verificación línea por línea, en
     docs/integration-notes.md.

     Cambios en ESTE archivo:
     · `#mapaHerramienta` — `role="application"` → `role="region"`,
       alineando el valor estático con el que `motor-render.js` ya
       fija en tiempo de ejecución (línea 402 de ese archivo). Cierra
       la discrepancia que la Auditoría §7.3/§8 ya había señalado
       como de baja prioridad: usuarios sin JavaScript o crawlers de
       accesibilidad ahora ven el mismo role que ve un usuario con JS.

     Cambios en OTROS archivos (ver docs/integration-notes.md para el
     detalle y la verificación de cada uno):
     · `css/code.css` — ELIMINADO (huérfano, cero referencias, dupli-
       caba `.btn` de `css/boton.css`).
     · `tests/motor-test.js` — ELIMINADO (suite duplicada del mismo
       nombre que `js/motor-test.js`, desactualizada contra una API de
       `motor-mapa.js` ya removida — `js/motor-test.js` siempre fue,
       y sigue siendo, la única suite real: 199/199).
     · `js/motor-test.js` — corrección de un comentario obsoleto
       (ninguna aserción ni lógica de test cambió; se re-verificó
       199/199 después del cambio).
     · `tests/contraste-tokens.js` — NUEVO. Auditoría de contraste
       WCAG 2.1 sin dependencias (no hay build step para traer
       axe-core/Lighthouse). Encontró que el tema claro que esta
       misma documentación afirma en la sección 14 de arriba
       ("`@media (prefers-color-scheme: light)` en tokens.css") NO
       EXISTE en el archivo real — hallazgo nuevo, no detectado por
       la Auditoría de Repositorio Fase 7. También encontró que los
       badges de estado (Abierto: 4.34:1, Cerrado: 2.98:1) no
       alcanzan el mínimo WCAG AA de 4.5:1 contra su propia píldora
       real. Ninguno de los dos hallazgos se corrigió en esta pasada
       — ambos requieren una decisión de diseño de color, no una
       limpieza de código, y quedan documentados como excepción
       versionada pendiente en docs/integration-notes.md.

     Invariantes verificadas sin cambios: `node js/motor-test.js`
     sigue en 199/199, ningún `id` de la tabla de contrato de la
     sección 3 se tocó, ningún `<script defer>` cambió de orden ni de
     cantidad (WP0 no agrega ningún módulo nuevo — eso es WP2/F0, el
     siguiente Work Package, pendiente de la confirmación de alcance
     de WP1), y el contenido editorial visible no cambió en absoluto.

     16. AUDITORÍA 6ª PASADA — Fases 0-2 del roadmap de mejora (26/07/2026)

     Punto de partida: una auditoría de precisión externa (ver
     REPO_CONTEXT_MASTER.md / REPO_FILE_CATALOG.md /
     REPO_ARCHITECTURE_MAP.md) verificó línea por línea este
     repositorio y confirmó 6 hallazgos, dos de ellos con corrección
     de código real pendiente (los otros 4 eran solo de documentación
     y ya se corrigieron en esos tres archivos, sin tocar código).
     Esta pasada ejecuta las Fases 0, 1 y 2 del roadmap derivado de
     esa auditoría.

     FASE 0 — Red de seguridad (nuevo, sin dependencias externas):
     · `js/smoke-tests.js` — verifica que todo asset local referenciado
       en este HTML (`<script src="js/...">`, `<link href="css/...">`)
       exista físicamente en disco. Este test, de haber existido
       antes, habría atrapado automáticamente la referencia rota a
       `js/lazy-css-editorial.js` el día que se rompió.
     · `js/run-tests.js` — punto de entrada único que corre
       `motor-test.js` + `smoke-tests.js` + `contract-tests.js` en
       secuencia y agrega el resultado. CORRECCIÓN (26/07/2026, mismo
       día): el commit original de este archivo apuntaba a los nombres
       `smoke-test.js`/`contract-test.js` (singular), que no existen
       — el runner fallaba con `MODULE_NOT_FOUND` antes de ejecutar
       una sola suite. Se corrigió a los nombres reales
       (`smoke-tests.js`/`contract-tests.js`, plural) y se verificó
       `node js/run-tests.js` → exit code 0, 3/3 suites.

     FASE 1 — Limpieza de código muerto ya confirmado (sin ambigüedad,
     verificado con grep exhaustivo antes de borrar — ningún `<script
     src>`/`<link href>` real los referenciaba, solo comentarios
     históricos). NOTA DE PRECISIÓN: un commit anterior de este mismo
     archivo ("Update index.html", 26/07/2026) ya afirmaba que estos 5
     archivos estaban "ELIMINADOS", pero esa fue solo una actualización
     de documentación — los archivos seguían físicamente presentes en
     el repo. El borrado real (`git rm`) se ejecutó recién en esta
     pasada, después de repetir la búsqueda exhaustiva de referencias
     y confirmar cero consumidores funcionales:
     · ELIMINADOS: `js/ambiente-estilos.js`, `js/ambiente-particulas.js`,
       `js/ambiente-senales.js` — los 3 módulos del Ambient Engine que
       existían en el repo pero nunca se cargaban (su retiro ya estaba
       documentado dentro de los propios archivos y en comentarios de
       `ambiente-orquestador.js`/`ambiente-config.js`/etc.). El Ambient
       Engine pasa de 30 archivos (27 activos) a **27 archivos, los 27
       activos** — ya no quedan huérfanos físicos en el repo.
     · ELIMINADOS: `css/code.css` (huérfano, ya documentado como
       "eliminado" en la sección 15 de arriba desde la 5ª auditoría,
       pero seguía presente físicamente — ahora sí se eliminó de
       verdad) y `css/lazy-editorial.css` (huérfano, cero referencias).
     · CORREGIDO en ESTE archivo: se quitó la línea
       `<script src="js/lazy-css-editorial.js" defer></script>`
       (línea ~229 antes de este cambio) — el archivo nunca existió en
       el repositorio, así que esa etiqueta resolvía en un 404 en cada
       carga de página. Decisión tomada: eliminar la referencia rota
       en vez de crear un archivo nuevo cuyo contenido/intención
       original no se pudo determinar con certeza — no se encontró
       ningún otro módulo que dependiera de que ese script expusiera
       algo. Si en el futuro se decide que el mecanismo de carga
       perezosa de CSS editorial sigue siendo necesario, debe
       diseñarse como una pieza nueva, no reconstruirse a ciegas.

     FASE 2 — Test de contrato DOM↔JS (nuevo, sin navegador disponible
     en este entorno — ver limitación explícita dentro del propio
     archivo):
     · `js/contract-tests.js` — lee `REQUIRED_DOM_IDS`/`OPTIONAL_DOM_IDS`
       directamente de `js/app.js` (no los duplica a mano) y verifica
       que cada id requerido exista en este HTML, que no haya ids
       duplicados, y que el orden real de `<script defer>` respete las
       dependencias documentadas en la sección 5 de arriba (motor-config
       antes de motor-plano/motor-exposicion/motor-mapa, proyeccion
       antes de motor-render, app.js al final, ambiente-orquestador
       antes de app.js y después de los demás ambiente-*.js).

     Invariantes verificadas sin cambios: `node js/motor-test.js` sigue
     en 202/202 (línea base ya corregida en la 6ª pasada de la
     auditoría de precisión externa, no en esta). Ningún `id` de la
     tabla de contrato de la sección 3 cambió. El orden relativo de los
     `<script defer>` de negocio y del Ambient Engine activo NO
     cambió — solo se acortó la lista total de `<script>` en 1 (la
     línea rota eliminada) y el Ambient Engine perdió 3 archivos que
     de todos modos nunca se cargaban. Tras el fix del typo en
     `run-tests.js` y el borrado real de los 5 archivos de Fase 1,
     `node js/run-tests.js` corre las tres suites y confirma exit code
     0: 202/202 (motor-test.js), 52/52 assets (smoke-tests.js), 0 ids
     duplicados y orden de carga correcto (contract-tests.js).
     ═══════════════════════════════════════════════════════════════════════

     17. FASE 3 — Calidad de datos: 306 lugares sin estado_verificacion
     (26/07/2026)

     Hallazgo previo a la decisión editorial: 306 de 1468 registros de
     `lugares-mapa.json` no tenían `estado_verificacion`. `split_dataset.py`
     ya filtraba correctamente esos casos al generar `lugares-estado.json`
     (build_estado devuelve null y se descarta) — pero eso tenía un efecto
     colateral no detectado hasta ahora: en `js/app.js`, cada lugar arranca
     con `estado: 'verificado'` por defecto (línea ~878) al cargar
     `lugares-core.json`, y solo se corrige a 'pendiente' si aparece en
     `lugares-estado.json`. Como esos 306 nunca aparecían ahí, se quedaban
     con el default para siempre — se mostraban como verificados sin
     ningún dato real que lo respalde.

     Verificación de los 306: 303 de 306 tienen `place_id` de Google y
     coordenadas válidas (no son basura ni duplicados: son lugares reales
     que nunca pasaron por una auditoría). Dispersos en 52 tramos no
     contiguos a lo largo de todo el rango de ids (URU-00197 a URU-01345),
     concentrados sobre todo en `compras` (98) y `oficios_tecnicos` (81)
     pero presentes en casi todos los grupos — deuda acumulada de varias
     tandas de carga, no un lote reciente único.

     CORREGIDO:
     · `js/app.js` — default de `estado` cambiado de `'verificado'` a
       `'pendiente'`. Un lugar sin dato de verificación ahora se muestra
       como pendiente hasta que `lugares-estado.json` confirme lo
       contrario, en vez de mostrarse como verificado por omisión.
     · `lugares-mapa.json` — los 306 registros sin `estado_verificacion`
       quedaron marcados explícitamente como `"Pendiente de verificación"`
       (decisión editorial: visibilidad honesta del estado real en vez de
       dejarlos en null).
     · `lugares-core.json` / `lugares-estado.json` regenerados con
       `python3 split_dataset.py` a partir del `lugares-mapa.json`
       actualizado. `lugares-estado.json` pasa de cubrir 1162 a cubrir los
       1468 registros completos.

     Invariantes verificadas sin cambios: `node js/run-tests.js` → exit 0,
     202/202 + 52/52 + contrato OK. `lugares-detalles.json` no cambió
     (no depende de `estado_verificacion`). El comportamiento de
     `motor-exposicion.js` no se tocó — su lectura de rechazos/afinidad es
     independiente de este campo.

     Pendiente real de negocio (no técnico, fuera de alcance de esta
     pasada): 306 lugares del catálogo necesitan una auditoría real
     (confirmar horario, actividad, teléfono) para pasar de "pendiente" a
     "verificado". Ese trabajo de campo/auditoría web queda abierto.
     ═══════════════════════════════════════════════════════════════════════

     18. FASE 4 — Accesibilidad: contraste del badge Abierto/Cerrado
     (26/07/2026)

     Deuda WCAG AA ya documentada: los colores semánticos de estado
     medían 4.34:1 (abierto) y 2.98:1 (cerrado) contra su propia píldora,
     por debajo del mínimo 4.5:1 para texto normal. Se aclararon
     manteniendo el mismo matiz (hue/saturación intactos, solo más
     luminosidad):
     · --color-estado-abierto: #40916C → #44996F (4.34:1 → 4.72:1)
     · --color-estado-cerrado: #C1121F → #F04552 (2.98:1 → 4.74:1)
     Cambio hecho en `css/tokens.css` (única fuente de verdad), con
     `--color-estado-*-fondo` y `--glow-abierto` recalculados en rgb para
     seguir siendo el mismo color en distinta opacidad. `css/badge-estado.css`
     tenía además un box-shadow con el rgb del rojo viejo hardcodeado
     (`rgba(193,18,31,.3)`, no vía var()) — corregido también.

     HALLAZGO fuera del alcance original del roadmap (que decía "Archivos:
     css/badge-estado.css únicamente"): el mismo patrón visual — píldora
     "Abierto ahora"/"Cerrado" con los mismos dos colores — estaba
     duplicado a mano en las 51 páginas estáticas de `locales/`, con los
     valores viejos, sin pasar por `tokens.css` ni por `badge-estado.css`
     en absoluto:
     · `locales/ficha.js` — variables `openColor`/`closedColor` con los
       hex viejos (única fuente real para 50 de las 51 páginas: el color
       final que ve el usuario lo pone este script en tiempo de carga,
       no el HTML).
     · Las 50 páginas de `locales/*/index.html` (todas menos
       `gimnasio-538`, que no tiene panel de horario) — el `<span
       id="schedStatusPill">` y el `<span id="schedDot">` traían el color
       "abierto" viejo hardcodeado inline, como estado inicial antes de
       que `ficha.js` lo pise.
     · `locales/ficha.css` — `--green-bright`/`--red-accent` con los
       mismos hex viejos, declaradas pero sin ningún `var()` que las
       lea en todo el repo (variables muertas, no se tocó su uso porque
       no tienen uso; se actualizó el valor para que si alguien las
       activa en el futuro no reintroduzca el bug). `.schedule-time-closed`
       (texto "Cerrado" en la fila del día, 21 páginas) también tenía el
       rojo viejo hardcodeado — corregido.
     · `--green-accent` (#2D6A4F, checks ✓ de amenities) NO se tocó:
       es un verde distinto, sin relación semántica con el badge
       abierto/cerrado, fuera de este bug.

     Fondo real verificado antes de aplicar el mismo valor: el panel de
     horario de las fichas (`.schedule-block`) usa `background:var(--ink)`
     = `#0d0d0d`, prácticamente idéntico al `--color-fondo` del índice
     (`#0A0D13`) — el mismo par de colores corregidos sirve para ambos
     contextos sin recalcular. Contraste verificado directamente:
     `schedule-time-closed` viejo 3.12:1 → nuevo 5.26:1 (texto plano,
     sin transparencia); píldora abierto/cerrado en fichas 4.72:1/4.73:1
     (coincide con el índice, transparencia de fondo igual).

     Invariantes verificadas sin cambios: `node js/run-tests.js` → exit 0,
     202/202 + 52/52 + contrato OK (ninguno de estos tests cubre CSS ni
     las páginas estáticas de locales/, así que la verificación de
     contraste fue manual, con el mismo método de cálculo WCAG 2.1 en
     los dos casos). Grep final sobre todo el repo (`.css`/`.html`/`.js`)
     confirma cero apariciones de los hex/rgb viejos fuera de los
     comentarios de esta misma documentación.
     ═══════════════════════════════════════════════════════════════════════ -->
```
