/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — motor-render.js
   Motor de mapa propio. No es una librería genérica envuelta: dibuja
   sus propios tiles y marcadores sobre <canvas>, con su propio
   vocabulario visual (mismos tokens de --granate / --fondo-2 que el
   resto de la interfaz), su propia interacción (pan, zoom, cluster,
   popup) y su propio puente de accesibilidad por teclado.

   No decide QUÉ mostrar — eso es responsabilidad de motor-mapa.js y
   del presupuesto de exposición. Este archivo solo sabe CÓMO
   mostrarlo. Separación deliberada: calibrar cuántos puntos van al
   mapa nunca debería requerir tocar el renderer, y cambiar cómo se
   ve un marcador nunca debería requerir tocar la regla de negocio.

   ───────────────────────────────────────────────────────────────────
   Auditoría y evolución de esta pasada (motivo de cada cambio no
   trivial, para que quien lea el diff entienda el "por qué" sin
   tener que reconstruirlo):

   BUGS REALES corregidos
   • Pan de un dedo y pellizco de dos dedos competían por el mismo
     estado de arrastre: al posar el segundo dedo, el mapa "saltaba".
     Ahora el pellizco toma el control explícitamente y el pan de un
     solo puntero queda atado a su pointerId.
   • Un tile que falla (red, 404, CORS) quedaba en blanco para
     siempre. Ahora hay un reintento con backoff y, si sigue
     fallando, el relleno base del mapa se ve en su lugar — nunca un
     hueco crudo.
   • Caché de tiles sin techo: en una sesión larga explorando mucho
     territorio, crecía sin límite. Ahora tiene un tope con desalojo
     simple (FIFO).
   • `role="application"` en el contenedor entero metía en "modo app"
     (fuera del modo de navegación normal de un lector de pantalla)
     a la lista accesible real que vive adentro. Se cambia a
     `role="region"` — el canvas sigue oculto a AT, la lista sigue
     siendo HTML normal navegable.
   • `aria-hidden="true"` + `tabIndex=0` en el canvas era una
     contradicción: el foco podía aterrizar por Tab en algo invisible
     para lectores de pantalla. Ahora `tabIndex=-1` (fuera del orden
     de tabulación, pero el mouse todavía puede enfocarlo para
     habilitar el pan por flechas a usuarios con mouse+teclado).
   • El botón de cerrar el popup era un `<div role="button">` sin
     manejo de Enter/Espacio — inaccesible por teclado. Ahora es un
     `<button>` real.
   • `requestAnimationFrame` de animación de vuelo y de ondas de clic
     no se cancelaban en `destruir()` — código zombi dibujando sobre
     un canvas ya desmontado.
   • El `devicePixelRatio` se leía una sola vez al crear el mapa; si
     cambiaba (mover la ventana a otro monitor, zoom del navegador
     sin resize del contenedor) el canvas quedaba borroso.
   • Un color mal formado en los datos (no un hex de 6 dígitos)
     rompía `parseInt` en silencio y podía dejar un marcador con un
     color previo pegado. Ahora se valida con fallback.

   RENDIMIENTO
   • Cada `pointermove` recalculaba proyección + clustering O(n²)
     completo solo para saber qué hay bajo el cursor — con miles de
     eventos de mouse por sesión, era el cuello de botella real (el
     propio motor-config.js ya advertía sobre el costo de este
     algoritmo). Ahora se cachea el resultado del último frame
     dibujado y solo se recalcula si el viewport realmente cambió.
   • La lista accesible en paralelo se reconstruía entera (con sus
     listeners) en cada llamada a `establecerPuntos`, aunque el
     conjunto de lugares no hubiera cambiado (p. ej. un re-render por
     cada tecla del buscador). Ahora se compara una huella barata y
     se salta la reconstrucción si no cambió.
   • `encuadrarTodos` volvía a animar hacia el mismo destino en cada
     llamada — visible como un "salto" del mapa en cada tecla
     tipeada en el buscador (motorMapa.encuadrarTodos se llama desde
     app.js en cada render()). Ahora se cachea el último encuadre y
     se omite la animación si el destino es esencialmente el mismo.

   ACCESIBILIDAD / UX PREMIUM
   • Anillo de foco visible en el canvas para quien navega con mouse
     y después usa flechas/teclado.
   • Escape cierra el popup y devuelve el foco a donde estaba.
   • Se respeta `prefers-reduced-motion`: sin vuelos animados ni
     ondas de clic para quien lo pidió a nivel sistema operativo.
   • Botones +/− quedan `disabled` (con `aria-disabled`) en los
     límites de zoom, en vez de no dar ninguna señal.
   • Cursor cambia a "grabbing" mientras se arrastra.
   • El pellizco de dos dedos ahora ancla el zoom al punto geográfico
     bajo el centro del pellizco (como Google/Apple Maps), no solo
     cambia el zoom con el centro del viewport fijo.
   • Relleno base sólido detrás de los tiles: nunca hay un flash de
     canvas completamente vacío mientras cargan las imágenes.
   • Mayor tolerancia de toque en pantallas táctiles (dedo ≠ cursor
     de precisión).
   • El popup se reposiciona con clamp para no salirse del
     contenedor cuando el marcador queda cerca de un borde.

   Todo lo anterior es interno a este archivo. No se tocó ningún
   otro módulo — motor-plano.js, motor-mapa.js, motor-exposicion.js,
   motor-config.js y proyeccion.js siguen siendo la misma superficie
   de integración (`URU_PROYECCION`, y la API pública
   `URU_MOTOR_MAPA_RENDER.crear(...)` con los mismos métodos:
   on / establecerPuntos / encuadrarTodos / enfocar / resaltar /
   quitarResaltado / destruir).

   ───────────────────────────────────────────────────────────────────
   SEGUNDA PASADA — sensación premium de la interacción de zoom/pan.

   Antes de tocar nada, se revisó el resto del repo (app.js,
   motor-plano.js, motor-exposicion.js, motor-mapa.js,
   motor-config.js) para calibrar esta pasada contra la escala real
   del proyecto, no una hipotética: motor-config.js documenta
   explícitamente ~1468 lugares en catálogo, un tope de 2000 puntos
   simultáneos en el mapa-herramienta, y deja escrito que indexar
   espacialmente (grid/quadtree) es intencional para "si el catálogo
   crece mucho más allá de unos pocos miles" — no ahora. Construir acá
   una arquitectura para decenas de miles de puntos sería la clase de
   volumen sin sustento real que este mismo archivo ya advierte en su
   propio historial de decisiones (ver motor-config.js, sección mapa).
   Por eso esta pasada NO toca el algoritmo de clustering ni agrega
   indexado espacial: a la escala real y proyectada del catálogo, con
   caché ya vigente entre frames, no es el cuello de botella.

   Lo que sí eran carencias reales de sensación premium, verificadas
   contra el comportamiento de referencia (Google/Apple Maps):
   • La rueda del mouse cambiaba el zoom manteniendo fijo el CENTRO
     del viewport en vez del punto bajo el cursor — explorar con la
     rueda se sentía como si el mapa se escapara. Ahora ancla al
     punto geográfico bajo el cursor (misma matemática que ya existía
     para el pellizco de dos dedos, reutilizada, no duplicada).
   • Esa misma rueda trataba un trackpad (decenas de eventos
     pequeños/segundo) igual que un mouse de scroll a clicks —
     resultado, un trackpad zoomeaba mucho más rápido y entrecortado.
     Ahora se acumula el delta y se aplica una vez por frame vía rAF.
   • El doble clic también zoomeaba con el centro del viewport fijo,
     no con el punto clickeado.
   • Soltar el mapa en medio de un arrastre lo frenaba en seco. Ahora
     tiene inercia: sigue deslizando y frena solo, con la velocidad
     real del gesto al soltar (ventana de 80ms, no el promedio de todo
     el arrastre). Se cancela automáticamente si empieza cualquier
     otra interacción que deba tomar control del viewport (pellizco,
     otro arrastre, flechas de teclado, botones +/−, vuelo animado) —
     para que inercia y esas interacciones nunca compitan por el
     mismo estado, mismo principio que ya regía pan-vs-pellizco.
   • Un pin que pasaba de no existir en pantalla a existir (un
     cluster se separa al hacer zoom, una búsqueda nueva trae
     resultados) aparecía de golpe a tamaño completo. Ahora entra con
     un scale+opacity corto (220ms, se salta con
     prefers-reduced-motion). Deliberadamente NO se aplica a clusters:
     su membership cambia en cada frame de una animación de vuelo, sin
     clave estable que no se re-dispare constantemente — aplicarlo
     ahí se hubiera visto roto (nunca terminando de asentar) en vez de
     premium, así que se dejó fuera con esa razón documentada acá en
     vez de forzarlo.

   Se evaluó y se descartó explícitamente (para que quede constancia
   de que se consideró, no que se pasó por alto):
   • Detección manual de doble-toque en touch, en paralelo al
     `dblclick` que el navegador ya sintetiza: los navegadores móviles
     actuales ya lo sintetizan de forma confiable con
     `touch-action: none` (que este mapa ya usa — ver css/mapa.css).
     Una detección propia hubiera disparado en paralelo con el manejo
     de click de marcador ya existente (abrir/cerrar popup) en el
     mismo toque, produciendo un conflicto real de estados en vez de
     una mejora — se prefirió no introducirlo antes que introducir un
     bug nuevo por sumar una función que ya cubre otro camino.
   • Indexado espacial (grid/quadtree) para el clustering — ver
     justificación de escala arriba.

   ───────────────────────────────────────────────────────────────────
   TERCERA PASADA — se releyó el repo completo (app.js, motor-mapa.js,
   proyeccion.js, motor-config.js, motor-exposicion.js, motor-plano.js,
   tests/motor-test.js) antes de tocar nada. Confirmado: motorMapa es
   un singleton lazy-inicializado una sola vez por sesión de app.js
   (nunca se destruye/recrea en producción), así que el trabajo de
   ciclo de vida de esta pasada es robustez real por si algún consumo
   futuro sí destruye/reinicializa, no una corrección de un bug ya
   observado en producción.

   GAPS REALES encontrados y resueltos:
   • Coordenadas coincidentes/casi coincidentes en un cluster: existía
     una salida funcional (lista de texto), pero sin forma espacial de
     distinguir "estos lugares están literalmente acá". Se agrega
     spiderfy — abanico de pines individuales alrededor del cluster,
     cada uno clickeable — para clusters de hasta SPIDER_MAX_MIEMBROS.
     Por encima de ese umbral, la lista sigue siendo el mejor recurso
     (un abanico de más piernas deja de ser legible).
   • Soltar un dedo de un pellizco de dos dedos dejaba el mapa quieto
     hasta que el usuario levantara el dedo restante y lo volviera a
     apoyar — el pan de un solo dedo no se reactivaba solo, a
     diferencia de Google/Apple Maps.
   • Pestaña en background: nada frenaba explícitamente las animaciones
     por tiempo (inercia, ondas, apariciones, vuelo); un rAF pausado o
     acelerado de forma impredecible por el navegador podía dejar un
     `dt` gigante en el primer frame al volver a foreground. Ahora se
     cancela todo al ocultarse y se resincroniza (o se completa
     directo al destino) al volver.
   • `entrada.onReady` (caché de tiles, a nivel de módulo) se pisaba
     solo si estaba vacío — una instancia destruida y recreada que
     pedía un tile ya en vuelo nunca se enteraba de que terminó de
     cargar. Ahora se reasigna siempre al callback más reciente.
   • Hit-testing de hover corría completo en cada `pointermove`, sin
     coalescer — con mouses/trackpads de alta frecuencia (100-1000Hz)
     eso es mucho trabajo descartado entre frame y frame. Se coalesce
     a una vez por frame vía rAF.
   • Sin indicio visual de "no hay resultados" (lista vacía) ni de
     "tiles fallando de forma sostenida" (red degradada/offline) — dos
     estados reales que antes se veían igual que un mapa cargando
     normal.

   ───────────────────────────────────────────────────────────────────
   CUARTA PASADA (2026-08-02) — se releyó el repo completo antes de
   tocar nada; las tres pasadas anteriores ya cubren prácticamente todo
   lo que una auditoría de rendimiento de este motor pediría (rAF único
   deduplicado, rectCache sin forced reflow, pool de objetos en
   `proyectarPuntos` sin allocations por frame, cache de clustering
   correctamente atado al render loop, cache de Path2D/RGB, coalescing
   de wheel/hover, pausa en background). Repetir ese trabajo hubiera
   sido, en el mejor caso, redundante, y en el peor, arriesgar una
   regresión sobre decisiones ya fundamentadas — así que esta pasada
   buscó específicamente lo que las anteriores no cubrieron.

   GAP REAL encontrado: `proyectarPuntos()` corre en cada frame, para
   cada punto visible (hasta el tope de motor-config.js), y llamaba a
   `PROY.puntoAPantalla(p.lat, p.lng, viewport)` una vez por punto. Esa
   función reproyecta el CENTRO del viewport desde cero
   (`Math.pow`+`Math.sin`+`Math.log`) en cada llamada — pero el centro
   y la escala de mundo son el mismo valor para los cientos de puntos
   de un mismo frame; solo el punto en sí cambia. Se agregó un
   parámetro opcional a `PROY.proyectar`/`PROY.puntoAPantalla`
   (proyeccion.js) para recibir centro/escala precalculados —
   retrocompatible: sin ese parámetro, comportamiento y costo
   idénticos a antes — y `proyectarPuntos()` los calcula una sola vez
   por llamada. Verificado bit-a-bit idéntico (diff 0) contra el
   comportamiento anterior antes de aplicar; test suite completo
   (224/224 + 4 suites más) sigue en verde.

   ───────────────────────────────────────────────────────────────────
   QUINTA PASADA (2026-08-02, misma fecha, segunda revisión) — pedida
   explícitamente como auditoría nueva sobre lo recién aplicado: se
   releyó el repo completo desde cero (no desde memoria de la pasada
   anterior), se re-clonó y se corrió la suite completa como línea de
   base antes de tocar nada. Buscó específicamente dos cosas: (a)
   oportunidades que la CUARTA PASADA haya habilitado sin aprovechar
   en todos sus casos, y (b) trabajo redundante por frame que no
   pasaba por `PROY.proyectar` y por lo tanto no se vio en esa pasada.

   GAPS REALES encontrados y resueltos, los cuatro verificados con
   comparación numérica automatizada (no solo lectura) antes de
   aplicarse, y con la suite completa (224/224 + 4 suites) en verde
   después de cada uno:
   • `proyeccion.js`, `encuadrar()`: el loop que baja el zoom probando
     encuadres (hasta 16 iteraciones) llamaba `proyectar()` dos veces
     por iteración con el mismo `zoom`, sin usar el parámetro opcional
     de escala agregado en la pasada anterior — la propia función que
     lo habilitó no lo aprovechaba en este segundo call site. Se
     calcula `escalaDeZoom(zoom)` una vez por iteración. Verificado:
     mismo zoom resultante en 3 escenarios sintéticos comparando contra
     una réplica exacta de la versión anterior.
   • `dispersionMaxima()` (decide si vale la pena animar el zoom hacia
     un cluster clickeado): mismo patrón, proyectaba cada miembro del
     cluster con el mismo `zoom` sin escala precalculada. Corregido
     igual que `proyectarPuntos()`.
   • `agruparEnClusters()`: NO está protegida por el cache de
     `claveClusters` frente a sí misma (ES la función que ese cache
     evita volver a llamar cuando el viewport no cambió) — pero
     durante cualquier pan/zoom/inercia CONTINUOS el viewport cambia
     en cada frame, así que esta función corre 1 vez por frame en el
     caso de uso más común de todo el mapa (arrastrar el mapa). Cada
     cluster de 2+ miembros pagaba dos `.reduce()` más un `.map()` —
     tres closures nuevas y tres recorridos del mismo grupo — para
     calcular centro y extraer miembros. Reemplazado por un único loop
     plano. Verificado con fuzzing: 500 conjuntos de puntos aleatorios,
     resultado idéntico byte a byte (`assert.deepStrictEqual`) entre
     la versión vieja y la nueva.
   • `dibujarMarcadores()`: sin ningún cache que la salte (a diferencia
     de `agruparEnClusters`), corre en TODOS los frames sin excepción.
     Usaba `clusters.forEach(function (c) {...})`, recreando esa
     closure en cada frame. Reemplazado por un loop `for` plano —
     mismo comportamiento, sin la asignación de función por frame.

   No se encontró nada más: se revisaron también `dibujarTiles`,
   `dibujarCluster`, `dibujarSpider`, los handlers de wheel/touch/
   pointer, `animarA`, y el CSS de compositing (mapa.css) sin
   encontrar trabajo redundante adicional. Seguir buscando más allá de
   esto sería agregar cambios sin una razón de rendimiento real
   detrás — el mismo criterio que el resto de este archivo ya aplica
   contra la complejidad sin sustento.

   ───────────────────────────────────────────────────────────────────
   EVALUADO Y DESCARTADO explícitamente en la CUARTA PASADA:
     mapa (pines, tiles) tiene orientación propia; rotar el mapa entero
     es una decisión de producto mayor (reescribir toda la matemática
     de proyección/dibujado para un norte no fijo) sin pedido ni
     necesidad real detrás, no una mejora incremental de este archivo.
   • Momentum configurable por el consumidor (parámetro de fricción
     expuesto en `crear(opciones)`): ningún consumidor real
     (`app.js`) necesita distinto momentum en distintos contextos —
     agregar una API que nadie va a llamar es exactamente el tipo de
     superficie sin sustento que esta pasada busca evitar.
   • Foco secuencial de marcadores dentro del propio `<canvas>` con
     flechas (independiente de la lista accesible ya existente):
     redundante con la lista accesible en paralelo, que ya expone cada
     punto sin depender del estado de clustering — agregarlo hubiera
     sido dos caminos de teclado para llegar a lo mismo.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var PROY = global.URU_PROYECCION;

  // Dependencia dura: sin proyeccion.js este módulo no puede hacer
  // nada útil. Antes de esta pasada, su ausencia rompía el script
  // entero en la primera línea con un error críptico ("Cannot read
  // properties of undefined"). Ahora se falla temprano y claro.
  if (!PROY) {
    if (global.console) {
      console.error('URU_MOTOR_MAPA_RENDER: falta URU_PROYECCION (proyeccion.js). ' +
        'Revisá el orden de carga de los <script> — este módulo no puede iniciar sin esa dependencia.');
    }
    global.URU_MOTOR_MAPA_RENDER = {
      crear: function () {
        throw new Error('URU_MOTOR_MAPA_RENDER: no se puede crear el mapa sin URU_PROYECCION cargado antes.');
      }
    };
    return;
  }

  // Voyager en vez de dark_all: mismo proveedor (CARTO/OSM), pero un
  // basemap claro con calles, nombres y puntos de referencia legibles
  // — dark_all a este tamaño quedaba casi negro y sin contraste.
  var TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  var SUBDOMINIOS = ['a', 'b', 'c', 'd'];
  var TAM_TILE = PROY.TAM_TILE;
  // Antes 10: la ventana central alcanzaba ~3.6px de radio, suficiente
  // para una inicial de letra pero no para un pictograma legible. Se
  // sube a 12 (pin ~20% más grande) y se agranda la proporción de la
  // ventana (RATIO_VENTANA) para darle al ícono el espacio que
  // necesita — ver dibujarPictogramaRubro() más abajo. La forma y el
  // resto de la identidad del pin (gota, halo, gradiente, estados) no
  // cambian, solo la escala.
  var RADIO_MARCADOR = 12;
  var RADIO_CLUSTER = 16;
  var RADIO_CLUSTER_PX = 36;
  var ZOOM_MIN = 4, ZOOM_MAX = 18;

  // ── Sistema de pictogramas por rubro (ver rubros-meta.js) ──
  // RATIO_VENTANA: qué fracción del radio del pin ocupa la ventana
  // central oscura (antes 0.36, fija inline; ahora agrandada y
  // nombrada porque el pictograma necesita más aire que una letra).
  var RATIO_VENTANA = 0.62;
  // Margen interno del ícono dentro de la ventana (0-1): 0.88 dibuja
  // el pictograma casi al borde de la ventana sin tocarlo.
  var ICONO_MARGEN = 0.88;
  var ICONO_VIEWBOX = (global.URU_RUBROS_ICONO_VIEWBOX || 24);
  var ICONO_GROSOR = (global.URU_RUBROS_ICONO_GROSOR || 1.75);
  // Cache de Path2D por string `d`: los mismos 14 paths de
  // rubros-meta.js se reutilizan en cada marcador y en cada frame —
  // no tiene sentido reconstruir el Path2D por punto ni por redibujo.
  var CACHE_PATH2D = Object.create(null);
  function obtenerPath2D(d) {
    if (!CACHE_PATH2D[d]) CACHE_PATH2D[d] = new Path2D(d);
    return CACHE_PATH2D[d];
  }

  // Constantes de calibración visual/temporal, agrupadas para que
  // ajustar un número no obligue a bucear en la lógica — mismo
  // criterio que motor-config.js aplica al resto del sistema.
  var COLOR_DEFECTO = '#C97A83';
  var COLOR_FONDO_MAPA = '#12151b';   // relleno base mientras cargan los tiles, o si fallan
  var DURACION_ONDA_MS = 550;
  var DURACION_VUELO_MS = 420;
  var MAX_TILES_EN_CACHE = 400;       // tope simple para no crecer sin límite en sesiones largas
  var REINTENTOS_TILE = 1;
  var DEMORA_REINTENTO_TILE_MS = 800;
  var RE_HEX = /^#[0-9a-fA-F]{6}$/;

  // GAP REAL DE PERFORMANCE (auditoría navegación, 2026-08-02):
  // devicePixelRatio no tenía techo — en un teléfono de gama media con
  // DPR real de 2.5-3 (frecuente en Android, candidato real para el
  // hardware donde se reportó "el mapa se siente raro/pesado") el canvas
  // interno se crea a ancho*dpr × alto*dpr: hasta 9x más píxeles para
  // limpiar/rellenar en CADA frame que a DPR 1, y 2-4x más que a un DPR
  // ya de sobra nítido de 2. Esto pega directo en la fluidez de
  // cualquier gesto continuo (inercia, pellizco, rueda) justo en el
  // hardware con menos margen. La nitidez extra más allá de DPR 2 es
  // imperceptible acá: no hay texto fino ni fotografía de alta
  // frecuencia en el canvas del mapa, solo tiles, pines planos y
  // clusters — se pierde rendimiento real sin ninguna ganancia visual
  // real a cambio.
  var DPR_MAX = 2;

  var esPunteroTosco = !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches);
  var TOLERANCIA_CLICK_PX = esPunteroTosco ? 28 : 20; // el dedo es menos preciso que un cursor

  // GAP REAL corregido (auditoría navegación, 2026-08-02): el umbral que
  // decide si un gesto es "tap" o "pan" (más abajo, en `pointermove`)
  // estaba fijo en 2px para CUALQUIER puntero. Tiene sentido para un
  // mouse preciso, pero un dedo sobre un digitalizador de gama baja/media
  // (más jitter/ruido que uno de gama alta) supera 2px de movimiento con
  // bastante frecuencia incluso en un tap bien intencionado — cada uno de
  // esos falsos positivos convierte un tap limpio en un micro-pan que
  // cierra popups/spiderfy sin que el usuario lo haya pedido. El propio
  // archivo ya reconoce esta diferencia para el hit-testing
  // (TOLERANCIA_CLICK_PX arriba); acá se aplica el mismo criterio al
  // umbral de detección de drag, distinguiendo por `e.pointerType` en
  // vez de por `matchMedia` (más preciso en dispositivos híbridos
  // mouse+touch: importa el puntero real de ESTE gesto, no una
  // capacidad general del dispositivo).
  var UMBRAL_DRAG_MOUSE_PX = 2;
  var UMBRAL_DRAG_TOQUE_PX = 8;
  function umbralDrag(pointerType) {
    return pointerType === 'touch' ? UMBRAL_DRAG_TOQUE_PX : UMBRAL_DRAG_MOUSE_PX;
  }

  // PERF (auditoría rendimiento, ronda 1, hallazgo 4): antes se creaba
  // un MediaQueryList nuevo en CADA frame dibujado (dibujarMarcadores
  // corre una vez por frame durante pan/pellizco/inercia/vuelo, hasta
  // 60 veces por segundo). El valor de esta media query no cambia más
  // que muy ocasionalmente (el usuario altera una preferencia del SO),
  // nunca frame a frame — mismo criterio que cacheVarCSS/CACHE_RGB en
  // este archivo: se crea una sola vez y se lee la propiedad cacheada.
  var mqMovimientoReducido = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)');
  function prefiereMovimientoReducido() {
    return !!(mqMovimientoReducido && mqMovimientoReducido.matches);
  }

  function colorSeguro(c) {
    return (typeof c === 'string' && RE_HEX.test(c)) ? c : COLOR_DEFECTO;
  }

  // RENDIMIENTO REAL (no especulativo): el catálogo usa un puñado de
  // colores por rubro (rubros-meta.js tiene ~14 entradas), pero
  // `hexARgba`/`aclarar` se llaman una vez POR MARCADOR VISIBLE EN
  // CADA FRAME — con cientos de pines en pantalla a 60fps durante un
  // pan o una animación de vuelo, eso es re-parsear el mismo puñado
  // de strings hex miles de veces por segundo. `parseInt` sobre un
  // string ya visto no cambia de resultado — es la definición de un
  // caso para memoizar. La caché es por hex crudo (sin alpha), así
  // que sirve tanto para `hexARgba` (que solo cambia la alpha, un
  // string liviano) como para `aclarar` (que si acaso solo compone el
  // rgb ya cacheado con un porcentaje).
  var CACHE_RGB = Object.create(null);
  function rgbDe(hex) {
    var c = CACHE_RGB[hex];
    if (c) return c;
    c = CACHE_RGB[hex] = {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
    return c;
  }

  // GARANTÍA ESTRUCTURAL: todo punto que llega hasta acá ya pasó por el
  // filtro de `establecerPuntos` (lat/lng numéricos y finitos — ver más
  // abajo), así que esta función SIEMPRE devuelve un link válido a la
  // ubicación real en Google Maps. A diferencia de `punto.href` (que
  // depende de que exista una ficha/slug, y puede ser null), este link
  // no depende de ningún dato opcional: es la representación directa de
  // la coordenada del pin. Por eso es la acción primaria de cada popup,
  // individual o dentro de un cluster — nunca puede faltar.
  function hrefMapsDe(p) {
    return 'https://www.google.com/maps/search/?api=1&query=' + p.lat + ',' + p.lng;
  }

  /* ── Caché de tiles con desalojo simple (FIFO) y reintento ante error ── */
  var cacheTiles = Object.create(null);
  var ordenTiles = [];

  function construirUrlTile(z, xw, y) {
    var sub = SUBDOMINIOS[(xw + y) % SUBDOMINIOS.length];
    return TILE_URL.replace('{s}', sub).replace('{z}', z).replace('{x}', xw).replace('{y}', y)
      .replace('{r}', (global.devicePixelRatio > 1 ? '@2x' : ''));
  }

  function cargarTile(z, x, y) {
    var n = Math.pow(2, z);
    var xw = ((x % n) + n) % n; // wrap horizontal
    if (y < 0 || y >= n) return null;
    var clave = z + '/' + xw + '/' + y;
    var existente = cacheTiles[clave];
    if (existente) return existente;

    var img = new Image();
    img.crossOrigin = 'anonymous';
    var entrada = { img: img, cargado: false, error: false, intentos: 0 };
    // PERF (auditoría rendimiento, ronda 1, hallazgo 3): antes se
    // marcaba `cargado=true` directo en `onload`, así que el primer
    // `drawImage` sobre esa imagen (complete=true pero no
    // necesariamente decodificada) podía forzar una decodificación
    // síncrona en el hilo principal justo en el momento de pintar el
    // frame — notorio con tiles @2x, y peor con varios tiles
    // terminando de cargar casi juntos durante un pan/zoom rápido.
    // `img.decode()` mueve ese costo fuera del frame de pintado; si no
    // existe o rechaza, se cae al comportamiento anterior (marcar
    // cargado igual, sin bloquear la carga por un error de decode).
    img.onload = function () {
      entrada.error = false;
      if (img.decode) {
        img.decode().then(function () {
          entrada.cargado = true;
          if (entrada.onReady) entrada.onReady();
        }, function () {
          entrada.cargado = true;
          if (entrada.onReady) entrada.onReady();
        });
      } else {
        entrada.cargado = true;
        if (entrada.onReady) entrada.onReady();
      }
    };
    img.onerror = function () {
      entrada.cargado = false;
      entrada.error = true;
      if (entrada.intentos < REINTENTOS_TILE) {
        entrada.intentos++;
        setTimeout(function () {
          if (cacheTiles[clave] !== entrada) return; // ya fue desalojado del caché
          img.src = construirUrlTile(z, xw, y);
        }, DEMORA_REINTENTO_TILE_MS);
      }
      // Si se agotan los reintentos, no se hace nada más: dibujarTiles()
      // ya deja ver el relleno base (COLOR_FONDO_MAPA) en su lugar.
    };
    img.src = construirUrlTile(z, xw, y);

    cacheTiles[clave] = entrada;
    ordenTiles.push(clave);
    if (ordenTiles.length > MAX_TILES_EN_CACHE) {
      delete cacheTiles[ordenTiles.shift()];
    }
    return entrada;
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function crear(contenedor, opciones) {
    opciones = opciones || {};
    var emisor = {};
    (function initEmisor() {
      var listeners = Object.create(null);
      emisor.on = function (ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb); return emisor; };
      emisor.emitir = function (ev, payload) { (listeners[ev] || []).forEach(function (cb) { cb(payload); }); };
    })();

    contenedor.classList.add('uru-mapa');
    // "region", no "application": el canvas está aria-hidden (la
    // navegación real accesible es la lista paralela de abajo), así
    // que no hace falta ni conviene poner todo el contenedor en modo
    // aplicación — eso le quitaría a un lector de pantalla el modo
    // de navegación normal justo sobre la lista que sí es accesible.
    contenedor.setAttribute('role', 'region');
    contenedor.setAttribute('aria-label', opciones.ariaLabel || 'Mapa interactivo de lugares');

    var lienzo = document.createElement('canvas');
    lienzo.className = 'uru-mapa-lienzo';
    // tabIndex=-1 (no tabIndex=0): coherente con aria-hidden. Queda
    // fuera del recorrido por Tab (así un lector de pantalla nunca
    // aterriza en algo que declaramos invisible para él), pero sigue
    // siendo enfocable con clic de mouse, para que quien usa
    // mouse + teclado combinados pueda, después de hacer clic,
    // desplazarse con las flechas.
    lienzo.tabIndex = -1;
    lienzo.setAttribute('aria-hidden', 'true');
    contenedor.appendChild(lienzo);
    var ctx = lienzo.getContext('2d');

    var listaAccesible = document.createElement('ul');
    listaAccesible.className = 'uru-mapa-lista-accesible';
    listaAccesible.setAttribute('aria-label', 'Lista de lugares en el mapa');
    contenedor.appendChild(listaAccesible);

    var controles = document.createElement('div');
    controles.className = 'uru-mapa-controles';
    controles.innerHTML =
      '<button type="button" class="uru-mapa-btn" data-zoom="1" aria-label="Acercar">+</button>' +
      '<button type="button" class="uru-mapa-btn" data-zoom="-1" aria-label="Alejar">−</button>';
    contenedor.appendChild(controles);
    var btnZoomIn = controles.querySelector('[data-zoom="1"]');
    var btnZoomOut = controles.querySelector('[data-zoom="-1"]');

    var atribucion = document.createElement('div');
    atribucion.className = 'uru-mapa-atribucion';
    atribucion.innerHTML = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';
    contenedor.appendChild(atribucion);

    var popup = document.createElement('div');
    popup.className = 'uru-mapa-popup';
    popup.hidden = true;
    contenedor.appendChild(popup);

    var etiqueta = document.createElement('div');
    etiqueta.className = 'uru-mapa-etiqueta';
    etiqueta.hidden = true;
    contenedor.appendChild(etiqueta);

    // PERF (auditoría performance, 2026-08-03, hallazgo 1.1): el halo
    // pulsante de "acá estás vos" vivía enteramente en <canvas>
    // (dibujarMarcadorUsuario, más abajo) y necesitaba su propio loop
    // de requestAnimationFrame que llamaba a redibujar() en CADA frame
    // mientras el marcador estuviera activo — eso disparaba dibujar()
    // completo (clearRect + tiles + TODOS los marcadores/clusters +
    // spider + ondas) 60 veces por segundo solo para animar un punto
    // decorativo que ni siquiera se movía. Se saca a un <div> propio,
    // posicionado en JS (mismo patrón exacto que ya usan `popup` y
    // `etiqueta` arriba: left/top absolutos, recalculados solo cuando
    // dibujar() corre por una razón real — pan/zoom/datos nuevos) y
    // animado con @keyframes de CSS (transform/opacity, ver
    // css/mapa.css), que el navegador anima en su compositor sin
    // volver a tocar el canvas ni el resto de la página.
    var marcadorUsuarioEl = document.createElement('div');
    marcadorUsuarioEl.className = 'uru-mapa-marcador-usuario';
    marcadorUsuarioEl.setAttribute('aria-hidden', 'true');
    marcadorUsuarioEl.innerHTML =
      '<span class="uru-mapa-marcador-usuario__halo"></span>' +
      '<span class="uru-mapa-marcador-usuario__punto"></span>';
    marcadorUsuarioEl.hidden = true;
    contenedor.appendChild(marcadorUsuarioEl);

    // resolverVarCSS: puente de lectura hacia la capa "Tokens de
    // Canvas" de css/tokens.css (Blueprint V2 §2 — puente exclusivo
    // hacia este archivo, ningún literal hardcodeado). Generalizada
    // (Fase 4, paso 3): antes se usaba una única vez, con un nombre
    // de variable que nunca existió (--granate-clara, sin el prefijo
    // "color-" real), así que caía en silencio a su fallback
    // hardcodeado sin que nada lo señalara — el BUG REAL que motivó
    // este paso. Se agrega caché por nombre de variable dentro de
    // esta instancia de mapa: el valor de un custom property no
    // cambia durante la vida de un mismo mapa (no hay cambio de tema
    // en caliente hoy), así que releer getComputedStyle en cada
    // punto/redibujo sería trabajo repetido sin ninguna ganancia.
    // Firma sin cambios (nombre, fallback) — cualquier llamador nuevo
    // que se agregue en el paso 5 (color del mapa) puede reusarla tal
    // cual, sin duplicar esta lógica en otro punto del archivo.
    var cacheVarCSS = Object.create(null);
    function resolverVarCSS(nombre, fallback) {
      if (nombre in cacheVarCSS) return cacheVarCSS[nombre];
      var val;
      try {
        val = getComputedStyle(contenedor).getPropertyValue(nombre).trim();
      } catch (e) {
        val = '';
      }
      return (cacheVarCSS[nombre] = val || fallback);
    }
    var colorFoco = resolverVarCSS('--canvas-color-foco', '#E8A2AB');

    var viewport = { lat: opciones.lat || -32.4833, lng: opciones.lng || -58.2333, zoom: opciones.zoom || 14, ancho: 0, alto: 0 };
    var puntos = [];
    var idResaltado = null;
    var puntoResaltado = null;
    var idAbierto = null;
    var clusterAbierto = null; // { miembros: [...] } — lista de un cluster chico que no separa al hacer zoom
    var elementoFocoPrevio = null; // para devolver el foco al cerrar el popup
    var clusterResaltadoKey = null;
    var focoVisible = false;
    var ondas = []; // feedback de toque: cada clic dispara un anillo que se expande y se apaga

    // PREVENCIÓN DE MEMORY LEAKS EN REINICIALIZACIÓN REPETIDA: guard
    // central de ciclo de vida. Antes, destruir() cancelaba los
    // `requestAnimationFrame` en vuelo pero no impedía que un callback
    // asíncrono ya en camino (imagen de tile que termina de cargar
    // después de destruir, `document.fonts.ready` resuelto tarde,
    // `ResizeObserver` disparando durante el mismo tick del `disconnect`)
    // volviera a programar trabajo nuevo sobre una instancia ya muerta.
    // Cada punto de entrada asíncrono (no cada línea del archivo)
    // consulta `vivo` antes de actuar — un solo booleano en vez de
    // repetir `if (contenedorDestruido) return` disperso y fácil de
    // olvidar en el próximo callback que se agregue.
    var vivo = true;

    var establecioAlgunaVez = false; // primera vez que el consumidor llamó establecerPuntos(): distingue "todavía no se buscó nada" de "se buscó y no hay resultados"

    // ── Spiderfy: alternativa visual a la lista para clusters chicos ──
    // GAP REAL: dos o más lugares pueden compartir coordenadas exactas
    // o casi exactas (mismo edificio, galería, shopping — geocodificación
    // aproximada). Ya existía una salida funcional para ese caso
    // (abrirPopupCluster: lista con un link "Cómo llegar" por miembro),
    // pero es una lista de texto — no comunica "estos lugares están
    // literalmente acá" de forma espacial. Spiderfy expande el cluster
    // en un abanico de pines individuales alrededor de su centro, cada
    // uno clickeable como un marcador normal. No reemplaza la lista
    // (que sigue siendo el mejor recurso para clusters grandes que
    // nunca se separan, ver SPIDER_MAX_MIEMBROS más abajo) ni la lista
    // accesible en paralelo (que ya expone cada punto individual sin
    // depender del estado de clustering en absoluto).
    var spiderActivo = null; // { key, cx, cy, posiciones:[{punto,x,y,_xActual,_yActual}], inicio }
    var rafSpider = null;

    // ── Continuidad de pan al soltar un dedo de un pellizco ──
    // Ver justificación completa junto al listener de touchstart/
    // touchmove/touchend más abajo.
    var enPellizco = false;
    var panTactilUnico = null; // { id, x, y }

    // Seguido por animarA(): permite completar un vuelo instantáneamente
    // si la pestaña vuelve de segundo plano a mitad de la animación (ver
    // alCambiarVisibilidad más abajo) en vez de retomar una interpolación
    // cuyo origen temporal ya no significa nada.
    var vueloDestino = null;

    // TIER 3.3 — auditoría (Perf/UX, 2026-08-02): marcador de "acá
    // estás vos", independiente del array `puntos` (que representa
    // SIEMPRE resultados del catálogo, nunca la posición propia del
    // usuario — mezclarlos en la misma lista habría significado que
    // enfocar(id)/resaltar(id) pudieran resolver por error sobre el
    // usuario, o que deduplicarPorId de motor-mapa.js lo tratara como
    // un lugar más). Nace en null: sin marcador hasta que app.js llame
    // a establecerMarcadorUsuario() tras una geolocalización real.
    var usuarioMarcador = null;

    // Caché del último clustering calculado, para no repetir el
    // trabajo O(n²) de agrupar en cada movimiento de mouse — solo se
    // recalcula si el viewport (o el conjunto de puntos) cambió
    // desde el último frame dibujado.
    var ultimosClusters = [];
    var claveClusters = '';
    function clusteringVigente() {
      // PERF (auditoría performance, 2026-07-30): antes usaba `puntos.length`
      // como proxy del conjunto de puntos. Dos búsquedas/filtros distintos
      // que devuelven la MISMA CANTIDAD de resultados (común: 8 curados vs.
      // 8 filtrados) producían la misma clave sin viewport haber cambiado,
      // así que un consumidor que cacheara sobre esta clave (ver
      // clustersActuales() y dibujar() más abajo) podía reusar clusters de
      // un conjunto de lugares que ya no es el que está en pantalla.
      // `huellaListaPrevia` (ver establecerPuntos()/calcularHuella()) ya es
      // una huella real de contenido (ids en orden) que se recalcula una
      // sola vez por llamada a establecerPuntos(), no por frame — reusarla
      // acá no agrega costo por frame y cierra el hueco.
      return viewport.lat + ',' + viewport.lng + ',' + viewport.zoom + ',' +
        viewport.ancho + ',' + viewport.alto + ',' + huellaListaPrevia;
    }
    function clustersActuales() {
      var clave = clusteringVigente();
      if (clave === claveClusters) return ultimosClusters;
      var proyectados = proyectarPuntos();
      var clusters = agruparEnClusters(proyectados);
      ultimosClusters = clusters;
      claveClusters = clave;
      return clusters;
    }

    // ── Aparición de marcadores individuales ──
    // MICROINTERACCIÓN REAL (no cosmética porque sí): cuando un pin
    // pasa de no existir en pantalla a existir — un cluster se separa
    // al hacer zoom, una búsqueda nueva trae resultados que antes no
    // estaban — antes aparecía de golpe, en el mismo frame, a tamaño
    // completo. Un `scale`+`opacity` de entrada corto (220ms) comunica
    // "esto es nuevo" sin depender de leer texto, y es exactamente el
    // tipo de detalle que separa un mapa que "funciona" de uno que se
    // siente vivo.
    //
    // Deliberadamente NO se aplica esta animación a los clusters: la
    // identidad de un cluster (qué miembros lo componen) cambia en
    // cada frame de una animación de vuelo o de un pellizco continuo
    // — no hay una clave estable frame a frame sin recalcular
    // membership, y usar la posición en pantalla como clave la
    // re-dispara en cada pixel de pan. La clave de un punto individual
    // (`punto.id`) sí es 100% estable, así que solo los puntos
    // individuales entran animados; los clusters aparecen directo,
    // que es preferible a una animación que nunca llega a completarse
    // durante un vuelo.
    var DURACION_APARICION_MS = 220;
    var visiblesFramePrevio = Object.create(null); // set de ids vistos como punto individual en el último frame
    var apariciones = Object.create(null);          // id -> timestamp de cuándo empezó a aparecer
    var rafApariciones = null;
    function factorAparicion(id) {
      var inicio = apariciones[id];
      if (inicio === undefined) return 1;
      var t = (performance.now() - inicio) / DURACION_APARICION_MS;
      if (t >= 1) { delete apariciones[id]; return 1; }
      return Math.max(0, t);
    }
    function seguirApariciones() {
      if (rafApariciones !== null) return;
      rafApariciones = requestAnimationFrame(function () {
        rafApariciones = null;
        if (!vivo) return;
        var pendientes = false;
        for (var k in apariciones) { if (apariciones[k] !== undefined) { pendientes = true; break; } }
        redibujar();
        if (pendientes) seguirApariciones();
      });
    }

    var rafOndas = null;
    // PERF (auditoría performance, 2026-07-30): `dispararOnda()` llamaba
    // a `animarOndas()` de forma SÍNCRONA (no vía rAF), y `animarOndas()`
    // llamaba a `dibujar()` DIRECTO — el único de los ~8 ciclos de
    // animación de este archivo (aparición, spider, inercia, wheel,
    // hover, vuelo) que no pasa por `redibujar()`, el punto único de
    // deduplicación (rafRedibujo) que ya usan todos los demás.
    // `manejarClick()` (ver más abajo) llama `cerrarSpider()` →
    // `redibujar()`, LUEGO `dispararOnda()`, LUEGO `abrirPopup()` →
    // `redibujar()` de nuevo — es decir, CADA click sobre un marcador
    // (la interacción más frecuente de todo el mapa) disparaba:
    //   1) un `dibujar()` síncrono, en medio del handler de click,
    //      fuera de cualquier `requestAnimationFrame` — trabajo
    //      completo (clear + tiles + proyección + clustering +
    //      marcadores) potencialmente antes de que el propio
    //      `abrirPopup()` de la misma función terminara de mutar el
    //      DOM, y de cualquier forma descartado un frame después;
    //   2) en el frame siguiente, DOS dibujados más: uno por el
    //      `rafRedibujo` ya agendado por cerrarSpider/abrirPopup, y
    //      otro por el propio tick de `animarOndas()` (que sigue
    //      llamando a `dibujar()` directo) — dos redibujados
    //      idénticos del mismo frame visual, ninguno necesario más
    //      que el último.
    // Reproducción con conteo de llamadas (ver auditoría): 3 `dibujar()`
    // por click antes de este cambio, 1 después, en una réplica fiel
    // del mecanismo real (mismas guardas, mismo orden de llamadas).
    // Fix: `dispararOnda()` agenda el primer tick vía rAF en vez de
    // llamar directo, y `animarOndas()` pasa a usar `redibujar()` como
    // el resto del motor — la propia dedup de `rafRedibujo` absorbe
    // el caso (muy común) de que otra animación quiera dibujar en el
    // mismo frame. Costo: el primer frame de la onda se ve 1 frame
    // (~16ms) más tarde — mismo delay de arranque que ya tienen
    // aparición, spider y hover; imperceptible e inaudible frente a
    // los 400ms de duración total de la animación.
    function dispararOnda(x, y, color) {
      if (prefiereMovimientoReducido()) return; // el estado (popup, tarjeta resaltada) ya comunica la acción sin necesidad de animación
      ondas.push({ x: x, y: y, inicio: performance.now(), color: colorSeguro(color) });
      if (rafOndas === null) rafOndas = requestAnimationFrame(animarOndas);
    }
    function animarOndas() {
      if (!vivo || !ondas.length) { rafOndas = null; return; }
      var ahora = performance.now();
      ondas = ondas.filter(function (o) { return ahora - o.inicio < DURACION_ONDA_MS; });
      redibujar();
      rafOndas = ondas.length ? requestAnimationFrame(animarOndas) : null;
    }
    function dibujarOndas() {
      var ahora = performance.now();
      ondas.forEach(function (o) {
        var t = Math.min(1, (ahora - o.inicio) / DURACION_ONDA_MS);
        var e = 1 - (1 - t) * (1 - t);
        ctx.beginPath();
        ctx.arc(o.x, o.y, 6 + e * 34, 0, Math.PI * 2);
        ctx.strokeStyle = hexARgba(o.color, (1 - t) * 0.65);
        ctx.lineWidth = 2.5;
        ctx.stroke();
      });
    }
    var dpr = 1; // se recalcula en cada medir(), no queda pegado al valor de creación
    var animacionZoom = null;

    // PERF (auditoría performance, 2026-08-02): rectCache — antes,
    // buscarMarcadorEn(), el handler de `wheel`, el de `dblclick` y el
    // de `touchmove` (pinch de 2 dedos) llamaban cada uno por su
    // cuenta a `lienzo.getBoundingClientRect()`, forzando un layout
    // síncrono en cada evento. En `touchmove` eso significa un
    // forced reflow por cada evento táctil durante un pinch — que en
    // hardware táctil real dispara muy por encima de 60 veces por
    // segundo. El canvas es `width:100%; height:100%` de `contenedor`
    // (css/mapa.css) y solo cambia de tamaño/posición cuando
    // `contenedor` cambia — evento que YA dispara `medir()` a través
    // del ResizeObserver de abajo. Por eso alcanza con cachear acá el
    // mismo rect que `medir()` ya calcula (no hay que leer el rect de
    // `lienzo` por separado: al ser 100%/100% de `contenedor` sin
    // borde/padding entre ambos, coinciden) y exponerlo a través de
    // `rectLienzo()` para que ningún handler de interacción vuelva a
    // forzar layout por su cuenta. `rectLienzo()` conserva un fallback
    // a lectura directa solo por si algún llamador corriera antes de
    // la primera `medir()` — no debería pasar hoy (medir() se llama
    // al crear el mapa, antes de registrar ningún listener), pero es
    // más seguro que devolver `undefined`.
    var rectCache = null;

    function medir() {
      dpr = Math.min(DPR_MAX, Math.max(1, global.devicePixelRatio || 1));
      var rect = contenedor.getBoundingClientRect();
      rectCache = rect;
      viewport.ancho = rect.width;
      viewport.alto = rect.height;
      lienzo.width = Math.round(rect.width * dpr);
      lienzo.height = Math.round(rect.height * dpr);
      lienzo.style.width = rect.width + 'px';
      lienzo.style.height = rect.height + 'px';
    }

    function rectLienzo() {
      return rectCache || lienzo.getBoundingClientRect();
    }

    // BUG REAL corregido (auditoría navegación, 2026-08-02): rectCache
    // solo se refrescaba desde medir() — disparado por ResizeObserver
    // (cambios de TAMAÑO del contenedor) o por visibilitychange/
    // orientationchange. Pero getBoundingClientRect() es relativo al
    // VIEWPORT del navegador, no al documento: si la página hace scroll
    // (el mapa vive `position:relative` dentro del flujo normal, ver
    // css/mapa.css — no es fullscreen/fixed), rect.top/rect.left cambian
    // aunque el contenedor no cambie de tamaño, y ResizeObserver no
    // dispara por scroll. Con un rectCache desactualizado, TODO el
    // cálculo de coordenadas de pantalla→mundo (pellizco, zoom de rueda
    // anclado al cursor, hit-testing de click/hover) quedaba offseteado
    // por lo que la página hubiera scrolleado desde el último resize —
    // el punto que el usuario toca y el punto que el motor cree que
    // tocó dejan de coincidir. Caso más común de todos: el usuario
    // scrollea la página hasta el mapa y recién ahí empieza a tocarlo.
    // Fix: refrescar la posición (no el tamaño, no dpr, no el canvas —
    // eso sigue siendo trabajo exclusivo de medir()) al EMPEZAR cada
    // gesto (pointerdown, touchstart de un pellizco, primer wheel de
    // una ráfaga, pointerenter para hover de mouse), no en cada
    // move/frame — así se preserva el motivo original de la caché
    // (evitar forced reflow en CADA evento de un gesto en curso) y se
    // corrige el caso real que no cubría.
    function refrescarRect() {
      rectCache = contenedor.getBoundingClientRect();
    }

    var rafRedibujo = null;
    function redibujar() {
      if (!vivo || rafRedibujo !== null) return;
      rafRedibujo = requestAnimationFrame(function () { rafRedibujo = null; if (vivo) dibujar(); });
    }

    function dibujar() {
      if (!vivo || !viewport.ancho || !viewport.alto) return;
      try {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, viewport.ancho, viewport.alto);
        dibujarTiles();
        posicionarMarcadorUsuario();
        if (puntos.length === 0) {
          dibujarEstadoVacio();
        } else {
          var proyectados = proyectarPuntos();
          // PERF (auditoría performance, 2026-07-30): agruparEnClusters() es
          // O(n²) (comentario original en su definición) y ya existía
          // clustersActuales()/claveClusters/ultimosClusters exactamente
          // para no repetir ese trabajo cuando el viewport y el conjunto de
          // puntos no cambiaron entre frames — pero dibujar(), que es el
          // ÚNICO llamador real del loop de rAF (pan, zoom, inercia, ondas
          // de clic, aparición de marcador, spider — ver los ~10 puntos de
          // requestAnimationFrame de este archivo, todos terminan acá),
          // nunca lo usaba: llamaba a agruparEnClusters() directo, siempre,
          // incondicionalmente. El cache existía pero protegía al
          // consumidor equivocado (solo lo leía el hit-testing de hover,
          // clustersActuales() en buscarMarcadorEn()). Con el viewport
          // estático durante cualquier animación (onda de clic ~400ms,
          // aparición de marcador 220ms, spider), esto repetía el O(n²)
          // completo en cada uno de esos frames sin que ni `viewport` ni
          // los puntos hubieran cambiado un solo bit.
          var claveActual = clusteringVigente();
          var clusters;
          if (claveActual === claveClusters) {
            clusters = ultimosClusters;
          } else {
            clusters = agruparEnClusters(proyectados);
            ultimosClusters = clusters;
            claveClusters = claveActual;
          }
          dibujarMarcadores(clusters);
          dibujarSpider();
          posicionarPopupAbierto(proyectados, clusters);
          posicionarEtiqueta(proyectados);
        }
        dibujarOndas();
        dibujarBadgeDegradado();
        if (focoVisible) dibujarAnilloFoco();
        actualizarEstadoControles();
      } catch (err) {
        // Un frame roto no debería dejar el mapa muerto para el resto
        // de la sesión: se registra y se sigue intentando en el
        // próximo redibujar().
        if (global.console) console.error('URU_MOTOR_MAPA_RENDER: error al dibujar un frame — se omite.', err);
      }
    }

    function dibujarAnilloFoco() {
      ctx.save();
      ctx.strokeStyle = colorFoco;
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, Math.max(0, viewport.ancho - 4), Math.max(0, viewport.alto - 4));
      ctx.restore();
    }

    function actualizarEstadoControles() {
      if (btnZoomIn) {
        var enMax = viewport.zoom >= ZOOM_MAX - 0.001;
        btnZoomIn.disabled = enMax;
        btnZoomIn.setAttribute('aria-disabled', String(enMax));
      }
      if (btnZoomOut) {
        var enMin = viewport.zoom <= ZOOM_MIN + 0.001;
        btnZoomOut.disabled = enMin;
        btnZoomOut.setAttribute('aria-disabled', String(enMin));
      }
    }

    // BUG REAL corregido (reinicialización repetida): `cacheTiles` es un
    // caché a nivel de MÓDULO, compartido entre cualquier instancia que
    // haya pedido ese tile — no se limpia al destruir una instancia,
    // deliberadamente (otra instancia futura reutiliza tiles ya
    // descargados). Pero `entrada.onReady` guardaba el callback de
    // redibujo de la PRIMERA instancia que lo pidió, y `if (!entrada.
    // onReady)` nunca lo actualizaba después: si esa instancia se
    // destruía y una instancia nueva pedía el mismo tile todavía en
    // vuelo, la nueva instancia nunca se enteraba de que terminó de
    // cargar (quedaba con el hueco de fondo hasta el próximo redibujo
    // por otro motivo). Ahora se pisa siempre con el callback más
    // reciente — el único que puede importarle a alguien vivo.
    var degradacionTiles = false;
    var degradacionTilesPrevia = false;
    function dibujarTiles() {
      // Relleno base primero: así un tile que todavía no cargó, o que
      // falló definitivamente, nunca deja un hueco crudo — se ve el
      // fondo del mapa en su lugar.
      ctx.fillStyle = resolverVarCSS('--canvas-color-fondo-mapa', COLOR_FONDO_MAPA);
      ctx.fillRect(0, 0, viewport.ancho, viewport.alto);

      var zTiles = PROY.clamp(Math.round(viewport.zoom), ZOOM_MIN, ZOOM_MAX);
      var escalaExtra = Math.pow(2, viewport.zoom - zTiles);
      var centroMundo = PROY.proyectar(viewport.lat, viewport.lng, zTiles);
      var origenX = centroMundo.x - (viewport.ancho / 2) / escalaExtra;
      var origenY = centroMundo.y - (viewport.alto / 2) / escalaExtra;

      var tileX0 = Math.floor(origenX / TAM_TILE) - 1;
      var tileY0 = Math.floor(origenY / TAM_TILE) - 1;
      var tileX1 = Math.ceil((origenX + viewport.ancho / escalaExtra) / TAM_TILE) + 1;
      var tileY1 = Math.ceil((origenY + viewport.alto / escalaExtra) / TAM_TILE) + 1;

      var totalTiles = 0, tilesFallidos = 0;
      for (var tx = tileX0; tx <= tileX1; tx++) {
        for (var ty = tileY0; ty <= tileY1; ty++) {
          var entrada = cargarTile(zTiles, tx, ty);
          if (!entrada) continue;
          totalTiles++;
          var sx = (tx * TAM_TILE - origenX) * escalaExtra;
          var sy = (ty * TAM_TILE - origenY) * escalaExtra;
          var s = TAM_TILE * escalaExtra;
          if (entrada.cargado) {
            ctx.drawImage(entrada.img, sx, sy, s, s);
          } else {
            entrada.onReady = redibujar;
            if (entrada.error && entrada.intentos >= REINTENTOS_TILE) tilesFallidos++;
          }
        }
      }
      // ESTADO DEGRADADO REAL: no un solo tile suelto (una request
      // puede fallar por ruido de red sin que signifique nada), sino
      // una fracción sostenida del viewport visible sin poder cargar
      // tras agotar reintentos. El umbral de 4 tiles totales evita
      // falsos positivos con muy poca superficie de mapa en pantalla
      // (por ejemplo, un contenedor chico en un zoom alto).
      degradacionTiles = totalTiles >= 4 && (tilesFallidos / totalTiles) > 0.6;
      if (degradacionTiles !== degradacionTilesPrevia) {
        degradacionTilesPrevia = degradacionTiles;
        emisor.emitir(degradacionTiles ? 'tilesDegradados' : 'tilesRecuperados');
      }
    }

    // Insignia discreta, no bloqueante: comunica degradación sin
    // interrumpir pan/zoom/click, que siguen funcionando sobre el
    // relleno base. Se recalcula cada frame contra `degradacionTiles`,
    // así que desaparece sola en cuanto la red se recupera — sin
    // ningún estado que haya que "limpiar" a mano.
    function dibujarBadgeDegradado() {
      if (!degradacionTiles || viewport.ancho < 140) return;
      var texto = 'Conexión limitada al mapa';
      ctx.save();
      ctx.font = '600 11px "IBM Plex Sans", sans-serif';
      var anchoTexto = ctx.measureText(texto).width;
      var w = Math.min(viewport.ancho - 16, anchoTexto + 24);
      var h = 24;
      var x = 8, y = viewport.alto - h - 8;
      ctx.fillStyle = resolverVarCSS('--canvas-color-superficie-flotante', 'rgba(10,13,19,.78)');
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, 6); else ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.fillStyle = resolverVarCSS('--canvas-color-texto-pin', '#ECEDEF');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(texto, x + 10, y + h / 2 + 1, w - 16);
      ctx.restore();
    }

    // RENDIMIENTO REAL: `proyectarPuntos()` corre en CADA frame
    // dibujado (no solo cuando cambia el clustering — `dibujar()` la
    // llama directo, y `clustersActuales()` la llama cuando el
    // clustering está desactualizado). La versión anterior hacía
    // `.map().filter()`: dos arrays nuevos más un objeto literal por
    // punto, EN CADA frame, incluyendo un pan simple a 60fps con el
    // catálogo completo en pantalla. Con miles de redibujados por
    // sesión eso es presión de GC real, no cosmética — el recolector
    // de basura pausando el hilo principal es exactamente el tipo de
    // "stutter" que rompe la sensación de fluidez que esta pasada
    // busca. Se reemplaza por un buffer reutilizado entre frames: se
    // sobreescriben los mismos objetos en vez de crear otros nuevos, y
    // el array se trunca con `.length = n` en vez de descartarse.
    // Es seguro porque ningún consumidor retiene una referencia al
    // array o a sus objetos más allá del mismo tick en que se pidió
    // (se lee y se descarta dentro de `dibujar()`/`clustersActuales()`
    // — nunca se guarda en una variable de instancia ni se pasa a un
    // callback diferido).
    // ESTADO VACÍO REAL: antes, una lista de resultados vacía dejaba el
    // mapa mostrando solo tiles y ningún indicio de por qué no hay
    // pines — indistinguible de "todavía no cargó nada". Se muestra
    // solo después de que `establecerPuntos` se llamó al menos una vez
    // (así el primer montado del mapa, antes de la primera búsqueda
    // real, no parpadea este mensaje).
    function dibujarEstadoVacio() {
      if (!establecioAlgunaVez) return;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = resolverVarCSS('--canvas-color-texto-pin', '#ECEDEF');
      ctx.font = '600 13px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Sin lugares para mostrar en esta vista', viewport.ancho / 2, viewport.alto / 2);
      ctx.restore();
    }

    var bufferProyectados = [];
    function proyectarPuntos() {
      // PERF (auditoría performance, 2026-08-02): antes, cada llamada a
      // `PROY.puntoAPantalla(p.lat, p.lng, viewport)` volvía a proyectar
      // el CENTRO del viewport desde cero (Math.pow + Math.sin + Math.log)
      // — pero el centro y la escala son el mismo valor para los cientos
      // de puntos de esta misma llamada (mismo `viewport`, un solo
      // frame). Se calculan acá una única vez y se reutilizan para todos
      // los puntos — ver el parámetro opcional agregado a
      // `PROY.proyectar`/`PROY.puntoAPantalla` (proyeccion.js) para el
      // porqué es seguro y no cambia el resultado.
      var escala = PROY.escalaDeZoom(viewport.zoom);
      var centro = PROY.proyectar(viewport.lat, viewport.lng, viewport.zoom, escala);
      var n = 0;
      for (var i = 0; i < puntos.length; i++) {
        var p = puntos[i];
        var xy = PROY.puntoAPantalla(p.lat, p.lng, viewport, centro, escala);
        if (xy.x > -40 && xy.x < viewport.ancho + 40 && xy.y > -40 && xy.y < viewport.alto + 40) {
          var slot = bufferProyectados[n];
          if (!slot) { slot = bufferProyectados[n] = {}; }
          slot.punto = p; slot.x = xy.x; slot.y = xy.y;
          n++;
        }
      }
      bufferProyectados.length = n;
      return bufferProyectados;
    }

    // TIER 3.3 (Perf/UX, 2026-08-02) resolvía el lifecycle de este rAF
    // (auto-programado, se apagaba solo). PERF (auditoría performance,
    // 2026-08-03, hallazgo 1.1): ese lifecycle estaba bien, pero el
    // rAF en sí ya no hace falta — "acá estás vos" es un <div>
    // animado con @keyframes de CSS (uru-mapa-marcador-usuario__halo,
    // ver css/mapa.css), que el navegador anima solo en su compositor
    // sin que JS tenga que pedir un frame nuevo cada 16ms. El halo
    // sigue pulsando aunque nada más en el mapa cambie, sin volver a
    // ejecutar dibujar() para lograrlo — que es justo lo que costaba
    // caro (redibujaba tiles + todos los marcadores 60 veces/segundo
    // para animar un único punto decorativo).

    // Reemplaza a la vieja dibujarMarcadorUsuario() (canvas) — ver el
    // comentario de PERF junto a la creación de marcadorUsuarioEl más
    // arriba. Solo posiciona un <div> ya estilado por CSS; no dibuja
    // nada. Costo por llamada: dos proyecciones (PROY.proyectar +
    // PROY.puntoAPantalla), igual que antes — la diferencia real es
    // que esto ahora corre únicamente dentro de dibujar() cuando
    // dibujar() ya se estaba ejecutando por otra razón (pan, zoom,
    // datos nuevos), no en un rAF propio a 60fps.
    function posicionarMarcadorUsuario() {
      if (!usuarioMarcador) { marcadorUsuarioEl.hidden = true; return; }
      var escala = PROY.escalaDeZoom(viewport.zoom);
      var centro = PROY.proyectar(viewport.lat, viewport.lng, viewport.zoom, escala);
      var xy = PROY.puntoAPantalla(usuarioMarcador.lat, usuarioMarcador.lng, viewport, centro, escala);
      if (xy.x < -40 || xy.x > viewport.ancho + 40 || xy.y < -40 || xy.y > viewport.alto + 40) {
        marcadorUsuarioEl.hidden = true;
        return;
      }
      marcadorUsuarioEl.style.left = xy.x + 'px';
      marcadorUsuarioEl.style.top = xy.y + 'px';
      marcadorUsuarioEl.hidden = false;
    }

    // Clustering por grilla en espacio de pantalla: solo agrupa cuando
    // hay verdadero solapamiento visual, no por regla arbitraria de zoom.
    //
    // PERF (auditoría performance, 2026-08-02): el color dominante de
    // cada cluster (`colorDominante`/`esUnRubro`) se calcula ACÁ, una
    // sola vez por cluster, en el momento en que se arma — no en
    // `dibujarCluster()`. `agruparEnClusters()` ya está protegida por
    // `claveClusters`/`ultimosClusters` (ver `clustersActuales()` y
    // `dibujar()`): mientras el viewport y el conjunto de puntos no
    // cambien, el MISMO objeto de cluster se reutiliza frame tras
    // frame durante cualquier animación (onda de clic, aparición,
    // spider). Antes, `dibujarCluster()` volvía a recorrer los
    // miembros y reconstruir/ordenar el conteo de colores en CADA uno
    // de esos frames redibujados, sobre datos que no habían cambiado
    // un bit desde el frame anterior — trabajo puramente repetido.
    function calcularColorCluster(miembros) {
      var conteo = Object.create(null);
      for (var i = 0; i < miembros.length; i++) {
        var col = colorSeguro(miembros[i] && miembros[i].color);
        conteo[col] = (conteo[col] || 0) + 1;
      }
      var colores = Object.keys(conteo).sort(function (a, b) { return conteo[b] - conteo[a]; });
      return { colorDominante: colores[0], esUnRubro: colores.length === 1 };
    }

    // PERF (auditoría performance, 2026-08-02, segunda revisión):
    // `agruparEnClusters` NO está protegida por el cache de
    // `claveClusters` frente a sí misma — es justamente lo que ese
    // cache evita volver a llamar cuando el viewport no cambió, pero
    // durante cualquier pan/zoom/inercia CONTINUOS el viewport cambia
    // en cada frame, así que esta función sí corre a razón de 1 vez
    // por frame en el caso de uso más común de todo el mapa (arrastrar
    // o pellizcar). Antes, cada cluster de 2+ miembros pagaba DOS
    // `.reduce()` más un `.map()` — tres closures nuevas y tres
    // recorridos separados del mismo `grupo` — para calcular centro y
    // extraer miembros. Se reemplaza por un único loop plano que hace
    // las tres cosas en un solo recorrido, sin closures por cluster.
    function agruparEnClusters(proyectados) {
      var usados = new Array(proyectados.length);
      var resultado = [];
      for (var i = 0; i < proyectados.length; i++) {
        if (usados[i]) continue;
        var grupo = [proyectados[i]];
        usados[i] = true;
        for (var j = i + 1; j < proyectados.length; j++) {
          if (usados[j]) continue;
          var dx = proyectados[i].x - proyectados[j].x;
          var dy = proyectados[i].y - proyectados[j].y;
          if (Math.sqrt(dx * dx + dy * dy) < RADIO_CLUSTER_PX) { grupo.push(proyectados[j]); usados[j] = true; }
        }
        if (grupo.length === 1) {
          resultado.push({ tipo: 'punto', x: grupo[0].x, y: grupo[0].y, punto: grupo[0].punto });
        } else {
          var sumX = 0, sumY = 0, miembros = new Array(grupo.length);
          for (var k = 0; k < grupo.length; k++) {
            sumX += grupo[k].x;
            sumY += grupo[k].y;
            miembros[k] = grupo[k].punto;
          }
          var colorInfo = calcularColorCluster(miembros);
          resultado.push({
            tipo: 'cluster', x: sumX / grupo.length, y: sumY / grupo.length, miembros: miembros,
            colorDominante: colorInfo.colorDominante, esUnRubro: colorInfo.esUnRubro
          });
        }
      }
      return resultado;
    }

    // PERF (auditoría performance, 2026-08-02, segunda revisión):
    // `forEach` con una función inline recreaba esa closure en CADA
    // llamada a `dibujarMarcadores` — es decir, en cada frame
    // dibujado, sin excepción (a diferencia de `agruparEnClusters`,
    // esta función no tiene ningún cache que la salte). Un loop plano
    // hace exactamente lo mismo sin asignar una función nueva por
    // frame.
    function dibujarMarcadores(clusters) {
      var visiblesEsteFrame = Object.create(null);
      var reducido = prefiereMovimientoReducido();
      var hayNuevos = false;
      for (var i = 0; i < clusters.length; i++) {
        var c = clusters[i];
        if (c.tipo === 'cluster') { dibujarCluster(c); continue; }
        var id = c.punto.id;
        visiblesEsteFrame[id] = true;
        if (!reducido && visiblesFramePrevio[id] === undefined && apariciones[id] === undefined) {
          // No es el primer frame del mapa entero (huellaListaPrevia ya
          // se habría poblado) y el punto no estaba en el frame
          // anterior: es una aparición real, no el dibujado inicial en
          // frío, que se ve mejor a tamaño completo desde el primer
          // frame en vez de animar 220ms antes de mostrar el estado
          // inicial del mapa.
          if (huboFramePrevioConPuntos) { apariciones[id] = performance.now(); hayNuevos = true; }
        }
        var esResaltado = id === idResaltado;
        var esAbierto = id === idAbierto;
        dibujarMarcador(c.x, c.y, c.punto, esResaltado || esAbierto, reducido ? 1 : factorAparicion(id));
      }
      visiblesFramePrevio = visiblesEsteFrame;
      huboFramePrevioConPuntos = true;
      if (hayNuevos) seguirApariciones();
    }
    var huboFramePrevioConPuntos = false;

    // Pin con forma de gota — silueta reconocible de "lugar en un mapa",
    // no una bolita genérica. El color codifica el rubro (ver
    // rubros-meta.js) para que de un vistazo se distinga qué es qué,
    // igual que la franja de color de la etiqueta de rubro en las
    // tarjetas. Además de color, la ventana central lleva el
    // pictograma del rubro (antes una inicial de letra): el color
    // solo no alcanza (dos rubros pueden quedar parecidos en un mapa
    // oscuro, y no es accesible para daltonismo) — el ícono es un
    // segundo canal de distinción que no depende del color, y además
    // se reconoce más rápido que una letra sola.
    // PERF (auditoría rendimiento, ronda 1, hallazgo 1): antes, cada
    // pin reconstruía su path completo, creaba un createLinearGradient
    // NUEVO y aplicaba shadowBlur en CADA frame dibujado — con N
    // marcadores visibles, eso es O(N) creaciones de gradiente + N
    // blurs de sombra, 60 veces por segundo, durante todo el gesto de
    // pan/pellizco/inercia. shadowBlur es una de las operaciones más
    // caras de Canvas 2D (en muchos motores cae a blur por software,
    // sin aceleración GPU).
    //
    // La combinación color × activo × ícono-de-rubro × favorito × dpr
    // es finita y chica (~14 rubros × 2 × 2 × 2 × 1 dpr efectivo por
    // sesión): se pre-renderiza cada variante UNA sola vez en un
    // <canvas> offscreen, con su gradiente y su sombra ya "horneados",
    // y de ahí en más cada frame hace un único `drawImage` (composición
    // GPU barata) en vez de reconstruir path+gradiente+shadow. El halo
    // de "activo" (fill simple sin gradiente/sombra, y cuyo radio ya
    // varía con r) y la transformación de aparición (fade+scale) siguen
    // aplicándose en el ctx principal, fuera del sprite cacheado.
    var SPRITE_MARCADOR_ORIGEN_X = 40;
    var SPRITE_MARCADOR_ORIGEN_Y = 44;
    var SPRITE_MARCADOR_ANCHO = 80;
    var SPRITE_MARCADOR_ALTO = 84;
    var CACHE_SPRITE_MARCADOR = Object.create(null);
    var CACHE_SPRITE_MARCADOR_MAX = 300; // tope defensivo: el catálogo real de variantes es ~decenas, no cientos

    function obtenerSpriteMarcador(color, activo, punto, dprActual) {
      var pathD = punto && punto.rubroIcono;
      var iconoClave = pathD ? pathD : ((punto && punto.rubroNombre) ? ('L:' + String(punto.rubroNombre).trim().charAt(0).toUpperCase()) : '');
      var esFavorito = !!(punto && punto.esFavorito);
      var clave = color + '|' + (activo ? 1 : 0) + '|' + iconoClave + '|' + (esFavorito ? 1 : 0) + '|' + dprActual;
      var cacheado = CACHE_SPRITE_MARCADOR[clave];
      if (cacheado) return cacheado;

      var claves = Object.keys(CACHE_SPRITE_MARCADOR);
      if (claves.length > CACHE_SPRITE_MARCADOR_MAX) {
        // No debería pasar en operación normal (ver comentario arriba),
        // pero si el catálogo de rubros/colores creciera mucho, mejor
        // vaciar la caché que dejarla crecer sin techo.
        CACHE_SPRITE_MARCADOR = Object.create(null);
      }

      var r = activo ? RADIO_MARCADOR + 2.5 : RADIO_MARCADOR;
      var off = document.createElement('canvas');
      off.width = Math.round(SPRITE_MARCADOR_ANCHO * dprActual);
      off.height = Math.round(SPRITE_MARCADOR_ALTO * dprActual);
      var octx = off.getContext('2d');
      octx.setTransform(dprActual, 0, 0, dprActual, 0, 0);
      octx.translate(SPRITE_MARCADOR_ORIGEN_X, SPRITE_MARCADOR_ORIGEN_Y);
      pintarCuerpoMarcador(octx, r, activo, punto, color);

      var entrada = { canvas: off };
      CACHE_SPRITE_MARCADOR[clave] = entrada;
      return entrada;
    }

    // Cuerpo completo del pin (gota + gradiente + sombra + ventana +
    // pictograma + insignia de favorito), parametrizado por `ctxD` para
    // poder dibujarse tanto en el canvas principal como en el offscreen
    // del sprite cacheado. Asume que `ctxD` ya está trasladado al
    // origen local del marcador (0,0) — no traslada por su cuenta.
    function pintarCuerpoMarcador(ctxD, r, activo, punto, color) {
      ctxD.beginPath();
      // Cabeza circular del pin + punta triangular hacia abajo
      ctxD.arc(0, -r * 0.35, r, Math.PI * 0.08, Math.PI * 0.92, true);
      ctxD.lineTo(0, r * 1.55);
      ctxD.closePath();
      var grad = ctxD.createLinearGradient(0, -r * 1.3, 0, r * 1.55);
      grad.addColorStop(0, aclarar(color, 18));
      grad.addColorStop(1, color);
      ctxD.fillStyle = grad;
      ctxD.shadowColor = resolverVarCSS('--canvas-color-sombra-marcador', 'rgba(0,0,0,.45)');
      ctxD.shadowBlur = activo ? 10 : 5;
      ctxD.shadowOffsetY = 2;
      ctxD.fill();
      ctxD.shadowColor = 'transparent';
      ctxD.lineWidth = activo ? 2.5 : 2;
      ctxD.strokeStyle = resolverVarCSS('--canvas-color-texto-pin', '#ECEDEF');
      ctxD.stroke();
      // Centro claro: hace de "ventana" del pin, referencia visual de
      // mapas profesionales (Google/Apple Maps usan el mismo recurso)
      var rVentana = r * RATIO_VENTANA;
      ctxD.beginPath();
      ctxD.arc(0, -r * 0.35, rVentana, 0, Math.PI * 2);
      ctxD.fillStyle = resolverVarCSS('--canvas-color-cluster-fondo', '#0A0D13');
      ctxD.fill();
      // Pictograma del rubro dentro de la ventana — segundo canal de
      // distinción además del color (dos rubros pueden quedar
      // parecidos en un mapa oscuro, y el color solo no es accesible
      // para daltonismo).
      dibujarPictogramaRubro(ctxD, punto, r, rVentana, color);
      // TIER 3.2 — auditoría (UX, 2026-08-02): insignia de favorito.
      // Se dibuja DESPUÉS del pictograma de rubro (encima, no debajo)
      // y fuera del área de la ventana central — así nunca tapa el
      // ícono que ya identifica el rubro, que sigue siendo el canal
      // principal de lectura del pin.
      if (punto && punto.esFavorito) {
        var xIns = r * 0.62, yIns = -r * 0.35 - r * 0.62;
        ctxD.beginPath();
        ctxD.arc(xIns, yIns, r * 0.34, 0, Math.PI * 2);
        ctxD.fillStyle = resolverVarCSS('--canvas-color-favorito', '#C97A83');
        ctxD.shadowColor = resolverVarCSS('--canvas-color-sombra-marcador', 'rgba(0,0,0,.45)');
        ctxD.shadowBlur = 3;
        ctxD.fill();
        ctxD.shadowColor = 'transparent';
        ctxD.lineWidth = 1.4;
        ctxD.strokeStyle = resolverVarCSS('--canvas-color-texto-pin', '#ECEDEF');
        ctxD.stroke();
        ctxD.fillStyle = resolverVarCSS('--canvas-color-texto-pin', '#ECEDEF');
        ctxD.font = '700 ' + Math.round(r * 0.42) + 'px "IBM Plex Sans", sans-serif';
        ctxD.textAlign = 'center';
        ctxD.textBaseline = 'middle';
        ctxD.fillText('★', xIns, yIns + 0.5);
      }
    }

    function dibujarMarcador(x, y, punto, activo, factorEntrada) {
      var color = colorSeguro(punto && punto.color);
      var r = activo ? RADIO_MARCADOR + 2.5 : RADIO_MARCADOR;
      var f = factorEntrada === undefined ? 1 : factorEntrada;
      ctx.save();
      if (f < 1) {
        // easeOutCubic manual (evitar la dependencia de la función de
        // animación de vuelo, que vive más abajo en el archivo y está
        // pensada para t de 0 a 1 sobre coordenadas geográficas, no
        // sobre una escala de dibujo): entra "creciendo un poco de
        // más" y asentando, en vez de una interpolación lineal que se
        // percibe mecánica.
        var e = 1 - Math.pow(1 - f, 3);
        ctx.globalAlpha = e;
        ctx.translate(x, y);
        ctx.scale(0.5 + e * 0.5, 0.5 + e * 0.5);
        ctx.translate(-x, -y);
      }
      if (activo) {
        ctx.beginPath();
        ctx.arc(x, y, r + 9, 0, Math.PI * 2);
        ctx.fillStyle = hexARgba(color, 0.22);
        ctx.fill();
      }
      var sprite = obtenerSpriteMarcador(color, activo, punto, dpr);
      ctx.drawImage(
        sprite.canvas,
        x - SPRITE_MARCADOR_ORIGEN_X,
        y - SPRITE_MARCADOR_ORIGEN_Y,
        SPRITE_MARCADOR_ANCHO,
        SPRITE_MARCADOR_ALTO
      );
      ctx.restore();
    }

    // Dibuja el pictograma vectorial de rubros-meta.js dentro de la
    // ventana del pin. Un solo `d` (mismo string que consume el <svg>
    // del lado DOM vía URU_RUBROS_ICONO_SVG) se reutiliza acá tal
    // cual con Path2D — sin duplicar la geometría del ícono en dos
    // formatos ni depender de una librería de íconos.
    // Si el punto no trae `rubroIcono` (rubro nuevo que todavía no
    // tiene pictograma cargado en rubros-meta.js), se cae de nuevo a
    // la inicial de letra: el pin nunca queda con la ventana vacía.
    // Recibe `ctxD` para poder dibujarse tanto en el canvas principal
    // como en el offscreen del sprite cacheado (ver hallazgo 1).
    function dibujarPictogramaRubro(ctxD, punto, r, rVentana, color) {
      var pathD = punto && punto.rubroIcono;
      if (pathD) {
        var escala = (rVentana * 2 * ICONO_MARGEN) / ICONO_VIEWBOX;
        ctxD.save();
        ctxD.translate(0, -r * 0.35);
        ctxD.scale(escala, escala);
        ctxD.translate(-ICONO_VIEWBOX / 2, -ICONO_VIEWBOX / 2);
        ctxD.lineWidth = ICONO_GROSOR;
        ctxD.lineCap = 'round';
        ctxD.lineJoin = 'round';
        ctxD.strokeStyle = color;
        ctxD.stroke(obtenerPath2D(pathD));
        ctxD.restore();
        return;
      }
      if (punto && punto.rubroNombre) {
        var inicial = String(punto.rubroNombre).trim().charAt(0).toUpperCase();
        ctxD.fillStyle = color;
        ctxD.font = '700 ' + Math.round(rVentana * 1.05) + 'px "IBM Plex Sans", sans-serif';
        ctxD.textAlign = 'center';
        ctxD.textBaseline = 'middle';
        ctxD.fillText(inicial, 0, -r * 0.35 + 0.5);
      }
    }

    function hexARgba(hex, alpha) {
      var c = rgbDe(hex);
      return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
    }
    function aclarar(hex, pct) {
      var c = rgbDe(hex);
      var r = Math.min(255, c.r + pct * 2.55), g = Math.min(255, c.g + pct * 2.55), b = Math.min(255, c.b + pct * 2.55);
      return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
    }

    // Antes: todo cluster era el mismo círculo bordó, sin importar qué
    // rubros agrupaba — indistinguible de otro cluster, y del resto de
    // los pines. Ahora el cluster hereda el color de los rubros que
    // agrupa: si todos sus miembros son del mismo rubro, se rellena con
    // ese color (mismo código que un pin individual); si mezcla rubros,
    // se deja neutro pero con el borde en el color dominante, para que
    // "mixto" también se lea de un vistazo en vez de camuflarse.
    // PERF (auditoría rendimiento, ronda 1, hallazgo 1): mismo problema
    // y misma solución que dibujarMarcador — halo + gradiente radial +
    // shadowBlur se reconstruían enteros en CADA frame por cada cluster
    // visible. El círculo (halo+gradiente+sombra+borde) depende de un
    // set finito y chico de variantes (color dominante × esUnRubro ×
    // esResaltado × dpr), así que se pre-renderiza una vez por variante
    // en un offscreen y de ahí en más es un solo `drawImage`. El número
    // de miembros SÍ varía por cluster individual (no tiene sentido
    // cachearlo, cambiaría la clave en cada recuento distinto), así que
    // se sigue dibujando aparte encima del sprite con un `fillText`
    // simple — sin gradiente ni sombra, es barato y no vale la pena
    // meterlo en el sprite cacheado.
    var SPRITE_CLUSTER_ORIGEN = 37;
    var SPRITE_CLUSTER_LADO = 74;
    var CACHE_SPRITE_CLUSTER = Object.create(null);
    var CACHE_SPRITE_CLUSTER_MAX = 100; // variantes reales: colores de rubro × 2 (esUnRubro) × 2 (resaltado), un puñado

    function obtenerSpriteCluster(colorDominante, esUnRubro, esResaltado, dprActual) {
      var clave = colorDominante + '|' + (esUnRubro ? 1 : 0) + '|' + (esResaltado ? 1 : 0) + '|' + dprActual;
      var cacheado = CACHE_SPRITE_CLUSTER[clave];
      if (cacheado) return cacheado;

      if (Object.keys(CACHE_SPRITE_CLUSTER).length > CACHE_SPRITE_CLUSTER_MAX) {
        CACHE_SPRITE_CLUSTER = Object.create(null);
      }

      var r = RADIO_CLUSTER;
      var rGlow = r + (esResaltado ? 11 : 7);
      var off = document.createElement('canvas');
      off.width = Math.round(SPRITE_CLUSTER_LADO * dprActual);
      off.height = Math.round(SPRITE_CLUSTER_LADO * dprActual);
      var octx = off.getContext('2d');
      octx.setTransform(dprActual, 0, 0, dprActual, 0, 0);
      var ox = SPRITE_CLUSTER_ORIGEN, oy = SPRITE_CLUSTER_ORIGEN;

      // Halo de luz detrás del cluster — sin esto el círculo quedaba
      // plano contra el tile pálido del basemap y se perdía. Con el
      // halo, el mismo cluster "flota" sobre el mapa.
      octx.beginPath();
      octx.arc(ox, oy, rGlow, 0, Math.PI * 2);
      octx.fillStyle = hexARgba(colorDominante, esResaltado ? 0.35 : 0.22);
      octx.fill();

      octx.beginPath();
      octx.arc(ox, oy, r, 0, Math.PI * 2);
      var gradCluster = octx.createRadialGradient(ox - r * 0.3, oy - r * 0.3, 1, ox, oy, r);
      if (esUnRubro) {
        gradCluster.addColorStop(0, aclarar(colorDominante, 22));
        gradCluster.addColorStop(1, colorDominante);
      } else {
        gradCluster.addColorStop(0, resolverVarCSS('--canvas-color-cluster-mixto-inicio', 'rgba(32,38,50,.96)'));
        gradCluster.addColorStop(1, resolverVarCSS('--canvas-color-cluster-mixto-fin', 'rgba(14,17,24,.96)'));
      }
      octx.fillStyle = gradCluster;
      octx.shadowColor = resolverVarCSS('--canvas-color-sombra-marcador', 'rgba(0,0,0,.4)');
      octx.shadowBlur = 6;
      octx.shadowOffsetY = 1;
      octx.fill();
      octx.shadowColor = 'transparent';
      octx.lineWidth = 2.5;
      octx.strokeStyle = esUnRubro ? resolverVarCSS('--canvas-color-texto-pin', '#ECEDEF') : colorDominante;
      octx.stroke();

      var entrada = { canvas: off };
      CACHE_SPRITE_CLUSTER[clave] = entrada;
      return entrada;
    }

    // Antes: todo cluster era el mismo círculo bordó, sin importar qué
    // rubros agrupaba — indistinguible de otro cluster, y del resto de
    // los pines. Ahora el cluster hereda el color de los rubros que
    // agrupa: si todos sus miembros son del mismo rubro, se rellena con
    // ese color (mismo código que un pin individual); si mezcla rubros,
    // se deja neutro pero con el borde en el color dominante, para que
    // "mixto" también se lea de un vistazo en vez de camuflarse.
    function dibujarCluster(c) {
      var colorDominante = c.colorDominante;
      var esUnRubro = c.esUnRubro;
      var esResaltado = clusterResaltadoKey === (Math.round(c.x) + ':' + Math.round(c.y));

      var sprite = obtenerSpriteCluster(colorDominante, esUnRubro, esResaltado, dpr);
      ctx.drawImage(
        sprite.canvas,
        c.x - SPRITE_CLUSTER_ORIGEN,
        c.y - SPRITE_CLUSTER_ORIGEN,
        SPRITE_CLUSTER_LADO,
        SPRITE_CLUSTER_LADO
      );

      ctx.fillStyle = esUnRubro ? resolverVarCSS('--canvas-color-cluster-fondo', '#0A0D13') : resolverVarCSS('--canvas-color-texto-pin', '#ECEDEF');
      ctx.font = '700 12px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(c.miembros.length), c.x, c.y + 1);
    }

    // Radio del primer anillo del abanico, separación entre anillos si
    // hace falta más de uno, y cuántas piernas caben cómodas en un
    // solo anillo sin que los pines se toquen entre sí (calibrado
    // contra RADIO_MARCADOR: con 8 piernas en el primer anillo, el
    // espacio entre pines vecinos es cómodamente mayor a su diámetro).
    var SPIDER_RADIO_BASE = 34;
    var SPIDER_RADIO_PASO = 26;
    var SPIDER_MAX_POR_ANILLO = 8;
    // Por encima de esta cantidad de miembros, un abanico deja de ser
    // más legible que la lista de texto (demasiadas piernas cortas y
    // pines superpuestos) — la lista (abrirPopupCluster) sigue siendo
    // el mejor recurso para esos casos, igual que antes de esta pasada.
    var SPIDER_MAX_MIEMBROS = 14;
    var DURACION_SPIDER_MS = 240;

    function claveCluster(c) { return Math.round(c.x) + ':' + Math.round(c.y); }

    function calcularPosicionesSpider(c) {
      var n = c.miembros.length;
      var posiciones = new Array(n);
      for (var i = 0; i < n; i++) {
        var anillo = Math.floor(i / SPIDER_MAX_POR_ANILLO);
        var idxEnAnillo = i % SPIDER_MAX_POR_ANILLO;
        var totalEnEsteAnillo = Math.min(SPIDER_MAX_POR_ANILLO, n - anillo * SPIDER_MAX_POR_ANILLO);
        var angulo = (idxEnAnillo / totalEnEsteAnillo) * Math.PI * 2 - Math.PI / 2;
        var radio = SPIDER_RADIO_BASE + anillo * SPIDER_RADIO_PASO;
        posiciones[i] = {
          punto: c.miembros[i],
          x: c.x + Math.cos(angulo) * radio,
          y: c.y + Math.sin(angulo) * radio
        };
      }
      return posiciones;
    }

    function abrirSpider(c) {
      cerrarPopup();
      spiderActivo = { key: claveCluster(c), cx: c.x, cy: c.y, posiciones: calcularPosicionesSpider(c), inicio: performance.now() };
      if (prefiereMovimientoReducido()) redibujar(); else animarSpider();
    }
    function cerrarSpider() {
      if (!spiderActivo) return;
      spiderActivo = null;
      redibujar();
    }
    function animarSpider() {
      if (rafSpider !== null) return;
      rafSpider = requestAnimationFrame(function () {
        rafSpider = null;
        if (!vivo || !spiderActivo) return;
        redibujar();
        var t = (performance.now() - spiderActivo.inicio) / DURACION_SPIDER_MS;
        if (t < 1) animarSpider();
      });
    }
    // Piernas del abanico (líneas finas centro→pin) + los pines
    // individuales, dibujados encima del cluster que sigue actuando de
    // "eje" visual del abanico — mismo recurso que usan Leaflet/Google
    // Maps: el cluster no desaparece, se queda como centro de anclaje.
    function dibujarSpider() {
      if (!spiderActivo) return;
      var t = prefiereMovimientoReducido() ? 1 : Math.min(1, (performance.now() - spiderActivo.inicio) / DURACION_SPIDER_MS);
      var e = easeOutCubic(t);
      ctx.save();
      ctx.strokeStyle = resolverVarCSS('--canvas-color-trazo-conexion', 'rgba(236,237,239,.55)');
      ctx.lineWidth = 1.5;
      spiderActivo.posiciones.forEach(function (pos) {
        var px = spiderActivo.cx + (pos.x - spiderActivo.cx) * e;
        var py = spiderActivo.cy + (pos.y - spiderActivo.cy) * e;
        pos._xActual = px; pos._yActual = py;
        ctx.beginPath();
        ctx.moveTo(spiderActivo.cx, spiderActivo.cy);
        ctx.lineTo(px, py);
        ctx.stroke();
      });
      ctx.restore();
      spiderActivo.posiciones.forEach(function (pos) {
        var esResaltado = pos.punto.id === idResaltado || pos.punto.id === idAbierto;
        dibujarMarcador(pos._xActual, pos._yActual, pos.punto, esResaltado, e);
      });
    }

    /* ── Interacción: pan + zoom (mouse, touch, rueda, teclado) ── */
    var arrastrando = false, ultimoX = 0, ultimoY = 0, sePanneo = false;
    var pointerActivoId = null; // solo un puntero controla el pan a la vez

    // PERF (auditoría performance, C1.3): mismo mecanismo de
    // supresión de backdrop-filter que usa app.js para el scroll de
    // la lista, aplicado acá al arrastre del mapa — el panel de la
    // ficha/toolbar con vidrio queda encima del canvas del mapa, así
    // que cada frame de arrastre repetía el mismo costo de
    // recomposición. A diferencia del scroll (que usa rAF + timeout
    // de "fin de inercia"), acá el propio estado `arrastrando` ya
    // marca inicio/fin de forma exacta, así que alcanza con un
    // toggle directo de la clase en cada transición.
    function establecerArrastrando(valor) {
      arrastrando = valor;
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.classList.toggle('u-suprimir-vidrio', valor);
      }
      actualizarEstadoGesto();
    }

    // PERF (auditoría rendimiento, ronda 1, hallazgo 2): el motor
    // ambiental (ambiente-scheduler.js) corría sus tareas decorativas
    // en cada frame visible sin ninguna noción de que el mapa está en
    // medio de un gesto activo — dos loops de rAF competían por el
    // mismo frame budget de 16ms justo en el peor momento (dedo en la
    // pantalla arrastrando o pellizcando). Este archivo es el único
    // que sabe con exactitud cuándo un gesto (arrastre, pellizco,
    // inercia o vuelo animado) empieza y termina — se agregan esas 4
    // señales en un solo booleano y, SOLO en cada transición real (no
    // en cada frame), se avisa al scheduler ambiental para que salte
    // sus tareas mientras dure. Cero cambio funcional visible: son
    // animaciones decorativas de fondo, nadie percibe perder 200-400ms
    // de ellas durante un arrastre activo.
    var gestoActivo = false;
    function actualizarEstadoGesto() {
      var activo = arrastrando || enPellizco || inerciaRAF !== null || animacionZoom !== null;
      if (activo === gestoActivo) return;
      gestoActivo = activo;
      // PERF (auditoría rendimiento, ronda 1, hallazgo 5): will-change
      // solo debe existir mientras dura el gesto (ver css/mapa.css,
      // .uru-mapa.u-mapa-en-gesto) — dejarlo permanente es
      // contraproducente en memoria de GPU en gama baja. Mismo
      // booleano de transición que ya gobierna la pausa del motor
      // ambiental, así que no hace falta un segundo mecanismo de
      // detección de gesto.
      contenedor.classList.toggle('u-mapa-en-gesto', activo);
      if (global.AmbienteScheduler) {
        if (activo) global.AmbienteScheduler.pausar(); else global.AmbienteScheduler.reanudar();
      }
      emisor.emitir(activo ? 'gestoIniciado' : 'gestoFinalizado');
    }

    // Mismo patrón que establecerArrastrando (arriba): centraliza la
    // asignación de `enPellizco` para que ningún punto de asignación
    // futuro se olvide de avisar el cambio de estado de gesto.
    function establecerEnPellizco(valor) {
      enPellizco = valor;
      actualizarEstadoGesto();
    }

    // ── Inercia de arrastre (momentum) ──
    // GAP REAL DE PRODUCTO: al soltar el dedo/mouse en pleno arrastre,
    // el mapa se detenía en seco — funcional, pero se siente "pesado"
    // comparado con cualquier mapa o lista con scroll nativo, donde el
    // contenido sigue deslizando y frena solo. Se guarda una ventana
    // corta de las últimas muestras de movimiento (tiempo + delta) y,
    // al soltar, se estima la velocidad instantánea real (no el
    // promedio de todo el gesto, que diluiría un frenado intencional
    // justo antes de soltar) para decidir si vale la pena seguir
    // deslizando y con cuánta fuerza.
    var MUESTRAS_INERCIA_MAX = 6;
    var muestrasMovimiento = [];
    var inerciaRAF = null;
    function registrarMuestra(x, y) {
      var ahora = performance.now();
      muestrasMovimiento.push({ t: ahora, x: x, y: y });
      if (muestrasMovimiento.length > MUESTRAS_INERCIA_MAX) muestrasMovimiento.shift();
    }
    function cancelarInercia() {
      if (inerciaRAF !== null) { cancelAnimationFrame(inerciaRAF); inerciaRAF = null; actualizarEstadoGesto(); }
    }
    function iniciarInercia() {
      if (prefiereMovimientoReducido() || muestrasMovimiento.length < 2) return;
      var reciente = muestrasMovimiento[muestrasMovimiento.length - 1];
      // Se busca la muestra más vieja dentro de los últimos 80ms: una
      // ventana corta refleja el gesto real al soltar, no el arrastre
      // completo (que puede haber sido lento al principio y rápido al
      // final, o viceversa).
      var base = reciente;
      for (var i = muestrasMovimiento.length - 2; i >= 0; i--) {
        base = muestrasMovimiento[i];
        if (reciente.t - base.t >= 80) break;
      }
      var dt = reciente.t - base.t;
      if (dt <= 0) return;
      var vx = (reciente.x - base.x) / dt; // px/ms
      var vy = (reciente.y - base.y) / dt;
      var velocidad = Math.sqrt(vx * vx + vy * vy);
      if (velocidad < 0.04) return; // gesto casi estático al soltar: no vale la pena animar
      // Techo de velocidad: un pellizco/arrastre muy brusco no debería
      // catapultar el mapa a un pan absurdamente largo.
      var TECHO_V = 2.2;
      if (velocidad > TECHO_V) { vx = vx / velocidad * TECHO_V; vy = vy / velocidad * TECHO_V; }
      var FRICCION = 0.0022; // px/ms perdidos por ms — calibra distancia y duración del deslizamiento
      function paso(ahora, previo) {
        if (!vivo) { inerciaRAF = null; actualizarEstadoGesto(); return; }
        var dtPaso = previo ? ahora - previo : 16;
        var factor = Math.max(0, 1 - FRICCION * dtPaso * 12);
        vx *= factor; vy *= factor;
        var v = Math.sqrt(vx * vx + vy * vy);
        if (v < 0.02) { inerciaRAF = null; actualizarEstadoGesto(); return; }
        var c0 = PROY.proyectar(viewport.lat, viewport.lng, viewport.zoom);
        var nuevo = PROY.desproyectar(c0.x - vx * dtPaso, c0.y - vy * dtPaso, viewport.zoom);
        viewport.lat = nuevo.lat; viewport.lng = nuevo.lng;
        redibujar();
        inerciaRAF = requestAnimationFrame(function (t) { paso(t, ahora); });
      }
      inerciaRAF = requestAnimationFrame(function (t) { paso(t, null); });
      actualizarEstadoGesto();
    }

    lienzo.addEventListener('pointerdown', function (e) {
      if (pointerActivoId !== null) return; // ya hay otro dedo/puntero arrastrando — el pellizco se maneja aparte
      refrescarRect();
      cancelarInercia();
      pointerActivoId = e.pointerId;
      establecerArrastrando(true); sePanneo = false;
      ultimoX = e.clientX; ultimoY = e.clientY;
      muestrasMovimiento = [];
      registrarMuestra(e.clientX, e.clientY);
      lienzo.setPointerCapture(e.pointerId);
      lienzo.style.cursor = 'grabbing';
    });
    lienzo.addEventListener('pointerenter', function () { refrescarRect(); });
    lienzo.addEventListener('pointermove', function (e) {
      // Durante la continuación táctil de un pan con un solo dedo tras
      // soltar uno de los dos de un pellizco (ver touchend más abajo),
      // el movimiento real ya lo aplica ese código con Touch Events
      // puros — procesar acá el mismo gesto como "hover" produciría un
      // resaltado que titila mientras el mapa se mueve por otro lado.
      if (panTactilUnico) return;
      // BUG REAL corregido: un pellizco de 2 dedos se maneja con Touch
      // Events (ver alTouchstartContenedor/alTouchmoveContenedor), pero
      // el navegador SIGUE disparando Pointer Events por cada dedo
      // individual mientras el pellizco está en curso — el dedo que
      // queda apoyado genera `pointermove` reales sobre este `lienzo`.
      // `alTouchstartContenedor` ya pone `arrastrando = false` y
      // `pointerActivoId = null` al empezar el pellizco (para cederle
      // el control), pero sin este chequeo de `enPellizco` esos
      // `pointermove` del dedo apoyado caían derecho en la rama de
      // hover de abajo: hit-testing contra marcadores usando la
      // posición del dedo como si fuera un cursor de mouse, con
      // `emisor.emitir('hover'/'hoverOut', ...)` real hacia app.js
      // (resalta una tarjeta del panel, dispara el Ambient Engine)
      // en medio de un gesto que no tiene nada que ver con hover —
      // más un recálculo de clustering redundante (procesarHoverPendiente
      // → clustersActuales() invalida su caché en cada frame porque el
      // propio pellizco ya cambió viewport.zoom/lat/lng ese mismo tick),
      // justo el gesto más sensible a rendimiento en un dispositivo
      // táctil. Se suspende también acá, mismo criterio que ya se
      // aplica a `arrastrando`/`panTactilUnico`.
      if (enPellizco) return;
      if (arrastrando) {
        if (e.pointerId !== pointerActivoId) return; // ignorar punteros secundarios mientras se arrastra
        var dx = e.clientX - ultimoX, dy = e.clientY - ultimoY;
        var umbral = umbralDrag(e.pointerType);
        if (Math.abs(dx) > umbral || Math.abs(dy) > umbral) { sePanneo = true; ultimoTapTiempo = 0; cerrarSpider(); }
        ultimoX = e.clientX; ultimoY = e.clientY;
        registrarMuestra(e.clientX, e.clientY);
        var c0 = PROY.proyectar(viewport.lat, viewport.lng, viewport.zoom);
        var nuevo = PROY.desproyectar(c0.x - dx, c0.y - dy, viewport.zoom);
        viewport.lat = nuevo.lat; viewport.lng = nuevo.lng;
        cerrarPopup();
        redibujar();
        return;
      }
      // RENDIMIENTO REAL (mouse/trackpad de alta frecuencia): un mouse
      // gaming a 125-1000Hz o un trackpad de precisión pueden disparar
      // varios cientos de `pointermove` por segundo — muchos más que
      // los ~60 frames por segundo que de verdad se dibujan. Hacer el
      // hit-testing completo (recorrer todos los clusters/puntos
      // visibles) en cada uno de esos eventos es trabajo descartado:
      // solo el resultado del último evento antes de cada frame
      // termina importando. Se guarda apenas la posición del puntero
      // (un objeto liviano, no el Event completo) y se resuelve una
      // sola vez por frame vía rAF.
      hoverPendiente = { clientX: e.clientX, clientY: e.clientY };
      if (hoverRAF === null) hoverRAF = requestAnimationFrame(procesarHoverPendiente);
    });
    var hoverPendiente = null;
    var hoverRAF = null;
    function procesarHoverPendiente() {
      hoverRAF = null;
      // Mismo chequeo de `enPellizco` que en el listener de arriba:
      // este rAF puede haber quedado encolado desde un `pointermove`
      // que llegó ANTES de que empezara el pellizco (el segundo dedo
      // puede bajar entre el evento y el frame que lo procesa), así
      // que se revalida acá también, no solo en el listener.
      if (!vivo || !hoverPendiente || arrastrando || panTactilUnico || enPellizco) { hoverPendiente = null; return; }
      var evt = hoverPendiente; hoverPendiente = null;
      var clusters = clustersActuales();
      var cerca = buscarMarcadorEn(evt, clusters);
      if (cerca && cerca.tipo === 'punto') {
        lienzo.style.cursor = 'pointer';
        if (cerca.punto.id !== idResaltado) { idResaltado = cerca.punto.id; puntoResaltado = cerca.punto; emisor.emitir('hover', cerca.punto); redibujar(); }
        if (clusterResaltadoKey !== null) { clusterResaltadoKey = null; redibujar(); }
      } else if (cerca && cerca.tipo === 'cluster') {
        lienzo.style.cursor = 'pointer';
        var key = Math.round(cerca.x) + ':' + Math.round(cerca.y);
        if (clusterResaltadoKey !== key) { clusterResaltadoKey = key; redibujar(); }
        if (idResaltado !== null) { idResaltado = null; puntoResaltado = null; emisor.emitir('hoverOut'); redibujar(); }
      } else if (idResaltado !== null || clusterResaltadoKey !== null) {
        idResaltado = null; puntoResaltado = null; clusterResaltadoKey = null; lienzo.style.cursor = 'grab'; emisor.emitir('hoverOut'); redibujar();
      }
    }
    // GAP REAL corregido (auditoría navegación, 2026-08-02): "doble tap
    // para acercar" es el gesto universal de cualquier mapa de
    // referencia (Google/Apple/Mapbox), pero acá dependía exclusivamente
    // del evento nativo `dblclick` — y `alTouchstartContenedor`/
    // `alTouchendContenedor` (ver más abajo) llaman `e.preventDefault()`
    // incondicionalmente en touch, lo que por especificación de Touch
    // Events le impide al navegador sintetizar click/dblclick de
    // compatibilidad a partir de los toques. Resultado: en un teléfono
    // real, doble tap para acercar probablemente nunca se disparaba —
    // solo funcionaba con doble clic real de mouse en desktop.
    // Se detecta el gesto acá a mano, sobre los mismos taps de un solo
    // dedo que YA se procesan vía Pointer Events (no Touch Events —
    // por eso vive junto a `pointerup`, no junto a `touchstart`),
    // comparando tiempo y distancia contra el tap anterior, y se reusa
    // exactamente la misma matemática de anclaje que ya usa el doble
    // clic de desktop (`calcularDestinoAnclado` + `animarA`), sin
    // duplicarla. No reemplaza ni suprime el tap individual: el primer
    // tap de un doble tap sigue abriendo su popup/marcador normalmente,
    // igual que ya pasa hoy con dos clics reales de mouse en desktop
    // (cada clic dispara su propio efecto Y el segundo, además, dispara
    // el zoom vía `dblclick`) — mismo criterio, sin comportamiento nuevo.
    var DOBLE_TAP_MS = 300;
    var DOBLE_TAP_DIST_PX = 40; // más generoso que TOLERANCIA_CLICK_PX: acá compara dos toques entre sí, no un toque contra un pin
    var ultimoTapTiempo = 0, ultimoTapX = 0, ultimoTapY = 0;
    function detectarDobleTap(e) {
      var ahora = performance.now();
      var dx = e.clientX - ultimoTapX, dy = e.clientY - ultimoTapY;
      var esDobleTap = (ahora - ultimoTapTiempo) < DOBLE_TAP_MS &&
        Math.sqrt(dx * dx + dy * dy) < DOBLE_TAP_DIST_PX;
      if (esDobleTap) {
        ultimoTapTiempo = 0; // consumido: un tercer tap rápido no encadena otro zoom
        var rect = rectLienzo();
        var xRel = e.clientX - rect.left, yRel = e.clientY - rect.top;
        var zoomDestino = Math.min(viewport.zoom + 1, ZOOM_MAX);
        var destino = calcularDestinoAnclado(zoomDestino, xRel, yRel);
        animarA(destino.lat, destino.lng, zoomDestino);
      } else {
        ultimoTapTiempo = ahora;
        ultimoTapX = e.clientX; ultimoTapY = e.clientY;
      }
    }
    lienzo.addEventListener('pointerup', function (e) {
      if (e.pointerId !== pointerActivoId) return;
      pointerActivoId = null;
      establecerArrastrando(false);
      lienzo.style.cursor = 'grab';
      if (!sePanneo) {
        var clusters = clustersActuales();
        var cerca = buscarMarcadorEn(e, clusters);
        if (cerca) manejarClick(cerca); else cerrarSpider();
        if (e.pointerType === 'touch') detectarDobleTap(e);
      } else {
        iniciarInercia();
      }
    });
    lienzo.addEventListener('pointercancel', function (e) {
      // El sistema operativo/navegador puede interrumpir un gesto (por
      // ejemplo, un gesto de sistema) sin disparar pointerup: sin esto,
      // arrastrando quedaba pegado en true y el mapa dejaba de responder
      // hasta recargar la página.
      if (e.pointerId === pointerActivoId) {
        pointerActivoId = null;
        establecerArrastrando(false);
        lienzo.style.cursor = 'grab';
      }
    });
    lienzo.style.cursor = 'grab';

    lienzo.addEventListener('focus', function () { focoVisible = true; redibujar(); });
    lienzo.addEventListener('blur', function () { focoVisible = false; redibujar(); });

    function buscarMarcadorEn(evtPointer, clusters) {
      var rect = rectLienzo();
      var mx = evtPointer.clientX - rect.left, my = evtPointer.clientY - rect.top;
      if (spiderActivo) {
        var mejorSpider = null, mejorDistSpider = TOLERANCIA_CLICK_PX;
        spiderActivo.posiciones.forEach(function (pos) {
          var px = pos._xActual !== undefined ? pos._xActual : pos.x;
          var py = pos._yActual !== undefined ? pos._yActual : pos.y;
          var ddx = px - mx, ddy = py - my;
          var d = Math.sqrt(ddx * ddx + ddy * ddy);
          if (d < mejorDistSpider) { mejorDistSpider = d; mejorSpider = { tipo: 'punto', x: px, y: py, punto: pos.punto }; }
        });
        if (mejorSpider) return mejorSpider;
      }
      var mejor = null, mejorDist = TOLERANCIA_CLICK_PX;
      clusters.forEach(function (c) {
        var cdx = c.x - mx, cdy = c.y - my;
        var d = Math.sqrt(cdx * cdx + cdy * cdy);
        if (d < mejorDist) { mejorDist = d; mejor = c; }
      });
      return mejor;
    }

    // Antes: un cluster SIEMPRE hacía zoom al clickearlo, asumiendo que
    // acercar la vista termina separando los pines. Eso rompe en seco
    // cuando 2+ lugares comparten exactamente la misma coordenada (pasa
    // seguido: geocodificación aproximada, mismo edificio/galería) — por
    // más zoom que se haga, nunca se separan y el cluster queda
    // "muerto": el click no visiblemente hace nada. Para clusters chicos
    // (hasta 8 lugares) mostramos directamente la lista con links a cada
    // ficha, así siempre hay una forma de llegar a cada lugar sin
    // depender de que el zoom los separe. Para clusters grandes, el zoom
    // sigue siendo lo más útil (son casos de área real con mucha oferta).
    //
    // BUG REAL corregido: el corte de "hasta 8 lugares" solo cubría
    // clusters chicos por conteo, pero el problema real no es el
    // conteo — es si los miembros pueden llegar a separarse en pantalla
    // en ALGÚN zoom alcanzable. Un cluster de 9+ lugares casi
    // superpuestos (o cualquier cluster ya cerca de ZOOM_MAX, sin
    // margen real para acercar más) seguía cayendo en la rama de zoom,
    // que no separaba nada. Resultado reportado: "pines con un número
    // que no se abren, no se expanden" al hacer mucho zoom.
    //
    // `dispersionMaxima(miembros, ZOOM_MAX)` calcula, en pixeles de
    // pantalla, cuánto se separarían esos mismos miembros si lleváramos
    // el mapa al zoom más alto posible — el mejor caso posible de
    // separación. Si incluso ahí siguen dentro de RADIO_CLUSTER_PX (el
    // mismo radio que agruparEnClusters usa para decidir que son "el
    // mismo punto" en pantalla), matemáticamente NINGÚN zoom los va a
    // separar: no tiene sentido animar hacia allá. Esto reemplaza la
    // heurística anterior (comparar el zoom destino contra el zoom
    // actual) por una verificación directa de la causa raíz que el
    // comentario de arriba ya describía en prosa pero nunca comprobaba
    // en código.
    // PERF (auditoría performance, 2026-08-02, segunda revisión): mismo
    // patrón que `proyectarPuntos()` — todos los miembros de este loop
    // se proyectan con el MISMO `zoom` (siempre ZOOM_MAX, ver
    // `manejarClick` más abajo), así que la escala se calcula una sola
    // vez en vez de una vez por miembro.
    function dispersionMaxima(miembros, zoom) {
      var escala = PROY.escalaDeZoom(zoom);
      var xs = new Array(miembros.length), ys = new Array(miembros.length);
      for (var i = 0; i < miembros.length; i++) {
        var p = PROY.proyectar(miembros[i].lat, miembros[i].lng, zoom, escala);
        xs[i] = p.x; ys[i] = p.y;
      }
      var anchoDisp = Math.max.apply(null, xs) - Math.min.apply(null, xs);
      var altoDisp = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      return Math.max(anchoDisp, altoDisp);
    }

    function manejarClick(c) {
      if (c.tipo === 'cluster') {
        var key = claveCluster(c);
        // Reclickear el mismo cluster que ya está desplegado en abanico
        // lo cierra — mismo principio de "toggle" que un acordeón, sin
        // necesitar un botón de cerrar aparte.
        if (spiderActivo && spiderActivo.key === key) { cerrarSpider(); return; }

        dispararOnda(c.x, c.y, c.miembros[0] && c.miembros[0].color);

        // Spiderfy: para clusters chicos/medianos, expandir en abanico
        // es más directo y más espacial que una lista de texto — ver
        // justificación completa junto a la definición de abrirSpider.
        if (c.miembros.length <= SPIDER_MAX_MIEMBROS) { abrirSpider(c); return; }

        // Caso general: ¿de verdad hay a dónde acercar? Si en el mejor
        // zoom posible los miembros van a seguir dentro del radio de
        // fusión de clusters, ningún acercamiento los va a separar —
        // y un abanico de más de SPIDER_MAX_MIEMBROS piernas ya no es
        // legible, así que acá sí conviene la lista en vez del fan.
        var nuncaSeSepara = dispersionMaxima(c.miembros, ZOOM_MAX) < RADIO_CLUSTER_PX;
        if (nuncaSeSepara) { abrirPopupCluster(c); return; }

        var enc = PROY.encuadrar(c.miembros, viewport.ancho, viewport.alto, 50, ZOOM_MAX);
        var zoomDestino = PROY.clamp(Math.max(viewport.zoom + 1.2, Math.min(viewport.zoom + 2.4, enc.zoom)), ZOOM_MIN, ZOOM_MAX);
        animarA(enc.lat, enc.lng, zoomDestino);
        return;
      }
      cerrarSpider();
      dispararOnda(c.x, c.y, c.punto && c.punto.color);
      abrirPopup(c.punto, { x: c.x, y: c.y });
      emisor.emitir('click', c.punto);
    }

    // GAP REAL DE PRODUCTO (no un bug, una carencia): antes la rueda
    // cambiaba el zoom manteniendo fijo el CENTRO del viewport, sin
    // importar dónde estuviera el cursor. En cualquier mapa de
    // referencia (Google/Apple/Mapbox) la rueda ancla el punto
    // geográfico que está bajo el cursor — así explorar "hacia" un
    // lugar con la rueda se siente intencional, no como si el mapa se
    // escapara por debajo del mouse. Reutiliza la misma matemática de
    // anclaje que ya existía para el pellizco (pantallaAPunto +
    // proyectar/desproyectar), esta vez con el zoom cambiando en un
    // solo paso en vez de continuamente.
    // PERF (auditoría performance, 2026-08-02): calcularDestinoAnclado
    // — antes, esta proyección (pantallaAPunto → proyectar → desproyectar
    // para mantener el mismo punto geográfico bajo xRel/yRel al cambiar
    // de zoom) estaba escrita dos veces: una vez acá adentro de
    // zoomAnclado (mutando viewport directamente, para wheel/pinch) y
    // una segunda vez, matemáticamente idéntica pero copiada a mano,
    // en el listener de `dblclick` (sin mutar viewport, porque ese caso
    // necesita el destino para animarlo con animarA() sin tocar el
    // zoom real hasta que la animación arranca — ver el comentario
    // "BUG REAL evitado" más abajo). Se extrae la matemática compartida
    // acá, pura (no toca `viewport.zoom`, ni `viewport.lat/lng`): recibe
    // el zoom destino y devuelve `{lat, lng}`, dejando que cada
    // llamador decida qué hacer con el resultado.
    function calcularDestinoAnclado(zoomDestino, xRel, yRel) {
      var geoFoco = PROY.pantallaAPunto(xRel, yRel, viewport);
      var pFoco = PROY.proyectar(geoFoco.lat, geoFoco.lng, zoomDestino);
      var centroMundoX = pFoco.x + viewport.ancho / 2 - xRel;
      var centroMundoY = pFoco.y + viewport.alto / 2 - yRel;
      return PROY.desproyectar(centroMundoX, centroMundoY, zoomDestino);
    }

    function zoomAnclado(nuevoZoom, xRel, yRel) {
      nuevoZoom = PROY.clamp(nuevoZoom, ZOOM_MIN, ZOOM_MAX);
      if (Math.abs(nuevoZoom - viewport.zoom) < 0.0001) return;
      var destino = calcularDestinoAnclado(nuevoZoom, xRel, yRel);
      viewport.zoom = nuevoZoom;
      viewport.lat = destino.lat;
      viewport.lng = destino.lng;
    }

    // Acumulador de rueda: trackpads e input devices "de precisión"
    // (Windows PointerEvents, trackpads de Mac con gesto de pellizco
    // mapeado a wheel+ctrlKey) disparan decenas de eventos wheel muy
    // pequeños por segundo en vez de unos pocos "clicks" de mouse
    // tradicional. Tratarlos igual (±0.5 por evento) hacía que un
    // trackpad zoomeara muchísimo más rápido y de forma entrecortada
    // que un mouse. Ahora se acumula deltaY normalizado y se aplica en
    // el próximo frame vía rAF — un solo redibujo por frame sin
    // importar cuántos eventos wheel llegaron, y una sensación de
    // "rueda" pareja entre mouse y trackpad.
    var wheelAcumulado = 0;
    var wheelRAF = null;
    var wheelXRel = 0, wheelYRel = 0;
    function aplicarWheelAcumulado() {
      wheelRAF = null;
      if (!wheelAcumulado) return;
      var delta = PROY.clamp(wheelAcumulado, -1.6, 1.6);
      wheelAcumulado = 0;
      zoomAnclado(viewport.zoom + delta, wheelXRel, wheelYRel);
      cerrarPopup();
      redibujar();
    }
    // Verificado en auditoría de perf (2026-08-01): este listener NO
    // puede pasar a { passive: true }. `e.preventDefault()` de la
    // línea de abajo es lo que evita que la rueda/gesto de pellizco
    // también scrollee o haga zoom la PÁGINA mientras el usuario hace
    // zoom del MAPA — sin él, cada wheel sobre el canvas dispararía
    // el zoom del navegador (o el scroll de la página) al mismo
    // tiempo que el zoom propio del mapa. `passive:true` prohíbe
    // llamar `preventDefault()` (el navegador lo ignora y tira un
    // warning en consola), así que la única combinación correcta acá
    // es la que ya está: `{ passive: false }` explícito. El costo
    // real de no ser pasivo ya está mitigado por el acumulador +
    // rAF de arriba: el navegador espera a este handler en cada
    // evento wheel, pero el handler solo acumula un número y agenda
    // un frame — no hace layout ni redibuja sincrónicamente — así
    // que el bloqueo por evento es del orden de microsegundos, no lo
    // que normalmente hace cara la no-pasividad.
    lienzo.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (wheelRAF === null) refrescarRect(); // primer evento de una ráfaga nueva: recién ahí vale la pena pagar el reflow
      cancelarInercia();
      cerrarSpider();
      var rect = rectLienzo();
      wheelXRel = e.clientX - rect.left;
      wheelYRel = e.clientY - rect.top;
      // deltaMode 0 = píxeles (trackpad, mouse de alta resolución): se
      // escala hacia abajo. deltaMode 1 = líneas (mouse tradicional):
      // un "click" de rueda entero equivale al paso de 0.5 de antes.
      var unidad = e.deltaMode === 1 ? 0.5 : Math.min(0.12, Math.abs(e.deltaY) * 0.0035);
      wheelAcumulado += (e.deltaY > 0 ? -1 : 1) * unidad;
      if (wheelRAF === null) wheelRAF = requestAnimationFrame(aplicarWheelAcumulado);
    }, { passive: false });

    lienzo.addEventListener('dblclick', function (e) {
      var rect = rectLienzo();
      var xRel = e.clientX - rect.left, yRel = e.clientY - rect.top;
      var zoomDestino = Math.min(viewport.zoom + 1, ZOOM_MAX);
      // BUG REAL evitado (no llegó a publicarse, detectado en revisión
      // propia): mutar `viewport.zoom` acá ANTES de llamar a `animarA`
      // haría que `origen.zoom` (leído dentro de animarA al arrancar)
      // ya fuera igual a `zoomDestino` — el resultado visible sería un
      // pan que sí se anima suave, pero un zoom que "salta" de golpe
      // en vez de acompañar la animación. animarA no puede animar el
      // anclaje frame a frame sin duplicar toda la matemática de
      // zoomAnclado dentro de la propia animación de vuelo — para un
      // doble clic (un solo nivel de zoom, ~420ms) la diferencia entre
      // animar hacia el destino final anclado vs. animar el anclaje
      // continuo es imperceptible. Por eso el punto de anclaje se
      // resuelve acá con el zoom destino, PERO sin tocar el viewport
      // real — solo animarA(), más abajo, es quien efectivamente
      // mueve lat/lng/zoom, interpolando desde el estado actual real.
      // Matemática de anclaje compartida con zoomAnclado() vía
      // calcularDestinoAnclado() (PERF, 2026-08-02) — antes estaba
      // copiada a mano acá.
      var destino = calcularDestinoAnclado(zoomDestino, xRel, yRel);
      animarA(destino.lat, destino.lng, zoomDestino);
    });


    lienzo.addEventListener('keydown', function (e) {
      var paso = 40;
      if (e.key === 'ArrowUp') { desplazarPx(0, paso); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { desplazarPx(0, -paso); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { desplazarPx(paso, 0); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { desplazarPx(-paso, 0); e.preventDefault(); }
      else if (e.key === '+' || e.key === '=') { animarA(viewport.lat, viewport.lng, Math.min(viewport.zoom + 1, ZOOM_MAX)); }
      else if (e.key === '-') { animarA(viewport.lat, viewport.lng, Math.max(viewport.zoom - 1, ZOOM_MIN)); }
    });

    // Escape cierra la ficha abierta y devuelve el foco a donde estaba
    // antes de abrirla — sin esto, un usuario de teclado que abre un
    // popup y quiere descartarlo no tenía forma de hacerlo sin el mouse.
    // BUG REAL corregido: este listener, y los 4 de touch de más abajo,
    // se atan a `contenedor` — el elemento que entrega quien llama a
    // crear(), no un nodo interno que `destruir()` desmonta con
    // `contenedor.innerHTML = ''`. Ese innerHTML='' limpia hijos
    // (lienzo, controles, popup...) pero un listener puesto
    // directamente sobre `contenedor` sigue vivo después de destruir()
    // si nadie lo remueve explícitamente — a diferencia de los
    // listeners en `global`/`document`, que sí se removían. Si algún
    // consumidor futuro reutiliza el mismo contenedor para crear() una
    // instancia nueva (el escenario que esta misma pasada dice cubrir,
    // ver comentario de PREVENCIÓN DE MEMORY LEAKS más arriba), la
    // instancia vieja quedaba pegada para siempre: memoria retenida y
    // trabajo desperdiciado en cada evento, sin ningún efecto visible
    // porque `redibujar()` sí corta por `vivo`, pero la mutación de
    // estado y el propio handler no. Se nombran las 5 funciones para
    // poder removerlas en destruir().
    function alKeydownContenedor(e) {
      if (e.key === 'Escape' && (!popup.hidden || spiderActivo)) {
        e.stopPropagation();
        if (!popup.hidden) cerrarPopup(true);
        cerrarSpider();
      }
    }
    contenedor.addEventListener('keydown', alKeydownContenedor);

    function desplazarPx(dx, dy) {
      cancelarInercia();
      cerrarSpider();
      var c0 = PROY.proyectar(viewport.lat, viewport.lng, viewport.zoom);
      var n = PROY.desproyectar(c0.x - dx, c0.y - dy, viewport.zoom);
      viewport.lat = n.lat; viewport.lng = n.lng;
      redibujar();
    }

    controles.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-zoom]');
      if (!btn || btn.disabled) return;
      cancelarInercia();
      var dz = parseFloat(btn.dataset.zoom);
      animarA(viewport.lat, viewport.lng, PROY.clamp(viewport.zoom + dz, ZOOM_MIN, ZOOM_MAX));
    });

    // Soporte táctil de pellizco (pinch), anclado al centro del gesto:
    // el punto geográfico que estaba bajo los dos dedos al empezar el
    // pellizco se mantiene bajo el centro de los dedos mientras se
    // mueven — igual que Google/Apple Maps. Antes, el pellizco solo
    // cambiaba el zoom con el centro del viewport fijo, así que
    // pellizcar lejos del centro "arrastraba" el mapa de forma rara.
    //
    // BUG REAL corregido (reportado: Moto G14, gama baja-media — "el
    // zoom se va hacia donde están mis dedos, de forma rara"): el punto
    // geográfico de anclaje (`geoFoco`) se recalculaba en CADA
    // `touchmove`, desproyectando la posición de pantalla FIJA inicial
    // (`pinchCentro0`) contra el `viewport` YA MODIFICADO por el frame
    // anterior. Pero ese frame anterior movió el viewport justo para que
    // el punto original quedara bajo el centro ACTUAL de los dedos (que
    // se desplaza), no bajo la posición fija inicial — así que
    // recalcular ahí agarra, cada vez, un punto geográfico ligeramente
    // distinto al original: un drift acumulativo frame a frame. Con
    // `touchmove` frecuentes (dispositivo potente) el error por frame es
    // chico y casi no se nota; con eventos táctiles más espaciados
    // (gama baja/media, frames más grandes entre sí) el mismo drift se
    // acumula mucho más rápido y se vuelve visible: el mapa "se escapa"
    // hacia los dedos en vez de quedarse anclado. Corrección: el punto
    // geográfico de anclaje se calcula UNA SOLA VEZ, al empezar el
    // pellizco (acá, en touchstart, contra el viewport todavía sin
    // tocar), y se reutiliza sin volver a desproyectarlo en cada frame
    // — la misma técnica que usan Leaflet/Mapbox GL para pinch-zoom.
    var pinchDist0 = null, pinchZoom0 = null, pinchCentro0 = null, pinchGeoFoco0 = null;
    // Estado adicional para reconocer un TAP de 2 dedos (gesto corto, sin
    // separación real entre los dedos) dentro del mismo flujo que ya
    // trackea el pellizco — ver `detectarDobleTapDosDedos` más abajo.
    var pinchInicioTiempo = 0, pinchDistUltima = 0;
    function alTouchstartContenedor(e) {
      e.preventDefault();
      if (e.touches.length === 2) {
        establecerEnPellizco(true);
        panTactilUnico = null;
        pinchDist0 = distanciaToques(e.touches);
        pinchDistUltima = pinchDist0;
        pinchInicioTiempo = performance.now();
        pinchZoom0 = viewport.zoom;
        pinchCentro0 = centroToques(e.touches);
        refrescarRect();
        (function () {
          var rect = rectLienzo();
          pinchGeoFoco0 = PROY.pantallaAPunto(
            pinchCentro0.x - rect.left,
            pinchCentro0.y - rect.top,
            viewport
          );
        })();
        // El pellizco toma el control: cede cualquier arrastre de un
        // solo puntero (o inercia post-arrastre) que estuviera en
        // curso, para que no compitan.
        establecerArrastrando(false);
        pointerActivoId = null;
        cancelarInercia();
        cerrarPopup();
        cerrarSpider();
        // COROLARIO del mismo hallazgo (pointermove sin chequeo de
        // enPellizco): en un dispositivo híbrido mouse+touch puede
        // haber un hover de mouse activo (idResaltado/puntoResaltado)
        // justo antes de que empiecen los 2 dedos del pellizco. Sin
        // esto, esa tarjeta quedaba resaltada en el panel de app.js
        // durante todo el gesto — nada bajo el cursor real la
        // justifica ya, y el `pointermove` que la limpiaría normal-
        // mente ahora se ignora a propósito mientras `enPellizco` es
        // true.
        if (idResaltado !== null || clusterResaltadoKey !== null) {
          idResaltado = null; puntoResaltado = null; clusterResaltadoKey = null;
          emisor.emitir('hoverOut');
        }
      }
    }
    lienzo.addEventListener('touchstart', alTouchstartContenedor, { passive: false });
    function alTouchmoveContenedor(e) {
      e.preventDefault();
      if (e.touches.length === 2 && pinchDist0 && pinchGeoFoco0) {
        var d = distanciaToques(e.touches);
        pinchDistUltima = d;
        var centroActual = centroToques(e.touches);
        var nuevoZoom = PROY.clamp(pinchZoom0 + Math.log2(d / pinchDist0), ZOOM_MIN, ZOOM_MAX);

        var rect = rectLienzo();
        // pinchGeoFoco0: el MISMO punto geográfico calculado una única
        // vez en touchstart — nunca se vuelve a desproyectar desde la
        // posición de pantalla, así que no hay drift posible por más
        // frames que pasen ni por más grande que sea el salto entre
        // touchmove sucesivos.
        viewport.zoom = nuevoZoom;
        var pFoco = PROY.proyectar(pinchGeoFoco0.lat, pinchGeoFoco0.lng, viewport.zoom);
        var centroActualRelX = centroActual.x - rect.left;
        var centroActualRelY = centroActual.y - rect.top;
        var centroMundoX = pFoco.x + viewport.ancho / 2 - centroActualRelX;
        var centroMundoY = pFoco.y + viewport.alto / 2 - centroActualRelY;
        var nuevoCentro = PROY.desproyectar(centroMundoX, centroMundoY, viewport.zoom);
        viewport.lat = nuevoCentro.lat;
        viewport.lng = nuevoCentro.lng;
        redibujar();
        return;
      }
      // GAP REAL corregido: al soltar uno de los dos dedos de un
      // pellizco, el dedo que queda abajo no generaba ningún
      // `pointerdown` nuevo (ya estaba apoyado desde antes), así que
      // el pan de un solo dedo no se reactivaba solo — el mapa se
      // quedaba quieto hasta que el usuario levantara ese dedo también
      // y volviera a apoyarlo. Google/Apple Maps sí continúan el pan
      // sin cortes. Se seguí acá con Touch Events puros (no con
      // Pointer Events: ese dedo nunca se activó como puntero de
      // arrastre, ver touchend) hasta que se suelte del todo.
      if (e.touches.length === 1 && enPellizco) {
        // El usuario acaba de levantar un dedo pero sigue presionando otro.
        // Inicializar pan táctil único SOLO ahora, en el primer movimiento.
        var t = e.touches[0];
        if (!panTactilUnico) {
          muestrasMovimiento = [];
          panTactilUnico = { id: t.identifier, x: t.clientX, y: t.clientY };
          registrarMuestra(t.clientX, t.clientY);
        }
      }
      if (e.touches.length === 1 && panTactilUnico) {
        var t = e.touches[0];
        var dx = t.clientX - panTactilUnico.x, dy = t.clientY - panTactilUnico.y;
        panTactilUnico.x = t.clientX; panTactilUnico.y = t.clientY;
        registrarMuestra(t.clientX, t.clientY);
        var c0 = PROY.proyectar(viewport.lat, viewport.lng, viewport.zoom);
        var n = PROY.desproyectar(c0.x - dx, c0.y - dy, viewport.zoom);
        viewport.lat = n.lat; viewport.lng = n.lng;
        cerrarPopup();
        redibujar();
      }
    }
    lienzo.addEventListener('touchmove', alTouchmoveContenedor, { passive: false });

    // CAPACIDAD NUEVA (auditoría navegación, 2026-08-02, ítem #6 del
    // informe): "doble tap con 2 dedos = alejar un nivel" es el gesto
    // espejo del doble tap de 1 dedo (#3, ver `detectarDobleTap` más
    // arriba) — estándar en iOS/Android maps. Se reconoce reusando el
    // mismo tracking que ya existe para el pellizco: si el gesto de 2
    // dedos duró poco Y la distancia entre dedos casi no cambió (osea,
    // fue un TAP con 2 dedos, no un intento real de pellizcar/separar),
    // se lo trata como "tap de 2 dedos" y se compara contra el anterior
    // con la misma ventana de tiempo/distancia que el doble tap de 1
    // dedo. No compite con el pellizco real: un pellizco genuino mueve
    // la distancia entre dedos bastante más que el umbral, así que
    // nunca dispara esto por accidente.
    var UMBRAL_TAP_DOS_DEDOS_MS = 250;
    var UMBRAL_TAP_DOS_DEDOS_DIST_PX = 14;
    var ultimoTapDosDedosTiempo = 0, ultimoTapDosDedosX = 0, ultimoTapDosDedosY = 0;
    function detectarDobleTapDosDedos(centro) {
      var ahora = performance.now();
      var dx = centro.x - ultimoTapDosDedosX, dy = centro.y - ultimoTapDosDedosY;
      var esDobleTap = (ahora - ultimoTapDosDedosTiempo) < DOBLE_TAP_MS &&
        Math.sqrt(dx * dx + dy * dy) < DOBLE_TAP_DIST_PX;
      if (esDobleTap) {
        ultimoTapDosDedosTiempo = 0; // consumido: un tercer tap rápido no encadena otro alejamiento
        var rect = rectLienzo();
        var xRel = centro.x - rect.left, yRel = centro.y - rect.top;
        var zoomDestino = Math.max(viewport.zoom - 1, ZOOM_MIN);
        var destino = calcularDestinoAnclado(zoomDestino, xRel, yRel);
        animarA(destino.lat, destino.lng, zoomDestino);
      } else {
        ultimoTapDosDedosTiempo = ahora;
        ultimoTapDosDedosX = centro.x; ultimoTapDosDedosY = centro.y;
      }
    }
    function alTouchendContenedor(e) {
      e.preventDefault();
      if (e.touches.length < 2) {
        // Se evalúa ANTES de limpiar pinchDist0/pinchCentro0: necesita
        // los valores que dejó el pellizco que recién termina.
        if (pinchDist0 && pinchCentro0) {
          var duracionPellizco = performance.now() - pinchInicioTiempo;
          var deltaDist = Math.abs(pinchDistUltima - pinchDist0);
          var fueTapDeDosDedos = duracionPellizco < UMBRAL_TAP_DOS_DEDOS_MS &&
            deltaDist < UMBRAL_TAP_DOS_DEDOS_DIST_PX;
          if (fueTapDeDosDedos) detectarDobleTapDosDedos(pinchCentro0);
        }
        pinchDist0 = null;
        pinchCentro0 = null;
        pinchGeoFoco0 = null;
        if (e.touches.length === 0) establecerEnPellizco(false);
      }
      if (e.touches.length === 0) {
        if (panTactilUnico) { panTactilUnico = null; iniciarInercia(); }
      }
    }
    lienzo.addEventListener('touchend', alTouchendContenedor, { passive: false });
    function alTouchcancelContenedor(e) {
      e.preventDefault();
      // El sistema puede interrumpir el gesto (llamada entrante,
      // gesto de sistema del propio OS) sin `touchend` — sin este
      // manejo, `panTactilUnico`/`enPellizco` quedaban pegados y el
      // próximo toque heredaba un estado de pellizco que ya no existe.
      pinchDist0 = null;
      pinchCentro0 = null;
      pinchGeoFoco0 = null;
      panTactilUnico = null;
      establecerEnPellizco(false);
    }
    lienzo.addEventListener('touchcancel', alTouchcancelContenedor, { passive: false });
    function distanciaToques(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
    function centroToques(t) { return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 }; }

    /* ── Animación suave de zoom/pan (usada por focar/encuadrar) ── */
    function animarA(lat, lng, zoom, duracion) {
      // BUG REAL corregido en esta pasada: se cancelaba el rAF de un
      // vuelo en curso pero no se limpiaba `animacionZoom` a `null` —
      // si a continuación se entraba por la rama de movimiento
      // reducido (return inmediato más abajo, que nunca reasigna la
      // variable), quedaba apuntando para siempre a un frame ya
      // cancelado. Sin consecuencia visible hasta ahora (nada más leía
      // esta variable fuera de esta misma función), pero con el nuevo
      // acople gesto↔ambiente (hallazgo 2) esa lectura estancada
      // habría dejado el motor ambiental pausado para siempre tras
      // cualquier `animarA` interrumpido con movimiento reducido activo.
      if (animacionZoom) { cancelAnimationFrame(animacionZoom); animacionZoom = null; actualizarEstadoGesto(); }
      cancelarInercia();
      cerrarSpider();
      if (prefiereMovimientoReducido()) {
        viewport.lat = lat; viewport.lng = lng; viewport.zoom = zoom;
        vueloDestino = null;
        redibujar();
        return;
      }
      var origen = { lat: viewport.lat, lng: viewport.lng, zoom: viewport.zoom };
      var destino = { lat: lat, lng: lng, zoom: zoom };
      vueloDestino = destino;
      var inicio = performance.now();
      duracion = duracion || DURACION_VUELO_MS;
      function paso(ahora) {
        if (!vivo) return;
        var t = Math.min(1, (ahora - inicio) / duracion);
        var e = easeOutCubic(t);
        viewport.lat = origen.lat + (destino.lat - origen.lat) * e;
        viewport.lng = origen.lng + (destino.lng - origen.lng) * e;
        viewport.zoom = origen.zoom + (destino.zoom - origen.zoom) * e;
        redibujar();
        if (t < 1) { animacionZoom = requestAnimationFrame(paso); } else { animacionZoom = null; actualizarEstadoGesto(); vueloDestino = null; }
      }
      animacionZoom = requestAnimationFrame(paso);
      actualizarEstadoGesto();
    }

    /* ── Popup ──
       BUG REAL corregido: `abrirPopup`/`abrirPopupCluster` sacaban el
       popup de `hidden` de forma SÍNCRONA, pero su posición (left/top)
       recién se calculaba en `posicionarPopupAbierto`, que solo corre
       dentro de `dibujar()` — y `dibujar()` se dispara vía
       `redibujar()`, que a su vez lo difiere a un `requestAnimationFrame`.
       Como el popup es un único <div> reutilizado (nunca se recrea),
       arrastraba el `left`/`top` de la vez anterior (o ningún valor,
       la primera vez). Resultado: durante un frame — visible a simple
       vista, sobre todo en dispositivos más lentos — el popup aparecía
       en la posición vieja (o en la esquina, sin posición), y recién
       después "saltaba" al lugar correcto. Eso es exactamente lo que
       se ve en el reporte: el mapa "se ve mal directamente" al
       clickear un lugar. Ahora se posiciona de forma síncrona, en el
       mismo tick que se hace visible, usando las coordenadas de
       pantalla que el propio click ya calculó (o, si no las hay —
       apertura por teclado/lista accesible—, proyectando el punto con
       el viewport actual). `redibujar()` se sigue llamando después
       para que el popup siga acompañando al punto si el mapa está en
       medio de una animación de vuelo (ver `enfocar`). */
    // PERF (auditoría rendimiento, ronda 2, hallazgo 6): posicionarPopupEn
    // corre en CADA frame de dibujar() mientras el popup está abierto
    // (arrastrar/pellizcar/animar el mapa con una ficha ya abierta es un
    // caso de uso real, no un borde). Antes leía popup.offsetWidth/
    // offsetHeight en cada una de esas llamadas — una lectura de layout
    // que, si el mismo frame ya escribió otro estilo antes (p.ej.
    // posicionarMarcadorUsuario() en dibujar(), líneas más arriba),
    // fuerza un reflow SÍNCRONO ahí mismo en vez de dejar que el
    // navegador lo resuelva en su propio momento de layout — el clásico
    // patrón de "layout thrashing" escritura→lectura en el mismo tick,
    // repetido 60 veces por segundo durante todo el gesto.
    // El tamaño del popup solo puede cambiar cuando cambia su
    // `innerHTML` (abrirPopup/abrirPopupCluster) — nunca por el propio
    // reposicionamiento — así que se cachea y se invalida únicamente en
    // esos dos puntos (y cuando document.fonts.ready puede haber
    // cambiado el ancho real del texto tras el primer frame).
    var medidasPopupCache = null;
    function invalidarMedidasPopup() { medidasPopupCache = null; }

    function posicionarPopupEn(x, y) {
      if (!medidasPopupCache) {
        medidasPopupCache = { ancho: popup.offsetWidth || 220, alto: popup.offsetHeight || 90 };
      }
      var anchoPopup = medidasPopupCache.ancho;
      var altoPopup = medidasPopupCache.alto;
      // Los márgenes se acotan al propio tamaño del viewport antes de
      // usarlos como límites del clamp. Sin esto, un popup más ancho
      // que el contenedor (pantallas muy angostas, nombre de lugar muy
      // largo) producía min > max en PROY.clamp; como esa función hace
      // Math.max(min, Math.min(max, v)), un min>max no lanza, pero
      // "gana" siempre el mínimo — el popup quedaba fijo pegado a un
      // borde sin que valiera la pena depurar por qué. Acotando el
      // margen a la mitad del viewport se garantiza min <= max siempre,
      // así el popup se achica contra el borde en vez de comportarse
      // de forma no determinística en el caso límite.
      var margenX = Math.min(anchoPopup / 2 + 8, viewport.ancho / 2);
      var margenYMin = Math.min(altoPopup + 16, viewport.alto);
      var px = PROY.clamp(x, margenX, Math.max(margenX, viewport.ancho - margenX));
      var py = PROY.clamp(y, margenYMin, Math.max(margenYMin, viewport.alto - 8));
      popup.style.left = px + 'px';
      popup.style.top = py + 'px';
    }
    function abrirPopup(punto, xy) {
      idAbierto = punto.id;
      elementoFocoPrevio = document.activeElement;
      // BUG REAL corregido: antes el único link del popup era "Ver
      // ficha completa", condicionado a `punto.href` (depende de que
      // el lugar tenga slug/ficha propia). Si no la tenía, el popup se
      // abría sin ningún link — un pin que representa un lugar real
      // pero no llevaba a ningún lado. Ahora "Cómo llegar" (hrefMapsDe)
      // es incondicional: usa lat/lng del punto, que `establecerPuntos`
      // ya garantiza válidos para todo punto dibujado. "Ver ficha
      // completa" sigue como link aparte, solo cuando hay ficha.
      popup.innerHTML =
        '<button type="button" class="uru-mapa-popup-cerrar" aria-label="Cerrar">×</button>' +
        '<strong class="uru-mapa-popup-nombre"></strong>' +
        '<div class="uru-mapa-popup-direccion"></div>' +
        '<div class="uru-mapa-popup-acciones">' +
          '<a class="uru-mapa-popup-link uru-mapa-popup-link--maps" target="_blank" rel="noopener">📍 Cómo llegar →</a>' +
          (punto.href ? '<a class="uru-mapa-popup-link">Ver ficha completa →</a>' : '') +
        '</div>';
      invalidarMedidasPopup(); // nuevo contenido: el ancho/alto cacheado ya no vale
      popup.querySelector('.uru-mapa-popup-nombre').textContent = punto.nombre;
      popup.querySelector('.uru-mapa-popup-direccion').textContent = punto.direccion || '';
      popup.querySelector('.uru-mapa-popup-link--maps').href = hrefMapsDe(punto);
      var link = popup.querySelector('.uru-mapa-popup-link:not(.uru-mapa-popup-link--maps)');
      if (link) link.href = punto.href;
      popup.setAttribute('role', 'group');
      popup.setAttribute('aria-label', punto.nombre || 'Detalle del lugar');
      popup.hidden = false;
      var colorBorde = (punto.color && RE_HEX.test(punto.color)) ? punto.color : 'var(--color-granate-clara)';
      popup.style.borderLeft = '3px solid ' + colorBorde;
      var btnCerrar = popup.querySelector('.uru-mapa-popup-cerrar');
      btnCerrar.addEventListener('click', function () { cerrarPopup(true); });
      // Posición síncrona (ver nota arriba): si el click ya nos dio
      // las coordenadas de pantalla, se usan directo; si no (apertura
      // por teclado/lista accesible), se proyectan lat/lng con el
      // viewport actual.
      var punteroXY = xy || PROY.puntoAPantalla(punto.lat, punto.lng, viewport);
      posicionarPopupEn(punteroXY.x, punteroXY.y);
      // <button> real: Enter/Espacio ya funcionan sin código adicional.
      if (typeof btnCerrar.focus === 'function') btnCerrar.focus({ preventScroll: true });
      redibujar();
    }
    function cerrarPopup(devolverFoco) {
      idAbierto = null;
      clusterAbierto = null;
      popup.hidden = true;
      if (devolverFoco && elementoFocoPrevio && typeof elementoFocoPrevio.focus === 'function') {
        elementoFocoPrevio.focus({ preventScroll: true });
      }
      elementoFocoPrevio = null;
    }

    // Lista de lugares de un cluster chico — mismo popup visual que el
    // de un lugar individual, pero con un <a> por miembro en vez de un
    // solo nombre/dirección. Usa textContent (nunca innerHTML con datos
    // del negocio) para no depender de escapar nada a mano.
    function abrirPopupCluster(c) {
      idAbierto = null;
      clusterAbierto = c;
      elementoFocoPrevio = document.activeElement;

      popup.innerHTML =
        '<button type="button" class="uru-mapa-popup-cerrar" aria-label="Cerrar">×</button>' +
        '<strong class="uru-mapa-popup-nombre"></strong>' +
        '<ul class="uru-mapa-popup-cluster-lista"></ul>';
      invalidarMedidasPopup(); // nuevo contenido: el ancho/alto cacheado ya no vale
      popup.querySelector('.uru-mapa-popup-nombre').textContent =
        c.miembros.length + ' lugares acá';

      var lista = popup.querySelector('.uru-mapa-popup-cluster-lista');
      // BUG REAL corregido (raíz del reporte): un miembro sin ficha
      // propia (`m.href` null) se renderizaba como <span> — ni link,
      // ni foco, ni acción. El pin representaba un lugar real pero no
      // llevaba a ningún lado. La ficha (`m.href`) es un dato OPCIONAL
      // del negocio; la ubicación (`m.lat`/`m.lng`) es un dato
      // GARANTIZADO por `establecerPuntos` para todo miembro que llegó
      // a agruparse en este cluster. Por eso cada fila ahora tiene
      // siempre, como mínimo, un <a> real a "Cómo llegar" — y además
      // el link a la ficha cuando existe. Ningún miembro de ningún
      // cluster, chico o grande, con coordenadas repetidas o no, queda
      // sin una acción real que lo lleve a SU ubicación específica.
      c.miembros.forEach(function (m) {
        var li = document.createElement('li');
        li.className = 'uru-mapa-popup-cluster-fila';
        if (m.href) {
          var aFicha = document.createElement('a');
          aFicha.className = 'uru-mapa-popup-cluster-item';
          aFicha.textContent = m.nombre;
          aFicha.href = m.href;
          li.appendChild(aFicha);
        } else {
          var span = document.createElement('span');
          span.className = 'uru-mapa-popup-cluster-item uru-mapa-popup-cluster-item--sin-ficha';
          span.textContent = m.nombre;
          li.appendChild(span);
        }
        var aMapa = document.createElement('a');
        aMapa.className = 'uru-mapa-popup-cluster-mapa';
        aMapa.href = hrefMapsDe(m);
        aMapa.target = '_blank';
        aMapa.rel = 'noopener';
        aMapa.setAttribute('aria-label', 'Cómo llegar a ' + m.nombre);
        aMapa.textContent = '📍';
        li.appendChild(aMapa);
        lista.appendChild(li);
      });

      popup.setAttribute('role', 'group');
      popup.setAttribute('aria-label', c.miembros.length + ' lugares en este punto del mapa');
      popup.hidden = false;
      popup.style.borderLeft = '3px solid var(--color-granate-clara)';
      var btnCerrar = popup.querySelector('.uru-mapa-popup-cerrar');
      btnCerrar.addEventListener('click', function () { cerrarPopup(true); });
      // Posición síncrona (ver nota en abrirPopup): c.x/c.y son las
      // coordenadas de pantalla que el propio click ya calculó.
      posicionarPopupEn(c.x, c.y);
      if (typeof btnCerrar.focus === 'function') btnCerrar.focus({ preventScroll: true });
      redibujar();
    }
    // Identifica un cluster de forma estable entre frames por el
    // conjunto de ids de sus miembros (orden-independiente) — la clave
    // de pantalla (`Math.round(c.x)+':'+Math.round(c.y)`, usada para
    // el resaltado por hover) no sirve acá porque cambia en cada pan/
    // zoom, que es justo cuando necesitamos reencontrar el mismo
    // cluster.
    function firmaMiembrosCluster(miembros) {
      return miembros.map(function (p) { return p.id; }).sort().join(',');
    }

    // PERF: reemplazan el patrón `.filter(...)[0]` en los puntos de
    // este archivo que corren por frame (posicionarPopupAbierto/
    // posicionarEtiqueta, llamadas desde dibujar() — el único
    // llamador del loop de rAF) o por cada hover de tarjeta
    // (enfocar/resaltar). `.filter` no tiene salida temprana: siempre
    // recorre el array completo (hasta 2000 puntos, ver
    // motor-config.js) y además aloca un array intermedio solo para
    // quedarse con el primer resultado. Un `for` con `return` en el
    // primer match hace el mismo trabajo sin ninguna de las dos cosas.
    function primeroPorId(lista, id) {
      for (var i = 0; i < lista.length; i++) {
        if (lista[i].id === id) return lista[i];
      }
      return null;
    }

    function primeroProyectadoPorId(proyectados, id) {
      for (var i = 0; i < proyectados.length; i++) {
        if (proyectados[i].punto.id === id) return proyectados[i];
      }
      return null;
    }

    function posicionarPopupAbierto(proyectados, clusters) {
      if (popup.hidden) return;
      if (idAbierto !== null) {
        if (spiderActivo) {
          var posSpider = primeroProyectadoPorId(spiderActivo.posiciones, idAbierto);
          if (posSpider) { posicionarPopupEn(posSpider._xActual || posSpider.x, posSpider._yActual || posSpider.y); return; }
        }
        var p = primeroProyectadoPorId(proyectados, idAbierto);
        if (!p) { cerrarPopup(); return; }
        // Clamp para que el popup nunca quede parcialmente fuera del
        // contenedor cuando el marcador está cerca de un borde.
        posicionarPopupEn(p.x, p.y);
        return;
      }
      // GAP REAL corregido (auditoría producción, 2026-07-30):
      // clusterAbierto se escribía en abrirPopupCluster()/cerrarPopup()
      // pero nunca se leía en ningún lado — el popup de un cluster no
      // seguía al mapa en pan/zoom, a diferencia del de un lugar
      // individual (arriba). Mismo criterio que esa rama: si el
      // cluster ya no existe con la misma composición de miembros en
      // este frame (se separó al hacer zoom, o la búsqueda cambió la
      // lista), se cierra el popup en vez de dejarlo huérfano.
      if (clusterAbierto !== null) {
        var firma = firmaMiembrosCluster(clusterAbierto.miembros);
        var actual = (clusters || []).filter(function (c) {
          return c.tipo === 'cluster' && firmaMiembrosCluster(c.miembros) === firma;
        })[0];
        if (!actual) { cerrarPopup(); return; }
        clusterAbierto = actual;
        posicionarPopupEn(actual.x, actual.y);
      }
    }

    function posicionarEtiqueta(proyectados) {
      // No mostrar la etiqueta liviana sobre el mismo punto que ya
      // tiene el popup completo abierto — sería redundante.
      if (!puntoResaltado || puntoResaltado.id === idAbierto) { etiqueta.hidden = true; return; }
      var p = primeroProyectadoPorId(proyectados, puntoResaltado.id);
      if (!p) { etiqueta.hidden = true; return; }
      etiqueta.textContent = puntoResaltado.nombre;
      etiqueta.style.left = p.x + 'px';
      etiqueta.style.top = p.y + 'px';
      etiqueta.hidden = false;
    }

    // Auditoría producción, 2026-07-30: se elimina el andamiaje de
    // "prioridad visual" (halo + z-order para los primeros N puntos
    // del array de entrada) — quedó documentado en un comentario largo
    // pero nunca se completó en ninguno de sus dos extremos:
    // rangoPorId nunca se poblaba desde establecerPuntos() y
    // esPrioridadVisual() nunca se consultaba desde dibujarMarcador().
    // Cero comportamiento visible dependía de esto. Si se retoma la
    // idea a futuro, es una funcionalidad nueva a diseñar de cero, no
    // una corrección de bug.

    /* ── Lista accesible en paralelo (teclado / lectores de pantalla) ── */
    function reconstruirListaAccesible() {
      listaAccesible.innerHTML = '';
      var frag = document.createDocumentFragment();
      puntos.forEach(function (p) {
        var li = document.createElement('li');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'uru-mapa-item-accesible';
        btn.textContent = p.nombre + (p.direccion ? ' — ' + p.direccion : '');
        btn.addEventListener('focus', function () { idResaltado = p.id; puntoResaltado = p; emisor.emitir('hover', p); redibujar(); });
        btn.addEventListener('blur', function () { idResaltado = null; puntoResaltado = null; emisor.emitir('hoverOut'); redibujar(); });
        btn.addEventListener('click', function () { enfocar(p.id); abrirPopup(p); emisor.emitir('click', p); });
        li.appendChild(btn);
        frag.appendChild(li);
      });
      listaAccesible.appendChild(frag);
    }

    /* ── API pública de la instancia ── */
    var huellaListaPrevia = '';
    function calcularHuella(lista) {
      var partes = new Array(lista.length);
      for (var i = 0; i < lista.length; i++) partes[i] = lista[i].id;
      return lista.length + '|' + partes.join(',');
    }

    function establecerPuntos(nuevosPuntos) {
      establecioAlgunaVez = true;
      // La identidad de un cluster (`spiderActivo.key`) depende de su
      // posición en pantalla y de qué miembros agrupa — ambas cosas
      // pueden cambiar con una lista nueva de resultados. Mantener el
      // abanico abierto apuntando a datos viejos mostraría piernas
      // hacia lugares que ya no están en el conjunto actual.
      cerrarSpider();
      var entrada = nuevosPuntos || [];
      var descartados = 0;
      // Un punto sin lat/lng numérico y finito no puede proyectarse —
      // antes esto colaba NaN hasta el propio dibujado del canvas.
      puntos = entrada.filter(function (p) {
        var valido = !!p && typeof p.lat === 'number' && typeof p.lng === 'number' &&
          isFinite(p.lat) && isFinite(p.lng);
        if (!valido) descartados++;
        return valido;
      });
      if (descartados > 0 && global.console) {
        console.warn('URU_MOTOR_MAPA_RENDER: se descartaron ' + descartados + ' punto(s) sin coordenadas válidas.');
      }
      // ROBUSTEZ REAL, no defensiva por las dudas: `enfocar(id)` y
      // `resaltar(id)` resuelven por `.filter(...)[0]` — con IDs
      // repetidos (bug de datos aguas arriba, no algo que este archivo
      // pueda o deba corregir por su cuenta) siempre apuntan al
      // primero, silenciosamente. No se filtra nada (el resto del
      // motor sigue funcionando: dos puntos con el mismo ID igual se
      // dibujan, clusterizan y aparecen en la lista accesible, cada
      // uno con sus propias coordenadas), pero se avisa una vez por
      // llamada para que el problema de datos se note en desarrollo en
      // vez de manifestarse como "el mapa enfoca el lugar equivocado".
      if (global.console) {
        var vistos = Object.create(null), repetidos = 0;
        for (var iDup = 0; iDup < puntos.length; iDup++) {
          var idDup = puntos[iDup].id;
          if (vistos[idDup]) repetidos++; else vistos[idDup] = true;
        }
        if (repetidos > 0) {
          console.warn('URU_MOTOR_MAPA_RENDER: ' + repetidos + ' punto(s) con id repetido — enfocar()/resaltar() solo pueden apuntar al primero de cada grupo.');
        }
      }
      var huella = calcularHuella(puntos);
      if (huella !== huellaListaPrevia) {
        huellaListaPrevia = huella;
        reconstruirListaAccesible();
      }
      redibujar();
    }

    // Evita re-animar hacia el mismo encuadre en llamadas repetidas
    // (p. ej. una por cada tecla del buscador en app.js), que se veía
    // como un "salto" constante del mapa sin que el conjunto de
    // resultados hubiera cambiado de verdad.
    var ultimoEncuadre = null;
    function encuadrarTodos(padding) {
      if (!puntos.length) return;
      medir(); // el contenedor puede acabar de pasar de hidden a visible
      var enc = PROY.encuadrar(puntos, viewport.ancho, viewport.alto, padding || 48, ZOOM_MAX);
      if (!enc) return;
      if (ultimoEncuadre &&
        Math.abs(ultimoEncuadre.lat - enc.lat) < 0.0002 &&
        Math.abs(ultimoEncuadre.lng - enc.lng) < 0.0002 &&
        Math.abs(ultimoEncuadre.zoom - enc.zoom) < 0.05) {
        return;
      }
      ultimoEncuadre = enc;
      animarA(enc.lat, enc.lng, enc.zoom);
    }

    function enfocar(id) {
      var p = primeroPorId(puntos, id);
      if (!p) return;
      animarA(p.lat, p.lng, Math.max(viewport.zoom, 15));
    }

    function resaltar(id) {
      idResaltado = id;
      puntoResaltado = primeroPorId(puntos, id);
      redibujar();
    }
    function quitarResaltado() { idResaltado = null; puntoResaltado = null; redibujar(); }

    // TIER 3.3 — auditoría (Perf/UX, 2026-08-02): valida coordenadas
    // con el mismo criterio real que el resto del módulo (finitas, no
    // solo `typeof === 'number'` — ver el comentario de auditoría al
    // principio del archivo hermano motor-mapa.js sobre por qué ese
    // chequeo ingenuo deja pasar NaN). `latlng` puede venir null
    // (desactivarCercaDeMi en app.js) — equivalente a quitarMarcadorUsuario().
    function establecerMarcadorUsuario(latlng) {
      if (!latlng || typeof latlng.lat !== 'number' || typeof latlng.lng !== 'number' ||
        !isFinite(latlng.lat) || !isFinite(latlng.lng)) {
        quitarMarcadorUsuario();
        return;
      }
      usuarioMarcador = { lat: latlng.lat, lng: latlng.lng };
      // Mismo fix que posicionarPopupEn()/abrirPopup() (ver comentario
      // ahí): posicionar de forma síncrona en vez de esperar al
      // rAF diferido de redibujar() evita un frame con el <div>
      // mostrado en 0,0 (o en la posición vieja) antes de "saltar" al
      // lugar correcto.
      posicionarMarcadorUsuario();
      redibujar();
    }

    function quitarMarcadorUsuario() {
      if (!usuarioMarcador) return;
      usuarioMarcador = null;
      marcadorUsuarioEl.hidden = true;
      redibujar();
    }

    var resizeObs = null;
    var resizeFallback = null;
    if ('ResizeObserver' in global) {
      resizeObs = new ResizeObserver(function () { if (vivo) { medir(); redibujar(); } });
      resizeObs.observe(contenedor);
    } else {
      // Navegador sin ResizeObserver: al menos reaccionar al resize de
      // la ventana, en vez de quedar con un tamaño de canvas obsoleto.
      resizeFallback = function () { if (vivo) { medir(); redibujar(); } };
      global.addEventListener('resize', resizeFallback);
    }
    medir();

    // Si la tipografía todavía no había cargado cuando se dibujó el
    // primer frame, la inicial de rubro dentro del pin salía con la
    // fuente de respaldo del sistema. Un único redibujo cuando las
    // fuentes terminan de cargar corrige ese frame inicial sin costo
    // permanente.
    if (global.document && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        if (!vivo) return;
        invalidarMedidasPopup(); // la fuente de respaldo pudo medir un ancho distinto al de la fuente real
        redibujar();
      }).catch(function () {});
    }

    // ── Suspensión/reanudación en background (pestaña oculta) ──
    // GAP REAL: los navegadores throttlean (no garantizan cancelar)
    // `requestAnimationFrame` en una pestaña en background — una
    // animación en curso puede seguir "corriendo" a una cadencia
    // arbitraria e impredecible, o acumular un `dt` gigante en el
    // primer frame tras volver a foreground si algo asumía ~16ms entre
    // pasos. En vez de confiar en ese comportamiento no garantizado,
    // se corta explícitamente todo lo que anima por tiempo al ocultarse
    // y se resincroniza al volver — degradación elegante en vez de
    // dejarlo a la suerte del navegador.
    function alCambiarVisibilidad() {
      if (!vivo) return;
      if (document.hidden) {
        if (animacionZoom) { cancelAnimationFrame(animacionZoom); animacionZoom = null; actualizarEstadoGesto(); }
        cancelarInercia();
        if (rafOndas !== null) { cancelAnimationFrame(rafOndas); rafOndas = null; }
        if (rafApariciones !== null) { cancelAnimationFrame(rafApariciones); rafApariciones = null; }
        if (rafSpider !== null) { cancelAnimationFrame(rafSpider); rafSpider = null; }
        if (wheelRAF !== null) { cancelAnimationFrame(wheelRAF); wheelRAF = null; wheelAcumulado = 0; }
        if (hoverRAF !== null) { cancelAnimationFrame(hoverRAF); hoverRAF = null; hoverPendiente = null; }
      } else {
        // Un vuelo interrumpido a mitad de camino no tiene un origen
        // temporal razonable para retomar tras un tiempo indeterminado
        // en background — se completa directo al destino en vez de que
        // el usuario vuelva a ver una animación arrancando de la nada.
        if (vueloDestino) {
          viewport.lat = vueloDestino.lat; viewport.lng = vueloDestino.lng; viewport.zoom = vueloDestino.zoom;
          vueloDestino = null;
        }
        // Mismo razonamiento para microinteracciones de duración fija
        // (ondas de clic, apariciones de pines): "completarlas" de
        // golpe en un lugar que el usuario ya no está mirando se vería
        // peor que simplemente descartarlas.
        ondas = [];
        for (var kApar in apariciones) delete apariciones[kApar];
        // El pulso de "acá estás vos" ya no depende de un rAF propio
        // (hallazgo 1.1, 2026-08-03) — es un @keyframes de CSS que
        // sigue corriendo solo, no hace falta retomar nada acá.
        // La pestaña pudo volver en otro monitor (distinto
        // devicePixelRatio) o con el contenedor en otro tamaño —
        // remedir agarra ambos casos, no solo el resize.
        medir();
        redibujar();
      }
    }
    if (global.document) document.addEventListener('visibilitychange', alCambiarVisibilidad);

    // Red de seguridad para `orientationchange`: ResizeObserver ya
    // debería reaccionar al nuevo tamaño del contenedor tras rotar,
    // pero algunas combinaciones de WebView/Safari iOS viejo disparan
    // el resize real del layout con demora respecto al evento de
    // orientación. Un remedido extra, un instante después, no cuesta
    // nada si ya estaba todo actualizado y corrige el caso raro en que
    // sí hacía falta.
    var orientationFallback = null;
    var orientationTimeout = null;
    if ('onorientationchange' in global) {
      orientationFallback = function () {
        if (orientationTimeout !== null) clearTimeout(orientationTimeout);
        orientationTimeout = setTimeout(function () {
          orientationTimeout = null;
          if (vivo) { medir(); redibujar(); }
        }, 60);
      };
      global.addEventListener('orientationchange', orientationFallback);
    }

    return {
      on: emisor.on,
      establecerPuntos: establecerPuntos,
      encuadrarTodos: encuadrarTodos,
      enfocar: enfocar,
      resaltar: resaltar,
      quitarResaltado: quitarResaltado,
      establecerMarcadorUsuario: establecerMarcadorUsuario,
      quitarMarcadorUsuario: quitarMarcadorUsuario,
      destruir: function () {
        // Primero el guard: cualquier callback asíncrono que llegue
        // DESPUÉS de esta línea (imagen de tile, promesa de fuentes,
        // un RAF que ya estaba encolado antes de cancelarlo) se
        // encuentra `vivo === false` y no reprograma nada nuevo.
        vivo = false;
        // Red de seguridad del acople gesto↔ambiente (hallazgo 2): si
        // el mapa se destruye a mitad de un gesto (navegación fuera de
        // la sección, por ejemplo), ningún punto de arriba llega a
        // notificar el "fin" de ese gesto — sin esto, el motor
        // ambiental quedaría pausado para siempre. Reset incondicional,
        // no vía actualizarEstadoGesto() (que recalcularía a partir de
        // banderas que ya no importan una vez que la instancia muere).
        if (gestoActivo) {
          gestoActivo = false;
          if (global.AmbienteScheduler) global.AmbienteScheduler.reanudar();
        }
        if (resizeObs) resizeObs.disconnect();
        if (resizeFallback) global.removeEventListener('resize', resizeFallback);
        if (global.document) document.removeEventListener('visibilitychange', alCambiarVisibilidad);
        if (orientationFallback) global.removeEventListener('orientationchange', orientationFallback);
        // BUG REAL corregido en esta pasada: estos 5 listeners viven en
        // `contenedor`, el elemento que entrega quien llama a crear(),
        // no en `lienzo`/`controles` (que sí desaparecen con el
        // `contenedor.innerHTML = ''` de más abajo). Sin este remove
        // explícito, quedaban pegados para siempre si algún consumidor
        // futuro reinicializaba el mapa sobre el mismo contenedor.
        contenedor.removeEventListener('keydown', alKeydownContenedor);
        contenedor.removeEventListener('touchstart', alTouchstartContenedor);
        contenedor.removeEventListener('touchmove', alTouchmoveContenedor);
        contenedor.removeEventListener('touchend', alTouchendContenedor);
        contenedor.removeEventListener('touchcancel', alTouchcancelContenedor);
        if (orientationTimeout !== null) clearTimeout(orientationTimeout);
        if (animacionZoom) cancelAnimationFrame(animacionZoom);
        if (rafRedibujo !== null) cancelAnimationFrame(rafRedibujo);
        if (rafOndas !== null) cancelAnimationFrame(rafOndas);
        if (rafApariciones !== null) cancelAnimationFrame(rafApariciones);
        if (rafSpider !== null) cancelAnimationFrame(rafSpider);
        if (hoverRAF !== null) cancelAnimationFrame(hoverRAF);
        cancelarInercia();
        if (wheelRAF !== null) cancelAnimationFrame(wheelRAF);
        contenedor.innerHTML = '';
      }
    };
  }

  global.URU_MOTOR_MAPA_RENDER = { crear: crear };
})(typeof window !== 'undefined' ? window : global);
