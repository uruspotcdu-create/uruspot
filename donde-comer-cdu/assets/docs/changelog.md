# URU SPOT — Ambient Engine — Changelog del sistema de assets

Ficha por asset al incorporarse, según Cap. 10.4 del documento de
Lenguaje de Assets v1.0. Cada fila = un asset. Orden cronológico.

## v1.0 — Infraestructura (Paso 1)

| Nombre de archivo | Familia | Plano | Movimiento heredado | Reactividad | Fecha / versión | Justificación |
|---|---|---|---|---|---|---|
| `_primitivas/primitivas-compartidas.svg` | — (infraestructura) | — | — | — | v1.0 | Set de 5 primitivas compartidas (Cap. 3.3): arco, línea, sinusoide, círculo concéntrico, marca de coordenada. Ninguna familia dibuja geometría propia — todas ensamblan estas. |
| `_tokens/ambiente-tokens-visual.css` | — (infraestructura) | — | — | — | v1.0 | Tokens de color/opacidad por plano y peso de trazo (Cap. 1.3, 4.1, 7). Ningún asset fija color propio. |
| `_tokens/ambiente-tokens-movimiento.css` | — (infraestructura) | — | — | — | v1.0 | Keyframe compartido de Respiración (Cap. 5), consumido por Retícula y (Paso 3) Curvas topográficas. |

## v1.0 — Retícula cartográfica (Paso 2)

| Nombre de archivo | Familia | Plano | Movimiento heredado | Reactividad | Fecha / versión | Justificación |
|---|---|---|---|---|---|---|
| `reticula/reticula--default--hairline.svg` | Retícula cartográfica | P0 | Respiración (10s) | Ninguna (sustrato, Cap. 4.2) | v1.0 | "Da estructura de fondo; sin ella todo lo demás flota sin contexto" (Cap. 2.1). Construida solo con las primitivas línea y marca-coordenada. |

**Nota de discrepancia (no corregida en este paso, dejar registrada
para la fase de integración):** el catálogo conceptual de
`ambiente-config.js` (Fase 2) tiene `lineas-cartograficas` con
`capa: 'profundidad', carga: 'diferida'`. El documento de Lenguaje de
Assets (Fase 3, Cap. 12, orden 2) trata a la Retícula cartográfica
como P0/estructura base, candidata natural a carga anticipada. No se
tocó `capa`/`carga` en este paso porque cambia comportamiento en
tiempo de ejecución y es una decisión de producto, no de lenguaje
visual — queda para que la fase de integración la revise a propósito.

*(Los assets de las familias restantes se agregan a esta tabla a
medida que se implementan, uno por paso, siguiendo el roadmap del
Cap. 12.)*

## v1.0 — Curvas topográficas (Paso 3)

| Nombre de archivo | Familia | Plano | Movimiento heredado | Reactividad | Fecha / versión | Justificación |
|---|---|---|---|---|---|---|
| `topograficas/topograficas--default--hairline.svg` | Curvas topográficas | P0 (más profundo) | Respiración extrema lenta (24s) | Ninguna (sustrato, Cap. 4.2) | v1.0 | "Da profundidad sin necesitar sombra ni ilustración" (Cap. 2.1). Construida solo con la primitiva arco; 3 clusters, escala 1 : 1.3 en dos de ellos (Cap. 1.4) y una ruptura deliberada en el tercero. |

Sin discrepancias que anotar en este paso: `curvas-topograficas` ya
tenía `carga: 'anticipada'` en el catálogo Fase 2, coherente con su
rol de infraestructura visual base según el documento Fase 3.

## v1.0 — Integración: renderizado real en pantalla (Paso 4)

No se agregan assets nuevos en este paso — es el paso que faltaba
para que los dos assets de Paso 2 y Paso 3 dejaran de ser archivos
sueltos y pasaran a verse en pantalla:

- `js/ambiente-assets.js` gana `obtenerBinario(id)`: la versión
  asincrónica del Asset Registry que el Cap. 8.1 dejaba marcada como
  "fase posterior" — descarga el SVG, lo cachea, y reescribe sus
  `href`/`xlink:href` relativos para que sigan apuntando a
  `_primitivas/primitivas-compartidas.svg` correctamente una vez
  insertados inline dentro de `index.html`.
- `js/ambiente-reticula.js` y `js/ambiente-topografia.js` (nuevos):
  un módulo por familia, cada uno inserta su asset en
  `AmbientePlanos.contenedor('p0')`.

**Discrepancia de Paso 2 resuelta:** `lineas-cartograficas` pasa de
`carga: 'diferida'` a `carga: 'anticipada'` en `ambiente-config.js`.
Como sustrato P0, debe estar presente desde el primer instante de
cualquier escena — "diferida" no aplicaba acá (ver nota de Paso 2
más arriba).

## v1.0 — Corrientes (Paso 5, Roadmap Cap. 12 orden 4)

| Nombre de archivo | Familia | Plano | Movimiento heredado | Reactividad | Fecha / versión | Justificación |
|---|---|---|---|---|---|---|
| `corrientes/corrientes--diagonal-lenta--hairline.svg` | Corrientes | P1 | Deriva direccional continua (40s, loop) | Ninguna implementada en este paso (ver nota abajo) | v1.0 | "Es la única familia que representa el río sin literalidad" (Cap. 2.1). Construida solo con la primitiva sinusoide; 3 franjas, escala 1.0 / 1.3 en progresión (Cap. 1.4) y una tercera fuera de serie a propósito. |

Primer paso del Roadmap (Cap. 12) que sale del plano P0: Corrientes
vive en P1 ("Corriente", Cap. 4.1), con opacidad y color tomados de
los tokens `--amb-p1-*` ya definidos desde el Paso 1 pero sin uso
hasta ahora.

Movimiento nuevo: a diferencia de Respiración (que solo anima una
variable de opacidad), Deriva anima `transform: translateX()` sobre
un grupo que contiene el tile original + una copia desplazada un
ancho de tile completo — técnica de loop sin salto documentada en
el propio SVG. Se agregó el keyframe `amb-deriva` en
`ambiente-tokens-movimiento.css`, junto al `amb-respiracion` ya
existente, respetando `prefers-reduced-motion` con el mismo criterio
que las dos familias anteriores.

**Pendiente registrado a propósito (no es una excepción del Cap. 8.2,
es alcance explícito de este paso):** la matriz de reactividad del
Cap. 6.1 asigna a Corrientes reacción a scroll (parallax de
velocidad) y a clima (velocidad ↑ con lluvia). Ninguna de las dos se
implementa acá — este paso solo resuelve la familia y su firma de
movimiento propia. Queda para el paso de integración de interacción/
clima, mismo criterio que ya dejó pendientes los shifts de
clima/horario de `ambiente-tokens-visual.css` en el Paso 1.

Integración: `js/ambiente-corrientes.js` (nuevo, mismo patrón que
`ambiente-reticula.js`/`ambiente-topografia.js`, mismo `iniciar()`
llamado desde `ambiente-orquestador.js`), inserta el asset en
`AmbientePlanos.contenedor('p1')` en vez de `'p0'`.

*(Los assets de las familias restantes — Brújula, Partículas de
deriva, Halos de posición — se agregan a esta tabla a medida que se
implementan, uno por paso, siguiendo el Roadmap del Cap. 12.)*

## v1.0 — Coordenadas (Paso 6, Roadmap Cap. 12 orden 5)

| Nombre de archivo | Familia | Plano | Movimiento heredado | Reactividad | Fecha / versión | Justificación |
|---|---|---|---|---|---|---|
| `coordenadas/coordenadas--default--hairline.svg` | Coordenadas | P1 | Aparición/desaparición discreta (transición 260ms, sin loop) | Mapa/ubicación activa — instrumento listo, disparo real pendiente (ver nota abajo) | v1.0 | "Refuerza la promesa de precisión geográfica real, no genérica" (Cap. 2.1). Un solo marcador (primitiva marca-coordenada), sin repetición — es un marcador puntual, no un campo. |

Primera familia del Roadmap con `carga: 'diferida'` real (no una
discrepancia a resolver, como sí fue el caso de las tres anteriores):
Coordenadas no es sustrato permanente, es un marcador que solo tiene
sentido cuando hay un punto seleccionado (Cap. 6.1, Cap. 13.1 —
"la familia más débil de las 7... la única sin movimiento propio
real").

Diferencia estructural con Retícula/Topográficas/Corrientes: esas
tres se insertan una sola vez, siempre visibles, en cuanto
`iniciar()` corre. Coordenadas no — `js/ambiente-coordenadas.js`
prepara el elemento (oculto, `opacity:0`) pero expone `mostrarEn(x,
y)` / `ocultar()` en vez de mostrarse solo. Motivo: Cap. 5, "aparece
cuando hay algo que señalar y se retira, nunca flota" — insertarlo
siempre-visible como las otras tres sería, acá, precisamente el
error que ese capítulo pide evitar.

Movimiento nuevo: a diferencia de Respiración/Deriva (`@keyframes`
en loop), Aparición/desaparición discreta se resuelve con
`transition: opacity` + una clase de estado — no es cíclica, es un
evento puntual. Documentado en `ambiente-tokens-movimiento.css`
junto a los dos anteriores.

**Pendiente parcialmente resuelto (quedó registrado en el Paso 6
original como "siguiente sub-paso"):** `mostrarEn()` ya está
cableado a un evento real — `js/app.js`, `motorMapa.on('click', ...)`
(el mismo evento que ya usaba la app para hacer scroll a la tarjeta
del lugar clickeado) — así que Coordenadas deja de ser un
instrumento sin disparo real. Queda parcial a propósito: se ancla al
centro óptico (50,50) en vez de a la posición geográfica real del
punto clickeado, porque `motor-mapa.js` no expone su proyección de
lat/lng a coordenadas de pantalla como parte de su API pública —
inventar esa correspondencia desde afuera sería una decisión de
otro subsistema, no del Ambient Engine (Cap. 3.12). Tampoco hay
todavía un `ocultar()` cableado a ningún evento de deselección: el
motor de mapa no emite un evento de "popup cerrado" hoy. Ambas
piezas quedan para un paso posterior, si se decide que valen la
pena, en vez de resolverse con una inferencia poco confiable.

Sin valores tipográficos numéricos en este paso, aunque el Cap. 2.1
los menciona como parte de la familia ("marcas + valores
tipográficos discretos"): el sistema de tipografía del Ambient
Engine (fuente, tamaño, token de color de texto) no está definido en
ningún capítulo del documento fuente ni en los tokens ya creados
(Cap. 7 solo cubre color de trazo). Queda pendiente como decisión de
sistema a tomar a propósito, no a colar implícita.

**Nota de cierre real del Paso 6:** la ficha de arriba se había
documentado en el commit `d32b241`, pero los dos archivos que
describe (`coordenadas/coordenadas--default--hairline.svg` y
`js/ambiente-coordenadas.js`) nunca se habían commiteado — el
catálogo e `index.html` ya los referenciaban (script 404 real, asset
inexistente). Se crean ambos archivos y se completan las dos reglas
de opacidad que faltaban en `ambiente-tokens-movimiento.css`
(estaban en un archivo duplicado en la ruta equivocada, `css/`, sin
efecto real — también corregido). El Paso 6 queda cerrado de verdad
recién en el commit `f6adbd8`, no en `d32b241`.

*(Los assets de las familias restantes — Brújula, Partículas de
deriva, Halos de posición — se agregan a esta tabla a medida que se
implementan, uno por paso, siguiendo el Roadmap del Cap. 12.)*

## v1.0 — Brújula (Paso 7, Roadmap Cap. 12 orden 6)

| Nombre de archivo | Familia | Plano | Movimiento heredado | Reactividad | Fecha / versión | Justificación |
|---|---|---|---|---|---|---|
| `brujula/brujula--default--regular.svg` | Brújula | P2 | Rotación mínima (aro, 60s) + Oscilación de aguja (6s) | Mapa/ubicación activa — instrumento listo, disparo real pendiente (mismo estado que Coordenadas antes de su cableado) | v1.0 | "Ancla simbólica única del producto — orientación, encontrar tu lugar" (Cap. 2.1). Único asset hasta ahora con 2 ejes de movimiento simultáneos, el máximo del Cap. 5. |

Primer asset construido con 3 primitivas a la vez (círculo
concéntrico, marca de coordenada, sinusoide) en vez de 1 o 2 como
las familias anteriores — la propia `_primitivas/primitivas-compartidas.svg`
ya documentaba de antemano que la sinusoide era la base geométrica
pensada para la aguja, decisión tomada al construir el set de
primitivas en el Paso 1, no en este paso.

Estructura en 3 grupos con significado propio (Cap. 3.3): aro (fijo
en radio, rota mínimamente), marcas cardinales (completamente
estático, referencia contra la que se lee el resto), aguja (sinusoide
rotada a vertical + marca de coordenada en la punta norte, para
distinguir norte de sur al oscilar).

Peso `regular` (1.5px) — primera familia del sistema en usar ese
peso; las tres anteriores (Retícula, Topográficas, Corrientes) usan
`hairline` en P0/P1, Coordenadas también `hairline` en P1. Cap. 1.3:
"brújulas, elementos de plano medio" es uno de los tres usos
textuales de `regular`.

`carga: 'anticipada'` (a diferencia de Coordenadas): la Brújula es
sustrato de identidad del producto, presente desde el arranque de
cualquier escena — no depende de que haya un punto seleccionado.

**Pendiente registrado a propósito (mismo criterio que Coordenadas
en el Paso 6, no una excepción del Cap. 8.2):** la aguja solo tiene,
por ahora, su oscilación libre "buscando norte" — no apunta todavía
hacia ningún spot seleccionado real (Cap. 6.1). Cablear un rumbo
geográfico real requiere una proyección que hoy no existe en ningún
subsistema de la app (misma limitación exacta que ya se documentó al
cablear `mostrarEn()` de Coordenadas a `motorMapa.on('click', ...)`
en `js/app.js`) — queda para un paso posterior explícito.

## v1.0 — Partículas de deriva (Paso 8, Roadmap Cap. 12 orden 7)

| Nombre de archivo | Familia | Plano | Movimiento heredado | Reactividad | Fecha / versión | Justificación |
|---|---|---|---|---|---|---|
| `particulas/particulas--deriva-libre--hairline.svg` | Partículas de deriva | P2 | Flotación libre con parallax (trayectorias no lineales, 22-34s por mota + parallax de scroll) | Scroll (parallax real, implementado en este paso) | v1.0 | "Único elemento con movimiento verdaderamente libre; introduce vida orgánica" (Cap. 2.1). 5 instancias de la primitiva círculo-concéntrico a escala mínima, progresión 1.0/1.3/1.6 + ruptura del 20% (elipse leve, no uniforme). |

Primera familia con reactividad a scroll realmente implementada (a
diferencia de Corrientes, que la dejó pendiente a propósito en el
Paso 5): `js/ambiente-particulas-deriva.js` escucha `scroll` con
throttle por `requestAnimationFrame` y escribe la variable
`--amb-particulas-scroll` sobre el grupo `.particulas-parallax` del
propio SVG — nunca transform directamente desde JS (Cap. 9.1). El
listener no se agrega si `AmbienteAccesibilidad.reducirMovimiento`
está activo, y se desactiva/reactiva en vivo si el usuario cambia esa
preferencia en caliente.

Nombre distinto de `js/ambiente-particulas.js` (Fase 2, Particle
Engine, basado en `<div>`, sin planos ni primitivas compartidas):
son dos subsistemas distintos que hoy conviven en el repo; este paso
no los fusiona (decisión de arquitectura fuera de alcance, ver nota
de cabecera del propio archivo).

**Pendiente registrado a propósito (mismo criterio que Corrientes en
el Paso 5):** la matriz de reactividad del Cap. 6.1 también asigna a
esta familia reacción a clima ("densidad ↑ con lluvia, dirección con
viento simulado") — no se implementa acá porque no existe hoy ninguna
señal real de lluvia/viento en la app (`js/ambiente-clima.js` ya
documenta esa misma ausencia). Queda para cuando exista un Weather
Engine real.

Integración: `js/ambiente-particulas-deriva.js` (nuevo, mismo patrón
de inserción que `ambiente-brujula.js`), inserta el asset en
`AmbientePlanos.contenedor('p2')`, `carga: 'anticipada'` en
`ambiente-config.js` (sustrato de identidad, no atado a selección).

## v1.0 — Halos de posición (Paso 9, Roadmap Cap. 12 orden 8)

| Nombre de archivo | Familia | Plano | Movimiento heredado | Reactividad | Fecha / versión | Justificación |
|---|---|---|---|---|---|---|
| `halos/halos--foco-activo--feature.svg` | Halos de posición | P3 | Iluminación reactiva (transition, sin loop propio, 220ms) | Usuario (hover/click) y mapa/ubicación activa — instrumento cableado a un evento real en este mismo paso | v1.0 | "El único asset reactivo al usuario — necesario para feedback" (Cap. 2.1). 3 anillos concéntricos (círculo-concéntrico a 3 escalas) simulan foco radial sin usar `filter`/blur (Cap. 9.1). Único asset del sistema en peso `feature`. |

Primera y única familia que anima `transform:scale` además de
`opacity` (Cap. 5: "el crecimiento ES la semántica de esta familia",
ver comentario del propio SVG) — el resto del sistema solo anima
`opacity`/`translate`/`rotate`. Sigue siendo Cap. 9.1-compatible:
`scale` vía `transform`, nunca una propiedad de layout.

A diferencia de Coordenadas y Brújula (cuyo cableado real a un evento
de mapa quedó pendiente hasta un sub-paso posterior), acá el cableado
sí se resuelve en el mismo paso: `js/app.js`, `motorMapa.on('hover'
/'hoverOut'/'click', ...)` ya llama a `AmbienteHalos.mostrarEn(50,50)`
/ `ocultar()`. Misma limitación de siempre y ya documentada dos veces
(Coordenadas, Brújula): sin proyección real de lat/lng expuesta por
`motor-mapa.js`, se ancla al centro óptico en vez de a la posición
geográfica real del punto — no es una excepción nueva, es la misma
restricción de plataforma.

Cap. 4.2 ("el halo nunca convive con más de un asset P2 activo... dos
focos compitiendo anulan el propósito") y Cap. 13.3 del documento
fuente (permiso explícito de reaccionar *solo* al usuario, ver
`excepciones.md`) se cumplen por construcción: una única instancia
insertada, `mostrarEn()` reposiciona, nunca crea una segunda.

Integración: `js/ambiente-halos.js` (nuevo, mismo patrón que
`ambiente-coordenadas.js`), inserta el asset oculto en
`AmbientePlanos.contenedor('p3')`, `carga: 'diferida'` en
`ambiente-config.js` (no es sustrato permanente).

## v1.0 — Variantes de clima/horario (Paso 10, Roadmap Cap. 12 orden 9)

No agrega ninguna familia nueva a la tabla de assets — implementa el
Cap. 7.3 sobre las 7 familias ya existentes, P2/P3 solamente (P0/P1
nunca cambian, regla dura del propio capítulo).

`js/ambiente-horario-tinte.js` (nuevo) reutiliza el mismo cálculo de
hora real que ya usa `js/ambiente-capa-fondo.js` para el color del
cielo (mismo período de muestreo, 60s, mismo criterio de "nada se
recalcula con la pestaña en 2º plano", Cap. 9.2) y escribe cuatro
variables CSS —`--amb-tinte-monto-p2/p3` y `--amb-tinte-color-p2/p3`—
que `assets/ambient/_tokens/ambiente-tokens-visual.css` consume vía
`color-mix()` para redefinir `--amb-p2-color`/`--amb-p3-color`. Ningún
asset SVG cambió: siguen usando `currentColor` heredado de esas
mismas variables, tal como pedía el Cap. 3.4/11.2 desde el Paso 1 — el
shift vive enteramente en el token, nunca en el asset.

Implementado: Amanecer (5h-8h, ámbar bajo, pico 22% de mezcla) y
Atardecer (18h-21h, ámbar medio, pico 38% de mezcla), con
interpolación lineal del monto en el borde de cada franja para que no
se note un salto de color. Noche queda cubierta por la base dark ya
existente del sistema, sin tinte adicional en este paso.

**No implementado, a propósito (mismo criterio que la reactividad a
clima pendiente en Corrientes y Partículas de deriva):** el shift de
Lluvia del Cap. 7.3 (P1/P2/P3, azul-gris + desaturación). No existe
hoy en ningún subsistema de la app una señal real de "está lloviendo"
— inventar un valor fijo o un toggle de mentira acá sería la
excepción silenciosa que el Cap. 8.2 pide evitar explícitamente.
Queda pendiente, registrado, para cuando exista una fuente real de
clima (el propio `js/ambiente-clima.js`, Fase 2, ya documenta la misma
ausencia).

## v1.1 — Auditoría (Paso 11, Roadmap Cap. 12 orden 10)

Primera aplicación real del Cap. 13 del documento fuente ("Auditoría
crítica") desde que existe implementación, no solo especificación.
Revisión punto por punto contra el estado real del repo tras los
Pasos 1-10:

- **13.1 (¿sobran familias? — Coordenadas)**: sigue siendo, en
  implementación, la familia con menos movimiento propio real (fade
  discreto) — coherente con la prioridad de expansión más baja que ya
  le asignaba el documento fuente. No se degrada ni se fusiona: nada
  en la implementación real contradice la decisión original.
- **13.2 (¿redundancia Corrientes/Partículas?)**: implementadas por
  separado, se leen distinto en pantalla — Corrientes es una franja
  direccional continua (deriva horizontal, un solo eje), Partículas es
  cinco puntos con trayectorias independientes no lineales más
  parallax de scroll (dos ejes, ninguno compartido con Corrientes).
  La distinción de comportamiento que pedía el Cap. 13.2 sí se está
  respetando en implementación.
- **13.3 (¿el halo es un asset real?)**: confirmado en la práctica —
  el halo se construye con la misma primitiva compartida que Brújula
  y Partículas (círculo-concéntrico) y vive en el mismo sistema de
  tokens de color/plano que el resto (Cap. 3.3/3.4), aunque su
  disparador siga siendo distinto (evento de mapa, no ambiente
  autónomo). La excepción sigue documentada en `excepciones.md`, no
  como inconsistencia nueva.
- **13.4 (¿4 planos alcanza?)**: con las 7 familias ya implementadas,
  P0 (Retícula/Topográficas), P1 (Corrientes/Coordenadas), P2
  (Brújula/Partículas) y P3 (Halos) mantienen la separación de
  velocidad/densidad/reactividad que el Cap. 13.4 exigía para
  justificar 4 y no 3 o 5 — ninguna familia terminó necesitando un
  quinto plano.

**Elemento que se elimina/degrada tras esta auditoría v1.1:** ninguno.
El sistema completo (7 familias, 4 planos, shift de horario en P2/P3)
queda implementado sin que ninguna decisión del Cap. 13 original haya
tenido que revisarse contra la realidad — la jerarquía de robustez que
ya fijaba esa auditoría (Coordenadas con menor prioridad de expansión,
halo como excepción formal) sigue vigente sin cambios.

Pendientes que esta auditoría deja registrados para revisiones
futuras, en vez de resolverlos por inferencia (mismo criterio del Cap.
8.2 en todo este documento):
1. Reactividad a clima (lluvia/viento) de Corrientes y Partículas de
   deriva — sin señal real de clima en la app.
2. Shift de temperatura por Lluvia (Cap. 7.3) sobre P1/P2/P3.
3. Rumbo geográfico real de la aguja de Brújula y posición geográfica
   real de Coordenadas/Halos — sin proyección lat/lng→pantalla
   expuesta por `motor-mapa.js`.
4. Valores tipográficos numéricos de Coordenadas (Cap. 2.1) — sin
   sistema de tipografía del Ambient Engine definido todavía.

Los cuatro son, deliberadamente, el mismo tipo de pendiente: una
limitación real de otro subsistema de la app, no una falla del
sistema visual en sí — el criterio para cerrarlos, cuando corresponda,
es el mismo Cap. 8.2 que ya gobernó cada paso anterior.

## v1.2 — Fase 8: Visual & Design Master Pass (retiro de sistemas paralelos)

No agrega assets nuevos. Corrige una discrepancia real encontrada al
auditar el repo contra este mismo documento: dos sistemas de "fondo
vivo" corrían al mismo tiempo sin que uno supiera del otro —

1. **El sistema documentado acá** (7 familias, tokens de
   `assets/ambient/_tokens/`, dark-only, colores siempre vía
   `currentColor`).
2. **Un prototipo previo (Fase 2 técnica)** — `js/ambiente-particulas.js`,
   `js/ambiente-luz.js`, `css/ambiente-estilos.css` — que dibujaba sus
   propios puntos, niebla, lluvia, viento y viñeta con colores fijos
   sin tokenizar (celeste cielo, naranja, azul profundo, gris-azul
   genérico), exactamente lo que el Cap. 11.2 de este mismo documento
   prohíbe.

Cambios de este paso:

- `js/ambiente-particulas.js` (motor de partículas del prototipo) se
  retira del arranque (`js/ambiente-orquestador.js`) y de la carga de
  `index.html` — su rol ya lo cubre oficialmente la Familia 6
  (Partículas de deriva, Paso 8) desde v1.0. El archivo sigue en el
  repo, sin invocarse.
- `js/ambiente-luz.js` (Lighting Engine, sí se mantiene: es el único
  módulo con permiso explícito de nunca desactivarse, Cap. 7.2) se
  retinta: sus tres paradas de color día/atardecer/noche pasan de
  celeste-cielo/naranja/azul-profundo a los mismos RGB que ya son
  fuente de verdad en `css/tokens.css` (`--color-tinta`,
  `--color-granate-clara`, `--color-linea`).
- `css/ambiente-estilos.css`: la viñeta pasa de negro plano a
  `--color-fondo-2`; niebla/lluvia/viento (Weather Engine, real —
  reacciona a clima real de Concepción del Uruguay vía
  `functions/weather.js`, Fase 6/7) se retintan sobre `--color-linea`
  en vez de un gris-celeste genérico de app del tiempo; se retira el
  bloque `@media (prefers-color-scheme: dark)` que contradecía al
  propio proyecto (dark-only, ya documentado en
  `ambiente-tokens-visual.css`).

Ningún asset SVG de las 7 familias cambia. Ningún plano P0-P3 cambia
de opacidad, color base o regla de reactividad — esta auditoría tocó
únicamente el sistema paralelo que vivía fuera de esa arquitectura.

## v1.3 — Fase 8 (continuación): auditoría de conexiones

Dos hallazgos de una auditoría enfocada en conexiones faltantes entre
módulos que ya existían (no assets nuevos, no familias nuevas):

**1. `js/ambiente-respiracion.js` estaba huérfano.** El módulo (Fase
4, Cap. 8) tenía su configuración en `ambiente-config.js`
(`RESPIRACION`) y su arranque ya escrito en `ambiente-orquestador.js`
(`if (global.AmbienteRespiracion) ...iniciar();`), pero nunca figuraba
en la lista de `<script>` de `index.html` — nunca se ejecutó en
producción. Además, la regla que debía consumir su variable
(`#ambient-resplandor` en `css/ambiente-estilos.css`) tenía la
opacidad fija en `0.3` en vez del `calc(var(--amb-resplandor-base) +
var(--amb-respiracion))` que los propios comentarios de
`ambiente-luz.js` describían como el contrato. Corregidos ambos
puntos: el módulo ahora se carga (después de `ambiente-ritmo.js`, del
que depende) y la regla CSS realmente suma las dos variables.

**2. Reactividad a clima real de Corrientes/Partículas de deriva,
antes bloqueada.** v1.0 y v1.1 registraban esto como pendiente "a
propósito" por falta de una señal real de clima. Esa señal existe
desde Fase 6/7 (`js/ambiente-clima.js` vía `functions/weather.js`),
pero nunca salía del módulo. Se agrega `publicarSenalVientoDOM()`,
que escribe `--amb-clima-viento` (0|1) sobre `<html>` — mismo patrón
de "publicar una variable, cero acoplamiento lateral" que ya usa
`ambiente-respiracion.js` (Cap. 2.3). `ambiente-tokens-movimiento.css`
consume esa variable vía `calc()` sobre `animation-duration` (nunca
sobre `transform`, Cap. 9.1 intacto) para acelerar moderadamente la
Deriva de Corrientes (factor 0.8) y, más sutilmente, la Flotación de
las cinco Partículas (factor 0.35). Deliberadamente solo viento, no
lluvia/niebla: es la única señal con una traducción de movimiento
directa: lluvia y niebla ya tienen su propia expresión visual (los
overlays de Clima) y forzarlas también acá sería la "excepción
silenciosa" que el Cap. 8.2 pide evitar.

**No tocado en este paso, a propósito — mismos cuatro pendientes que
v1.1 ya dejó registrados** (rumbo real de Brújula, posición real de
Coordenadas/Halos, tipografía de Coordenadas, shift de temperatura por
Lluvia sobre P1/P2/P3): siguen bloqueados por la misma causa real
(sin proyección lat/lng expuesta por `motor-mapa.js` / sin sistema de
tipografía del motor definido), no por falta de señal — inventar una
sin esa base seguiría siendo la misma excepción silenciosa que ya
evitó v1.0.
