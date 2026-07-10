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
      if (i === -1) favs.push(id); else favs.splice(i, 1);
      try { localStorage.setItem(KEY, JSON.stringify(favs)); } catch (e) {}
      return i === -1;
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
      return function (cluster) {
        return L.divIcon({
          className: 'mapa-cluster',
          html: '<div class="mapa-cluster-inner" style="background:' + color + '">' + cluster.getChildCount() + '</div>',
          iconSize: [38, 38]
        });
      };
    }

    // ─── Inicialización del mapa ───
    function initMapa() {
      map = L.map('mapa-leaflet', { scrollWheelZoom: true })
        .setView(config.mapCenter || [0, 0], config.mapZoom || 13);

      L.tileLayer(config.tileUrl || 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: config.tileAttribution || '&copy; OpenStreetMap &copy; CARTO',
        maxZoom: 19
      }).addTo(map);

      // Un cluster group por grupo (así cada "racimo" respeta el color de su
      // categoría y los filtros pueden mostrar/ocultar grupos enteros al instante).
      Object.keys(GRUPOS).forEach(function (g) {
        clusterGroups[g] = L.markerClusterGroup({
          iconCreateFunction: clusterIcon(GRUPOS[g].color),
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          maxClusterRadius: 46
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
        html += '<a class="wa" target="_blank" rel="noopener" href="https://wa.me/' + utils.telefonoWhatsapp(lugar.telefono) + '">💬 WhatsApp</a>';
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
      marker.bindPopup(popupHtml(lugar, color), { className: 'mapa-popup' });
      marker.lugarData = lugar;
      clusterGroups[grupo].addLayer(marker);
      todosLosMarkers.push({
        marker: marker,
        grupo: grupo,
        categoria: lugar.categoria || '',
        nombreNorm: utils.normalizarTexto(lugar.nombre),
        categoriaNorm: utils.normalizarTexto(lugar.categoria || ''),
        lugar: lugar
      });
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
      todosLosMarkers.forEach(function (m) {
        if (m.grupo !== filtroActivo) return;
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
      var visibles = 0;
      todosLosMarkers.forEach(function (m) {
        var pasaCategoria = (filtroActivo === 'todos') || (m.grupo === filtroActivo);
        var pasaSubcategoria = (!subFiltroActivo) || (m.categoria === subFiltroActivo);
        var pasaBusqueda = (textoBusqueda === '') ||
          (m.nombreNorm.indexOf(textoBusqueda) > -1) ||
          (m.categoriaNorm.indexOf(textoBusqueda) > -1);
        var mostrar = pasaCategoria && pasaSubcategoria && pasaBusqueda;
        var grupo = clusterGroups[m.grupo];
        if (mostrar) {
          if (!grupo.hasLayer(m.marker)) grupo.addLayer(m.marker);
          visibles++;
        } else {
          if (grupo.hasLayer(m.marker)) grupo.removeLayer(m.marker);
        }
      });

      // Antes: se sacaba TODO cluster group del mapa y se volvía a agregar
      // el que correspondiera, en cada tecla del buscador. Eso forzaba a
      // Leaflet.markercluster a reclusterizar grupos que ni siquiera habían
      // cambiado de estado. Ahora solo se toca (add/remove) el grupo cuyo
      // estado deseado difiere del actual — el resultado final (qué grupos
      // quedan en el mapa) es exactamente el mismo.
      Object.keys(clusterGroups).forEach(function (g) {
        var grupo = clusterGroups[g];
        var debeEstar = (filtroActivo === 'todos' || filtroActivo === g);
        var estaEnMapa = map.hasLayer(grupo);
        if (debeEstar && !estaEnMapa) map.addLayer(grupo);
        else if (!debeEstar && estaEnMapa) map.removeLayer(grupo);
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
      if (config.seoItemListSufijo !== false) generarSEOItemLists(config.seoItemListSufijo);
      animarContadores();

      // [FIX] El overlay #app-loading queda tapando la app para siempre si
      // nadie le agrega "is-done" (ver comentario en index.html líneas 55-59).
      // Se saca acá porque es el punto donde termina el primer render real.
      var appLoading = document.getElementById('app-loading');
      if (appLoading) {
        appLoading.classList.add('is-done');
        appLoading.setAttribute('inert', '');
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
        }, 250); // 250ms debounce
        
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
  function initSpotlightSearch() {
    var overlay = document.getElementById('search-spotlight');
    var input = document.getElementById('spotlight-input');
    var closeBtn = document.getElementById('spotlight-close');
    var openBtn = document.getElementById('bn-buscar');
    var realSearch = document.getElementById('mapa-search');
    if (!overlay || !input || !realSearch) return;

    function abrir() {
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
      setTimeout(function () { input.focus(); }, 50);
    }
    function cerrar() {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (openBtn) openBtn.addEventListener('click', abrir);
    if (closeBtn) closeBtn.addEventListener('click', cerrar);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) cerrar(); });
    input.addEventListener('input', function () {
      realSearch.value = input.value;
      realSearch.dispatchEvent(new Event('input', { bubbles: true }));
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
      initSpotlightSearch();
      initBottomNav();
      initReveal();
      initSmoothAnchors();

      return motor;
    }
  };

  global.UruSpotCore = UruSpotCore;

})(window);
