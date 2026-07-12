/* ═══════════════════════════════════════════════════════════════════════
 * URU SPOT — MÓDULO A (CORE)
 * Motor de infraestructura: mapa, filtros, búsqueda, favoritos, estado
 * global y utilidades. No contiene ningún dato de ciudad: el taxonomy de
 * categorías (GRUPOS) y el dataset de lugares (LUGARES) se pasan como
 * configuración desde el MÓDULO B (contenido) al llamar a UruSpotCore.init().
 *
 * Contrato de DOM esperado (los IDs deben existir en el HTML anfitrión):
 *   #mapa-leaflet, #mapa-filtros, #mapa-subfiltros, #mapa-legend,
 *   #mapa-legend-head, #mapa-legend-list, #mapa-search, #mapa-geoloc,
 *   #mapa-reset, #mapa-count, #mapa-total, #mapa-total-badge, #mapa-empty
 * Opcionales (si no existen, el motor simplemente no los actualiza):
 *   #cats-container, #cd-wrap-container, #hero-total-lugares,
 *   #stat-total-lugares, #stat-total-categorias, #search-spotlight,
 *   #spotlight-input, #spotlight-close, #bn-buscar, #bn-favoritos,
 *   #toggle-local, #toggle-visitante
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────
  // Utilidades puras (sin estado, sin DOM)
  // ─────────────────────────────────────────────────────────────────────
  // Tabla usada por utils.escapeHtml. Se crea una sola vez (antes se
  // recreaba el objeto literal por cada carácter especial encontrado).
  var ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  // [OPTIMIZACIÓN] Regex compartidas: antes cada llamada a normalizarTexto()
  // y escapeHtml() evaluaba un literal /regex/ propio, lo que crea una
  // instancia de RegExp nueva por invocación. normalizarTexto() sola corre
  // ~1700+ veces solo en el arranque (nombreNorm + categoriaNorm de cada
  // uno de los 862 lugares); compartir una única instancia elimina esas
  // asignaciones sin cambiar el resultado (los regex no llevan estado
  // relevante entre llamadas de .replace(), que resetea lastIndex solo).
  var DIACRITICS_REGEX = /[\u0300-\u036f]/g;
  var ESCAPE_REGEX = /[&<>"']/g;
  // [OPTIMIZACIÓN] starsHtml(rating) solo depende de Math.floor(rating),
  // que en este dominio (ratings de 0 a 5) tiene exactamente 6 salidas
  // posibles. En vez de reconstruir el string con un loop en cada llamada
  // (se invoca por cada popup abierto y por cada resultado de búsqueda
  // mostrado), se resuelve con una tabla precomputada una sola vez.
  var STARS_CACHE = ['☆☆☆☆☆', '★☆☆☆☆', '★★☆☆☆', '★★★☆☆', '★★★★☆', '★★★★★'];

  // [OPTIMIZACIÓN — Fase 2, punto 3.2] El buscador del panel del mapa
  // (bindControlesMapa) y el spotlight (initSpotlightSearch) debounceaban
  // la misma clase de operación — filtrar sobre el array completo de
  // lugares — con dos valores distintos (250ms y 150ms), sin ninguna
  // razón funcional para la diferencia; solo hacía que las dos búsquedas
  // del sitio se sintieran distintas entre sí. Se unifica en un único
  // punto intermedio (200ms): suficientemente bajo para no sentirse lento
  // al tipear, y suficientemente alto para seguir amortiguando el costo
  // de recorrer todosLosMarkers en cada evento (ver 2.1 para el problema
  // de fondo, que esta constante no resuelve, solo estandariza).
  var DEBOUNCE_BUSQUEDA_MS = 200;

  var utils = {
    // Normaliza acentos/mayúsculas para que "heladeria" encuentre "Heladería".
    normalizarTexto: function (str) {
      return String(str || '')
        .normalize('NFD')
        .replace(DIACRITICS_REGEX, '')
        .toLowerCase();
    },

    // [OPTIMIZACIÓN] Ver STARS_CACHE: lookup directo en vez de loop+concat.
    // Mismo resultado que antes para cualquier rating (incluidos los casos
    // límite fuera de 0-5, que el loop original también recortaba de
    // forma efectiva a "todo lleno" o "todo vacío").
    starsHtml: function (rating) {
      var full = Math.floor(rating);
      if (full < 0) full = 0; else if (full > 5) full = 5;
      return STARS_CACHE[full];
    },

    escapeHtml: function (str) {
      return String(str).replace(ESCAPE_REGEX, function (c) {
        return ESCAPE_MAP[c];
      });
    },

    // Convierte un teléfono en formato local/argentino a dígitos puros
    // aptos para un enlace wa.me (código de país + número, sin '+', espacios
    // ni guiones). No modifica el dato original (lugar.telefono).
    telefonoWhatsapp: function (telefono) {
      if (!telefono) return null;
      var digitos = String(telefono).replace(/[^\d]/g, '');
      if (digitos.indexOf('54') !== 0) digitos = '54' + digitos.replace(/^0+/, '');
      // [FIX — punto 4.2] Antes se devolvía el resultado tal cual, sin
      // validar longitud: un dato sucio en el JSON (ej. "telefono" mal
      // cargado, con letras o incompleto) podía generar un link
      // "wa.me/54123" roto sin que nada lo detectara. Un teléfono argentino
      // con código de país (54 + característica + número, con o sin el 9
      // de celular) cae siempre entre 10 y 13 dígitos totales; fuera de
      // ese rango se descarta como no-plausible en vez de armar un link
      // que sabemos que no va a funcionar.
      if (digitos.length < 10 || digitos.length > 13) return null;
      return digitos;
    },

    debounce: function (fn, wait) {
      var t;
      return function () {
        var ctx = this, args = arguments;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(ctx, args); }, wait);
      };
    },

    // [NUEVA FUNCIONALIDAD — vista lista] Distancia en línea recta (fórmula
    // de Haversine) entre la posición del usuario y un lugar, en km. Se usa
    // para "Más cerca" (orden) y para mostrar "a X m/km" en cada tarjeta de
    // la lista. Es una estimación geométrica sobre coordenadas reales — no
    // inventa ningún dato del lugar — por eso se muestra siempre como
    // distancia en línea recta, nunca como "tiempo caminando/en auto" (eso
    // sí requeriría un servicio de ruteo real que este proyecto no tiene).
    distanciaKm: function (lat1, lng1, lat2, lng2) {
      var R = 6371;
      var dLat = (lat2 - lat1) * Math.PI / 180;
      var dLng = (lng2 - lng1) * Math.PI / 180;
      var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // Favoritos (localStorage) — genérico, la clave es configurable
  // ─────────────────────────────────────────────────────────────────────
  function crearFavoritos(storageKey) {
    var KEY = storageKey || 'uruspot_favoritos';
    // [OPTIMIZACIÓN] Antes getFavoritos() hacía localStorage.getItem +
    // JSON.parse en CADA llamada, incluida esFavorito() (que puede
    // invocarse una vez por cada botón de favorito que se pinta en
    // pantalla). Se cachea el array ya parseado en memoria: se lee una
    // sola vez y se reutiliza; toggle() sigue escribiendo a localStorage
    // en cada cambio (comportamiento de persistencia idéntico al original).
    var cache = null;
    function leerDeStorage() {
      try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
    }
    function getFavoritosInterno() {
      if (cache === null) cache = leerDeStorage();
      return cache;
    }
    // API pública: devuelve una copia, igual que antes (JSON.parse siempre
    // producía un array nuevo) — así ningún consumidor externo que mute el
    // resultado puede corromper la caché interna.
    function getFavoritos() { return getFavoritosInterno().slice(); }
    function esFavorito(id) { return getFavoritosInterno().indexOf(id) !== -1; }
    function toggleFavorito(id) {
      var favs = getFavoritosInterno();
      var i = favs.indexOf(id);
      var seAgrego = (i === -1);
      if (seAgrego) favs.push(id); else favs.splice(i, 1);
      try {
        localStorage.setItem(KEY, JSON.stringify(favs));
      } catch (e) {
        // [FIX — punto 4.3] Antes este catch quedaba vacío: si el guardado
        // fallaba (Safari en modo privado, storage lleno), la función
        // devolvía igual el resultado como si hubiera persistido, y el
        // botón de favorito cambiaba de estado visualmente aunque no se
        // hubiera guardado nada — quedaba inconsistente apenas se
        // recargaba la página. Ahora, si falla, se revierte el cambio en
        // memoria y se devuelve el estado ANTERIOR (real), para que el
        // botón no muestre algo que no se guardó.
        if (seAgrego) favs.pop(); else favs.splice(i, 0, id);
        return !seAgrego;
      }
      return seAgrego;
    }
    return { get: getFavoritos, is: esFavorito, toggle: toggleFavorito };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Toast / snackbar — feedback no bloqueante para acciones puntuales
  // (favorito guardado/quitado con "Deshacer", enlace copiado, errores de
  // geolocalización o de carga). Reemplaza los alert() nativos que existían
  // en esos mismos puntos: alert() bloquea el hilo principal y toda la
  // interacción de la página hasta que el usuario lo cierra manualmente —
  // exactamente lo opuesto a la sensación de "aplicación" que persigue este
  // proyecto. Usa var(--z-toast), ya reservado en :root (core.css, capa
  // tokens) sin que ningún componente lo consumiera todavía. Un solo
  // contenedor compartido para todo el documento (igual que #scrim): no
  // hace falta que exista en el HTML, se crea perezosamente en el primer
  // toast que se muestra.
  // ─────────────────────────────────────────────────────────────────────
  var TOAST_DURACION_MS = 4200;
  var toastContainerEl = null;
  function getToastContainer() {
    if (toastContainerEl) return toastContainerEl;
    toastContainerEl = document.createElement('div');
    toastContainerEl.className = 'us-toast-container';
    toastContainerEl.setAttribute('role', 'status');
    toastContainerEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastContainerEl);
    return toastContainerEl;
  }
  // mostrarToast(mensaje, { accionLabel, onAccion, duracion })
  // opts.accionLabel + opts.onAccion son opcionales: sin ellos, el toast es
  // solo informativo (ej. "Enlace copiado"); con ellos, agrega un botón de
  // acción (ej. "Deshacer" al quitar un favorito).
  function mostrarToast(mensaje, opts) {
    opts = opts || {};
    var cont = getToastContainer();
    var el = document.createElement('div');
    el.className = 'us-toast';

    var texto = document.createElement('span');
    texto.className = 'us-toast-msg';
    texto.textContent = mensaje;
    el.appendChild(texto);

    var cerrado = false;
    var timeoutId = null;
    function cerrar() {
      if (cerrado) return;
      cerrado = true;
      clearTimeout(timeoutId);
      el.classList.remove('is-visible');
      el.classList.add('is-leaving');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }
    if (opts.accionLabel && typeof opts.onAccion === 'function') {
      var btnAccion = document.createElement('button');
      btnAccion.type = 'button';
      btnAccion.className = 'us-toast-action';
      btnAccion.textContent = opts.accionLabel;
      btnAccion.addEventListener('click', function () {
        opts.onAccion();
        cerrar();
      });
      el.appendChild(btnAccion);
    }
    var btnCerrar = document.createElement('button');
    btnCerrar.type = 'button';
    btnCerrar.className = 'us-toast-close';
    btnCerrar.setAttribute('aria-label', 'Cerrar aviso');
    btnCerrar.textContent = '✕';
    btnCerrar.addEventListener('click', cerrar);
    el.appendChild(btnCerrar);

    cont.appendChild(el);
    // Fuerza reflow: agregar la clase "is-visible" en el mismo frame en que
    // se crea el nodo no dispara la transición de entrada (el navegador
    // colapsa ambos cambios de estilo en un único frame sin transición).
    void el.offsetWidth;
    el.classList.add('is-visible');

    var duracion = opts.duracion || TOAST_DURACION_MS;
    timeoutId = setTimeout(cerrar, duracion);
    // Pausa el auto-cierre mientras el puntero está sobre el toast (mismo
    // criterio que cualquier snackbar: no se cierra solo mientras el
    // usuario está a mitad de leerlo o a punto de tocar "Deshacer").
    el.addEventListener('mouseenter', function () { clearTimeout(timeoutId); });
    el.addEventListener('mouseleave', function () { timeoutId = setTimeout(cerrar, 1500); });

    return { close: cerrar };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Trampa de foco — utilidad compartida por Drawer y Spotlight (los dos
  // diálogos con aria-modal="true" del sitio). Antes ninguno de los dos
  // bloqueaba realmente el foco de teclado dentro de sí mismo: con Tab, un
  // usuario de teclado o de lector de pantalla podía salir del diálogo
  // "modal" y seguir tabulando por el contenido de fondo mientras el
  // diálogo seguía abierto en pantalla — contradice el propio
  // aria-modal="true" que ya declaraba el HTML. Tampoco se devolvía el
  // foco al botón que abrió el diálogo al cerrarlo (quedaba huérfano, en
  // <body>). Selector de "focusable" deliberadamente simple: cubre los
  // elementos que hoy existen dentro de Drawer/Spotlight, no pretende ser
  // una librería general de accesibilidad.
  // ─────────────────────────────────────────────────────────────────────
  var FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function crearTrampaFoco(container) {
    var previoFocus = null;
    function onKeydown(e) {
      if (e.key !== 'Tab') return;
      var focusables = Array.prototype.slice.call(container.querySelectorAll(FOCUSABLE_SELECTOR))
        .filter(function (el) { return el.offsetParent !== null; }); // solo lo visible
      if (!focusables.length) return;
      var first = focusables[0];
      var last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
    return {
      // Guarda qué elemento tenía el foco antes de abrir (para restaurarlo
      // al cerrar) y empieza a interceptar Tab dentro del contenedor.
      activar: function () {
        previoFocus = document.activeElement;
        container.addEventListener('keydown', onKeydown);
      },
      desactivar: function () {
        container.removeEventListener('keydown', onKeydown);
        if (previoFocus && typeof previoFocus.focus === 'function') previoFocus.focus();
        previoFocus = null;
      }
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Motor principal
  // ─────────────────────────────────────────────────────────────────────
  function crearMotor(config) {
    config = config || {};

    var GRUPOS = config.grupos || {};
    // [OPTIMIZACIÓN] GRUPOS no cambia después de este punto (no hay ningún
    // GRUPOS[x] = ... en todo el archivo), así que sus claves se calculan
    // una sola vez y se reutilizan en todos los puntos que antes llamaban a
    // Object.keys(GRUPOS) por separado (initMapa, renderFiltros,
    // renderLeyenda, renderHeroCards, renderCdWrap, generarSEOItemLists,
    // actualizarContadoresHero) — entre ellos, dos llamadas dentro de
    // aplicarFiltros(), la función que corre en cada tecleo de búsqueda y
    // en cada clic de filtro. clusterGroups se construye iterando este
    // mismo conjunto de claves en initMapa() (ver más abajo), así que
    // Object.keys(clusterGroups) es siempre idéntico a GRUPO_KEYS y
    // también se reemplaza por la misma constante.
    var GRUPO_KEYS = Object.keys(GRUPOS);
    // [OPTIMIZACIÓN] Antes agregarLugar() recalculaba
    // "Object.keys(GRUPOS)[0]" en cada una de sus 862 llamadas solo para
    // tener un valor de respaldo casi nunca usado (solo cuando el JSON trae
    // un lugar con "grupo" inválido o ausente). Se calcula una única vez acá.
    var GRUPO_DEFECTO = config.grupoPorDefecto || GRUPO_KEYS[0];
    var favoritos = crearFavoritos(config.favoritesKey);

    var map = null;
    var clusterGroups = {};
    var todosLosMarkers = []; // {marker, grupo, categoria, nombreNorm, categoriaNorm, lugar, color}
    // [ARQUITECTURA — carga core/detalles] Índice id → entry con acceso
    // O(1). Antes getLugarPorId()/irALugar() recorrían todosLosMarkers
    // completo (862 comparaciones en el peor caso) cada vez que se abría un
    // lugar desde un link externo o desde el spotlight. Se llena en
    // agregarLugar() (una escritura extra por lugar, costo despreciable) y
    // se reutiliza acá y en cargarDetalles() (ver más abajo) para aplicar
    // el merge de detalles por id sin volver a escanear el array grande.
    var lugaresPorId = {};
    // [OPTIMIZACIÓN — Fase 2, punto 2.1] Índice grupo → array de las mismas
    // entradas de todosLosMarkers (mismas referencias de objeto, no copias:
    // cualquier cambio sobre una entrada se ve reflejado en ambas
    // estructuras, así que no hay riesgo de que queden desincronizadas).
    // Permite que aplicarFiltros() recorra solo los marcadores del grupo
    // activo en vez de los 862 completos cuando hay un filtro de categoría
    // puesto — ver aplicarFiltros() para el uso real.
    var markersPorGrupo = {};
    var filtroActivo = 'todos';
    var subFiltroActivo = null; // categoria específica dentro del grupo activo, o null = todas
    var textoBusqueda = '';
    // [FIX — AUDITORIA_DONDE_COMER.md, P3] true cuando se sabe con certeza
    // que NINGÚN marcador está oculto (recién cargados los datos, o recién
    // terminada una pasada completa de aplicarFiltros() en el estado
    // "todos + sin subfiltro + sin búsqueda"). Se pone en false en
    // cualquier pasada que no sea ese caso trivial, porque ahí es donde
    // pueden quedar marcadores ocultos dentro de su propio clusterGroup.
    // Permite un fast-path 100% seguro: solo se salta el recorrido de
    // markersPorGrupo cuando ya se sabe que no hay nada que restaurar.
    var estadoSinOcultos = true;

    // [NUEVA FUNCIONALIDAD — pasada "toolbar del mapa"] Estado de la vista
    // alternativa a Leaflet (#mapa-view-toggle), del criterio de orden
    // (#mapa-orden) y de la última posición geográfica conocida del
    // usuario (compartida entre "📍 Cerca de mí" y "Más cerca" del
    // selector de orden, para no pedir permiso de geolocalización dos
    // veces por la misma sesión).
    var vistaActual = 'mapa'; // 'mapa' | 'lista'
    var ordenActual = 'relevancia'; // 'relevancia' | 'cercania' | 'recomendados' | 'recientes'
    var posicionUsuario = null; // {lat, lng} | null

    // [OPTIMIZACIÓN] Caché del resultado ordenado por rating que usa
    // lugaresSugeridos(). todosLosMarkers queda fijo apenas termina
    // cargarDatos() en init() (no hay ninguna función pública que agregue
    // lugares después); el orden por rating es entonces el mismo en toda
    // la vida de la página, así que se ordena una sola vez la primera vez
    // que se pide, y se reutiliza (con distintos "cantidad") en cada
    // apertura del buscador con el campo vacío en vez de copiar+ordenar
    // los 862 lugares de nuevo cada vez.
    var sugeridosCache = null;

    // [OPTIMIZACIÓN] Objeto de opciones reutilizado por los dos únicos
    // puntos que llaman a setFiltro(grupo, { limpiarBusqueda: true }):
    // setFiltro() solo LEE opts.limpiarBusqueda, nunca lo modifica, así
    // que es seguro compartir la misma instancia en vez de crear un
    // objeto literal nuevo en cada clic.
    var OPTS_LIMPIAR_BUSQUEDA = { limpiarBusqueda: true };

    // Cache de nodos del DOM que exige el contrato documentado al inicio del
    // archivo (existen desde el arranque y nunca se reemplazan por completo,
    // así que buscarlos una sola vez evita repetir getElementById en el hot
    // path del buscador/filtros). Se completa en cachearElementos().
    var els = {};

    // Cache de íconos de Leaflet: todos los lugares de un mismo grupo (y
    // mismo estado "destacado") usan exactamente el mismo color/tamaño, así
    // que comparten la misma instancia de ícono en vez de crear un L.divIcon
    // por cada marcador (Leaflet soporta reusar íconos entre markers).
    var iconCache = {};

    // [LOTE 1 — Mejora 4, evidencia] Antes existía acá una clusterIconCache
    // keyeada por "color|childCount". Esa estrategia es correcta para
    // pinIcon() (26 combinaciones fijas: 13 colores × destacado/no) pero es
    // matemáticamente inútil para clusters: childCount NO es un estado fijo
    // del dominio, es una cantidad que cambia con cada pan/zoom (depende de
    // cuántos marcadores caen dentro de maxClusterRadius en la posición y
    // zoom actuales). Un mismo color puede generar, a lo largo de una sola
    // sesión de uso normal, decenas o cientos de valores distintos de
    // childCount — cada uno una clave nueva, retenida para siempre (nunca
    // se hacía delete ni se limitaba el tamaño del objeto). Resultado neto:
    // la caché fallaba en su propósito declarado ("evitar recrear el ícono
    // en cada zoom/pan" — en la práctica, para clusters, esto casi nunca se
    // cumplía) y además crecía sin límite durante toda la vida de la
    // pestaña (fuga de memoria de baja severidad pero real, agravada por el
    // tamaño del dataset). Se elimina la caché para clusters: crear un
    // L.divIcon por cluster visible es una operación barata (un objeto
    // literal + un string), muy por debajo del costo que en teoría se
    // buscaba evitar. Ver AUDITORIA_PERFORMANCE_donde-comer-cdu.md, P5.

    // Cache de las listas de botones "pill"/leyenda, actualizada cada vez
    // que renderFiltros()/renderLeyenda() reconstruyen su HTML. Evita
    // recorrer todo el documento en cada cambio de filtro.
    var pillNodes = null;
    var legendNodes = null;

    function cachearElementos() {
      els.filtros = document.getElementById('mapa-filtros');
      els.subfiltros = document.getElementById('mapa-subfiltros');
      els.legendList = document.getElementById('mapa-legend-list');
      els.legendHead = document.getElementById('mapa-legend-head');
      els.legendPanel = document.getElementById('mapa-legend');
      els.count = document.getElementById('mapa-count');
      els.empty = document.getElementById('mapa-empty');
      els.mapaDiv = document.getElementById('mapa-leaflet');
      els.buscador = document.getElementById('mapa-search');
      els.catsContainer = document.getElementById('cats-container');
      els.cdWrapContainer = document.getElementById('cd-wrap-container');
      els.statTotal = document.getElementById('stat-total-lugares');
      els.heroTotal = document.getElementById('hero-total-lugares');
      els.statCategorias = document.getElementById('stat-total-categorias');
      els.totalBadge = document.getElementById('mapa-total-badge');
      els.total = document.getElementById('mapa-total');
      els.resetBtn = document.getElementById('mapa-reset');
      els.geolocBtn = document.getElementById('mapa-geoloc');
      // [NUEVA FUNCIONALIDAD — pasada "toolbar del mapa"]
      els.orden = document.getElementById('mapa-orden');
      els.viewMapaBtn = document.getElementById('mapa-view-mapa');
      els.viewListaBtn = document.getElementById('mapa-view-lista');
      els.mapaCanvas = document.getElementById('mapa-canvas');
      els.listaDiv = document.getElementById('mapa-lista');
    }

    // ─── Íconos de mapa ───
    function pinIcon(color, destacado) {
      var key = color + '|' + (destacado ? '1' : '0');
      var icon = iconCache[key];
      if (!icon) {
        var claseExtra = destacado ? ' mapa-pin-destacado' : '';
        icon = iconCache[key] = L.divIcon({
          className: '',
          html: '<div class="mapa-pin' + claseExtra + '" style="background:' + color + '"></div>',
          iconSize: destacado ? [20, 20] : [16, 16],
          iconAnchor: destacado ? [10, 20] : [8, 16],
          popupAnchor: [0, -16]
        });
      }
      return icon;
    }

    function clusterIcon(color) {
      // [LOTE 1 — Mejora 4] Sin caché (ver nota junto a la declaración de
      // clusterIconCache más arriba, ahora eliminada). Cada cluster visible
      // recibe su propio L.divIcon nuevo, con el conteo real siempre
      // correcto — no hay riesgo de mostrar un número de un cluster viejo
      // reutilizado por error, y no hay ningún objeto que quede retenido
      // en memoria más allá de lo que Leaflet ya retiene por su cuenta
      // mientras el cluster existe.
      return function (cluster) {
        var count = cluster.getChildCount();
        return L.divIcon({
          className: 'mapa-cluster',
          html: '<div class="mapa-cluster-inner" style="background:' + color + '">' + count + '</div>',
          iconSize: [38, 38]
        });
      };
    }

    // ─── Inicialización del mapa ───
    function initMapa() {
      // [FIX v2] El intento anterior deshabilitaba dragging/tap y los volvía
      // a habilitar DENTRO del propio touchstart del mapa. Problema real:
      // Leaflet solo empieza a trackear un gesto si su handler ya estaba
      // activo ANTES de que el navegador dispare ese touchstart — al
      // habilitarlo recién ahí, ese primer swipe se "tragaba" sin mover
      // nada (ni mapa ni página), lo que se sentía como más lag/traba que
      // antes, no menos.
      //
      // Solución correcta: el mapa queda 100% funcional desde el arranque
      // (sin tocar dragging/tap), pero se tapa con una capa transparente
      // APARTE por encima. El primer toque/click cae sobre esa capa (nunca
      // llega a Leaflet), así que ese primer gesto siempre se comporta como
      // scroll normal de página. La capa se saca sola apenas se la toca, y
      // desde el segundo gesto en adelante el mapa reacciona directo, sin
      // ninguna carrera contra el gesto en curso.
      map = L.map('mapa-leaflet', { scrollWheelZoom: false })
        .setView(config.mapCenter || [0, 0], config.mapZoom || 13);

      L.tileLayer(config.tileUrl || 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: config.tileAttribution || '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19
      }).addTo(map);

      var mapaEl = document.getElementById('mapa-leaflet');
      if (mapaEl) {
        var activador = document.createElement('div');
        activador.className = 'mapa-activador';
        activador.setAttribute('aria-hidden', 'true');
        activador.innerHTML = '<span>Tocá el mapa para interactuar</span>';
        mapaEl.appendChild(activador);

        var quitarActivador = function () {
          if (activador.parentNode) activador.parentNode.removeChild(activador);
          map.scrollWheelZoom.enable();
        };
        activador.addEventListener('touchstart', quitarActivador, { passive: true, once: true });
        activador.addEventListener('click', quitarActivador, { once: true });
      } else {
        map.scrollWheelZoom.enable();
      }

      // Un cluster group por grupo (así cada "racimo" respeta el color de su
      // categoría y los filtros pueden mostrar/ocultar grupos enteros al instante).
      // [FIX] chunkedLoading: con 862 lugares, agregarlos todos de un tirón
      // congelaba el hilo principal un instante (más notorio en celulares
      // gama media/baja). Con esto, Leaflet.markercluster los procesa en
      // lotes vía requestAnimationFrame en vez de en un solo bloque síncrono.
      GRUPO_KEYS.forEach(function (g) {
        clusterGroups[g] = L.markerClusterGroup({
          iconCreateFunction: clusterIcon(GRUPOS[g].color),
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          maxClusterRadius: 46,
          chunkedLoading: true
        });
      });
    }

    // ─── Popup de un lugar ───
    function popupHtml(lugar, color) {
      var html = '';
      var g = GRUPOS[lugar.grupo];
      // [NUEVA FUNCIONALIDAD — paridad mapa/lista] La vista lista ya
      // permite guardar en favoritos y compartir cada lugar
      // (cardListaHtml/lista-card-actions); el popup del mapa —la
      // superficie que en la práctica ve la mayoría de las visitas,
      // porque "Mapa" es la vista por defecto— no ofrecía ninguna de las
      // dos. Mismos data-attribute (data-fav-id/data-share-id) que ya
      // reconoce bindAccionesLugar(), así que no hace falta lógica nueva:
      // solo pintar el botón y llamar a esa misma función desde
      // 'popupopen' (ver agregarLugar más abajo).
      var esFav = favoritos.is(lugar.id);
      if (lugar.destacado) html += '<span class="mapa-popup-destacado">★ Destacado</span>';
      html += '<span class="mapa-popup-cat">' + g.icon + ' ' + utils.escapeHtml(lugar.categoria || '') +
              ' <span class="mapa-popup-grupo">· ' + utils.escapeHtml(g.label) + '</span></span>';
      html += '<span class="mapa-popup-nombre">' + utils.escapeHtml(lugar.nombre || '') + '</span>';
      if (lugar.rating) {
        var rating = parseFloat(lugar.rating);
        if (!isNaN(rating)) {
          html += '<div class="mapa-popup-rating">' + utils.starsHtml(rating) + ' ' + rating.toFixed(1) +
                  (lugar.rating_count ? ' <span class="cant">(' + lugar.rating_count + ')</span>' : '') + '</div>';
        }
      } else {
        html += '<span class="mapa-popup-norating">Sin calificación aún</span>';
      }
      if (lugar.direccion) html += '<span class="mapa-popup-addr">📍 ' + utils.escapeHtml(lugar.direccion) + '</span>';
      if (lugar.descripcion) html += '<span class="mapa-popup-desc">' + utils.escapeHtml(lugar.descripcion) + '</span>';
      html += '<div class="mapa-popup-actions">';
      html += '<a class="ir" style="--pop-color:' + color + '" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + lugar.lat + ',' + lugar.lng + (lugar.place_id ? '&destination_place_id=' + lugar.place_id : '') + '">↗ Cómo llegar</a>';
      if (lugar.telefono) {
        html += '<a class="tel" href="tel:' + lugar.telefono.replace(/\s+/g, '') + '">📞 Llamar</a>';
        // [FIX — punto 4.2] El botón "Llamar" se queda igual (los
        // marcadores tel: son tolerantes a formato); el de WhatsApp ahora
        // solo se renderiza si telefonoWhatsapp() considera el número
        // plausible, para no ofrecer un botón que sabemos que va a un
        // link roto.
        var waNumero = utils.telefonoWhatsapp(lugar.telefono);
        if (waNumero) {
          html += '<a class="wa" target="_blank" rel="noopener" href="https://wa.me/' + waNumero + '">💬 WhatsApp</a>';
        }
      }
      html += '<button type="button" class="fav' + (esFav ? ' is-fav' : '') + '" data-fav-id="' + lugar.id + '" aria-label="' +
              (esFav ? 'Quitar de favoritos' : 'Guardar en favoritos') + '">' + (esFav ? '♥ Guardado' : '♡ Guardar') + '</button>';
      html += '<button type="button" class="compartir" data-share-id="' + lugar.id + '" aria-label="Compartir este lugar">↗ Compartir</button>';
      html += '</div>';
      return html;
    }

    // ─── Alta de un lugar en el mapa ───
    function agregarLugar(lugar) {
      // Validación de propiedades requeridas
      if (!lugar || typeof lugar !== 'object') return;
      if (typeof lugar.lat !== 'number' || typeof lugar.lng !== 'number') return;
      if (!lugar.id || !lugar.nombre) return;

      var grupoInfo = GRUPOS[lugar.grupo];
      var grupo = grupoInfo ? lugar.grupo : GRUPO_DEFECTO;
      var color = grupoInfo ? grupoInfo.color : GRUPOS[GRUPO_DEFECTO].color;
      var destacado = !!lugar.destacado;
      var marker = L.marker([lugar.lat, lugar.lng], {
        icon: pinIcon(color, destacado),
        title: lugar.nombre,
        riseOnHover: true,
        zIndexOffset: destacado ? 1000 : 0
      });
      // [OPTIMIZACIÓN — Fase 2] Antes popupHtml(lugar, color) se ejecutaba
      // acá mismo para los 862 lugares en el arranque (concatenación de
      // strings + escapeHtml + formateo de rating/teléfono, por cada uno),
      // aunque la enorme mayoría de esos popups no se abre nunca en una
      // sesión típica. Ahora el popup se vincula vacío y el HTML real recién
      // se genera la primera vez que se abre ('popupopen'), cacheado en el
      // propio marker para no repetir el trabajo si se vuelve a abrir. El
      // evento 'popupopen' de Leaflet se dispara tanto al hacer clic en el
      // pin como al abrir el popup de forma programática (irALugar()), así
      // que el comportamiento visible es idéntico en ambos casos.
      marker.bindPopup('', { className: 'mapa-popup' });
      marker.on('popupopen', function () {
        if (!marker._popupHtmlListo) {
          marker._popupHtmlListo = true;
          marker.setPopupContent(popupHtml(lugar, color));
          // El popup de Leaflet recién tiene nodo DOM real después de
          // setPopupContent(); "api" ya está asignado en este punto porque
          // 'popupopen' solo puede dispararse por un gesto del usuario (o
          // por irALugar()), siempre después de que crearMotor() terminó de
          // construir el objeto motor completo — mismo razonamiento que ya
          // documenta bindListaCards() para este mismo objeto "api".
          var popupEl = marker.getPopup().getElement();
          if (popupEl && api.bindAccionesLugar) api.bindAccionesLugar(popupEl);
        }
      });
      marker.lugarData = lugar;
      // [LOTE 1 — Mejora 1, evidencia] Antes: clusterGroups[grupo].addLayer(marker)
      // acá mismo, uno por uno para cada lugar. Esto anulaba en la práctica
      // la opción chunkedLoading:true configurada en initMapa() — según la
      // documentación oficial de Leaflet.markercluster, chunkedLoading
      // trocea específicamente el procesamiento de addLayers() (plural,
      // bulk); nunca se llamaba a addLayers() en este archivo, así que esa
      // opción no tenía ningún efecto real. Además, cada addLayer()
      // individual dispara su propia recomputación de bounds/posición
      // ponderada ascendiendo por el árbol de clusters (así lo documenta el
      // propio autor del plugin en el PR #584 de Leaflet.markercluster).
      // Ahora agregarLugar() solo arma el marker y lo devuelve; es
      // cargarDatos() quien agrupa todos los markers nuevos por grupo y
      // llama a addLayers() UNA sola vez por grupo — ahí sí se activa
      // chunkedLoading de verdad, y la recomputación de bounds se hace una
      // sola vez al final en vez de una vez por marcador. Ver
      // AUDITORIA_PERFORMANCE_donde-comer-cdu.md, P1.
      var entry = {
        marker: marker,
        grupo: grupo,
        categoria: lugar.categoria || '',
        nombreNorm: utils.normalizarTexto(lugar.nombre),
        categoriaNorm: utils.normalizarTexto(lugar.categoria || ''),
        lugar: lugar,
        // [ARQUITECTURA — carga core/detalles] Se guarda acá para que
        // cargarDetalles() pueda regenerar el popup (popupHtml necesita el
        // color) sin duplicar la lógica grupoInfo/GRUPO_DEFECTO de arriba.
        color: color
      };
      todosLosMarkers.push(entry);
      lugaresPorId[lugar.id] = entry;
      if (!markersPorGrupo[grupo]) markersPorGrupo[grupo] = [];
      markersPorGrupo[grupo].push(entry);
      return entry;
    }

    // ─── Filtros (pills) ───
    function renderFiltros(counts) {
      var cont = els.filtros;
      if (!cont) return;

      var html = '<button class="mapa-pill activo" data-cat="todos" type="button">Todos <span class="cnt">' + todosLosMarkers.length + '</span></button>';
      GRUPO_KEYS.forEach(function (g) {
        var c = counts[g];
        if (!c) return;
        var info = GRUPOS[g];
        html += '<button class="mapa-pill" data-cat="' + g + '" type="button" style="--pill-color:' + info.color + '">' +
                info.icon + ' ' + info.label + ' <span class="cnt">' + c + '</span></button>';
      });
      cont.innerHTML = html;

      pillNodes = cont.querySelectorAll('.mapa-pill');
      pillNodes.forEach(function (btn) {
        btn.addEventListener('click', function () {
          setFiltro(btn.getAttribute('data-cat'));
        });
      });
    }

    // Genera los chips de subcategoría (campo 'categoria' del dataset) para el
    // grupo actualmente seleccionado. Se recalculan en cada cambio de filtro
    // porque dependen de qué lugares quedan visibles para ese grupo.
    function renderSubfiltros() {
      var cont = els.subfiltros;
      if (!cont) return;
      if (filtroActivo === 'todos') {
        cont.classList.remove('visible');
        cont.innerHTML = '';
        return;
      }
      var counts = {};
      // [OPTIMIZACIÓN — Fase 2, punto 2.1] Antes recorría todosLosMarkers
      // completo filtrando por m.grupo !== filtroActivo; con el índice
      // markersPorGrupo ya armado para aplicarFiltros(), se reutiliza acá
      // para recorrer solo los lugares del grupo activo.
      var lista = markersPorGrupo[filtroActivo] || [];
      var listaLen = lista.length;
      for (var li = 0; li < listaLen; li++) {
        var cat = lista[li].categoria;
        counts[cat] = (counts[cat] || 0) + 1;
      }
      var subcats = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
      if (subcats.length < 2) {
        cont.classList.remove('visible');
        cont.innerHTML = '';
        return;
      }
      var html = '<button class="mapa-subpill' + (!subFiltroActivo ? ' activo' : '') + '" data-subcat="" type="button">Todas <span class="cnt">' +
                  subcats.reduce(function (a, c) { return a + counts[c]; }, 0) + '</span></button>';
      subcats.forEach(function (c) {
        html += '<button class="mapa-subpill' + (subFiltroActivo === c ? ' activo' : '') + '" data-subcat="' + utils.escapeHtml(c) + '" type="button">' +
                utils.escapeHtml(c) + ' <span class="cnt">' + counts[c] + '</span></button>';
      });
      cont.innerHTML = html;
      cont.classList.add('visible');
      var subpillNodes = cont.querySelectorAll('.mapa-subpill');
      subpillNodes.forEach(function (btn) {
        btn.addEventListener('click', function () {
          subFiltroActivo = btn.getAttribute('data-subcat') || null;
          subpillNodes.forEach(function (b) { b.classList.remove('activo'); });
          btn.classList.add('activo');
          aplicarFiltros();
        });
      });
    }

    // Mantiene sincronizados los selectores visuales de categoría (pills del
    // toolbar y leyenda del mapa) para que siempre muestren el mismo filtro
    // activo, se haga clic donde se haga clic.
    function sincronizarActivos(f) {
      (pillNodes || document.querySelectorAll('.mapa-pill')).forEach(function (b) {
        b.classList.toggle('activo', b.getAttribute('data-cat') === f);
      });
      (legendNodes || document.querySelectorAll('.mapa-legend-item')).forEach(function (it) {
        it.classList.toggle('activo', it.getAttribute('data-cat') === f);
      });
    }

    // Genera la leyenda visual del mapa: color + ícono + etiqueta + conteo por
    // categoría. Cada color tiene su nombre y su cantidad de lugares a la
    // vista, y es clickeable para filtrar el mapa igual que las pills.
    function renderLeyenda(counts) {
      var cont = els.legendList;
      if (!cont) return;

      var html = '';
      GRUPO_KEYS.forEach(function (g) {
        var c = counts[g];
        if (!c) return;
        var info = GRUPOS[g];
        html += '<button class="mapa-legend-item' + (filtroActivo === g ? ' activo' : '') + '" data-cat="' + g + '" type="button">' +
                '<span class="mapa-legend-swatch" style="background:' + info.color + '"></span>' +
                '<span class="mapa-legend-label">' + info.icon + ' ' + info.label + '</span>' +
                '<span class="mapa-legend-count">' + c + '</span></button>';
      });
      cont.innerHTML = html;

      legendNodes = cont.querySelectorAll('.mapa-legend-item');
      legendNodes.forEach(function (item) {
        item.addEventListener('click', function () {
          setFiltro(item.getAttribute('data-cat'));
        });
      });

      var head = els.legendHead;
      var panel = els.legendPanel;
      if (head && panel && !head.dataset.bound) {
        head.dataset.bound = '1';
        head.addEventListener('click', function () {
          panel.classList.toggle('colapsada');
        });
      }
    }

    // ═════════════════════════════════════════════════════════════════
    // VISTA LISTA (#mapa-view-toggle) + ORDENAR (#mapa-orden)
    // [NUEVA FUNCIONALIDAD — pasada "toolbar del mapa"] Tres controles
    // vivían en el HTML/CSS del toolbar sin una sola línea de JS detrás:
    // el botón "Lista" no cambiaba nada al tocarlo, el <select> de orden
    // no se leía en ningún lado, y sus estilos ni siquiera existían (ver
    // core.css). Esta sección los implementa reutilizando el MISMO estado
    // de filtro/categoría/búsqueda/subcategoría que ya gobierna el mapa
    // (filtroActivo/subFiltroActivo/textoBusqueda): la lista muestra
    // exactamente el mismo conjunto de lugares que el mapa tendría
    // visibles en ese instante, nunca un criterio de filtrado paralelo.
    // ═════════════════════════════════════════════════════════════════

    // Mismo criterio de "candidato" que usa aplicarFiltros(): con un grupo
    // activo, solo se recorren sus propias entradas (no las 862 completas).
    function entradasCandidatas() {
      if (filtroActivo === 'todos') return todosLosMarkers;
      return markersPorGrupo[filtroActivo] || [];
    }

    // Aplica subcategoría + búsqueda sobre las candidatas — misma lógica
    // de predicado que el loop caliente de aplicarFiltros(), pero acá
    // devuelve un array de datos (para pintar tarjetas) en vez de tocar
    // capas de Leaflet.
    function entradasFiltradas() {
      var candidatas = entradasCandidatas();
      var tieneSubFiltro = !!subFiltroActivo;
      var tieneBusqueda = (textoBusqueda !== '');
      if (!tieneSubFiltro && !tieneBusqueda) return candidatas.slice();
      var out = [];
      var len = candidatas.length;
      for (var i = 0; i < len; i++) {
        var m = candidatas[i];
        var pasaSubcategoria = !tieneSubFiltro || (m.categoria === subFiltroActivo);
        var pasaBusqueda = !tieneBusqueda ||
          (m.nombreNorm.indexOf(textoBusqueda) > -1) ||
          (m.categoriaNorm.indexOf(textoBusqueda) > -1);
        if (pasaSubcategoria && pasaBusqueda) out.push(m);
      }
      return out;
    }

    // Ordena según #mapa-orden. "recomendados" y "recientes" son señales
    // 100% reales del dataset (rating/rating_count e id); "cercania"
    // requiere posicionUsuario (ver solicitarUbicacionParaOrden). Sin
    // ninguna de esas condiciones, se deja el orden del dataset tal cual
    // (equivalente a "relevancia") en vez de inventar una fórmula de
    // ranking que esta guía no tiene forma de justificar con datos reales.
    function ordenarEntradas(entradas) {
      var arr = entradas.slice();
      if (ordenActual === 'recomendados') {
        arr.sort(function (a, b) {
          var ra = a.lugar.rating || 0, rb = b.lugar.rating || 0;
          if (rb !== ra) return rb - ra;
          return (b.lugar.rating_count || 0) - (a.lugar.rating_count || 0);
        });
      } else if (ordenActual === 'recientes') {
        arr.sort(function (a, b) { return (b.lugar.id || 0) - (a.lugar.id || 0); });
      } else if (ordenActual === 'cercania' && posicionUsuario) {
        arr.forEach(function (e) {
          e._distKm = utils.distanciaKm(posicionUsuario.lat, posicionUsuario.lng, e.lugar.lat, e.lugar.lng);
        });
        arr.sort(function (a, b) { return a._distKm - b._distKm; });
      }
      return arr;
    }

    // Tarjeta de la vista lista. Reutiliza exactamente las mismas fuentes
    // de verdad que popupHtml() (mismos campos, mismo utils.starsHtml/
    // telefonoWhatsapp/escapeHtml) para que un lugar se vea consistente
    // entre el popup del mapa y su tarjeta de lista — nunca dos redacciones
    // distintas del mismo dato.
    function cardListaHtml(entry) {
      var lugar = entry.lugar;
      var g = GRUPOS[entry.grupo];
      var esFav = favoritos.is(lugar.id);
      var html = '<article class="lista-card" data-lugar-id="' + lugar.id + '">';
      html += '<button type="button" class="lista-card-ir" data-ir-lista="' + lugar.id + '" style="--card-color:' + entry.color + '">';
      html += '<span class="lista-card-icon" aria-hidden="true">' + g.icon + '</span>';
      html += '<span class="lista-card-body">';
      html += '<span class="lista-card-top"><span class="lista-card-cat">' + utils.escapeHtml(lugar.categoria || g.label) + '</span>' +
              (lugar.destacado ? '<span class="lista-card-destacado">★ Destacado</span>' : '') + '</span>';
      html += '<span class="lista-card-nombre">' + utils.escapeHtml(lugar.nombre || '') + '</span>';
      if (lugar.rating) {
        var rating = parseFloat(lugar.rating);
        if (!isNaN(rating)) {
          html += '<span class="lista-card-rating">' + utils.starsHtml(rating) + ' ' + rating.toFixed(1) +
                  (lugar.rating_count ? ' <span class="cant">(' + lugar.rating_count + ')</span>' : '') + '</span>';
        }
      } else {
        html += '<span class="lista-card-norating">Sin calificación aún</span>';
      }
      if (lugar.direccion) html += '<span class="lista-card-addr">📍 ' + utils.escapeHtml(lugar.direccion) + '</span>';
      if (typeof entry._distKm === 'number') {
        html += '<span class="lista-card-dist">' +
          (entry._distKm < 1 ? Math.round(entry._distKm * 1000) + ' m' : entry._distKm.toFixed(1) + ' km') +
          ' de tu ubicación</span>';
      }
      html += '</span></button>';
      html += '<div class="lista-card-actions">';
      html += '<button type="button" class="lista-card-fav' + (esFav ? ' is-fav' : '') + '" data-fav-id="' + lugar.id + '" aria-label="' +
              (esFav ? 'Quitar de favoritos' : 'Guardar en favoritos') + '">' + (esFav ? '♥' : '♡') + '</button>';
      if (lugar.telefono) {
        html += '<a class="lista-card-tel" href="tel:' + lugar.telefono.replace(/\s+/g, '') + '" aria-label="Llamar">📞</a>';
        var waNumero = utils.telefonoWhatsapp(lugar.telefono);
        if (waNumero) html += '<a class="lista-card-wa" target="_blank" rel="noopener" href="https://wa.me/' + waNumero + '" aria-label="WhatsApp">💬</a>';
      }
      html += '<button type="button" class="lista-card-share" data-share-id="' + lugar.id + '" aria-label="Compartir">↗</button>';
      html += '</div></article>';
      return html;
    }

    // Clic en el cuerpo de una tarjeta: vuelve a la vista mapa y hace volar
    // el mapa hasta ese lugar (mismo patrón ya usado por el spotlight de
    // búsqueda) — no duplica un "detalle inline" nuevo, reutiliza el
    // popup que el mapa ya sabe construir.
    function bindListaCards(container) {
      container.querySelectorAll('[data-ir-lista]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = parseInt(btn.getAttribute('data-ir-lista'), 10);
          cambiarVista('mapa');
          setTimeout(function () { irALugar(id); }, 260);
        });
      });
      api.bindAccionesLugar(container);
    }

    // Pinta la grilla de tarjetas para el estado actual de filtro/orden.
    // Si todavía no hay datos (cargarConExtra() no resolvió el fetch:
    // recordar que la lista puede pedirse antes de que eso termine, ver
    // lazyInitMapa), muestra 3 tarjetas esqueleto en vez de una grilla
    // vacía — mismo criterio de "nunca dejar un momento de espera sin
    // feedback" que ya usa #mapa-geoloc con "📍 Buscando…".
    function renderLista() {
      var cont = els.listaDiv;
      if (!cont) return;
      if (!todosLosMarkers.length) {
        cont.innerHTML = '<div class="lista-skeleton">' +
          '<div class="lista-skeleton-card"></div><div class="lista-skeleton-card"></div><div class="lista-skeleton-card"></div>' +
          '</div>';
        return;
      }
      var entradas = ordenarEntradas(entradasFiltradas());
      cont.innerHTML = entradas.map(cardListaHtml).join('');
      bindListaCards(cont);
    }

    // Único punto de entrada para cambiar entre "Mapa" y "Lista" — lo usan
    // tanto los botones del toolbar como el clic en una tarjeta de lista
    // (que vuelve a "mapa" para mostrar el popup del lugar tocado).
    function cambiarVista(vista) {
      if (vista === vistaActual) return;
      vistaActual = vista;
      if (els.viewMapaBtn) els.viewMapaBtn.setAttribute('aria-pressed', vista === 'mapa' ? 'true' : 'false');
      if (els.viewListaBtn) els.viewListaBtn.setAttribute('aria-pressed', vista === 'lista' ? 'true' : 'false');
      if (els.mapaCanvas) els.mapaCanvas.setAttribute('data-view', vista);
      if (els.listaDiv) els.listaDiv.hidden = (vista !== 'lista');
      if (vista === 'lista') {
        renderLista();
      } else if (map) {
        // El contenedor de Leaflet pudo haber estado display:none (vía CSS,
        // ver [data-view="lista"] en core.css) mientras la lista estaba
        // activa; Leaflet cachea el tamaño de su contenedor y no lo
        // recalcula solo, así que sin este invalidateSize() el mapa vuelve
        // recortado/desalineado hasta el próximo resize manual del navegador.
        setTimeout(function () { map.invalidateSize(); }, 0);
      }
    }

    // Pide geolocalización específicamente para el criterio de orden
    // "Más cerca" del <select>. Reutiliza posicionUsuario con el botón
    // "📍 Cerca de mí" del toolbar (ver bindControlesMapa): si el usuario
    // ya compartió su ubicación por cualquiera de los dos caminos, el otro
    // no vuelve a pedir permiso. Sin permiso/API, cae en silencio al orden
    // del dataset — no hay forma honesta de "ordenar por cercanía" sin
    // saber dónde está el usuario, así que no se simula un resultado.
    function solicitarUbicacionParaOrden() {
      if (!navigator.geolocation) { renderLista(); return; }
      navigator.geolocation.getCurrentPosition(function (pos) {
        posicionUsuario = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (vistaActual === 'lista') renderLista();
      }, function () {
        if (vistaActual === 'lista') renderLista();
      }, { timeout: 8000 });
    }

    // ─── Reset de filtros — a nivel de motor para que tanto el link
    // "ver todos" (bindControlesMapa) como los botones del estado vacío
    // (renderEmptyState, justo abajo) llamen a la misma implementación. ───
    function limpiarTodoFiltro(e) {
      if (e) e.preventDefault();
      if (els.buscador) els.buscador.value = '';
      textoBusqueda = '';
      filtroActivo = 'todos';
      (pillNodes || document.querySelectorAll('.mapa-pill')).forEach(function (b) { b.classList.remove('activo'); });
      var todosBtn = els.filtros ? els.filtros.querySelector('.mapa-pill[data-cat="todos"]') : document.querySelector('.mapa-pill[data-cat="todos"]');
      if (todosBtn) todosBtn.classList.add('activo');
      (legendNodes || document.querySelectorAll('.mapa-legend-item')).forEach(function (it) { it.classList.remove('activo'); });
      aplicarFiltros();
      // [ARQUITECTURA — mapa diferido] Ver nota histórica: si todavía no
      // existe `map` (usuario tocó el reset antes de que la sección del
      // mapa arrancara Leaflet), no hay vista que reposicionar todavía;
      // cuando el mapa sí se cree va a arrancar directo en
      // config.mapCenter/mapZoom, mismo resultado sin doble trabajo.
      if (map) map.setView(config.mapCenter || [0, 0], config.mapZoom || 13);
    }
    // Variante más quirúrgica: borra solo el texto buscado y conserva el
    // filtro de categoría activo (si el usuario ya eligió "Gastronomía" y
    // tipeó algo que no encontró ahí, lo más útil es reofrecerle TODA
    // gastronomía, no mandarlo de vuelta a "todos" los grupos del sitio).
    function limpiarSoloBusqueda() {
      if (els.buscador) els.buscador.value = '';
      textoBusqueda = '';
      aplicarFiltros();
    }

    // [NUEVA FUNCIONALIDAD — estado vacío accionable] Antes #mapa-empty era
    // un texto fijo idéntico sin importar la causa (búsqueda sin match,
    // filtro de categoría sin resultados, o ambos combinados) y sin ninguna
    // acción: el usuario tenía que borrar a mano lo que había tipeado o
    // volver a tocar el chip de categoría por su cuenta. Ahora el mensaje
    // nombra la causa real (usa GRUPOS, ya cargado en el motor, para el
    // nombre legible de la categoría) y ofrece el atajo exacto que la
    // resuelve, en vez de una sola salida genérica ("ver todos") que en el
    // caso de un filtro de categoría activo tira también ese filtro, que
    // puede no ser lo que el usuario quería conservar.
    function renderEmptyState() {
      var cont = els.empty;
      if (!cont) return;
      var hayBusqueda = textoBusqueda !== '';
      var hayFiltro = filtroActivo !== 'todos';
      var grupoInfo = GRUPOS[filtroActivo];
      var nombreGrupo = grupoInfo ? grupoInfo.label : filtroActivo;
      var mensaje, acciones = '';
      if (hayBusqueda && hayFiltro) {
        mensaje = 'Sin resultados para "' + utils.escapeHtml(textoBusqueda) + '" dentro de ' + utils.escapeHtml(nombreGrupo) + '.';
        acciones += '<button type="button" class="mapa-empty-accion" data-empty-accion="solo-busqueda">Buscar en todas las categorías</button>';
        acciones += '<button type="button" class="mapa-empty-accion" data-empty-accion="todo">Ver todo ' + utils.escapeHtml(nombreGrupo) + '</button>';
      } else if (hayBusqueda) {
        mensaje = 'Sin resultados para "' + utils.escapeHtml(textoBusqueda) + '".';
        acciones += '<button type="button" class="mapa-empty-accion" data-empty-accion="solo-busqueda">Borrar búsqueda</button>';
      } else if (hayFiltro) {
        mensaje = 'Todavía no hay lugares verificados en ' + utils.escapeHtml(nombreGrupo) + '.';
        acciones += '<button type="button" class="mapa-empty-accion" data-empty-accion="todo">Ver todas las categorías</button>';
      } else {
        mensaje = 'No encontramos lugares con esa búsqueda o ese filtro.';
        acciones += '<button type="button" class="mapa-empty-accion" data-empty-accion="todo">Ver todos los lugares</button>';
      }
      cont.innerHTML = '<p class="mapa-empty-msg">' + mensaje + '</p><div class="mapa-empty-acciones">' + acciones + '</div>';
      var btnSoloBusqueda = cont.querySelector('[data-empty-accion="solo-busqueda"]');
      if (btnSoloBusqueda) btnSoloBusqueda.addEventListener('click', limpiarSoloBusqueda);
      var btnTodo = cont.querySelector('[data-empty-accion="todo"]');
      if (btnTodo) btnTodo.addEventListener('click', limpiarTodoFiltro);
    }

    // ─── Filtro combinado (categoría + subcategoría + búsqueda) ───
    function aplicarFiltros() {
      // [ARQUITECTURA — mapa diferido] initMapa() ya no corre en el
      // arranque (ver lazyInitMapa()/motor.initMapaYDatos() al final del
      // archivo): el mapa recién se crea cuando la sección se acerca al
      // viewport. Hasta ese momento `map` es null, pero bindFiltroLinks()
      // ya está enganchado desde el primer instante (initShell), así que
      // es alcanzable que el usuario haga clic en un chip de categoría
      // ANTES de que exista `map`. setFiltro() ya actualizó filtroActivo
      // igual (eso no depende de Leaflet); acá simplemente no hay todavía
      // ninguna capa de Leaflet sobre la que aplicar addLayer/removeLayer,
      // así que se corta temprano sin tocar `map`. Cuando el mapa termine
      // de inicializarse, cargarDatos() llama a aplicarFiltros() de nuevo
      // y ese filtroActivo ya actualizado se aplica normalmente — no se
      // pierde el clic, solo se pospone su efecto visual unos instantes.
      if (!map) return 0;

      // [OPTIMIZACIÓN — Fase 2, punto 2.1] Antes: un solo forEach sobre los
      // 862 marcadores completos, evaluando pasaCategoria por cada uno —
      // incluidos los ~800 que ya se sabía de antemano que no pertenecen al
      // grupo activo, y sobre los que igual se llamaba grupo.removeLayer()
      // (trabajo de reclusterización interna de Leaflet.markercluster) aun
      // cuando esos ~12 grupos enteros se iban a sacar del mapa dos pasos
      // después de todos modos. Ahora: se decide primero qué grupos son
      // "candidatos" a estar visibles (todos, o solo el activo), y:
      //   - los grupos NO candidatos se sacan del mapa como capa entera,
      //     sin tocar un solo marcador individual dentro de ellos (si el
      //     grupo no está en el mapa, no importa el estado interno de sus
      //     marcadores — Leaflet no los va a pintar de todas formas).
      //   - los grupos candidatos son los únicos donde se recorren
      //     marcadores, y se recorre solo su propio subconjunto vía
      //     markersPorGrupo (no los 862), evaluando subcategoría/búsqueda.
      // Resultado final (qué marcadores terminan visibles) es exactamente
      // el mismo que antes; cambia solo cuánto trabajo hace falta para
      // llegar a ese resultado. Con filtroActivo==='todos' el costo es
      // idéntico al de antes (se recorren todos los grupos igual); la
      // mejora aplica cuando hay un filtro de categoría puesto.
      var visibles = 0;
      var esTodos = (filtroActivo === 'todos');

      // [FIX — AUDITORIA_DONDE_COMER.md, P3] Fast-path para el caso trivial
      // ("todos" + sin subfiltro + sin búsqueda), pero solo cuando
      // estadoSinOcultos garantiza que no hay ningún marcador escondido
      // dentro de su propio clusterGroup (ver declaración de la variable
      // más arriba). La versión de la auditoría saltaba este caso siempre
      // que fuera trivial, sin esa garantía — eso podía dejar ocultos
      // marcadores que se habían removido en un filtro/búsqueda anterior,
      // al volver a "todos" sin pasar de nuevo por el loop. Con el guard
      // agregado, el fast-path solo se activa cuando de verdad no hay
      // trabajo que hacer (carga inicial, o resets consecutivos sin haber
      // filtrado nada en el medio).
      var esCasoTrivial = esTodos && !subFiltroActivo && (textoBusqueda === '');
      if (esCasoTrivial && estadoSinOcultos) {
        GRUPO_KEYS.forEach(function (g) {
          if (!map.hasLayer(clusterGroups[g])) map.addLayer(clusterGroups[g]);
        });
        visibles = todosLosMarkers.length;
        if (els.count) els.count.textContent = visibles;
        if (visibles === 0) renderEmptyState();
        if (els.empty) els.empty.style.display = (visibles === 0) ? 'block' : 'none';
        if (els.mapaDiv) els.mapaDiv.style.display = (visibles === 0) ? 'none' : 'block';
        // [NUEVA FUNCIONALIDAD — vista lista] Mantiene la lista sincronizada
        // con el mismo filtro/búsqueda que el mapa, sin costo cuando la
        // lista no está visible (vistaActual !== 'lista').
        if (vistaActual === 'lista') renderLista();
        return visibles;
      }

      GRUPO_KEYS.forEach(function (g) {
        var grupoLayer = clusterGroups[g];
        var esCandidato = esTodos || (g === filtroActivo);

        if (!esCandidato) {
          if (map.hasLayer(grupoLayer)) map.removeLayer(grupoLayer);
          return;
        }

        // [FIX — AUDITORIA_DONDE_COMER.md, P2] Antes: addLayer/removeLayer
        // individual por cada marcador del grupo, dentro del propio for.
        // Ahora: se decide primero (mismo criterio, mismo guard hasLayer de
        // Fase 2) qué marcadores cambian de estado, y se aplican los dos
        // lotes con una sola llamada bulk cada uno (addLayers/removeLayers)
        // en vez de N llamadas individuales. El conjunto final de
        // marcadores visibles, y el conteo "visibles", son exactamente los
        // mismos que antes.
        var lista = markersPorGrupo[g] || [];
        var aAgregar = [];
        var aQuitar = [];
        // [OPTIMIZACIÓN] tieneSubFiltro/tieneBusqueda no cambian durante
        // esta pasada (subFiltroActivo/textoBusqueda son fijos mientras
        // dura una sola llamada a aplicarFiltros()); se evalúan una vez acá
        // en vez de re-evaluar "!subFiltroActivo"/"textoBusqueda === ''"
        // en cada uno de los marcadores del grupo. lista.length también se
        // cachea en vez de releerlo en cada vuelta del for.
        var tieneSubFiltro = !!subFiltroActivo;
        var tieneBusqueda = (textoBusqueda !== '');
        var listaLen = lista.length;
        for (var i = 0; i < listaLen; i++) {
          var m = lista[i];
          var pasaSubcategoria = !tieneSubFiltro || (m.categoria === subFiltroActivo);
          var pasaBusqueda = !tieneBusqueda ||
            (m.nombreNorm.indexOf(textoBusqueda) > -1) ||
            (m.categoriaNorm.indexOf(textoBusqueda) > -1);
          var mostrar = pasaSubcategoria && pasaBusqueda;
          if (mostrar) {
            visibles++;
            if (!grupoLayer.hasLayer(m.marker)) aAgregar.push(m.marker);
          } else {
            if (grupoLayer.hasLayer(m.marker)) aQuitar.push(m.marker);
          }
        }
        if (aQuitar.length) grupoLayer.removeLayers(aQuitar);
        if (aAgregar.length) grupoLayer.addLayers(aAgregar);

        if (!map.hasLayer(grupoLayer)) map.addLayer(grupoLayer);
      });

      // [FIX — AUDITORIA_DONDE_COMER.md, P3] Esta pasada completa acaba de
      // recorrer todo; si el estado resultante es el caso trivial, queda
      // garantizado que no hay nada oculto, y el próximo llamado a
      // aplicarFiltros() en ese mismo estado podrá usar el fast-path.
      estadoSinOcultos = esCasoTrivial;

      if (els.count) els.count.textContent = visibles;
      if (visibles === 0) renderEmptyState();
      if (els.empty) els.empty.style.display = (visibles === 0) ? 'block' : 'none';
      if (els.mapaDiv) els.mapaDiv.style.display = (visibles === 0) ? 'none' : 'block';

      if (vistaActual === 'lista') renderLista();

      return visibles;
    }

    // Cambia el filtro activo (categoría) y refresca toda la UI dependiente.
    // Único punto de entrada usado por pills, leyenda y tarjetas externas
    // (hero, "categorías en detalle", footer) para evitar lógica duplicada.
    function setFiltro(grupo, opts) {
      opts = opts || {};
      filtroActivo = grupo;
      subFiltroActivo = null;
      if (opts.limpiarBusqueda) {
        textoBusqueda = '';
        if (els.buscador) els.buscador.value = '';
      }
      aplicarFiltros();
      sincronizarActivos(filtroActivo);
      renderSubfiltros();
    }

    // Restringe el mapa a un subconjunto puntual de IDs (usado por
    // funcionalidades de contenido como recorridos/itinerarios), sin pasar
    // por el sistema de categorías/búsqueda.
    function mostrarSoloLugares(ids) {
      // [FIX — AUDITORIA_DONDE_COMER.md, P3] Esta función puede dejar
      // marcadores ocultos fuera del flujo normal de aplicarFiltros(); si
      // no se avisa acá, el fast-path de aplicarFiltros() podría asumir
      // erróneamente que no hay nada oculto la próxima vez que se llame en
      // el estado "todos + sin filtro". Se invalida ese estado siempre,
      // sin excepción (es más barato que verificar si ids cubre todos los
      // lugares, y garantiza que el próximo aplicarFiltros() haga el
      // recorrido completo si hace falta).
      estadoSinOcultos = false;

      // Lookup por objeto en vez de ids.indexOf(...) dentro del forEach:
      // evita un escaneo del array "ids" por cada uno de los marcadores.
      var idsSet = {};
      var idsLen = ids.length;
      for (var i = 0; i < idsLen; i++) idsSet[ids[i]] = true;

      // [FIX — AUDITORIA_DONDE_COMER.md, P2] Mismo cambio que en
      // aplicarFiltros(): en vez de addLayer/removeLayer individual por
      // marcador, se agrupan los cambios por clusterGroup y se aplican con
      // una sola llamada bulk (addLayers/removeLayers) por grupo. El mismo
      // guard hasLayer se conserva, así que el resultado visible es
      // idéntico al de antes.
      var aAgregarPorGrupo = {};
      var aQuitarPorGrupo = {};
      var totalMarkers = todosLosMarkers.length;
      for (var mi = 0; mi < totalMarkers; mi++) {
        var m = todosLosMarkers[mi];
        var g = m.grupo;
        var grupoLayer = clusterGroups[g];
        if (idsSet[m.lugar.id]) {
          if (!grupoLayer.hasLayer(m.marker)) {
            (aAgregarPorGrupo[g] || (aAgregarPorGrupo[g] = [])).push(m.marker);
          }
        } else {
          if (grupoLayer.hasLayer(m.marker)) {
            (aQuitarPorGrupo[g] || (aQuitarPorGrupo[g] = [])).push(m.marker);
          }
        }
      }
      Object.keys(aQuitarPorGrupo).forEach(function (g) {
        clusterGroups[g].removeLayers(aQuitarPorGrupo[g]);
      });
      Object.keys(aAgregarPorGrupo).forEach(function (g) {
        clusterGroups[g].addLayers(aAgregarPorGrupo[g]);
      });

      // Todos los grupos terminan en el mapa (igual que antes); solo se
      // agregan los que todavía no estuvieran, sin sacarlos primero.
      GRUPO_KEYS.forEach(function (g) {
        if (!map.hasLayer(clusterGroups[g])) map.addLayer(clusterGroups[g]);
      });
    }

    function getLugarPorId(id) {
      var entry = lugaresPorId[id];
      return entry ? entry.lugar : null;
    }

    // [FIX] Buscador real para el overlay spotlight: antes el input de
    // #spotlight-input solo reenviaba el texto al filtro del mapa, pero
    // #spotlight-results/#spotlight-suggestions nunca se llenaban — no
    // había forma de tocar un resultado y llegar a un lugar. Esto habilita
    // ese camino directo (escribir → tocar el resultado → listo).
    function buscarLugares(texto, limite) {
      var norm = utils.normalizarTexto(texto || '').trim();
      if (!norm) return [];
      var max = limite || 8;
      var resultados = [];
      var encontrados = 0;
      var total = todosLosMarkers.length;
      for (var i = 0; i < total && encontrados < max; i++) {
        var m = todosLosMarkers[i];
        if (m.nombreNorm.indexOf(norm) > -1 || m.categoriaNorm.indexOf(norm) > -1) {
          resultados.push(m);
          encontrados++;
        }
      }
      return resultados;
    }

    // Lugares mejor puntuados, para mostrar como accesos rápidos apenas se
    // abre el buscador (antes de que el usuario escriba nada).
    function lugaresSugeridos(cantidad) {
      if (!sugeridosCache) {
        sugeridosCache = todosLosMarkers
          .slice()
          .sort(function (a, b) { return (b.lugar.rating || 0) - (a.lugar.rating || 0); });
      }
      return sugeridosCache.slice(0, cantidad || 6);
    }

    // Salto directo a un lugar puntual: resetea cualquier filtro/búsqueda
    // que lo estuviera tapando, hace zoom hasta sacarlo del cluster (API
    // propia de Leaflet.markercluster) y abre su popup con la info.
    function irALugar(id) {
      var entry = lugaresPorId[id];
      if (!entry) return false;

      setFiltro('todos', OPTS_LIMPIAR_BUSQUEDA);

      var grupo = clusterGroups[entry.grupo];
      if (grupo && grupo.zoomToShowLayer) {
        grupo.zoomToShowLayer(entry.marker, function () { entry.marker.openPopup(); });
      } else {
        map.setView(entry.marker.getLatLng(), 17);
        entry.marker.openPopup();
      }
      return true;
    }

    function contarPorGrupo() {
      var counts = {};
      var total = todosLosMarkers.length;
      for (var i = 0; i < total; i++) {
        var g = todosLosMarkers[i].grupo;
        counts[g] = (counts[g] || 0) + 1;
      }
      return counts;
    }

    // ─── Tarjetas de categoría (hero) — genéricas, iteran sobre GRUPOS ───
    function renderHeroCards(counts) {
      var cont = els.catsContainer;
      if (!cont) return;
      var html = '';
      GRUPO_KEYS.forEach(function (g) {
        var c = counts[g];
        if (!c) return;
        var info = GRUPOS[g];
        html += '<a class="cat cat-' + g + '" href="#mapa" data-filtro="' + g + '">' +
                '<span class="cat-icon" aria-hidden="true">' + info.icon + '</span>' +
                '<div class="cat-name"><span class="cat-dot" style="background:' + info.color + '"></span>' + utils.escapeHtml(info.label) + '</div>' +
                '<div class="cat-desc">' + utils.escapeHtml(info.desc || '') + '</div>' +
                '<div class="cat-count"><span id="cnt-' + g + '">' + c + '</span> lugares</div>' +
                '</a>';
      });
      cont.innerHTML = html;
    }

    // "Categorías en detalle": un bloque por cada grupo con lugares, con
    // conteo dinámico (nunca escrito a mano).
    function renderCdWrap(counts) {
      var cont = els.cdWrapContainer;
      if (!cont) return;
      var html = '';
      GRUPO_KEYS.forEach(function (g) {
        var c = counts[g];
        if (!c) return;
        var info = GRUPOS[g];
        html += '<div class="cd-item" id="cat-detalle-' + g + '">' +
                '<h3>' + info.icon + ' ' + utils.escapeHtml(info.label) + ' <span class="cd-count">(<span id="dcnt-' + g + '">' + c + '</span> lugares)</span></h3>' +
                '<p>' + utils.escapeHtml(info.desc || '') + '</p>' +
                '<a class="cd-link" href="#mapa" data-filtro="' + g + '">Ver en el mapa →</a>' +
                '</div>';
      });
      cont.innerHTML = html;
    }

    // Genera un ItemList (schema.org) por categoría a partir de los datos
    // reales ya cargados, y lo agrega al <head> como JSON-LD.
    function generarSEOItemLists(nombreSufijo) {
      var porGrupo = {};
      var totalMarkers = todosLosMarkers.length;
      for (var i = 0; i < totalMarkers; i++) {
        var m = todosLosMarkers[i];
        (porGrupo[m.grupo] || (porGrupo[m.grupo] = [])).push(m);
      }
      GRUPO_KEYS.forEach(function (g) {
        var lugaresGrupo = porGrupo[g];
        var n = lugaresGrupo ? lugaresGrupo.length : 0;
        if (!n) return;
        var itemListElement = new Array(n);
        for (var li = 0; li < n; li++) {
          itemListElement[li] = { '@type': 'ListItem', position: li + 1, name: lugaresGrupo[li].lugar.nombre };
        }
        var itemList = {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: GRUPOS[g].label + (nombreSufijo ? ' ' + nombreSufijo : ''),
          numberOfItems: n,
          itemListElement: itemListElement
        };
        var script = document.createElement('script');
        script.type = 'application/ld+json';
        script.text = JSON.stringify(itemList);
        document.head.appendChild(script);
      });
    }

    // Anima los contadores numéricos con un conteo ascendente usando un único
    // requestAnimationFrame compartido. Se llama explícitamente después de que
    // los números reales ya están en el DOM, así siempre anima hacia el valor correcto.
    // [OPTIMIZACIÓN] Cambiado de múltiples setInterval a único RAF para evitar thrashing
    function animarContadores() {
      var elementos = document.querySelectorAll('[id^="dcnt-"], [id^="cnt-"], #stat-total-lugares, #stat-total-categorias, #hero-total-lugares');
      if (!elementos.length) return;

      var animaciones = [];
      var tiempoInicio = null;
      var duracion = 600; // 600ms total de animación

      var totalElementos = elementos.length;
      for (var i = 0; i < totalElementos; i++) {
        var el = elementos[i];
        var valor = parseInt(el.textContent, 10);
        if (isNaN(valor)) continue;
        animaciones.push({ el: el, valorFinal: valor, valorActual: 0 });
      }

      var totalAnimaciones = animaciones.length;
      if (!totalAnimaciones) return;

      function animar(timestamp) {
        if (!tiempoInicio) tiempoInicio = timestamp;
        var progreso = (timestamp - tiempoInicio) / duracion;
        var j;

        if (progreso >= 1) {
          for (j = 0; j < totalAnimaciones; j++) animaciones[j].el.textContent = animaciones[j].valorFinal;
          return;
        }

        for (j = 0; j < totalAnimaciones; j++) {
          var a = animaciones[j];
          a.el.textContent = Math.floor(a.valorFinal * progreso);
        }

        requestAnimationFrame(animar);
      }

      requestAnimationFrame(animar);
    }

    // Calcula y pinta el total del hero, el contador de categorías, y genera
    // dinámicamente las tarjetas del hero y de "categorías en detalle".
    function actualizarContadoresHero(total, counts) {
      counts = counts || contarPorGrupo();

      if (els.statTotal) els.statTotal.textContent = total;
      if (els.heroTotal) els.heroTotal.textContent = total;
      if (els.statCategorias) {
        var catCount = 0;
        var grupoKeysLen = GRUPO_KEYS.length;
        for (var gi = 0; gi < grupoKeysLen; gi++) {
          if (counts[GRUPO_KEYS[gi]]) catCount++;
        }
        els.statCategorias.textContent = catCount;
      }

      renderHeroCards(counts);
      renderCdWrap(counts);

      // Re-vincula los listeners de las tarjetas recién generadas (hero,
      // "categorías en detalle" y cualquier enlace externo con data-filtro).
      bindFiltroLinks(document);

      if (typeof config.onDatosListos === 'function') config.onDatosListos(counts, total);
    }

    // Vincula cualquier elemento con [data-filtro] (tarjetas del hero, links
    // de "categorías en detalle", links del footer, etc.) para que al hacer
    // clic filtren el mapa por ese grupo. Se puede llamar de nuevo sobre
    // contenido agregado dinámicamente por el módulo de contenido.
    function bindFiltroLinks(root) {
      (root || document).querySelectorAll('[data-filtro]').forEach(function (card) {
        if (card.dataset.filtroBound) return;
        card.dataset.filtroBound = '1';
        card.addEventListener('click', function () {
          setFiltro(card.getAttribute('data-filtro'), OPTS_LIMPIAR_BUSQUEDA);
        });
      });
    }

    // ─── Carga de datos: dataset inicial + fusión opcional con JSON externo ───
    function cargarDatos(lugaresIniciales, extra) {
      // [VALIDACIÓN] Garantizar que lugaresIniciales es un array
      lugaresIniciales = Array.isArray(lugaresIniciales) ? lugaresIniciales : [];
      extra = Array.isArray(extra) ? extra : [];
      
      var combinados = lugaresIniciales.concat(extra);

      // [FIX — AUDITORIA_DONDE_COMER.md, P1] agregarLugar() ya no agrega el
      // marker a su clusterGroup (ver comentario en esa función); acá se
      // agrupan los markers nuevos por grupo y se agregan con UNA sola
      // llamada a addLayers() por grupo (API bulk de Leaflet.markercluster),
      // en vez de dejar que sea aplicarFiltros() —más abajo— quien los
      // agregue de a uno vía addLayer() individual. Esto sí activa
      // chunkedLoading (esa opción solo trocea addLayers(), plural, según
      // la documentación oficial del plugin). aplicarFiltros() se sigue
      // llamando igual después: para cada marker ya agregado acá, su guard
      // "if (!grupoLayer.hasLayer(m.marker))" da false, así que no lo
      // vuelve a agregar — el resultado visible final es idéntico.
      var markersNuevosPorGrupo = {};
      var totalCombinados = combinados.length;
      for (var ci = 0; ci < totalCombinados; ci++) {
        var entry = agregarLugar(combinados[ci]);
        if (!entry) continue;
        var arrGrupo = markersNuevosPorGrupo[entry.grupo];
        if (!arrGrupo) arrGrupo = markersNuevosPorGrupo[entry.grupo] = [];
        arrGrupo.push(entry.marker);
      }
      Object.keys(markersNuevosPorGrupo).forEach(function (g) {
        clusterGroups[g].addLayers(markersNuevosPorGrupo[g]);
      });

      if (els.totalBadge) els.totalBadge.textContent = totalCombinados + ' lugares';
      if (els.total) els.total.textContent = totalCombinados;

      // Se calculan los conteos por grupo una sola vez y se reutilizan en
      // renderFiltros/renderLeyenda/actualizarContadoresHero (antes cada una
      // recorría todosLosMarkers por su cuenta para obtener el mismo dato).
      var counts = contarPorGrupo();
      renderFiltros(counts);
      renderLeyenda(counts);
      aplicarFiltros();
      actualizarContadoresHero(totalCombinados, counts);
      animarContadores();

      // [ARQUITECTURA — mapa diferido] La remoción de #app-loading YA NO
      // vive acá. Antes este era "el punto donde termina el primer render
      // real" porque TODO el arranque (hero, header, drawer, bottom nav)
      // pasaba por esta misma cadena síncrona; ahora el hero es HTML
      // estático presente desde el primer byte y el resto del app-shell
      // (drawer/spotlight/bottom-nav/reveal) se engancha en initShell(),
      // sin depender de Leaflet ni de este fetch. cargarDatos() puede
      // correr recién cuando el usuario scrollea cerca de #mapa —a veces
      // segundos después de que la página ya es interactiva—, así que
      // seguir tapando la pantalla entera hasta este punto habría
      // significado bloquear TODO el sitio por algo que ni siquiera está a
      // la vista. Ver UruSpotCore.init() al final del archivo.

      // [OPTIMIZACIÓN — Fase 1] generarSEOItemLists() no aporta nada a lo
      // que el usuario ve: solo escribe <script type="application/ld+json">
      // en <head> para buscadores. Antes corría de forma síncrona en medio
      // del render inicial (recorre todosLosMarkers completo + hace un
      // appendChild por cada grupo con lugares), compitiendo por el mismo
      // hilo justo en el momento más sensible de la carga. Se difiere con
      // requestIdleCallback para que se ejecute cuando el navegador ya
      // terminó el trabajo visual importante; con un timeout de seguridad
      // (2s) para no depender de que el hilo quede ocioso, y un fallback a
      // setTimeout(…, 1) en navegadores que no soportan la API (Safari).
      if (config.seoItemListSufijo !== false) {
        var lanzarSEOItemLists = function () { generarSEOItemLists(config.seoItemListSufijo); };
        if ('requestIdleCallback' in window) {
          requestIdleCallback(lanzarSEOItemLists, { timeout: 2000 });
        } else {
          setTimeout(lanzarSEOItemLists, 1);
        }
      }
    }

    // [ARQUITECTURA — carga core/detalles] Aplica los campos de detalle
    // (direccion/descripcion/telefono/place_id) sobre los lugares ya
    // cargados, por id, vía lugaresPorId (O(1) por registro). Se llama
    // recién cuando cargarDatos() ya terminó su render inicial, así que
    // esto nunca compite por el hilo principal con el trabajo que decide
    // cuándo el usuario puede interactuar — y se agenda en tiempo ocioso
    // porque, a diferencia del fetch en sí (I/O, no ocupa el hilo), el
    // propio merge sí es trabajo de CPU (aunque liviano: ~770 asignaciones
    // de propiedades como mucho).
    //
    // popupHtml() ya usa "if (lugar.direccion)" / "if (lugar.descripcion)"
    // / etc. para cada campo opcional (ver popupHtml más arriba), así que
    // un popup abierto ANTES de que lleguen los detalles simplemente
    // muestra menos líneas — nunca rompe ni deja "undefined" a la vista — y
    // se completa solo la próxima vez que se abra. El único caso que se
    // maneja explícitamente acá es el popup que ya está abierto en el
    // instante exacto en que llegan los detalles: se regenera en el acto
    // para que el usuario no tenga que cerrar/volver a abrir.
    function mergeDetalles(detalles) {
      if (!Array.isArray(detalles) || !detalles.length) return;
      var aplicar = function () {
        var total = detalles.length;
        for (var i = 0; i < total; i++) {
          var d = detalles[i];
          var entry = lugaresPorId[d.id];
          if (!entry) continue; // detalle huérfano (lugar borrado del core, dataset desincronizado)
          var lugar = entry.lugar;
          if (d.direccion) lugar.direccion = d.direccion;
          if (d.descripcion) lugar.descripcion = d.descripcion;
          if (d.telefono) lugar.telefono = d.telefono;
          if (d.place_id) lugar.place_id = d.place_id;

          if (entry.marker._popupHtmlListo) {
            entry.marker._popupHtmlListo = false;
            if (entry.marker.isPopupOpen && entry.marker.isPopupOpen()) {
              entry.marker._popupHtmlListo = true;
              entry.marker.setPopupContent(popupHtml(lugar, entry.color));
            }
          }
        }
        // [NUEVA FUNCIONALIDAD — vista lista] Las tarjetas de lista muestran
        // dirección/teléfono cuando existen; si la lista ya está pintada
        // con el dataset "core" (sin esos campos, ver arquitectura carga
        // core/detalles), se repinta una vez para incorporarlos — mismo
        // criterio que ya aplicaba acá para el popup abierto.
        if (vistaActual === 'lista') renderLista();
      };
      if ('requestIdleCallback' in window) {
        requestIdleCallback(aplicar, { timeout: 2000 });
      } else {
        setTimeout(aplicar, 1);
      }
    }

    // [ARQUITECTURA — mapa diferido] El pedido de red (fetch) no necesita
    // Leaflet para nada — es I/O puro, no toca el hilo principal ni usa L.
    // Antes esto vivía adentro de cargarConExtra(), que solo se llamaba
    // DESPUÉS de que <script defer> terminara de bajar y ejecutar Leaflet +
    // MarkerCluster (~150KB de JS) en el arranque. Con el mapa ahora
    // diferido a un IntersectionObserver (ver lazyInitMapa más abajo), esos
    // dos trabajos —descargar Leaflet, y pedir lugares-core.json/
    // lugares-detalles.json— pueden arrancar en el mismo instante en vez de
    // uno atrás del otro: iniciarFetch() se llama apenas se decide cargar
    // el mapa (en paralelo con cargarScript(LEAFLET_JS)), y cargarConExtra()
    // —que corre recién cuando Leaflet ya está listo— reutiliza la MISMA
    // promesa en vez de volver a pedir la red. idempotente: si algo llama a
    // iniciarFetch() más de una vez, no se duplica el fetch.
    var corePromise = null;
    var detallesPromise = null;
    function iniciarFetch() {
      if (corePromise) return; // ya arrancado
      var coreUrl = config.extraDataUrl;
      var detailsUrl = config.detailsDataUrl;

      detallesPromise = detailsUrl
        ? fetch(detailsUrl)
            .then(function (r) { return r.ok ? r.json() : []; })
            .then(function (data) { return Array.isArray(data) ? data : []; })
            .catch(function () { return []; })
        : Promise.resolve([]);

      corePromise = coreUrl
        ? fetch(coreUrl)
            .then(function (r) { if (!r.ok) throw new Error('no existe'); return r.json(); })
            .then(function (data) { return Array.isArray(data) ? data : []; })
            .catch(function () { return null; }) // null = "no se pudo", cargarDatos cae al dataset base
        : Promise.resolve(null);
    }

    function cargarConExtra() {
      iniciarFetch();
      corePromise.then(function (data) {
        cargarDatos(config.lugares, data || []);
        detallesPromise.then(mergeDetalles);
      });
    }

    // ─── Buscador, reset y geolocalización del panel del mapa ───
    function bindControlesMapa() {
      var buscador = els.buscador;
      if (buscador) {
        // [OPTIMIZACIÓN CRÍTICA] Debounce en buscador + normalizar texto para búsquedas coherentes
        var debouncedSearch = utils.debounce(function (e) {
          textoBusqueda = utils.normalizarTexto(e.target.value.trim());
          aplicarFiltros();
        }, DEBOUNCE_BUSQUEDA_MS);
        
        buscador.addEventListener('input', function (e) {
          debouncedSearch(e);
        });
      }

      var resetBtn = els.resetBtn;
      if (resetBtn) {
        resetBtn.addEventListener('click', limpiarTodoFiltro);
      }

      var geolocBtn = els.geolocBtn;
      if (geolocBtn) {
        geolocBtn.addEventListener('click', function () {
          var btn = this;
          var textoOriginal = btn.textContent;
          // [ARQUITECTURA — mapa diferido] Este botón vive en el toolbar del
          // mapa: en la práctica, para que el usuario pueda verlo y tocarlo
          // ya tuvo que scrollear hasta la sección #mapa, que es la misma
          // señal (IntersectionObserver, rootMargin 800px) que dispara la
          // carga de Leaflet/datos con anticipación — así que llegar acá
          // con `map` todavía null debería ser muy raro (red muy lenta).
          // Se guarda igual, en vez de dejar que L.marker() explote con
          // "L is not defined" si el usuario alcanza a tocar el botón en
          // esa ventana.
          if (!map || typeof L === 'undefined') {
            mostrarToast('El mapa todavía se está cargando — esperá un instante y probá de nuevo.');
            return;
          }
          if (!navigator.geolocation) { mostrarToast('Tu navegador no permite geolocalización.'); return; }
          btn.disabled = true;
          btn.textContent = '📍 Buscando…';
          
          // [ROBUSTEZ] Agregar timeout a geolocalización
          var timeoutId = setTimeout(function () {
            btn.disabled = false;
            btn.textContent = textoOriginal;
            mostrarToast('La geolocalización tardó demasiado. Intentá de nuevo.');
          }, 10000); // 10 segundos timeout
          
          navigator.geolocation.getCurrentPosition(function (pos) {
            clearTimeout(timeoutId);
            var latlng = [pos.coords.latitude, pos.coords.longitude];
            map.setView(latlng, 15);
            L.marker(latlng, {
              icon: L.divIcon({ className: '', html: '<div class="mapa-pin" style="background:#3AA0FF"></div>', iconSize: [16, 16], iconAnchor: [8, 16] })
            }).addTo(map).bindPopup('Estás acá').openPopup();
            btn.disabled = false;
            btn.textContent = textoOriginal;
            // [NUEVA FUNCIONALIDAD — vista lista] Se comparte la misma
            // posición con el orden "Más cerca" del selector de la lista,
            // para no pedir permiso de geolocalización dos veces.
            posicionUsuario = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            if (vistaActual === 'lista' && ordenActual === 'cercania') renderLista();
          }, function () {
            clearTimeout(timeoutId);
            mostrarToast('No pudimos acceder a tu ubicación.');
            btn.disabled = false;
            btn.textContent = textoOriginal;
          });
        });
      }

      // [NUEVA FUNCIONALIDAD — pasada "toolbar del mapa"] #mapa-orden y
      // #mapa-view-toggle: ver la nota de arquitectura junto a
      // renderLista()/cambiarVista() más arriba en este archivo.
      var ordenSelect = els.orden;
      if (ordenSelect) {
        ordenSelect.addEventListener('change', function () {
          ordenActual = ordenSelect.value;
          if (ordenActual === 'cercania' && !posicionUsuario) {
            solicitarUbicacionParaOrden();
          } else if (vistaActual === 'lista') {
            renderLista();
          }
        });
      }

      if (els.viewMapaBtn) els.viewMapaBtn.addEventListener('click', function () { cambiarVista('mapa'); });
      if (els.viewListaBtn) els.viewListaBtn.addEventListener('click', function () { cambiarVista('lista'); });
    }

    // ─── API pública del motor ───
    // [NUEVA FUNCIONALIDAD — vista lista] Antes este objeto se retornaba
    // como literal anónimo directo en el "return {...}". Se lo nombra acá
    // (var api = {...}; return api;) por una única razón: bindListaCards()
    // necesita llamar a bindAccionesLugar() (favoritos + compartir) sobre
    // las tarjetas de la lista sin duplicar esa lógica. Por clausura, "api"
    // ya está asignado para cuando bindListaCards() efectivamente se
    // ejecuta (solo corre en respuesta a un clic, muy después de que
    // crearMotor() terminó de construir este objeto) — mismo patrón que
    // ya usa bindAccionesLugar() internamente con "var self = this".
    // Ningún método ni valor de la API pública cambia: es el mismo objeto,
    // solo con un nombre.
    var api = {
      utils: utils,
      favoritos: favoritos,

      // [ARQUITECTURA — mapa diferido] "Shell": todo lo que el motor puede
      // hacer SIN Leaflet cargado — cachear nodos del DOM y enganchar los
      // listeners del toolbar del mapa (buscador, reset, geoloc) y de los
      // links [data-filtro] (hero cards, "categorías en detalle", footer).
      // Nada de esto crea un solo objeto de Leaflet ni toca la red; es
      // barato (microsegundos) y corre síncrono en el arranque, para que
      // esos controles respondan al tacto desde el primer instante aunque
      // el mapa en sí todavía no exista.
      initShell: function () {
        cachearElementos();
        bindControlesMapa();
        bindFiltroLinks(document);
      },

      // Arranca el fetch de lugares-core.json/lugares-detalles.json sin
      // esperar a Leaflet — se puede llamar en paralelo con la descarga del
      // script de Leaflet (ver lazyInitMapa). Público e idempotente.
      precargarDatos: function () {
        iniciarFetch();
      },

      // "Motor pesado": crea el mapa Leaflet real (L.map, tileLayer,
      // clusterGroups) y dispara/consume la carga de datos. Requiere que
      // `L` (y `L.markerClusterGroup`) ya estén definidos globalmente —
      // el llamador (lazyInitMapa) garantiza eso esperando a que los
      // scripts terminen de cargar antes de invocar esto.
      initMapaYDatos: function () {
        initMapa();
        cargarConExtra();
      },
      setFiltro: setFiltro,
      aplicarFiltros: aplicarFiltros,
      mostrarSoloLugares: mostrarSoloLugares,
      getLugarPorId: getLugarPorId,
      buscarLugares: buscarLugares,
      irALugar: irALugar,
      sugeridos: lugaresSugeridos,
      contarPorGrupo: contarPorGrupo,
      bindFiltroLinks: bindFiltroLinks,
      compartirLugar: function (lugar) {
        var url = location.href.split('#')[0] + '#lugar-' + lugar.id;
        var texto = lugar.nombre + (config.shareSuffix || '');
        if (navigator.share) {
          navigator.share({ title: lugar.nombre, text: texto, url: url }).catch(function () {});
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(function () {
            mostrarToast('Enlace copiado al portapapeles');
          }).catch(function () {
            mostrarToast('No pudimos copiar el enlace');
          });
        }
      },
      bindAccionesLugar: function (root) {
        var self = this;
        root.querySelectorAll('[data-fav-id]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = parseInt(btn.getAttribute('data-fav-id'), 10);
            var ahoraFav = favoritos.toggle(id);
            // Refresca CUALQUIER botón de favorito de este mismo lugar que
            // esté visible ahora mismo (mapa y lista muestran el mismo
            // lugar con marcado propio) para que no queden desincronizados
            // entre sí — antes solo se actualizaba el botón exacto que
            // recibió el clic.
            document.querySelectorAll('[data-fav-id="' + id + '"]').forEach(function (b) {
              b.classList.toggle('is-fav', ahoraFav);
              b.setAttribute('aria-label', ahoraFav ? 'Quitar de favoritos' : 'Guardar en favoritos');
              if (b.classList.contains('act-btn-lg')) {
                b.textContent = ahoraFav ? '♥ Guardado' : '♡ Guardar';
              } else {
                b.textContent = ahoraFav ? '♥' : '♡';
              }
            });
            // [NUEVA FUNCIONALIDAD — feedback de favoritos] Confirmación no
            // bloqueante con "Deshacer": un toque accidental en el corazón
            // (mobile, listas densas) ya no obliga a buscar el lugar de
            // nuevo para revertirlo. Reutiliza el mismo toggle(), no
            // duplica el camino de guardado/lectura de localStorage.
            var lugarRef = getLugarPorId(id);
            var nombre = lugarRef ? lugarRef.nombre : 'Lugar';
            mostrarToast(
              ahoraFav ? '♥ Guardado en favoritos: ' + nombre : 'Quitado de favoritos: ' + nombre,
              {
                accionLabel: 'Deshacer',
                onAccion: function () {
                  var revertido = favoritos.toggle(id);
                  document.querySelectorAll('[data-fav-id="' + id + '"]').forEach(function (b) {
                    b.classList.toggle('is-fav', revertido);
                    b.setAttribute('aria-label', revertido ? 'Quitar de favoritos' : 'Guardar en favoritos');
                    if (b.classList.contains('act-btn-lg')) {
                      b.textContent = revertido ? '♥ Guardado' : '♡ Guardar';
                    } else {
                      b.textContent = revertido ? '♥' : '♡';
                    }
                  });
                }
              }
            );
          });
        });
        root.querySelectorAll('[data-share-id]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = parseInt(btn.getAttribute('data-share-id'), 10);
            var lugar = getLugarPorId(id);
            if (lugar) self.compartirLugar(lugar);
          });
        });
      },
      get map() { return map; },
      get todosLosMarkers() { return todosLosMarkers; },
      get filtroActivo() { return filtroActivo; }
    };
    return api;
  }

  // Menú lateral (drawer): el HTML/CSS ya existían (hamburguesa, aside con
  // los links, scrim compartido #scrim) pero no había NINGÚN JS que los
  // conectara — el botón de 3 barras no hacía nada. Usa el mismo #scrim
  // que consumen los otros overlays (data-owner evita que se pisen).
  function initDrawer() {
    var trigger = document.getElementById('header-drawer-trigger');
    var drawer = document.getElementById('app-drawer');
    var closeBtn = document.getElementById('drawer-close');
    var scrim = document.getElementById('scrim');
    if (!trigger || !drawer) return;
    var trampa = crearTrampaFoco(drawer);

    function abrir() {
      drawer.removeAttribute('hidden');
      trigger.setAttribute('aria-expanded', 'true');
      if (scrim) { scrim.removeAttribute('hidden'); scrim.setAttribute('data-owner', 'drawer'); }
      document.body.classList.add('no-scroll');
      trampa.activar();
      // Mueve el foco DENTRO del diálogo apenas se abre (el cierre, si
      // existe, es el destino más predecible; si no, el primer link/botón
      // de la nav) — antes el foco se quedaba en el botón hamburguesa,
      // fuera del propio diálogo que se acababa de declarar abierto.
      var primerFoco = closeBtn || drawer.querySelector('.us-drawer-item');
      if (primerFoco) setTimeout(function () { primerFoco.focus(); }, 0);
    }
    function cerrar() {
      drawer.setAttribute('hidden', '');
      trigger.setAttribute('aria-expanded', 'false');
      if (scrim && scrim.getAttribute('data-owner') === 'drawer') {
        scrim.setAttribute('hidden', '');
        scrim.setAttribute('data-owner', '');
      }
      document.body.classList.remove('no-scroll');
      trampa.desactivar();
    }
    trigger.addEventListener('click', abrir);
    if (closeBtn) closeBtn.addEventListener('click', cerrar);
    if (scrim) scrim.addEventListener('click', function () {
      if (scrim.getAttribute('data-owner') === 'drawer') cerrar();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !drawer.hasAttribute('hidden')) cerrar();
    });
    // Los links con href (#hero, #mapa, etc.) navegan solos: alcanza con
    // cerrar el drawer. Los botones sin href (favoritos/historial/etc.)
    // todavía no tienen su propia superficie implementada.
    drawer.querySelectorAll('.us-drawer-item').forEach(function (item) {
      item.addEventListener('click', function () { cerrar(); });
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Componentes de UI globales (independientes del motor de mapa)
  // ─────────────────────────────────────────────────────────────────────

  // Toggle "Local / Visitante": pura presentación (agrega una clase al body
  // que el CSS de contenido puede usar para reordenar secciones).
  function initLocalVisitanteToggle() {
    var btnLocal = document.getElementById('toggle-local');
    var btnVisitante = document.getElementById('toggle-visitante');
    if (!btnLocal || !btnVisitante) return;
    function setModo(modo) {
      document.body.classList.toggle('modo-local', modo === 'local');
      btnLocal.classList.toggle('is-active', modo === 'local');
      btnVisitante.classList.toggle('is-active', modo === 'visitante');
    }
    btnLocal.addEventListener('click', function () { setModo('local'); });
    btnVisitante.addEventListener('click', function () { setModo('visitante'); });
  }

  // Overlay de búsqueda (spotlight): no duplica lógica de filtrado, redirige
  // el valor al #mapa-search real y dispara su evento input.
  function initSpotlightSearch(motor, GRUPOS) {
    var overlay = document.getElementById('search-spotlight');
    var input = document.getElementById('spotlight-input');
    var closeBtn = document.getElementById('spotlight-close');
    var openBtn = document.getElementById('bn-buscar');
    // [FIX] La lupa visible del header (#header-search-trigger) nunca estaba
    // conectada: solo se escuchaba el botón de la bottom nav mobile.
    var openBtnHeader = document.getElementById('header-search-trigger');
    var realSearch = document.getElementById('mapa-search');
    var resultsEl = document.getElementById('spotlight-results');
    var suggestEl = document.getElementById('spotlight-suggestions');
    var emptyEl = document.getElementById('spotlight-empty');
    if (!overlay || !input || !realSearch) return;
    var trampa = crearTrampaFoco(overlay);

    // [FIX] Antes #spotlight-results/#spotlight-suggestions nunca se
    // llenaban: el buscador filtraba el mapa por detrás pero no había
    // ningún resultado para tocar. Esto arma la tarjeta clickeable que
    // lleva directo al lugar (buscar → tocar → el mapa vuela ahí y abre
    // la ficha), en vez de tener que ir a buscarlo a mano en el mapa.
    function itemHtml(entry) {
      var lugar = entry.lugar;
      var g = GRUPOS[entry.grupo];
      var icon = g ? g.icon : '📍';
      var label = g ? g.label : entry.categoria;
      var rating = lugar.rating ? '★ ' + parseFloat(lugar.rating).toFixed(1) : '';
      return '<button type="button" class="spotlight-item" data-ir="' + lugar.id + '">' +
        '<span class="spotlight-item-icon" aria-hidden="true">' + icon + '</span>' +
        '<span class="spotlight-item-info">' +
          '<span class="spotlight-item-nombre">' + utils.escapeHtml(lugar.nombre) + '</span>' +
          '<span class="spotlight-item-cat">' + utils.escapeHtml(label) + (rating ? ' · ' + rating : '') + '</span>' +
        '</span>' +
      '</button>';
    }

    function bindItems(container) {
      container.querySelectorAll('[data-ir]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = parseInt(btn.getAttribute('data-ir'), 10);
          cerrar();
          var mapaSection = document.getElementById('mapa');
          if (mapaSection) mapaSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Le da tiempo al scroll a terminar antes de mover el mapa
          // (evita pelear el flyTo/zoomToShowLayer contra el scroll nativo).
          setTimeout(function () { motor.irALugar(id); }, 350);
        });
      });
    }

    function renderSugeridos() {
      if (!suggestEl) return;
      var top = motor.sugeridos ? motor.sugeridos(6) : [];
      suggestEl.innerHTML = top.length
        ? '<div class="spotlight-suggestions-label">Los mejor puntuados</div>' + top.map(itemHtml).join('')
        : '';
      bindItems(suggestEl);
    }

    function renderResultados(texto) {
      var matches = motor.buscarLugares ? motor.buscarLugares(texto, 8) : [];
      if (resultsEl) {
        resultsEl.innerHTML = matches.map(itemHtml).join('');
        bindItems(resultsEl);
      }
      if (suggestEl) suggestEl.innerHTML = '';
      if (emptyEl) emptyEl.hidden = matches.length > 0;
    }

    function abrir(e) {
      if (e) e.preventDefault();
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      if (emptyEl) emptyEl.hidden = true;
      if (!input.value.trim()) renderSugeridos();
      trampa.activar();
      setTimeout(function () { input.focus(); }, 50);
    }
    function cerrar() {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      trampa.desactivar();
    }
    if (openBtn) openBtn.addEventListener('click', abrir);
    if (openBtnHeader) openBtnHeader.addEventListener('click', abrir);
    if (closeBtn) closeBtn.addEventListener('click', cerrar);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) cerrar(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) cerrar();
    });

    var debouncedRender = utils.debounce(function () {
      var texto = input.value.trim();
      if (texto) renderResultados(texto);
      else { if (resultsEl) resultsEl.innerHTML = ''; renderSugeridos(); }
    }, DEBOUNCE_BUSQUEDA_MS);

    input.addEventListener('input', function () {
      realSearch.value = input.value;
      realSearch.dispatchEvent(new Event('input', { bubbles: true }));
      debouncedRender();
    });
  }

  // Nav inferior mobile: resalta el ítem activo por scroll. El botón de
  // favoritos hace scroll a un destino configurable vía data-scroll-target
  // (el módulo de contenido decide a qué sección apunta "Favoritos").
  // [OPTIMIZACIÓN] Cachear offsetTop para evitar reflows en cada scroll
  function initBottomNav() {
    var items = document.querySelectorAll('.bn-item[href]');
    var favBtn = document.getElementById('bn-favoritos');
    if (favBtn) {
      favBtn.addEventListener('click', function () {
        var destino = favBtn.getAttribute('data-scroll-target');
        var el = destino ? document.querySelector(destino) : null;
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      });
    }
    if (!items.length) return;
    
    // [OPTIMIZACIÓN] Cachear offsetTop una sola vez en inicialización
    var targetData = Array.prototype.map.call(items, function (a) {
      var target = document.querySelector(a.getAttribute('href'));
      return { element: a, offsetTop: target ? target.offsetTop : 0 };
    });

    // [OPTIMIZACIÓN] targetData/items no cambian de tamaño después de este
    // punto: se cachean sus longitudes acá afuera en vez de releer
    // targetData.length/items.length en cada evento de scroll (que puede
    // dispararse decenas de veces por segundo).
    var targetDataLen = targetData.length;
    var itemsLen = items.length;

    window.addEventListener('scroll', function () {
      var pos = window.scrollY + 120;
      var activo = 0;
      for (var i = 0; i < targetDataLen; i++) {
        if (targetData[i].offsetTop <= pos) activo = i;
      }
      for (var j = 0; j < itemsLen; j++) {
        items[j].classList.toggle('is-active', j === activo);
      }
    }, { passive: true });
  }

  // Reveal on scroll: única implementación (reemplaza dos observadores
  // duplicados e inconsistentes —uno de ellos aplicaba una clase, .visible,
  // que el CSS nunca usaba— detectados durante la auditoría del código
  // original).
  function initReveal() {
    var els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window) || !els.length) {
      els.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    els.forEach(function (el) { obs.observe(el); });
  }

  // Scroll suave para anclas internas (#id).
  // [OPTIMIZACIÓN] Usar event delegation en lugar de listener en cada enlace
  function initSmoothAnchors() {
    document.addEventListener('click', function (e) {
      var anchor = e.target.closest('a[href^="#"]');
      if (anchor) {
        var href = anchor.getAttribute('href');
        if (href !== '#' && document.querySelector(href)) {
          e.preventDefault();
          document.querySelector(href).scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Carga diferida de Leaflet + Leaflet.markercluster
  // ─────────────────────────────────────────────────────────────────────
  // [ARQUITECTURA — mapa diferido, hallazgo principal de esta auditoría]
  // Antes, leaflet.min.js (~145KB) y leaflet.markercluster.min.js (~30KB)
  // se declaraban como <script defer> en el <head>: con defer, el
  // navegador los descarga en paralelo con el resto, pero los EJECUTA en
  // orden de documento antes de DOMContentLoaded — y content.js (el script
  // que sigue en esa misma cadena defer) llamaba a UruSpotCore.init() de
  // forma síncrona apenas le tocaba el turno. Eso significa que analizar +
  // ejecutar ~175KB de una librería de mapas (parseo, registro de clases,
  // detección de capacidades del navegador, etc.) quedaba en el camino
  // crítico de CUALQUIER interacción del sitio — el botón de hamburguesa
  // del drawer, la lupa de búsqueda, el resaltado de la bottom nav — aun
  // cuando ninguno de esos componentes usa una sola línea de Leaflet.
  // Peor: el mapa (#mapa-leaflet) está varias pantallas por debajo del
  // hero, así que en la enorme mayoría de las cargas ese trabajo se hacía
  // ANTES de que hubiera ninguna garantía de que el usuario fuera a
  // scrollear hasta ahí.
  //
  // Ahora Leaflet/MarkerCluster (JS y CSS) se inyectan dinámicamente recién
  // cuando #mapa-leaflet está por entrar en viewport (IntersectionObserver
  // con rootMargin generoso, para que ya esté listo cuando el usuario
  // realmente llegue scrolleando, sin sentirse "cargando"). Todo lo que SÍ
  // debe funcionar desde el primer instante (drawer, spotlight, bottom nav,
  // reveal, smooth-scroll, buscador/reset/geoloc del toolbar) se engancha
  // en UruSpotCore.init() sin esperar nada de esto — ver más abajo.
  var LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
  var CLUSTER_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.min.js';
  var LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
  var CLUSTER_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css';
  var CLUSTER_DEFAULT_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.css';

  function cargarCssAsync(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  // Carga un <script> bajo demanda. Idempotente: si dos llamadores piden el
  // mismo src (no debería pasar con un solo lazyInitMapa, pero es barato
  // de garantizar), no se duplica el tag ni la descarga.
  //
  // `yaListo` (opcional) es un chequeo directo de disponibilidad (ej. "¿ya
  // existe window.L?"), no solo el evento 'load'. Motivo: si ALGÚN OTRO
  // punto de la página ya declaró este mismo <script src> de forma eager
  // (por fuera de este archivo), su evento 'load' puede haber disparado
  // ANTES de que este código llegara a engancharse — y un 'load' que ya
  // pasó no vuelve a pasar, lo que dejaría la promesa colgada para
  // siempre. Sondear el resultado real, no solo el evento, hace esto
  // seguro sin importar quién puso el script ahí.
  function cargarScriptAsync(src, yaListo) {
    return new Promise(function (resolve, reject) {
      if (typeof yaListo === 'function' && yaListo()) { resolve(); return; }
      var existente = document.querySelector('script[src="' + src + '"]');
      if (existente) {
        if (existente._uruspotCargado) { resolve(); return; }
        existente.addEventListener('load', function () { resolve(); });
        existente.addEventListener('error', reject);
        if (typeof yaListo === 'function' && yaListo()) resolve();
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.async = true; // ya no hace falta orden de documento: se encadena a mano abajo
      script.onload = function () { script._uruspotCargado = true; resolve(); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function arrancarMapaPesado(motor) {
    // precargarDatos() e Leaflet arrancan en el MISMO instante: el fetch de
    // lugares-core.json/lugares-detalles.json es I/O puro y no necesita `L`
    // para nada, así que no hay ninguna razón para esperar a que Leaflet
    // termine de descargar/ejecutar antes de pedirlo por red.
    motor.precargarDatos();

    cargarCssAsync(LEAFLET_CSS);
    cargarCssAsync(CLUSTER_CSS);
    cargarCssAsync(CLUSTER_DEFAULT_CSS);

    // leaflet.markercluster extiende el objeto L, así que su script debe
    // ejecutar DESPUÉS de que leaflet.min.js ya haya corrido — de ahí el
    // encadenado en vez de cargar los dos en paralelo.
    cargarScriptAsync(LEAFLET_JS, function () { return typeof window.L !== 'undefined'; })
      .then(function () {
        return cargarScriptAsync(CLUSTER_JS, function () {
          return typeof window.L !== 'undefined' && typeof window.L.markerClusterGroup !== 'undefined';
        });
      })
      .then(function () { motor.initMapaYDatos(); })
      .catch(function () {
        // Red caída/bloqueada: al menos no dejamos "cargando…" para
        // siempre en el badge de la sección.
        var badge = document.getElementById('mapa-total-badge');
        if (badge) badge.textContent = 'No se pudo cargar el mapa';
        var empty = document.getElementById('mapa-empty');
        if (empty) { empty.textContent = 'No se pudo cargar el mapa. Revisá tu conexión y recargá la página.'; empty.style.display = 'block'; }
      });
  }

  function lazyInitMapa(motor) {
    var mapaEl = document.getElementById('mapa-leaflet');
    if (!mapaEl) return; // contrato de DOM no cumplido: nada que diferir

    var arrancado = false;
    function arrancar() {
      if (arrancado) return;
      arrancado = true;
      arrancarMapaPesado(motor);
    }

    if ('IntersectionObserver' in window) {
      // rootMargin generoso (800px por debajo del viewport): el objetivo
      // no es "cargar solo lo visible" a rajatabla, sino sacar el trabajo
      // pesado del camino crítico del arranque. Con este margen, para la
      // gran mayoría de patrones de scroll el mapa ya está listo (o casi)
      // para cuando el usuario efectivamente lo tiene enfrente.
      var obs = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            obs.disconnect();
            arrancar();
            return;
          }
        }
      }, { rootMargin: '800px 0px', threshold: 0 });
      obs.observe(mapaEl);
    } else {
      // Navegador sin IntersectionObserver (residual): no se vuelve a la
      // carga síncrona en el arranque, se difiere a tiempo ocioso con un
      // timeout de seguridad, que sigue siendo mejor que competir por el
      // hilo principal en el momento más sensible de la página.
      if ('requestIdleCallback' in window) requestIdleCallback(arrancar, { timeout: 3000 });
      else setTimeout(arrancar, 1);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Punto de entrada público
  // ─────────────────────────────────────────────────────────────────────
  var UruSpotCore = {
    utils: utils,

    // Crea e inicializa el motor de mapa/filtros con la configuración dada.
    // config.grupos y config.lugares los provee el MÓDULO B (contenido).
    init: function (config) {
      var motor = crearMotor(config);

      // ─── App-shell: interactivo YA, sin depender de Leaflet ni de red ───
      motor.initShell();
      initLocalVisitanteToggle();
      initSpotlightSearch(motor, config.grupos || {});
      initDrawer();
      initBottomNav();
      initReveal();
      initSmoothAnchors();

      // [ARQUITECTURA — mapa diferido] El overlay #app-loading se saca ACÁ,
      // apenas el app-shell completo ya respondió al tacto (header, drawer,
      // spotlight, bottom nav, hero — este último 100% HTML/CSS estático,
      // sin ninguna dependencia de este punto). Antes esperaba a que
      // cargarDatos() terminara de procesar 862 lugares — trabajo que ni
      // siquiera es visible hasta que el usuario scrollea hasta #mapa. La
      // página entera ya no tiene motivo para seguir tapada por eso.
      var appLoading = document.getElementById('app-loading');
      if (appLoading) {
        appLoading.classList.add('is-done');
        appLoading.setAttribute('inert', '');
      }

      // ─── Mapa: recién cuando la sección se acerca al viewport ───
      lazyInitMapa(motor);

      return motor;
    }
  };

  global.UruSpotCore = UruSpotCore;

})(window);
