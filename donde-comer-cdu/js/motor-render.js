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
  var RADIO_MARCADOR = 10;
  var RADIO_CLUSTER = 16;
  var RADIO_CLUSTER_PX = 36;
  var ZOOM_MIN = 4, ZOOM_MAX = 18;

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

    function proyectarPuntos() {
      return puntos.map(function (p) {
        var xy = PROY.puntoAPantalla(p.lat, p.lng, viewport);
        return { punto: p, x: xy.x, y: xy.y };
      }).filter(function (p) {
        return p.x > -40 && p.x < viewport.ancho + 40 && p.y > -40 && p.y < viewport.alto + 40;
      });
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
      clusters.forEach(function (c) {
        if (c.tipo === 'cluster') { dibujarCluster(c); return; }
        var esResaltado = c.punto.id === idResaltado;
        var esAbierto = c.punto.id === idAbierto;
        dibujarMarcador(c.x, c.y, c.punto, esResaltado || esAbierto);
      });
    }

    // Pin con forma de gota — silueta reconocible de "lugar en un mapa",
    // no una bolita genérica. El color codifica el rubro (ver
    // rubros-meta.js) para que de un vistazo se distinga qué es qué,
    // igual que la franja de color de la etiqueta de rubro en las
    // tarjetas. Además de color, la ventana central lleva la inicial
    // del rubro: el color solo no alcanza (dos rubros pueden quedar
    // parecidos en un mapa oscuro, y no es accesible para daltonismo),
    // la letra es un segundo canal de distinción que no depende del color.
    function dibujarMarcador(x, y, punto, activo) {
      var color = colorSeguro(punto && punto.color);
      var r = activo ? RADIO_MARCADOR + 2.5 : RADIO_MARCADOR;
      ctx.save();
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
      ctx.beginPath();
      ctx.arc(0, -r * 0.35, r * 0.36, 0, Math.PI * 2);
      ctx.fillStyle = '#0A0D13';
      ctx.fill();
      // Inicial del rubro dentro de la ventana — segundo canal de
      // distinción además del color (ver comentario arriba).
      if (punto && punto.rubroNombre) {
        var inicial = String(punto.rubroNombre).trim().charAt(0).toUpperCase();
        ctx.fillStyle = color;
        ctx.font = '700 ' + Math.round(r * 0.5) + 'px "IBM Plex Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(inicial, 0, -r * 0.35 + 0.5);
      }
      ctx.restore();
    }

    function hexARgba(hex, alpha) {
      var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }
    function aclarar(hex, pct) {
      var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      r = Math.min(255, r + pct * 2.55); g = Math.min(255, g + pct * 2.55); b = Math.min(255, b + pct * 2.55);
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

    lienzo.addEventListener('pointerdown', function (e) {
      if (pointerActivoId !== null) return; // ya hay otro dedo/puntero arrastrando — el pellizco se maneja aparte
      pointerActivoId = e.pointerId;
      arrastrando = true; sePanneo = false;
      ultimoX = e.clientX; ultimoY = e.clientY;
      lienzo.setPointerCapture(e.pointerId);
      lienzo.style.cursor = 'grabbing';
    });
    lienzo.addEventListener('pointermove', function (e) {
      if (arrastrando) {
        if (e.pointerId !== pointerActivoId) return; // ignorar punteros secundarios mientras se arrastra
        var dx = e.clientX - ultimoX, dy = e.clientY - ultimoY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) sePanneo = true;
        ultimoX = e.clientX; ultimoY = e.clientY;
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

    lienzo.addEventListener('wheel', function (e) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? -0.5 : 0.5;
      viewport.zoom = PROY.clamp(viewport.zoom + delta, ZOOM_MIN, ZOOM_MAX);
      cerrarPopup();
      redibujar();
    }, { passive: false });

    lienzo.addEventListener('dblclick', function () {
      animarA(viewport.lat, viewport.lng, Math.min(viewport.zoom + 1, ZOOM_MAX));
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
      var c0 = PROY.proyectar(viewport.lat, viewport.lng, viewport.zoom);
      var n = PROY.desproyectar(c0.x - dx, c0.y - dy, viewport.zoom);
      viewport.lat = n.lat; viewport.lng = n.lng;
      redibujar();
    }

    controles.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-zoom]');
      if (!btn || btn.disabled) return;
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
        // solo puntero que estuviera en curso, para que no compitan.
        arrastrando = false;
        pointerActivoId = null;
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
        contenedor.innerHTML = '';
      }
    };
  }

  global.URU_MOTOR_MAPA_RENDER = { crear: crear };
})(typeof window !== 'undefined' ? window : global);
