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
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    },

    starsHtml: function (rating) {
      var full = Math.floor(rating);
      var s = '';
      for (var i = 0; i < 5; i++) s += (i < full) ? '★' : '☆';
      return s;
    },

    escapeHtml: function (str) {
      return String(str).replace(/[&<>"']/g, function (c) {
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
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // Favoritos (localStorage) — genérico, la clave es configurable
  // ─────────────────────────────────────────────────────────────────────
  function crearFavoritos(storageKey) {
    var KEY = storageKey || 'uruspot_favoritos';
    function getFavoritos() {
      try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
    }
    function esFavorito(id) { return getFavoritos().indexOf(id) !== -1; }
    function toggleFavorito(id) {
      var favs = getFavoritos();
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
  // Motor principal
  // ─────────────────────────────────────────────────────────────────────
  function crearMotor(config) {
    config = config || {};

    var GRUPOS = config.grupos || {};
    var favoritos = crearFavoritos(config.favoritesKey);

    var map = null;
    var clusterGroups = {};
    var todosLosMarkers = []; // {marker, grupo, categoria, nombreNorm, categoriaNorm, lugar}
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
    }

    // ─── Íconos de mapa ───
    function pinIcon(color, destacado) {
      var key = color + '|' + (destacado ? '1' : '0');
      if (!iconCache[key]) {
        var claseExtra = destacado ? ' mapa-pin-destacado' : '';
        iconCache[key] = L.divIcon({
          className: '',
          html: '<div class="mapa-pin' + claseExtra + '" style="background:' + color + '"></div>',
          iconSize: destacado ? [20, 20] : [16, 16],
          iconAnchor: destacado ? [10, 20] : [8, 16],
          popupAnchor: [0, -16]
        });
      }
      return iconCache[key];
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
      Object.keys(GRUPOS).forEach(function (g) {
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
      if (lugar.destacado) html += '<span class="mapa-popup-destacado">★ Destacado</span>';
      html += '<span class="mapa-popup-cat">' + GRUPOS[lugar.grupo].icon + ' ' + utils.escapeHtml(lugar.categoria || '') +
              ' <span class="mapa-popup-grupo">· ' + utils.escapeHtml(GRUPOS[lugar.grupo].label) + '</span></span>';
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
      html += '</div>';
      return html;
    }

    // ─── Alta de un lugar en el mapa ───
    function agregarLugar(lugar) {
      // Validación de propiedades requeridas
      if (!lugar || typeof lugar !== 'object') return;
      if (typeof lugar.lat !== 'number' || typeof lugar.lng !== 'number') return;
      if (!lugar.id || !lugar.nombre) return;

      var grupoDefault = config.grupoPorDefecto || Object.keys(GRUPOS)[0];
      var grupo = GRUPOS[lugar.grupo] ? lugar.grupo : grupoDefault;
      var color = GRUPOS[grupo].color;
      var marker = L.marker([lugar.lat, lugar.lng], {
        icon: pinIcon(color, !!lugar.destacado),
        title: lugar.nombre,
        riseOnHover: true,
        zIndexOffset: lugar.destacado ? 1000 : 0
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
        lugar: lugar
      };
      todosLosMarkers.push(entry);
      if (!markersPorGrupo[grupo]) markersPorGrupo[grupo] = [];
      markersPorGrupo[grupo].push(entry);
      return entry;
    }

    // ─── Filtros (pills) ───
    function renderFiltros(counts) {
      var cont = els.filtros;
      if (!cont) return;

      var html = '<button class="mapa-pill activo" data-cat="todos" type="button">Todos <span class="cnt">' + todosLosMarkers.length + '</span></button>';
      Object.keys(GRUPOS).forEach(function (g) {
        if (!counts[g]) return;
        html += '<button class="mapa-pill" data-cat="' + g + '" type="button" style="--pill-color:' + GRUPOS[g].color + '">' +
                GRUPOS[g].icon + ' ' + GRUPOS[g].label + ' <span class="cnt">' + counts[g] + '</span></button>';
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
      lista.forEach(function (m) {
        counts[m.categoria] = (counts[m.categoria] || 0) + 1;
      });
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
      Object.keys(GRUPOS).forEach(function (g) {
        if (!counts[g]) return;
        html += '<button class="mapa-legend-item' + (filtroActivo === g ? ' activo' : '') + '" data-cat="' + g + '" type="button">' +
                '<span class="mapa-legend-swatch" style="background:' + GRUPOS[g].color + '"></span>' +
                '<span class="mapa-legend-label">' + GRUPOS[g].icon + ' ' + GRUPOS[g].label + '</span>' +
                '<span class="mapa-legend-count">' + counts[g] + '</span></button>';
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

    // ─── Filtro combinado (categoría + subcategoría + búsqueda) ───
    function aplicarFiltros() {
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

      Object.keys(clusterGroups).forEach(function (g) {
        var grupoLayer = clusterGroups[g];
        var esCandidato = esTodos || (g === filtroActivo);

        if (!esCandidato) {
          if (map.hasLayer(grupoLayer)) map.removeLayer(grupoLayer);
          return;
        }

        var lista = markersPorGrupo[g] || [];
        for (var i = 0; i < lista.length; i++) {
          var m = lista[i];
          var pasaSubcategoria = (!subFiltroActivo) || (m.categoria === subFiltroActivo);
          var pasaBusqueda = (textoBusqueda === '') ||
            (m.nombreNorm.indexOf(textoBusqueda) > -1) ||
            (m.categoriaNorm.indexOf(textoBusqueda) > -1);
          var mostrar = pasaSubcategoria && pasaBusqueda;
          if (mostrar) {
            if (!grupoLayer.hasLayer(m.marker)) grupoLayer.addLayer(m.marker);
            visibles++;
          } else {
            if (grupoLayer.hasLayer(m.marker)) grupoLayer.removeLayer(m.marker);
          }
        }

        if (!map.hasLayer(grupoLayer)) map.addLayer(grupoLayer);
      });

      if (els.count) els.count.textContent = visibles;
      if (els.empty) els.empty.style.display = (visibles === 0) ? 'block' : 'none';
      if (els.mapaDiv) els.mapaDiv.style.display = (visibles === 0) ? 'none' : 'block';

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
      // Lookup por objeto en vez de ids.indexOf(...) dentro del forEach:
      // evita un escaneo del array "ids" por cada uno de los marcadores.
      var idsSet = {};
      for (var i = 0; i < ids.length; i++) idsSet[ids[i]] = true;

      todosLosMarkers.forEach(function (m) {
        var grupo = clusterGroups[m.grupo];
        if (idsSet[m.lugar.id]) {
          if (!grupo.hasLayer(m.marker)) grupo.addLayer(m.marker);
        } else {
          if (grupo.hasLayer(m.marker)) grupo.removeLayer(m.marker);
        }
      });
      // Todos los grupos terminan en el mapa (igual que antes); solo se
      // agregan los que todavía no estuvieran, sin sacarlos primero.
      Object.keys(clusterGroups).forEach(function (g) {
        if (!map.hasLayer(clusterGroups[g])) map.addLayer(clusterGroups[g]);
      });
    }

    function getLugarPorId(id) {
      // Corte temprano en vez de .filter(...)[0]: no sigue recorriendo el
      // array después de encontrar el lugar buscado.
      for (var i = 0; i < todosLosMarkers.length; i++) {
        if (todosLosMarkers[i].lugar.id === id) return todosLosMarkers[i].lugar;
      }
      return null;
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
      for (var i = 0; i < todosLosMarkers.length && resultados.length < max; i++) {
        var m = todosLosMarkers[i];
        if (m.nombreNorm.indexOf(norm) > -1 || m.categoriaNorm.indexOf(norm) > -1) {
          resultados.push(m);
        }
      }
      return resultados;
    }

    // Lugares mejor puntuados, para mostrar como accesos rápidos apenas se
    // abre el buscador (antes de que el usuario escriba nada).
    function lugaresSugeridos(cantidad) {
      return todosLosMarkers
        .slice()
        .sort(function (a, b) { return (b.lugar.rating || 0) - (a.lugar.rating || 0); })
        .slice(0, cantidad || 6);
    }

    // Salto directo a un lugar puntual: resetea cualquier filtro/búsqueda
    // que lo estuviera tapando, hace zoom hasta sacarlo del cluster (API
    // propia de Leaflet.markercluster) y abre su popup con la info.
    function irALugar(id) {
      var entry = null;
      for (var i = 0; i < todosLosMarkers.length; i++) {
        if (todosLosMarkers[i].lugar.id === id) { entry = todosLosMarkers[i]; break; }
      }
      if (!entry) return false;

      setFiltro('todos', { limpiarBusqueda: true });

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
      todosLosMarkers.forEach(function (m) { counts[m.grupo] = (counts[m.grupo] || 0) + 1; });
      return counts;
    }

    // ─── Tarjetas de categoría (hero) — genéricas, iteran sobre GRUPOS ───
    function renderHeroCards(counts) {
      var cont = els.catsContainer;
      if (!cont) return;
      var html = '';
      Object.keys(GRUPOS).forEach(function (g) {
        if (!counts[g]) return;
        var info = GRUPOS[g];
        html += '<a class="cat cat-' + g + '" href="#mapa" data-filtro="' + g + '">' +
                '<span class="cat-icon" aria-hidden="true">' + info.icon + '</span>' +
                '<div class="cat-name"><span class="cat-dot" style="background:' + info.color + '"></span>' + utils.escapeHtml(info.label) + '</div>' +
                '<div class="cat-desc">' + utils.escapeHtml(info.desc || '') + '</div>' +
                '<div class="cat-count"><span id="cnt-' + g + '">' + counts[g] + '</span> lugares</div>' +
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
      Object.keys(GRUPOS).forEach(function (g) {
        if (!counts[g]) return;
        var info = GRUPOS[g];
        html += '<div class="cd-item" id="cat-detalle-' + g + '">' +
                '<h3>' + info.icon + ' ' + utils.escapeHtml(info.label) + ' <span class="cd-count">(<span id="dcnt-' + g + '">' + counts[g] + '</span> lugares)</span></h3>' +
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
      todosLosMarkers.forEach(function (m) {
        (porGrupo[m.grupo] || (porGrupo[m.grupo] = [])).push(m);
      });
      Object.keys(GRUPOS).forEach(function (g) {
        var lugaresGrupo = porGrupo[g];
        if (!lugaresGrupo || !lugaresGrupo.length) return;
        var itemList = {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: GRUPOS[g].label + (nombreSufijo ? ' ' + nombreSufijo : ''),
          numberOfItems: lugaresGrupo.length,
          itemListElement: lugaresGrupo.map(function (m, i) {
            return { '@type': 'ListItem', position: i + 1, name: m.lugar.nombre };
          })
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

      elementos.forEach(function (el) {
        var valor = parseInt(el.textContent, 10);
        if (isNaN(valor)) return;
        animaciones.push({ el: el, valorFinal: valor, valorActual: 0 });
      });

      if (!animaciones.length) return;

      function animar(timestamp) {
        if (!tiempoInicio) tiempoInicio = timestamp;
        var progreso = (timestamp - tiempoInicio) / duracion;

        if (progreso >= 1) {
          animaciones.forEach(function (a) { a.el.textContent = a.valorFinal; });
          return;
        }

        animaciones.forEach(function (a) {
          var valorIntermedio = Math.floor(a.valorFinal * progreso);
          a.el.textContent = valorIntermedio;
        });

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
      if (els.statCategorias) els.statCategorias.textContent = Object.keys(GRUPOS).filter(function (g) { return counts[g]; }).length;

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
          setFiltro(card.getAttribute('data-filtro'), { limpiarBusqueda: true });
        });
      });
    }

    // ─── Carga de datos: dataset inicial + fusión opcional con JSON externo ───
    function cargarDatos(lugaresIniciales, extra) {
      // [VALIDACIÓN] Garantizar que lugaresIniciales es un array
      lugaresIniciales = Array.isArray(lugaresIniciales) ? lugaresIniciales : [];
      extra = Array.isArray(extra) ? extra : [];
      
      var combinados = lugaresIniciales.concat(extra);
      combinados.forEach(agregarLugar);

      if (els.totalBadge) els.totalBadge.textContent = combinados.length + ' lugares';
      if (els.total) els.total.textContent = combinados.length;

      // Se calculan los conteos por grupo una sola vez y se reutilizan en
      // renderFiltros/renderLeyenda/actualizarContadoresHero (antes cada una
      // recorría todosLosMarkers por su cuenta para obtener el mismo dato).
      var counts = contarPorGrupo();
      renderFiltros(counts);
      renderLeyenda(counts);
      aplicarFiltros();
      actualizarContadoresHero(combinados.length, counts);
      animarContadores();

      // [FIX] El overlay #app-loading queda tapando la app para siempre si
      // nadie le agrega "is-done" (ver comentario en index.html líneas 55-59).
      // Se saca acá porque es el punto donde termina el primer render real.
      var appLoading = document.getElementById('app-loading');
      if (appLoading) {
        appLoading.classList.add('is-done');
        appLoading.setAttribute('inert', '');
      }

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

    function cargarConExtra() {
      var url = config.extraDataUrl;
      if (!url) { cargarDatos(config.lugares); return; }
      fetch(url)
        .then(function (r) { if (!r.ok) throw new Error('no existe'); return r.json(); })
        .then(function (data) { cargarDatos(config.lugares, Array.isArray(data) ? data : []); })
        .catch(function () { cargarDatos(config.lugares); });
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
        resetBtn.addEventListener('click', function (e) {
          e.preventDefault();
          if (buscador) buscador.value = '';
          textoBusqueda = '';
          filtroActivo = 'todos';
          (pillNodes || document.querySelectorAll('.mapa-pill')).forEach(function (b) { b.classList.remove('activo'); });
          var todosBtn = els.filtros ? els.filtros.querySelector('.mapa-pill[data-cat="todos"]') : document.querySelector('.mapa-pill[data-cat="todos"]');
          if (todosBtn) todosBtn.classList.add('activo');
          (legendNodes || document.querySelectorAll('.mapa-legend-item')).forEach(function (it) { it.classList.remove('activo'); });
          aplicarFiltros();
          map.setView(config.mapCenter || [0, 0], config.mapZoom || 13);
        });
      }

      var geolocBtn = els.geolocBtn;
      if (geolocBtn) {
        geolocBtn.addEventListener('click', function () {
          var btn = this;
          var textoOriginal = btn.textContent;
          if (!navigator.geolocation) { alert('Tu navegador no permite geolocalización.'); return; }
          btn.disabled = true;
          btn.textContent = '📍 Buscando…';
          
          // [ROBUSTEZ] Agregar timeout a geolocalización
          var timeoutId = setTimeout(function () {
            btn.disabled = false;
            btn.textContent = textoOriginal;
            alert('La geolocalización tardó demasiado. Intenta de nuevo.');
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
          }, function () {
            clearTimeout(timeoutId);
            alert('No pudimos acceder a tu ubicación.');
            btn.disabled = false;
            btn.textContent = textoOriginal;
          });
        });
      }
    }

    // ─── API pública del motor ───
    return {
      utils: utils,
      favoritos: favoritos,
      init: function () {
        cachearElementos();
        initMapa();
        bindControlesMapa();
        bindFiltroLinks(document);
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
            alert('Enlace copiado: ' + url);
          });
        }
      },
      bindAccionesLugar: function (root) {
        root.querySelectorAll('[data-fav-id]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = parseInt(btn.getAttribute('data-fav-id'), 10);
            var ahoraFav = favoritos.toggle(id);
            btn.classList.toggle('is-fav', ahoraFav);
            if (btn.classList.contains('act-btn-lg')) {
              btn.textContent = ahoraFav ? '♥ Guardado' : '♡ Guardar';
            } else {
              btn.textContent = ahoraFav ? '♥' : '♡';
            }
          });
        });
        root.querySelectorAll('[data-share-id]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = parseInt(btn.getAttribute('data-share-id'), 10);
            var lugar = getLugarPorId(id);
            if (lugar) this.compartirLugar(lugar);
          }.bind(this));
        }, this);
      },
      get map() { return map; },
      get todosLosMarkers() { return todosLosMarkers; },
      get filtroActivo() { return filtroActivo; }
    };
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

    function abrir() {
      drawer.removeAttribute('hidden');
      trigger.setAttribute('aria-expanded', 'true');
      if (scrim) { scrim.removeAttribute('hidden'); scrim.setAttribute('data-owner', 'drawer'); }
      document.body.classList.add('no-scroll');
    }
    function cerrar() {
      drawer.setAttribute('hidden', '');
      trigger.setAttribute('aria-expanded', 'false');
      if (scrim && scrim.getAttribute('data-owner') === 'drawer') {
        scrim.setAttribute('hidden', '');
        scrim.setAttribute('data-owner', '');
      }
      document.body.classList.remove('no-scroll');
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

    // [FIX] Antes #spotlight-results/#spotlight-suggestions nunca se
    // llenaban: el buscador filtraba el mapa por detrás pero no había
    // ningún resultado para tocar. Esto arma la tarjeta clickeable que
    // lleva directo al lugar (buscar → tocar → el mapa vuela ahí y abre
    // la ficha), en vez de tener que ir a buscarlo a mano en el mapa.
    function itemHtml(entry) {
      var g = GRUPOS && GRUPOS[entry.grupo];
      var icon = g ? g.icon : '📍';
      var label = g ? g.label : entry.categoria;
      var rating = entry.lugar.rating ? '★ ' + parseFloat(entry.lugar.rating).toFixed(1) : '';
      return '<button type="button" class="spotlight-item" data-ir="' + entry.lugar.id + '">' +
        '<span class="spotlight-item-icon" aria-hidden="true">' + icon + '</span>' +
        '<span class="spotlight-item-info">' +
          '<span class="spotlight-item-nombre">' + utils.escapeHtml(entry.lugar.nombre) + '</span>' +
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
      setTimeout(function () { input.focus(); }, 50);
    }
    function cerrar() {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
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
    
    window.addEventListener('scroll', function () {
      var pos = window.scrollY + 120;
      var activo = 0;
      for (var i = 0; i < targetData.length; i++) {
        if (targetData[i].offsetTop <= pos) activo = i;
      }
      for (var j = 0; j < items.length; j++) {
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
  // Punto de entrada público
  // ─────────────────────────────────────────────────────────────────────
  var UruSpotCore = {
    utils: utils,

    // Crea e inicializa el motor de mapa/filtros con la configuración dada.
    // config.grupos y config.lugares los provee el MÓDULO B (contenido).
    init: function (config) {
      var motor = crearMotor(config);
      motor.init();

      initLocalVisitanteToggle();
      initSpotlightSearch(motor, config.grupos || {});
      initDrawer();
      initBottomNav();
      initReveal();
      initSmoothAnchors();

      return motor;
    }
  };

  global.UruSpotCore = UruSpotCore;

})(window);
