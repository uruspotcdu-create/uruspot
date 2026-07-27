# Fase 6 — Auditoría previa del Ambient Engine (`donde-comer-cdu`)

> **Estado**: solo lectura. No se modificó ni un archivo del repositorio.
> **Método**: clon real de `https://github.com/uruspotcdu-create/uruspot`
> (`git clone --depth 1`), lectura directa de los 27 archivos
> `js/ambiente-*.js`, `index.html`, y las hojas `css/ambiente-*.css` +
> `assets/ambient/_tokens/*.css`. Los tres documentos de contexto
> (`REPO_CONTEXT_MASTER.md`, `REPO_ARCHITECTURE_MAP.md`,
> `REPO_FILE_CATALOG.md`) se usaron como punto de partida, **no como
> fuente de verdad** — donde el código real contradice esos documentos,
> se señala explícitamente abajo (§0).
> **Tests ejecutados**: `node js/motor-test.js` → **212/212 OK**.
> `node js/contract-tests.js` → **OK, 0 avisos**. Ambos confirmados en
> esta pasada, coincide con lo que indicás en tu mensaje.

---

## 0. Corrección importante antes de todo: el Ambient Engine tiene HOY 27 archivos, no 30

Los tres documentos que me diste describen una auditoría anterior donde
existían **30 archivos** `ambiente-*.js` (27 cargados + 3 huérfanos:
`ambiente-estilos.js`, `ambiente-particulas.js`, `ambiente-senales.js`).

**Verificado contra el repositorio real clonado ahora**: esos 3 archivos
**ya no existen físicamente**. `index.html` (línea ~2495-2506) documenta
que se ejecutó un `git rm` real sobre ellos en un commit posterior a la
auditoría que generó tus tres documentos. El comentario del propio HTML
es explícito: un commit anterior ya *decía* "ELIMINADOS" sin haberlo
hecho de verdad; el borrado físico ocurrió después.

**Estado real, confirmado por `find` + conteo de `<script src="js/ambiente-...">`
+ lectura del propio comentario de auditoría en `index.html`:**

- **27 archivos `js/ambiente-*.js` en el repo. Los 27 están cargados. Cero huérfanos físicos.**
- También se confirmó eliminados: `css/code.css`, `css/lazy-editorial.css`, y corregida la referencia rota a `js/lazy-css-editorial.js` (ya no aparece en `index.html`).
- También apareció un archivo nuevo no mencionado en tus documentos: `js/contract-tests.js` — test de contrato DOM↔JS + orden de `<script>`, corrible con `node js/contract-tests.js`, **211+1 aviso... en realidad 0 avisos, OK** en esta pasada.

Esto no invalida el resto de tus documentos (siguen siendo una buena
narrativa de arquitectura), pero **cualquier número "30" o "3 retirados"
que aparezca ahí está desactualizado**. Todo lo que sigue abajo está
verificado contra el código de hoy, no contra esos documentos.

---

## 1. Mapa completo del Ambient Engine

### 1.1 Orden de carga real (confirmado por `grep` línea por línea de `index.html`)

```
motor-config.js … motor-render.js        (Grupo de negocio, no auditado en Fase 6)
────────────────────────────────────────────────────────────────────────
GRUPO INFRAESTRUCTURA
  ambiente-config.js        (constantes puras — escenas, niveles, umbrales)
  ambiente-assets.js        (Asset Registry, caché LRU de 2 niveles)
  ambiente-diagnostico.js   (telemetría interna, buffers acotados)
GRUPO GOBIERNO
  ambiente-accesibilidad.js (prefers-reduced-motion, señal de máxima prioridad)
  ambiente-rendimiento.js   (Performance Manager — inicia su propio loop RAF aquí mismo)
  ambiente-estados.js       (máquina de estados: Idle/Activo/Transición/Carga/Foco/Error)
  ambiente-profundidad.js   (cálculo puro de factores de profundidad)
  ambiente-gramatica.js     (catálogo puro de verbos de movimiento, sin DOM)
  ambiente-ritmo.js         (registros de ritmo/duración de transición)
MOTION / ESTADOS
  ambiente-respiracion.js   (ciclo de "respiración" — inicia su propio loop RAF aquí mismo)
  ambiente-movimiento.js    (Motion Controller — hub de parámetros, sin loop propio)
  ambiente-escenas.js       (Scene Manager)
  ambiente-luz.js           (Lighting — viñeta + resplandor, reactivo a eventos)
CONTEXTUAL / GESTOS
  ambiente-clima.js         (Weather — fetch a /weather, setInterval con pausa en background)
  ambiente-interaccion.js   (Interaction Observer — listeners globales de gesto/foco)
CONTENIDO VISUAL (7 familias + fondo)
  ambiente-planos.js        (crea contenedores fijos P0-P3, position:fixed)
  ambiente-reticula.js      (SVG estático, inserción única)
  ambiente-topografia.js    (SVG estático, inserción única)
  ambiente-corrientes.js    (SVG estático, inserción única)
  ambiente-coordenadas.js   (SVG estático, inserción única)
  ambiente-brujula.js       (SVG estático, inserción única — oscilación por CSS)
  ambiente-particulas-deriva.js (SVG + scroll listener passive + RAF throttle)
  ambiente-halos.js         (SVG estático, inserción única)
  ambiente-horario-tinte.js (setInterval 60s, pausa si pestaña oculta)
  ambiente-capa-fondo.js    (setInterval 60s, pausa si pestaña oculta)
  ambiente-flags.js         (feature flags fail-open, localStorage/querystring)
  ambiente-orquestador.js   (ÚNICO mount point — window.AmbientEngine)
────────────────────────────────────────────────────────────────────────
app.js
```

Esto **coincide con lo documentado**, con una diferencia real: el orden
exacto de la sub-sección "Motion/Estados" y "Contextual/Gestos" en el
HTML intercala `ambiente-clima.js`/`ambiente-interaccion.js` **antes**
de `ambiente-planos.js`, no después de todas las familias como sugiere
la lectura rápida de la documentación — no cambia ninguna dependencia
real (todo sigue siendo defensivo), pero si vas a reordenar cualquier
cosa en Fase 6, usá el listado de arriba, no el de los documentos
previos.

### 1.2 Ciclo de vida completo (reconstruido de la lectura real)

```
document parseado, scripts defer en orden de documento
  │
  ├─ (independiente de app.js) ambiente-orquestador.js:
  │    document.readyState === 'loading'
  │      ? addEventListener('DOMContentLoaded', iniciar)
  │      : iniciar()   ← nota: NO es app.js quien llama a esto.
  │
  │  iniciar():
  │    1. if (!AmbienteEstados) return            ← aborta si falta la FSM
  │    2. if (AmbienteFlags && !activo('motor')) return   ← flag maestro
  │    3. AmbienteAssets.precalentar()             ← llena caché de assets anticipados
  │    4. reflejarGobiernoEnDOM() + suscripciones a Accesibilidad/Rendimiento
  │    5. AmbienteMovimiento.iniciar()             ← Motion Controller arranca
  │         (se suscribe a Rendimiento/Accesibilidad, escucha visibilitychange UNA vez)
  │    6. AmbienteEscenas.activar(ESCENA_INICIAL)  ← primera escena, sin transición
  │    7. AmbienteEstados.on('cambio', reflejarEstadoEnDOM) + refleja estado actual
  │    8. AmbienteInteraccion.iniciar()            ← listeners de gesto/foco/inactividad
  │    9. AmbienteRespiracion.iniciar()            ← arranca su loop RAF (nunca se detiene)
  │   10. si flag 'sustratoVisual' activo:
  │         AmbientePlanos.iniciar()               ← crea 4 divs position:fixed
  │         Reticula/Topografia/Corrientes/Coordenadas/Brujula.iniciar() ← SVG estático x5
  │         ParticulasDeriva.iniciar()              ← SVG + scroll listener passive
  │         Halos.iniciar()                         ← SVG estático
  │         CapaFondo.iniciar()                     ← crea div, arranca setInterval 60s
  │         Luz.iniciar()                            ← crea 2 divs fixed, se suscribe a Movimiento
  │   11. si flag 'horarioTinte' activo: HorarioTinte.iniciar()  ← setInterval 60s
  │   12. si flag 'clima' activo: Clima.iniciar()   ← fetch inicial + setInterval 5min con pausa
  │
  └─ (independiente, en paralelo) app.js: inicializar()
       … (flujo de negocio, no llama a AmbientEngine.iniciar() directamente —
          la única interacción real es iniciarCarga()/finalizarCarga()/reintentar()
          cuando el fetch de lugares-core.json arranca/termina/falla)
```

**Corrección puntual sobre tus documentos**: el diagrama de flujo de
`REPO_ARCHITECTURE_MAP.md` (§1) dibuja `AmbientEngine.iniciar()` como
un paso dentro de la secuencia de `app.js: inicializar()`. Leyendo el
código real, **no es así**: `ambiente-orquestador.js` tiene su propio
listener de `DOMContentLoaded` y se auto-inicia, independientemente de
`app.js`. `app.js` solo llama a `iniciarCarga()`, `finalizarCarga()` y
`reintentar()` en tres puntos puntuales del ciclo de fetch. El
aislamiento real es incluso más fuerte de lo que describe el diagrama
— pero el orden temporal es el mismo (ambos listeners de
`DOMContentLoaded` corren, en la práctica, casi al mismo tiempo).

### 1.3 Ningún módulo llama a `AmbientEngine.iniciar()` dos veces

Verificado por `grep -rn "AmbientEngine.iniciar\|\.iniciar()" ` en todo
el árbol: la única invocación de `ambiente-orquestador.js: iniciar()`
es la del propio listener de `DOMContentLoaded`/chequeo de
`readyState`. **No hay una segunda inicialización activa hoy.**

Dicho esto — **riesgo latente, no bug activo** (ver §14): ni
`ambiente-orquestador.js: iniciar()` ni `ambiente-interaccion.js:
iniciar()` tienen una bandera explícita de "ya inicializado" (tipo
`if (yaIniciado) return`). Si alguna vez algo externo llamara a
`window.AmbientEngine.iniciar()` una segunda vez (por ejemplo, un
futuro código de test, un futuro botón de "reiniciar ambientación", o
un error de copy-paste), el resultado sería:
- Reingreso benigno en la mayoría de los sub-módulos (usan sus propios
  guards `if (insertado) return` / `if (elFondo) return` / `if (rafId
  !== null) return`).
- **Excepción real**: `ambiente-interaccion.js` registra los listeners
  de `focus`/`blur` con una función **anónima inline**, no con una
  referencia con nombre — si `iniciar()` corriera dos veces, esos dos
  listeners **sí se duplicarían** (los de `click`/`touchstart` no,
  porque usan la función con nombre `registrarGesto`, y
  `addEventListener` deduplica automáticamente listener+capture
  idénticos).
- Consecuencia de esa duplicación: cada `focus`/`blur` en la página
  emitiría el evento dos veces a los suscriptores de
  `AmbienteInteraccion`. No es catastrófico (los handlers son baratos
  y no dependen de recibir el evento una sola vez), pero es trabajo
  redundante real si algún día ocurre.

---

## 2. Inventario de módulos (27, todos activos)

| # | Módulo | Líneas | Grupo | Patrón de ejecución |
|---|---|---:|---|---|
| 1 | `ambiente-config.js` | 503 | Infraestructura | Constantes puras, sin DOM |
| 2 | `ambiente-assets.js` | ~230 | Infraestructura | Caché LRU (2 niveles), sin loop |
| 3 | `ambiente-diagnostico.js` | 141 | Infraestructura | Buffers circulares acotados, sin loop |
| 4 | `ambiente-accesibilidad.js` | 126 | Gobierno | `matchMedia` + listener `change`, sin loop |
| 5 | `ambiente-rendimiento.js` | 247 | Gobierno | **Loop RAF propio** (muestreo FPS) |
| 6 | `ambiente-estados.js` | 169 | Gobierno/Estados | FSM event-driven, 2 `setTimeout` acotados |
| 7 | `ambiente-profundidad.js` | ~110 | Gobierno | Cálculo puro, sin DOM (no leído línea a línea) |
| 8 | `ambiente-gramatica.js` | ~220 | Motion | Catálogo puro de verbos, sin DOM (no leído línea a línea) |
| 9 | `ambiente-ritmo.js` | ~280 | Motion | Cálculo puro de registros/duración (no leído línea a línea) |
| 10 | `ambiente-respiracion.js` | 197 | Motion | **Loop RAF propio, nunca se detiene** (sin `detener()`) |
| 11 | `ambiente-movimiento.js` | 330 | Motion | Hub de parámetros, 100% event-driven, sin loop propio |
| 12 | `ambiente-escenas.js` | ~135 | Orquestación | Scene Manager (no leído línea a línea) |
| 13 | `ambiente-luz.js` | 189 | Contenido Visual | Event-driven, crea 2 divs `position:fixed` |
| 14 | `ambiente-clima.js` | 312 | Contextual | `fetch` + `setInterval` **con pausa correcta en background** |
| 15 | `ambiente-interaccion.js` | 117 | Gobierno | Listeners globales de `document` (capture) + `setTimeout` |
| 16 | `ambiente-planos.js` | 96 | Contenido Visual | Crea 4 divs `position:fixed`, sin loop |
| 17 | `ambiente-reticula.js` | ~55 | Contenido Visual | SVG estático, inserción única |
| 18 | `ambiente-topografia.js` | ~51 | Contenido Visual | SVG estático, inserción única |
| 19 | `ambiente-corrientes.js` | ~54 | Contenido Visual | SVG estático, inserción única |
| 20 | `ambiente-coordenadas.js` | 114 | Contenido Visual | SVG estático, inserción única |
| 21 | `ambiente-brujula.js` | 58 | Contenido Visual | SVG estático, inserción única (oscilación vía CSS `@keyframes`) |
| 22 | `ambiente-particulas-deriva.js` | 129 | Contenido Visual | SVG + `scroll` passive + RAF throttle, respeta `reduced-motion` |
| 23 | `ambiente-halos.js` | ~98 | Contenido Visual | SVG estático (no leído línea a línea) |
| 24 | `ambiente-horario-tinte.js` | 112 | Contextual | `setInterval` 60s, pausa si pestaña oculta |
| 25 | `ambiente-capa-fondo.js` | 159 | Contenido Visual | `setInterval` 60s, pausa si pestaña oculta |
| 26 | `ambiente-flags.js` | 103 | Infraestructura | Cálculo puro (`localStorage`/querystring), cacheado una vez |
| 27 | `ambiente-orquestador.js` | 253 | Orquestación | Único mount point, un solo listener `DOMContentLoaded` |

**Nota de honestidad de alcance**: los 27 archivos fueron localizados,
contados, y verificados en su patrón de carga/dependencias/orden. De
ellos, **21 se leyeron línea por línea completos** en esta pasada (los
que manejan timers, RAF, listeners, fetch o el ciclo de vida central).
Los 6 restantes (`ambiente-profundidad.js`, `ambiente-gramatica.js`,
`ambiente-ritmo.js`, `ambiente-escenas.js`, `ambiente-halos.js`,
parcialmente `ambiente-coordenadas.js`) se verificaron por grep
exhaustivo (`addEventListener`, `setInterval`, `setTimeout`,
`requestAnimationFrame`, `IntersectionObserver`, `MutationObserver`,
`ResizeObserver` — **cero coincidencias en los 6**) más lectura de su
cabecera de responsabilidad — confirmado que no tienen timers, loops
ni listeners propios, pero **no se auditó cada línea de su lógica de
cálculo interna**. Si Fase 6 va a tocar alguno de estos 6, recomiendo
una lectura completa previa puntual.

---

## 3. Flujo de ejecución (resumen operativo)

1. **Carga**: 27 `<script defer>` corren en el orden fijo del HTML,
   cada uno se auto-registra en `window.Ambiente*` inmediatamente al
   ejecutarse (no esperan a nadie).
2. **Arranque**: solo `ambiente-orquestador.js` tiene un listener de
   `DOMContentLoaded` real dentro del grupo Ambient; todo lo demás se
   dispara desde dentro de `orquestador.iniciar()`, en el orden fijo
   descripto en §1.2.
3. **Régimen estable** (pestaña visible, sin interacción): hay
   exactamente **2 loops de `requestAnimationFrame` corriendo
   indefinidamente** (`ambiente-rendimiento.js`,
   `ambiente-respiracion.js`) y **3 `setInterval` corriendo cada 60s o
   5 min** (`ambiente-capa-fondo.js`, `ambiente-horario-tinte.js` cada
   60s; `ambiente-clima.js` cada 5 min). Todo lo demás es
   estrictamente reactivo a eventos (suscripciones al Motion
   Controller, `visibilitychange`, `matchMedia`, `scroll`).
4. **Pestaña oculta**: el `setInterval` de clima se **cancela** de
   verdad (`clearInterval`) y se reanuda con un fetch inmediato al
   volver. Los `setInterval` de fondo/tinte horario **siguen
   corriendo** cada 60s pero su `tick()` hace un chequeo de
   `pestanaVisible` y no hace nada si está oculta (costo por tick:
   una comparación booleana, no una escritura de DOM). El loop RAF de
   `ambiente-rendimiento.js` **sigue re-solicitando `requestAnimationFrame`
   indefinidamente** incluso oculto (el navegador lo throttlea a ~1
   Hz en background, pero el código nunca lo cancela); el loop RAF de
   `ambiente-respiracion.js` hace lo mismo — nunca cancela su propio
   `rafId`, solo deja de acumular fase mientras está oculto.
5. **Scroll**: solo `ambiente-particulas-deriva.js` reacciona a
   scroll, con un listener `passive: true` + `requestAnimationFrame`
   throttle + deduplicación por `scrollY` sin cambios — no hay
   ningún otro listener de scroll en todo el Ambient Engine.
6. **Resize**: **cero listeners de `resize` en todo el Ambient
   Engine** (confirmado por grep exhaustivo). Los 4 planos son
   `position: fixed`, así que su cobertura de viewport se resuelve
   solo por CSS, sin intervención de JS.
7. **Navegación a una ficha** (`locales/<slug>/index.html`):
   confirmado por grep — **ninguna ficha carga ningún script
   `ambiente-*.js`**. Es una recarga completa de página (no hay
   router SPA), así que el Ambient Engine completo se destruye por el
   navegador al salir de `index.html` y no existe en absoluto dentro
   de una ficha. No hay lógica de "destruir" real ejercitada en
   producción hoy — los métodos `destruir()` que sí existen
   (`ambiente-clima.js`, `ambiente-luz.js`) están escritos pero **no
   los llama nadie** en el flujo real (posible código preparado para
   un futuro SPA, hoy muerto en la práctica — ver §9).

---

## 4. Problemas reales confirmados (evidencia directa de código, no hipótesis)

1. **Documentación desactualizada sobre el conteo de archivos**: tus
   tres documentos describen 30 archivos / 3 huérfanos; el repo real
   tiene 27 archivos, cero huérfanos físicos. Ver §0. Severidad:
   ninguna sobre el código — solo hay que descartar esos números al
   trabajar en Fase 6.
2. **`ambiente-respiracion.js` nunca se detiene a sí mismo**: no
   existe ningún método `detener()`/`destruir()` en su API pública, y
   su loop RAF se re-solicita incondicionalmente en cada `tick()`
   (línea 163: `rafId = global.requestAnimationFrame(tick);` es la
   primera línea de la función, antes de cualquier chequeo). Esto es
   **intencional según el propio comentario** ("Cap. 8: nunca se
   detiene por completo mientras el sitio está abierto"), así que no
   es un bug de diseño — pero si Fase 6 buscara reducir trabajo en
   segundo plano, este es el loop más persistente del sistema y su
   comportamiento actual (seguir pidiendo frames en pestaña oculta,
   solo pausando la acumulación de fase) es different de lo que
   `ambiente-rendimiento.js` documenta como objetivo general ("ningún
   ciclo de animación debe seguir corriendo en segundo plano" — línea
   26-28 de ese archivo). Hay una **inconsistencia real entre el
   comentario de intención de `ambiente-rendimiento.js` y el
   comportamiento real de ambos loops**: ninguno de los dos cancela su
   RAF en background, solo lo vacían de trabajo útil. En la práctica
   esto es principalmente semántico (el navegador ya throttlea RAF en
   background a ~1fps en la mayoría de los motores), pero la
   afirmación textual del comentario ("no debe existir ciclo de
   animación ejecutándose en segundo plano") no describe exactamente
   lo que hace el código (que es "seguir pidiendo frames, pero sin
   efecto visual").
3. **`ambiente-capa-fondo.js` y `ambiente-horario-tinte.js` nunca
   limpian su `setInterval`**: no hay ningún `clearInterval` en
   ninguno de los dos archivos (confirmado por grep). No es un bug
   funcional hoy (la SPA nunca destruye el Ambient Engine en tiempo de
   ejecución, solo por recarga completa de página al navegar a una
   ficha), pero es la única asimetría real frente a
   `ambiente-clima.js`, que sí limpia el suyo correctamente y hasta
   expone `destruir()`. Si Fase 6 agregara alguna forma de
   desmontar/remontar el Ambient Engine sin recargar la página (poco
   probable dado que no hay router SPA, pero posible si se agregara
   alguno), estos dos intervalos quedarían huérfanos.
4. **Listeners de `focus`/`blur` en `ambiente-interaccion.js` sin
   protección de re-inicialización** — ver detalle en §1.3. Riesgo
   latente, no un bug activo.
5. **`will-change: background`** en `css/ambiente-capa-fondo.css`
   (línea 66): `will-change` está documentado y diseñado para
   propiedades que el navegador puede promover a su propio layer
   compuesto (`transform`, `opacity`); `background` no es una de esas
   propiedades — el navegador puede ignorar el hint o aplicarlo de
   forma menos efectiva de lo esperado. No es un error que rompa nada,
   pero **es plausible que no esté logrando el efecto de optimización
   que su nombre sugiere** — ver §10 para cómo medirlo, no es una
   afirmación de impacto real sin medición.

---

## 5. Riesgos potenciales (hipótesis, no confirmados como problemas reales)

Todo lo de esta sección requiere navegador/dispositivo real o
profiling para confirmar o descartar — están listados explícitamente
como **hipótesis**, según pediste.

1. **Hipótesis — costo del loop RAF de `ambiente-rendimiento.js`**:
   corre indefinidamente, todo el tiempo que la pestaña esté abierta,
   incluso cuando el usuario está inmóvil leyendo una ficha (aunque
   ahí el motor ni siquiera está cargado) o simplemente parado en el
   listado sin interactuar. Su trabajo por frame es barato en
   apariencia (comparaciones numéricas, sin tocar DOM salvo cada 4s
   cuando evalúa la ventana de FPS), pero no se midió el costo real en
   ms/frame en ningún dispositivo.
2. **Hipótesis — costo del loop RAF de `ambiente-respiracion.js`**:
   escribe una variable CSS (`--amb-respiracion`) sobre
   `document.documentElement` **en cada frame** mientras la pestaña
   está visible (no cada 4s como el de rendimiento — cada frame, sin
   throttle). Esto fuerza una invalidación de estilo sobre el nodo
   raíz en cada frame. Si algún selector CSS de coste alto consume esa
   variable en una propiedad no compuesta (a diferencia de
   `transform`/`opacity`, que si se confirma serían compositor-only),
   podría producir recalculo de estilo/paint repetido. **No se
   verificó en esta pasada qué propiedades CSS consumen finalmente
   `--amb-respiracion`** (el propio archivo dice que no lo sabe a
   propósito, por diseño de desacoplamiento — "no conoce a
   ambiente-luz.js ni a ningún otro consumidor"). Esto es exactamente
   el tipo de pregunta que requiere DevTools, no lectura de código.
3. **Hipótesis — `will-change: background`** (ver punto 5 de §4):
   posible efecto nulo o contraproducente de la optimización
   pretendida.
4. **Hipótesis — costo acumulado de tener 27 módulos IIFE cargándose
   secuencialmente vía `<script defer>`**: cada uno registra su propio
   objeto en `window`, ejecuta código de nivel superior (definición de
   constantes, en algunos casos creación de objetos `Map`). El costo
   de parseo/ejecución de 27 archivos JS pequeños-medianos en el hilo
   principal, antes de `DOMContentLoaded`, no se midió. En dispositivos
   de gama baja esto podría ser un contribuyente real al Time to
   Interactive, independientemente de que después el motor sea
   liviano en régimen estable.
5. **Hipótesis — repintado del gradiente de fondo cada 60s**:
   `ambiente-capa-fondo.js` escribe `--ambiente-color-1`/`-2` cada
   minuto (cuando la pestaña está visible), consumidas por un
   `background` con transición CSS. Un cambio de `background` (a
   diferencia de `transform`/`opacity`) típicamente dispara un repaint
   real, no solo composición. A una frecuencia de 1 vez por minuto,
   el impacto agregado en CPU/batería es probablemente insignificante,
   pero no se midió.
6. **Hipótesis — impacto en GPU/composición por la cantidad de capas
   `position:fixed` simultáneas**: viñeta, resplandor, 4 planos P0-P3,
   contenedor de clima, capa de fondo = al menos 7-8 elementos
   `position:fixed` de viewport completo apilados con distintos
   `z-index` y `mix-blend-mode`/gradientes. Cada uno es candidato a
   layer de composición propia en la mayoría de los navegadores. No se
   midió cuántos layers reales se crean ni su costo de memoria de GPU.
7. **Hipótesis — dispositivos de gama baja**: `ambiente-rendimiento.js`
   sí implementa un heurístico de arranque conservador
   (`navigator.hardwareConcurrency`/`deviceMemory`) y degradación
   adaptativa por FPS real medido — el mecanismo de protección existe
   y está bien diseñado en el código, pero **su eficacia real en un
   dispositivo de gama baja real no fue verificada** (no hay acceso a
   dispositivo real desde este entorno).

---

## 6. Oportunidades de optimización (candidatas, sin implementar nada)

Ordenadas de menor a mayor riesgo/esfuerzo:

1. **Alinear el comentario de intención con el comportamiento real**
   en `ambiente-rendimiento.js`/`ambiente-respiracion.js` (documentar
   que el RAF sigue pidiéndose en background, solo vacío de trabajo,
   en vez de decir "no debe existir ciclo ejecutándose") — cambio de
   **documentación únicamente**, cero riesgo, cero impacto de
   rendimiento real.
2. **Agregar `clearInterval` simétrico** a `ambiente-capa-fondo.js` y
   `ambiente-horario-tinte.js` con un método `detener()` (siguiendo
   exactamente el patrón ya probado de `ambiente-clima.js`) — bajo
   riesgo, no cambia comportamiento visual, mejora consistencia del
   codebase y prepara el terreno por si algún día se necesita
   desmontar el motor sin recargar la página.
3. **Revisar `will-change: background`** — o se cambia a una
   propiedad compuesta real, o se retira si no aporta nada medible.
   Requiere medir antes de decidir (ver §10).
4. **Agregar guard de re-entrancia** a `ambiente-orquestador.js:
   iniciar()` y `ambiente-interaccion.js: iniciar()` (`if (yaIniciado)
   return`) — previene el escenario latente de duplicación de
   listeners `focus`/`blur` descripto en §1.3/§4.4. Bajo riesgo, cero
   cambio visual.
5. **Medir si el RAF de `ambiente-rendimiento.js` podría muestrear a
   una frecuencia menor** (por ejemplo, usando `setInterval` de 250ms
   para timestamps en vez de cada frame) sin perder precisión de
   detección de degradación — esto SÍ cambiaría el patrón de
   ejecución, así que requiere medición antes/después, no es un
   cambio "seguro por inspección".
6. **Evaluar consolidar los dos `setInterval` de 60s** (`capa-fondo` +
   `horario-tinte`) en un único temporizador compartido que notifique
   a ambos — reduce de 2 a 1 el número de timers activos en régimen
   estable. Bajo impacto esperado (la diferencia entre 1 y 2
   `setInterval` de 60s es marginal), pero es una simplificación
   arquitectónica válida si Fase 6 busca reducir superficie.

Ninguna de estas seis requiere tocar la lógica visual, la estética, ni
el comportamiento observable del sitio bajo condiciones normales — son
candidatas legítimas para una futura fase de implementación, no para
hacer ahora.

---

## 7. Módulos que NO deberían tocarse en Fase 6

- **`ambiente-config.js`, `ambiente-flags.js`**: son la fuente de
  verdad de configuración y el mecanismo de apagado de emergencia
  respectivamente. Tocarlos con la intención de "optimizar" es el
  camino más corto a romper el fail-open que protege a todo lo demás.
- **`ambiente-accesibilidad.js`**: implementa una señal de máxima
  prioridad absoluta (Cap. 3.11 citado en su propio comentario) — es,
  por diseño, el módulo con menos margen de "mejora" razonable sin
  riesgo real de accesibilidad.
- **`ambiente-clima.js`**: ya es, de los 27, el mejor engineered
  frente a exactamente los criterios que preguntás (pausa real en
  background, cleanup real, fail-open ante fallos de red). Es el
  ejemplo a copiar, no a modificar.
- **`ambiente-orquestador.js`**: es el único mount point; cualquier
  cambio en su orden de arranque puede introducir una dependencia
  invisible en cascada, dado que confirma explícitamente en sus
  comentarios que el orden de arranque interno importa (Motion
  Controller antes que Capa de Fondo, Planos antes que las familias,
  etc.).

---

## 8. Módulos candidatos a optimización (con evidencia, no solo intuición)

| Módulo | Qué se propone medir/optimizar | Evidencia que lo motiva |
|---|---|---|
| `ambiente-respiracion.js` | Confirmar consumidor real de `--amb-respiracion` y si dispara repaint | RAF sin throttle, cada frame, mientras la pestaña esté visible — el más "caliente" de los 27 |
| `ambiente-rendimiento.js` | Medir costo real del muestreo por frame vs. una alternativa de menor frecuencia | RAF continuo con trabajo mínimo pero indefinido |
| `ambiente-capa-fondo.js` / `ambiente-horario-tinte.js` | Agregar `clearInterval`/`detener()` simétrico | Único par de módulos sin cleanup, frente a un tercero (`clima`) que sí lo tiene |
| `css/ambiente-capa-fondo.css` | Verificar `will-change: background` con DevTools | Hint aplicado sobre propiedad no compuesta |

---

## 9. Módulos candidatos a eliminación — **ninguno, con evidencia suficiente hoy**

A diferencia de la auditoría anterior (que sí tenía 3 candidatos reales
a eliminación: `ambiente-estilos.js`, `ambiente-particulas.js`,
`ambiente-senales.js`), **esos tres ya fueron eliminados físicamente**
(§0). Verificado por `find` exhaustivo: **no quedan archivos
`ambiente-*.js` huérfanos en el repo hoy.**

Lo único que se acerca a "código potencialmente sin uso real" son los
métodos `destruir()` de `ambiente-clima.js` y `ambiente-luz.js`: existen,
están bien escritos, pero **nadie los llama** en el flujo real de
producción (no hay router SPA que desmonte la página). No son
candidatos a eliminación por dos razones: (a) no cuestan nada en
régimen estable — son funciones que nunca se ejecutan, cero costo de
runtime — y (b) es exactamente el tipo de código que preparás con
intención, para el día en que exista una necesidad real de desmontaje;
eliminarlo ahora sería trabajo con beneficio cero y costo de
tener que reescribirlo después si hiciera falta.

---

## 10. Qué debe medirse manualmente (navegador/dispositivo real)

Todo lo siguiente **no es ejecutable desde este entorno** (sin acceso a
browser ni a Cloudflare Pages en vivo) y requiere Chrome DevTools /
`chrome://tracing` / dispositivo físico:

1. **Panel Performance, grabación de 30-60s en reposo** (usuario
   parado, sin interactuar) en `index.html` cargado, para ver:
   - Cuántos frames por segundo realmente ejecuta el loop de
     `ambiente-respiracion.js` y su costo en ms/frame ("Scripting" +
     "Rendering" en el panel).
   - Si `--amb-respiracion` dispara "Recalculate Style"/"Paint" visibles
     en el timeline, y sobre qué elementos.
2. **Panel Rendering → "Paint flashing"** activado, observar si el
   cambio de `--ambiente-color-1`/`-2` cada 60s dispara un repaint
   visible de área grande (toda la capa de fondo) o solo del gradiente.
3. **Panel Layers** (`chrome://inspect` o DevTools → More tools →
   Layers): contar cuántos layers de composición reales crean los ~8
   elementos `position:fixed` del motor, y su huella de memoria GPU
   estimada.
4. **Grabación con CPU throttling 4x-6x** (simulando gama baja) +
   `navigator.hardwareConcurrency`/`deviceMemory` mockeados a valores
   bajos, para verificar que el heurístico de `ambiente-rendimiento.js`
   efectivamente arranca en nivel `reducida` y que la degradación por
   FPS real ocurre dentro de los ciclos configurados (3 ciclos de 4s
   para degradar).
5. **Pestaña en segundo plano durante 5+ minutos**, luego volver a
   primer plano: confirmar visualmente que no hay un "salto" perceptible
   de color/clima al recuperar foco (el código dice que no debería
   haberlo — confirmarlo empíricamente).
6. **`prefers-reduced-motion: reduce` activado en el SO**, recorrer el
   sitio completo: confirmar que la respiración se reduce a
   `PISO_REDUCIDO` (no a cero), que el parallax de partículas ni
   siquiera registra el listener de scroll, y que las animaciones CSS
   de `ambiente-estilos.css`/`ambiente-planos.css` respetan sus bloques
   `@media (prefers-reduced-motion: reduce)`.
7. **Lighthouse / WebPageTest en un dispositivo móvil real de gama
   media-baja**, con y sin el Ambient Engine (usando
   `?ambiente_off=motor` para desactivarlo por completo vía
   `ambiente-flags.js`, que ya soporta exactamente este caso de uso) —
   esta es la comparación A/B más directa y barata de ejecutar que ya
   tiene el propio código preparada, sin escribir una sola línea nueva.

---

## 11. Tests que deberían agregarse

**Automatizables desde Node, sin navegador** (extienden el patrón ya
usado por `motor-test.js`/`contract-tests.js`):

1. Test de que los 27 `<script src="js/ambiente-...">` de `index.html`
   corresponden 1:1 con los 27 archivos físicos en `js/` (detectaría
   automáticamente una futura reintroducción de huérfanos o una
   referencia rota, como ya pasó con `lazy-css-editorial.js`).
   `contract-tests.js` ya hace algo parecido para el orden — extenderlo
   a "todo archivo `ambiente-*.js` en disco tiene su `<script>`, y todo
   `<script src="js/ambiente-...">` tiene su archivo en disco" sería
   barato de agregar.
2. Test estático (grep programático, no DOM) que falle si aparece un
   nuevo `setInterval`/`requestAnimationFrame` en `js/ambiente-*.js`
   **sin** un `clearInterval`/`cancelAnimationFrame` correspondiente en
   el mismo archivo — habría detectado la asimetría de §4.3
   automáticamente, y previene que se repita en el futuro.
3. Test de que `AmbienteFlags.activo('motor')` en `false` (vía
   localStorage mockeado) efectivamente deja `document.body` sin
   ninguno de los elementos que crea el motor (`#ambiente-fondo`,
   `#ambiente-planos`, `#ambient-vigneta`, etc.) — confirmaría en CI
   que el flag maestro realmente apaga todo, no solo una parte.

**No automatizables sin navegador real** (requieren Playwright/Puppeteer
como mínimo, idealmente dispositivo físico):

4. Aserciones de FPS real bajo carga simulada (CPU throttling).
5. Aserciones de "no repaint fuera del elemento esperado" (requiere
   Paint API / captura de screenshots diferenciales).
6. Verificación de `prefers-reduced-motion` end-to-end (Playwright
   soporta emular esta media query).
7. Verificación de comportamiento en pestaña oculta/visible
   (Playwright soporta `page.evaluate` para simular `visibilitychange`).

---

## 12. Plan de implementación incremental sugerido (para cuando se apruebe empezar a tocar código)

Esto es una **propuesta de orden**, no una autorización para ejecutarla
todavía — la comparto porque la pediste, pero **Fase 6 se detiene acá**
hasta tu aprobación explícita.

1. **Paso 0 (documentación, cero riesgo)**: actualizar los tres
   documentos de contexto para reflejar 27 archivos / cero huérfanos
   (§0), y corregir el diagrama de `AmbientEngine.iniciar()` en
   `REPO_ARCHITECTURE_MAP.md` (§1.2).
2. **Paso 1 (test nuevo, cero riesgo)**: agregar el test de simetría
   `<script>` ↔ archivo físico (§11.1) — puramente aditivo, no toca
   ningún archivo existente del motor.
3. **Paso 2 (test nuevo, cero riesgo)**: agregar el test estático de
   timers sin cleanup (§11.2) — puramente aditivo.
4. **Paso 3 (cambio mínimo, bajo riesgo)**: agregar `detener()` +
   `clearInterval` simétrico a `ambiente-capa-fondo.js` y
   `ambiente-horario-tinte.js`, sin cambiar ningún comportamiento
   visual — nadie llama a `detener()` todavía, así que es
   estrictamente aditivo. Correr `node js/motor-test.js` +
   `node js/contract-tests.js` después (línea base 212/212 + OK).
5. **Paso 4 (medición, sin código)**: ejecutar el checklist de §10 en
   al menos un dispositivo real de gama media y uno de gama baja (o
   emulado con throttling), documentar los números reales.
6. **Paso 5 (decisión informada)**: recién con datos reales de Paso 4,
   decidir si `ambiente-respiracion.js`/`ambiente-rendimiento.js`
   necesitan algún ajuste de frecuencia — y si la respuesta es "no
   hace falta", esa es una conclusión legítima de Fase 6, no un
   fracaso.
7. **Paso 6 (opcional, solo si Paso 4 lo justifica)**: cualquier
   cambio de frecuencia/throttle a los loops RAF, con medición
   antes/después explícita.

---

## 13. Criterios objetivos para declarar la Fase 6 terminada

Propongo que Fase 6 se dé por terminada cuando **todo** lo siguiente
sea cierto (mezcla de criterios automatizables y manuales, explícitos
sobre cuál es cuál):

- [ ] `node js/motor-test.js` → 212/212 OK (automatizable, ya lo está)
- [ ] `node js/contract-tests.js` → OK, 0 avisos (automatizable, ya lo está)
- [ ] Test nuevo de simetría script↔archivo → OK (automatizable, a agregar)
- [ ] Test nuevo de timers sin cleanup → OK (automatizable, a agregar)
- [ ] Los tres documentos de contexto actualizados al estado real de
      27 archivos (verificación manual de lectura, no de código)
- [ ] Checklist de medición de §10 ejecutado al menos una vez en
      dispositivo real, con números documentados (manual, requiere
      navegador — no se puede tickear desde este entorno)
- [ ] Ningún cambio de Fase 6 alteró la estética ni el comportamiento
      visual observable bajo condiciones normales (verificación manual
      comparando antes/después con capturas o con el propio ojo)
- [ ] Si se implementó algún cambio de frecuencia/throttle: medición
      antes/después que muestre la mejora esperada, no solo la
      intención de mejorarla

---

## Resumen para vos

El Ambient Engine real es, en general, **mejor de lo que "30
archivos con partes retiradas" hacía pensar**: hoy son 27 módulos
limpios, sin huérfanos físicos, con un patrón de aislamiento y
fail-open consistente en casi todos ellos, tests que pasan, y un
módulo (`ambiente-clima.js`) que ya demuestra el patrón correcto de
pausa en background/cleanup que los otros dos con `setInterval`
todavía no replican. No encontré animaciones "zombies" que corran sin
ningún control, ni fugas de memoria reales, ni listeners duplicados
activos hoy — sí encontré una asimetría real y puntual (dos
`setInterval` sin `clearInterval`) y dos loops RAF que, por diseño
explícito, nunca se cancelan del todo (uno de ellos con un comentario
de intención que no describe exactamente lo que el código hace). Todo
lo demás que podría preocupar de verdad (impacto real en CPU/GPU,
costo del loop de respiración, efecto de `will-change: background`)
son preguntas legítimas que el código no puede responder por sí solo
— necesitan el checklist de medición de §10 antes de que valga la pena
tocar una sola línea.

Quedo a la espera de tu aprobación para empezar con el Paso 0 del plan
de §12, o para lo que decidas priorizar.
