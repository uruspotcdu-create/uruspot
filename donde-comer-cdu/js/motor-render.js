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
  var COLOR_ONDA_DEFECTO = '#ECEDEF';
  var DURACION_ONDA_MS = 550;
  var DURACION_VUELO_MS = 420;
  var MAX_TILES_EN_CACHE = 400;       // tope simple para no crecer sin límite en sesiones largas
  var REINTENTOS_TILE = 1;
  var DEMORA_REINTENTO_TILE_MS = 800;
  var RE_HEX = /^#[0-9a-fA-F]{6}$/;

  var esPunteroTosco = !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches);
  var TOLERANCIA_CLICK_PX = esPunteroTosco ? 28 : 20; // el dedo es menos preciso que un cursor

  function prefiereMovimientoReducido() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
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
    img.onload = function () { entrada.cargado = true; entrada.error = false; if (entrada.onReady) entrada.onReady(); };
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

    function resolverVarCSS(nombre, fallback) {
      try {
        var val = getComputedStyle(contenedor).getPropertyValue(nombre).trim();
        return val || fallback;
      } catch (e) { return fallback; }
    }
    var colorFoco = resolverVarCSS('--granate-clara', '#E8A2AB');

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

    // Caché del último clustering calculado, para no repetir el
    // trabajo O(n²) de agrupar en cada movimiento de mouse — solo se
    // recalcula si el viewport (o el conjunto de puntos) cambió
    // desde el último frame dibujado.
    var ultimosClusters = [];
    var claveClusters = '';
    function clusteringVigente() {
      return viewport.lat + ',' + viewport.lng + ',' + viewport.zoom + ',' +
        viewport.ancho + ',' + viewport.alto + ',' + puntos.length;
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
        var pendientes = false;
        for (var k in apariciones) { if (apariciones[k] !== undefined) { pendientes = true; break; } }
        redibujar();
        if (pendientes) seguirApariciones();
      });
    }

    var rafOndas = null;
    function dispararOnda(x, y, color) {
      if (prefiereMovimientoReducido()) return; // el estado (popup, tarjeta resaltada) ya comunica la acción sin necesidad de animación
      ondas.push({ x: x, y: y, inicio: performance.now(), color: colorSeguro(color) });
      animarOndas();
    }
    function animarOndas() {
      if (!ondas.length) { rafOndas = null; return; }
      var ahora = performance.now();
      ondas = ondas.filter(function (o) { return ahora - o.inicio < DURACION_ONDA_MS; });
      dibujar();
      rafOndas = ondas.length ? requestAnimationFrame(animarOndas) : null;
    }
    function dibujarOndas() {
      var ahora = performance.now();
      ondas.forEach(function (o) {
        var t = Math.min(1, (ahora - o.inicio) / DURACION_ONDA_MS);
        var e = 1 - Math.pow(1 - t, 2);
        ctx.beginPath();
        ctx.arc(o.x, o.y, 6 + e * 34, 0, Math.PI * 2);
        ctx.strokeStyle = hexARgba(o.color, (1 - t) * 0.65);
        ctx.lineWidth = 2.5;
        ctx.stroke();
      });
    }
    var dpr = 1; // se recalcula en cada medir(), no queda pegado al valor de creación
    var animacionZoom = null;

    function medir() {
      dpr = Math.max(1, global.devicePixelRatio || 1);
      var rect = contenedor.getBoundingClientRect();
      viewport.ancho = rect.width;
      viewport.alto = rect.height;
      lienzo.width = Math.round(rect.width * dpr);
      lienzo.height = Math.round(rect.height * dpr);
      lienzo.style.width = rect.width + 'px';
      lienzo.style.height = rect.height + 'px';
    }

    var rafRedibujo = null;
    function redibujar() {
      if (rafRedibujo !== null) return;
      rafRedibujo = requestAnimationFrame(function () { rafRedibujo = null; dibujar(); });
    }

    function dibujar() {
      if (!viewport.ancho || !viewport.alto) return;
      try {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, viewport.ancho, viewport.alto);
        dibujarTiles();
        var proyectados = proyectarPuntos();
        var clusters = agruparEnClusters(proyectados);
        ultimosClusters = clusters;
        claveClusters = clusteringVigente();
        dibujarMarcadores(clusters);
        dibujarOndas();
        posicionarPopupAbierto(proyectados);
        posicionarEtiqueta(proyectados);
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

    function dibujarTiles() {
      // Relleno base primero: así un tile que todavía no cargó, o que
      // falló definitivamente, nunca deja un hueco crudo — se ve el
      // fondo del mapa en su lugar.
      ctx.fillStyle = COLOR_FONDO_MAPA;
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

      for (var tx = tileX0; tx <= tileX1; tx++) {
        for (var ty = tileY0; ty <= tileY1; ty++) {
          var entrada = cargarTile(zTiles, tx, ty);
          if (!entrada) continue;
          var sx = (tx * TAM_TILE - origenX) * escalaExtra;
          var sy = (ty * TAM_TILE - origenY) * escalaExtra;
          var s = TAM_TILE * escalaExtra;
          if (entrada.cargado) {
            ctx.drawImage(entrada.img, sx, sy, s, s);
          } else if (!entrada.onReady) {
            entrada.onReady = redibujar;
          }
        }
      }
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
    var bufferProyectados = [];
    function proyectarPuntos() {
      var n = 0;
      for (var i = 0; i < puntos.length; i++) {
        var p = puntos[i];
        var xy = PROY.puntoAPantalla(p.lat, p.lng, viewport);
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

    // Clustering por grilla en espacio de pantalla: solo agrupa cuando
    // hay verdadero solapamiento visual, no por regla arbitraria de zoom.
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
          var cx = grupo.reduce(function (s, g) { return s + g.x; }, 0) / grupo.length;
          var cy = grupo.reduce(function (s, g) { return s + g.y; }, 0) / grupo.length;
          resultado.push({ tipo: 'cluster', x: cx, y: cy, miembros: grupo.map(function (g) { return g.punto; }) });
        }
      }
      return resultado;
    }

    function dibujarMarcadores(clusters) {
      var visiblesEsteFrame = Object.create(null);
      var reducido = prefiereMovimientoReducido();
      var hayNuevos = false;
      clusters.forEach(function (c) {
        if (c.tipo === 'cluster') { dibujarCluster(c); return; }
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
      });
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
      ctx.translate(x, y);
      ctx.beginPath();
      // Cabeza circular del pin + punta triangular hacia abajo
      ctx.arc(0, -r * 0.35, r, Math.PI * 0.08, Math.PI * 0.92, true);
      ctx.lineTo(0, r * 1.55);
      ctx.closePath();
      var grad = ctx.createLinearGradient(0, -r * 1.3, 0, r * 1.55);
      grad.addColorStop(0, aclarar(color, 18));
      grad.addColorStop(1, color);
      ctx.fillStyle = grad;
      ctx.shadowColor = 'rgba(0,0,0,.45)';
      ctx.shadowBlur = activo ? 10 : 5;
      ctx.shadowOffsetY = 2;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = activo ? 2.5 : 2;
      ctx.strokeStyle = '#ECEDEF';
      ctx.stroke();
      // Centro claro: hace de "ventana" del pin, referencia visual de
      // mapas profesionales (Google/Apple Maps usan el mismo recurso)
      var rVentana = r * RATIO_VENTANA;
      ctx.beginPath();
      ctx.arc(0, -r * 0.35, rVentana, 0, Math.PI * 2);
      ctx.fillStyle = '#0A0D13';
      ctx.fill();
      // Pictograma del rubro dentro de la ventana — segundo canal de
      // distinción además del color (ver comentario arriba: dos
      // rubros pueden quedar parecidos en un mapa oscuro, y el color
      // solo no es accesible para daltonismo).
      dibujarPictogramaRubro(punto, r, rVentana, color);
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
    function dibujarPictogramaRubro(punto, r, rVentana, color) {
      var pathD = punto && punto.rubroIcono;
      if (pathD) {
        var escala = (rVentana * 2 * ICONO_MARGEN) / ICONO_VIEWBOX;
        ctx.save();
        ctx.translate(0, -r * 0.35);
        ctx.scale(escala, escala);
        ctx.translate(-ICONO_VIEWBOX / 2, -ICONO_VIEWBOX / 2);
        ctx.lineWidth = ICONO_GROSOR;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = color;
        ctx.stroke(obtenerPath2D(pathD));
        ctx.restore();
        return;
      }
      if (punto && punto.rubroNombre) {
        var inicial = String(punto.rubroNombre).trim().charAt(0).toUpperCase();
        ctx.fillStyle = color;
        ctx.font = '700 ' + Math.round(rVentana * 1.05) + 'px "IBM Plex Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(inicial, 0, -r * 0.35 + 0.5);
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
    function dibujarCluster(c) {
      var conteo = Object.create(null);
      c.miembros.forEach(function (m) {
        var col = colorSeguro(m && m.color);
        conteo[col] = (conteo[col] || 0) + 1;
      });
      var colores = Object.keys(conteo).sort(function (a, b) { return conteo[b] - conteo[a]; });
      var colorDominante = colores[0];
      var esUnRubro = colores.length === 1;

      var r = RADIO_CLUSTER;
      var esResaltado = clusterResaltadoKey === (Math.round(c.x) + ':' + Math.round(c.y));
      var rGlow = r + (esResaltado ? 11 : 7);
      // Halo de luz detrás del cluster — sin esto el círculo quedaba
      // plano contra el tile pálido del basemap y se perdía. Con el
      // halo, el mismo cluster "flota" sobre el mapa.
      ctx.beginPath();
      ctx.arc(c.x, c.y, rGlow, 0, Math.PI * 2);
      ctx.fillStyle = hexARgba(colorDominante, esResaltado ? 0.35 : 0.22);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      var gradCluster = ctx.createRadialGradient(c.x - r * 0.3, c.y - r * 0.3, 1, c.x, c.y, r);
      if (esUnRubro) {
        gradCluster.addColorStop(0, aclarar(colorDominante, 22));
        gradCluster.addColorStop(1, colorDominante);
      } else {
        gradCluster.addColorStop(0, 'rgba(32,38,50,.96)');
        gradCluster.addColorStop(1, 'rgba(14,17,24,.96)');
      }
      ctx.fillStyle = gradCluster;
      ctx.shadowColor = 'rgba(0,0,0,.4)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 1;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = esUnRubro ? '#ECEDEF' : colorDominante;
      ctx.stroke();
      ctx.fillStyle = esUnRubro ? '#0A0D13' : '#ECEDEF';
      ctx.font = '700 12px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(c.miembros.length), c.x, c.y + 1);
    }

    /* ── Interacción: pan + zoom (mouse, touch, rueda, teclado) ── */
    var arrastrando = false, ultimoX = 0, ultimoY = 0, sePanneo = false;
    var pointerActivoId = null; // solo un puntero controla el pan a la vez

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
      if (inerciaRAF !== null) { cancelAnimationFrame(inerciaRAF); inerciaRAF = null; }
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
        var dtPaso = previo ? ahora - previo : 16;
        var factor = Math.max(0, 1 - FRICCION * dtPaso * 12);
        vx *= factor; vy *= factor;
        var v = Math.sqrt(vx * vx + vy * vy);
        if (v < 0.02) { inerciaRAF = null; return; }
        var c0 = PROY.proyectar(viewport.lat, viewport.lng, viewport.zoom);
        var nuevo = PROY.desproyectar(c0.x - vx * dtPaso, c0.y - vy * dtPaso, viewport.zoom);
        viewport.lat = nuevo.lat; viewport.lng = nuevo.lng;
        redibujar();
        inerciaRAF = requestAnimationFrame(function (t) { paso(t, ahora); });
      }
      inerciaRAF = requestAnimationFrame(function (t) { paso(t, null); });
    }

    lienzo.addEventListener('pointerdown', function (e) {
      if (pointerActivoId !== null) return; // ya hay otro dedo/puntero arrastrando — el pellizco se maneja aparte
      cancelarInercia();
      pointerActivoId = e.pointerId;
      arrastrando = true; sePanneo = false;
      ultimoX = e.clientX; ultimoY = e.clientY;
      muestrasMovimiento = [];
      registrarMuestra(e.clientX, e.clientY);
      lienzo.setPointerCapture(e.pointerId);
      lienzo.style.cursor = 'grabbing';
    });
    lienzo.addEventListener('pointermove', function (e) {
      if (arrastrando) {
        if (e.pointerId !== pointerActivoId) return; // ignorar punteros secundarios mientras se arrastra
        var dx = e.clientX - ultimoX, dy = e.clientY - ultimoY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) sePanneo = true;
        ultimoX = e.clientX; ultimoY = e.clientY;
        registrarMuestra(e.clientX, e.clientY);
        var c0 = PROY.proyectar(viewport.lat, viewport.lng, viewport.zoom);
        var nuevo = PROY.desproyectar(c0.x - dx, c0.y - dy, viewport.zoom);
        viewport.lat = nuevo.lat; viewport.lng = nuevo.lng;
        cerrarPopup();
        redibujar();
        return;
      }
      var clusters = clustersActuales();
      var cerca = buscarMarcadorEn(e, clusters);
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
    });
    lienzo.addEventListener('pointerup', function (e) {
      if (e.pointerId !== pointerActivoId) return;
      pointerActivoId = null;
      arrastrando = false;
      lienzo.style.cursor = 'grab';
      if (!sePanneo) {
        var clusters = clustersActuales();
        var cerca = buscarMarcadorEn(e, clusters);
        if (cerca) manejarClick(cerca);
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
        arrastrando = false;
        lienzo.style.cursor = 'grab';
      }
    });
    lienzo.style.cursor = 'grab';

    lienzo.addEventListener('focus', function () { focoVisible = true; redibujar(); });
    lienzo.addEventListener('blur', function () { focoVisible = false; redibujar(); });

    function buscarMarcadorEn(evtPointer, clusters) {
      var rect = lienzo.getBoundingClientRect();
      var mx = evtPointer.clientX - rect.left, my = evtPointer.clientY - rect.top;
      var mejor = null, mejorDist = TOLERANCIA_CLICK_PX;
      clusters.forEach(function (c) {
        var d = Math.sqrt(Math.pow(c.x - mx, 2) + Math.pow(c.y - my, 2));
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
    function dispersionMaxima(miembros, zoom) {
      var xs = new Array(miembros.length), ys = new Array(miembros.length);
      for (var i = 0; i < miembros.length; i++) {
        var p = PROY.proyectar(miembros[i].lat, miembros[i].lng, zoom);
        xs[i] = p.x; ys[i] = p.y;
      }
      var anchoDisp = Math.max.apply(null, xs) - Math.min.apply(null, xs);
      var altoDisp = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      return Math.max(anchoDisp, altoDisp);
    }

    function manejarClick(c) {
      if (c.tipo === 'cluster') {
        dispararOnda(c.x, c.y, c.miembros[0] && c.miembros[0].color);

        // Caso rápido, decisión de producto (no de bug): con pocos
        // lugares, mostrar la lista es más directo que animar un zoom,
        // aunque el zoom técnicamente pudiera separarlos.
        if (c.miembros.length <= 8) { abrirPopupCluster(c); return; }

        // Caso general: ¿de verdad hay a dónde acercar? Si en el mejor
        // zoom posible los miembros van a seguir dentro del radio de
        // fusión de clusters, ningún acercamiento los va a separar —
        // mostrar la lista en vez de animar hacia un destino que no
        // cambia nada.
        var nuncaSeSepara = dispersionMaxima(c.miembros, ZOOM_MAX) < RADIO_CLUSTER_PX;
        if (nuncaSeSepara) { abrirPopupCluster(c); return; }

        var enc = PROY.encuadrar(c.miembros, viewport.ancho, viewport.alto, 50, ZOOM_MAX);
        var zoomDestino = PROY.clamp(Math.max(viewport.zoom + 1.2, Math.min(viewport.zoom + 2.4, enc.zoom)), ZOOM_MIN, ZOOM_MAX);
        animarA(enc.lat, enc.lng, zoomDestino);
        return;
      }
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
    function zoomAnclado(nuevoZoom, xRel, yRel) {
      nuevoZoom = PROY.clamp(nuevoZoom, ZOOM_MIN, ZOOM_MAX);
      if (Math.abs(nuevoZoom - viewport.zoom) < 0.0001) return;
      var geoFoco = PROY.pantallaAPunto(xRel, yRel, viewport);
      viewport.zoom = nuevoZoom;
      var pFoco = PROY.proyectar(geoFoco.lat, geoFoco.lng, viewport.zoom);
      var centroMundoX = pFoco.x + viewport.ancho / 2 - xRel;
      var centroMundoY = pFoco.y + viewport.alto / 2 - yRel;
      var nuevoCentro = PROY.desproyectar(centroMundoX, centroMundoY, viewport.zoom);
      viewport.lat = nuevoCentro.lat;
      viewport.lng = nuevoCentro.lng;
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
    lienzo.addEventListener('wheel', function (e) {
      e.preventDefault();
      cancelarInercia();
      var rect = lienzo.getBoundingClientRect();
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
      var rect = lienzo.getBoundingClientRect();
      var xRel = e.clientX - rect.left, yRel = e.clientY - rect.top;
      var geoFoco = PROY.pantallaAPunto(xRel, yRel, viewport);
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
      var pFoco = PROY.proyectar(geoFoco.lat, geoFoco.lng, zoomDestino);
      var destino = PROY.desproyectar(
        pFoco.x + viewport.ancho / 2 - xRel,
        pFoco.y + viewport.alto / 2 - yRel,
        zoomDestino
      );
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
    contenedor.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !popup.hidden) {
        e.stopPropagation();
        cerrarPopup(true);
      }
    });

    function desplazarPx(dx, dy) {
      cancelarInercia();
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
    var pinchDist0 = null, pinchZoom0 = null, pinchCentro0 = null;
    contenedor.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        pinchDist0 = distanciaToques(e.touches);
        pinchZoom0 = viewport.zoom;
        pinchCentro0 = centroToques(e.touches);
        // El pellizco toma el control: cede cualquier arrastre de un
        // solo puntero (o inercia post-arrastre) que estuviera en
        // curso, para que no compitan.
        arrastrando = false;
        pointerActivoId = null;
        cancelarInercia();
        cerrarPopup();
      }
    }, { passive: true });
    contenedor.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2 && pinchDist0) {
        var d = distanciaToques(e.touches);
        var centroActual = centroToques(e.touches);
        var nuevoZoom = PROY.clamp(pinchZoom0 + Math.log2(d / pinchDist0), ZOOM_MIN, ZOOM_MAX);

        var rect = lienzo.getBoundingClientRect();
        var focoXInicialRel = pinchCentro0.x - rect.left;
        var focoYInicialRel = pinchCentro0.y - rect.top;
        var geoFoco = PROY.pantallaAPunto(focoXInicialRel, focoYInicialRel, viewport);

        viewport.zoom = nuevoZoom;
        var pFoco = PROY.proyectar(geoFoco.lat, geoFoco.lng, viewport.zoom);
        var centroActualRelX = centroActual.x - rect.left;
        var centroActualRelY = centroActual.y - rect.top;
        var centroMundoX = pFoco.x + viewport.ancho / 2 - centroActualRelX;
        var centroMundoY = pFoco.y + viewport.alto / 2 - centroActualRelY;
        var nuevoCentro = PROY.desproyectar(centroMundoX, centroMundoY, viewport.zoom);
        viewport.lat = nuevoCentro.lat;
        viewport.lng = nuevoCentro.lng;
        redibujar();
      }
    }, { passive: true });
    contenedor.addEventListener('touchend', function (e) {
      if (e.touches.length < 2) { pinchDist0 = null; pinchCentro0 = null; }
    });
    function distanciaToques(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
    function centroToques(t) { return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 }; }

    /* ── Animación suave de zoom/pan (usada por focar/encuadrar) ── */
    function animarA(lat, lng, zoom, duracion) {
      if (animacionZoom) cancelAnimationFrame(animacionZoom);
      cancelarInercia();
      if (prefiereMovimientoReducido()) {
        viewport.lat = lat; viewport.lng = lng; viewport.zoom = zoom;
        redibujar();
        return;
      }
      var origen = { lat: viewport.lat, lng: viewport.lng, zoom: viewport.zoom };
      var destino = { lat: lat, lng: lng, zoom: zoom };
      var inicio = performance.now();
      duracion = duracion || DURACION_VUELO_MS;
      function paso(ahora) {
        var t = Math.min(1, (ahora - inicio) / duracion);
        var e = easeOutCubic(t);
        viewport.lat = origen.lat + (destino.lat - origen.lat) * e;
        viewport.lng = origen.lng + (destino.lng - origen.lng) * e;
        viewport.zoom = origen.zoom + (destino.zoom - origen.zoom) * e;
        redibujar();
        if (t < 1) animacionZoom = requestAnimationFrame(paso);
        else animacionZoom = null;
      }
      animacionZoom = requestAnimationFrame(paso);
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
    function posicionarPopupEn(x, y) {
      var anchoPopup = popup.offsetWidth || 220;
      var altoPopup = popup.offsetHeight || 90;
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
      popup.querySelector('.uru-mapa-popup-nombre').textContent = punto.nombre;
      popup.querySelector('.uru-mapa-popup-direccion').textContent = punto.direccion || '';
      popup.querySelector('.uru-mapa-popup-link--maps').href = hrefMapsDe(punto);
      var link = popup.querySelector('.uru-mapa-popup-link:not(.uru-mapa-popup-link--maps)');
      if (link) link.href = punto.href;
      popup.setAttribute('role', 'group');
      popup.setAttribute('aria-label', punto.nombre || 'Detalle del lugar');
      popup.hidden = false;
      var colorBorde = (punto.color && RE_HEX.test(punto.color)) ? punto.color : 'var(--granate-clara)';
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
      popup.style.borderLeft = '3px solid var(--granate-clara)';
      var btnCerrar = popup.querySelector('.uru-mapa-popup-cerrar');
      btnCerrar.addEventListener('click', function () { cerrarPopup(true); });
      // Posición síncrona (ver nota en abrirPopup): c.x/c.y son las
      // coordenadas de pantalla que el propio click ya calculó.
      posicionarPopupEn(c.x, c.y);
      if (typeof btnCerrar.focus === 'function') btnCerrar.focus({ preventScroll: true });
      redibujar();
    }
    function posicionarPopupAbierto(proyectados) {
      if (popup.hidden || idAbierto === null) return;
      var p = proyectados.filter(function (pr) { return pr.punto.id === idAbierto; })[0];
      if (!p) { cerrarPopup(); return; }
      // Clamp para que el popup nunca quede parcialmente fuera del
      // contenedor cuando el marcador está cerca de un borde.
      posicionarPopupEn(p.x, p.y);
    }

    function posicionarEtiqueta(proyectados) {
      // No mostrar la etiqueta liviana sobre el mismo punto que ya
      // tiene el popup completo abierto — sería redundante.
      if (!puntoResaltado || puntoResaltado.id === idAbierto) { etiqueta.hidden = true; return; }
      var p = proyectados.filter(function (pr) { return pr.punto.id === puntoResaltado.id; })[0];
      if (!p) { etiqueta.hidden = true; return; }
      etiqueta.textContent = puntoResaltado.nombre;
      etiqueta.style.left = p.x + 'px';
      etiqueta.style.top = p.y + 'px';
      etiqueta.hidden = false;
    }

    // ── Prioridad visual derivada del orden de exposición ──
    // INTELIGENCIA VISUAL, no un motor de scoring paralelo: este
    // archivo NUNCA debe decidir qué lugar es "mejor" — esa decisión
    // es enteramente de motor-exposicion.js (ver `ordenarPorScore`,
    // que ya deja los resultados ordenados por score descendente antes
    // de que lleguen a app.js y de ahí a `establecerPuntos`). Pero ese
    // orden YA es información real y gratuita: el índice de un punto
    // dentro del array de entrada es, en los hechos, su rango de
    // relevancia. Ignorar esa señal y tratar a todos los marcadores
    // igual visualmente sería desperdiciar algo que el resto del
    // sistema ya calculó con más contexto del que este renderer tiene
    // o debería tener. Por eso: los primeros `TOP_PRIORIDAD_VISUAL`
    // puntos del array (tal cual llegan) se dibujan con una leve
    // jerarquía — halo sutil + se dibujan al final (encima del resto
    // cuando hay solapamiento visual) — sin inventar ninguna métrica
    // propia y sin exponer ninguna API nueva que motor-exposicion.js
    // tendría que aprender a llenar. Si `establecerPuntos` recibe un
    // conjunto que no viene ordenado por relevancia (p. ej. otro
    // consumidor futuro), el peor caso es una jerarquía visual
    // arbitraria pero inofensiva — nunca un error.
    var TOP_PRIORIDAD_VISUAL = 3;
    var rangoPorId = Object.create(null); // id -> índice en el array de entrada (0 = más relevante)

    function esPrioridadVisual(id) {
      var rango = rangoPorId[id];
      return rango !== undefined && rango < TOP_PRIORIDAD_VISUAL;
    }

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
      var p = puntos.filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      animarA(p.lat, p.lng, Math.max(viewport.zoom, 15));
    }

    function resaltar(id) {
      idResaltado = id;
      puntoResaltado = puntos.filter(function (p) { return p.id === id; })[0] || null;
      redibujar();
    }
    function quitarResaltado() { idResaltado = null; puntoResaltado = null; redibujar(); }

    var resizeObs = null;
    var resizeFallback = null;
    if ('ResizeObserver' in global) {
      resizeObs = new ResizeObserver(function () { medir(); redibujar(); });
      resizeObs.observe(contenedor);
    } else {
      // Navegador sin ResizeObserver: al menos reaccionar al resize de
      // la ventana, en vez de quedar con un tamaño de canvas obsoleto.
      resizeFallback = function () { medir(); redibujar(); };
      global.addEventListener('resize', resizeFallback);
    }
    medir();

    // Si la tipografía todavía no había cargado cuando se dibujó el
    // primer frame, la inicial de rubro dentro del pin salía con la
    // fuente de respaldo del sistema. Un único redibujo cuando las
    // fuentes terminan de cargar corrige ese frame inicial sin costo
    // permanente.
    if (global.document && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { redibujar(); }).catch(function () {});
    }

    return {
      on: emisor.on,
      establecerPuntos: establecerPuntos,
      encuadrarTodos: encuadrarTodos,
      enfocar: enfocar,
      resaltar: resaltar,
      quitarResaltado: quitarResaltado,
      destruir: function () {
        if (resizeObs) resizeObs.disconnect();
        if (resizeFallback) global.removeEventListener('resize', resizeFallback);
        if (animacionZoom) cancelAnimationFrame(animacionZoom);
        if (rafRedibujo !== null) cancelAnimationFrame(rafRedibujo);
        if (rafOndas !== null) cancelAnimationFrame(rafOndas);
        if (rafApariciones !== null) cancelAnimationFrame(rafApariciones);
        cancelarInercia();
        if (wheelRAF !== null) cancelAnimationFrame(wheelRAF);
        contenedor.innerHTML = '';
      }
    };
  }

  global.URU_MOTOR_MAPA_RENDER = { crear: crear };
})(typeof window !== 'undefined' ? window : global);
