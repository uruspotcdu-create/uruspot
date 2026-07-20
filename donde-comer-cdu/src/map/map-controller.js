/* ═══════════════════════════════════════════════════════════════════
   map-controller.js — Etapa 3 del plan: mapa real (Leaflet +
   clustering) reemplazando el mapa esquemático de puntos-por-
   porcentaje de las Etapas 1-2.

   Recicla dos patrones que ya existían, probados, en `js/core-engine.js`
   (archivado, nunca cargado por la página viva):
     1. Carga diferida de Leaflet/MarkerCluster (JS + CSS inyectados
        recién cuando el contenedor entra en viewport, con rootMargin
        generoso para que esté listo antes de que el usuario llegue
        scrolleando).
     2. Popup con contenido perezoso: se genera recién la primera vez
        que se abre, no al agregar cada uno de los 1.468 marcadores.

   Pero reescrito contra la arquitectura de la Etapa 2: no conoce
   ningún `estadoUI` propio — solo lee `filterStore.coincide()` /
   `filterStore.esFavorito()` y se suscribe a sus cambios. Al clickear
   un pin no decide nada por su cuenta: pide
   `filterStore.setSeleccionado(id)`, la misma fuente de verdad que ya
   usan la lista (Etapa 2, corregida) y la URL (Etapa 1, restaurada).

   Etapa 4 ("Sincronización lista↔mapa bidireccional + Buscar en esta
   área"), agregada acá:
     - `centrarEnSeleccion(id)`: cuando la selección cambia (clic en
       una fila, o restaurada desde la URL), el mapa vuela hasta el
       pin correspondiente y abre su popup — usando
       `clusterGroup.zoomToShowLayer` para que funcione aunque el pin
       esté escondido dentro de un racimo.
     - Control propio de Leaflet ("buscar en esta área"): aparece
       cuando el usuario mueve el mapa a mano (`moveend` real, no el
       que dispara nuestro propio `centrarEnSeleccion`) y, al
       apretarlo, pide `filterStore.setArea(bounds)` con el rectángulo
       visible — la lista se recorta sola porque ya escucha
       `filterStore.onChange`, sin que este módulo sepa nada de ella.

   Etapa 6 ("Experiencia mobile"), agregada acá:
     - `invalidateSize()`: Leaflet mide su contenedor una sola vez al
       arrancar; si ese contenedor cambia de tamaño después (rotar el
       teléfono, o el propio breakpoint mobile/desktop cambiando el
       layout de `.area`) el mapa queda descentrado/recortado hasta
       que alguien le avisa. `ui/mobile-sheet.js` y un listener de
       `resize`/`orientationchange` acá abajo llaman a esto — no hace
       falta en el arrastre de la hoja porque ahí el contenedor del
       mapa no cambia de tamaño, solo queda tapado por la hoja.
   ═══════════════════════════════════════════════════════════════════ */

import { COLOR_RUBRO, COLOR_DEFECTO } from './colores-rubro.js';

var LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
var LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
var CLUSTER_JS = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
var CLUSTER_CSS = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css';
var CLUSTER_DEFAULT_CSS = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css';

function cargarCssAsync(href){
  if (document.querySelector('link[href="' + href + '"]')) return;
  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function cargarScriptAsync(src, yaListo){
  return new Promise(function(resolve, reject){
    if (typeof yaListo === 'function' && yaListo()) { resolve(); return; }
    var existente = document.querySelector('script[src="' + src + '"]');
    if (existente){
      if (existente._uruspotCargado) { resolve(); return; }
      existente.addEventListener('load', function(){ resolve(); });
      existente.addEventListener('error', reject);
      if (typeof yaListo === 'function' && yaListo()) resolve();
      return;
    }
    var script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = function(){ script._uruspotCargado = true; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export function createMapController(opts){
  var dom = opts.dom;
  var registro = opts.registro;
  var porId = opts.porId;
  var filterStore = opts.filterStore;
  var escapeHTML = opts.escapeHTML;

  var map = null;
  var clusterGroup = null;
  var markersPorId = Object.create(null);
  var arrancado = false;
  var seleccionActual = null;
  var controlArea = null;
  // true mientras el propio módulo mueve el mapa (centrarEnSeleccion) —
  // el listener de 'moveend' lo usa para no confundir eso con un
  // arrastre/zoom real del usuario y no ofrecerle "buscar en esta
  // área" sobre un movimiento que él no pidió.
  var moviendoProgramatico = false;

  function pinIcon(color, activo){
    return L.divIcon({
      className: 'padron-pin' + (activo ? ' padron-pin--activo' : ''),
      html: '<span style="--pin-color:' + color + '"></span>',
      iconSize: [14, 14],
      iconAnchor: [7, 13],
      popupAnchor: [0, -12]
    });
  }

  function clusterIcon(cluster){
    return L.divIcon({
      className: 'mapa-cluster',
      html: '<div class="mapa-cluster-inner">' + cluster.getChildCount() + '</div>',
      iconSize: [34, 34]
    });
  }

  function popupHtml(r){
    var esFav = filterStore.esFavorito(r.id);
    var html = '<div class="popup-uruspot">';
    html += '<span class="popup-pos">' + String(r.pos).padStart(4, '0') + ' / 1468</span>';
    if (esFav) html += '<span class="popup-fav">★</span>';
    html += '<div class="popup-rubro">' + escapeHTML(r.categoria || '') + '</div>';
    html += '<div class="popup-nombre">' + escapeHTML(r.nombre) + '</div>';
    html += r.direccion
      ? '<div class="popup-dir">' + escapeHTML(r.direccion) + '</div>'
      : '<div class="popup-dir popup-dir--pendiente">dirección pendiente de carga</div>';
    html += '<span class="popup-constancia' + (r.estado === 'pendiente' ? ' popup-constancia--pendiente' : '') + '">' +
      (r.estado === 'pendiente' ? 'pendiente de confirmación' : 'verificado en el padrón') + '</span>';
    html += '</div>';
    return html;
  }

  function colorDe(r){
    return COLOR_RUBRO[r.grupo] || COLOR_DEFECTO;
  }

  function agregarMarcadores(){
    registro.forEach(function(r){
      if (typeof r.lat !== 'number' || typeof r.lng !== 'number') return;
      var marker = L.marker([r.lat, r.lng], { icon: pinIcon(colorDe(r), false) });
      marker.bindPopup('', { className: 'mapa-popup' });
      marker.on('popupopen', function(){ marker.setPopupContent(popupHtml(r)); });
      marker.on('click', function(){ filterStore.setSeleccionado(r.id); });
      markersPorId[r.id] = marker;
      if (filterStore.coincide(r)) clusterGroup.addLayer(marker);
    });
  }

  /** Agrega/saca marcadores del cluster según el filtro vigente. */
  function render(){
    if (!clusterGroup) return;
    registro.forEach(function(r){
      var marker = markersPorId[r.id];
      if (!marker) return;
      var ok = filterStore.coincide(r);
      var enMapa = clusterGroup.hasLayer(marker);
      if (ok && !enMapa) clusterGroup.addLayer(marker);
      else if (!ok && enMapa) clusterGroup.removeLayer(marker);
    });
  }

  /** Refleja la selección activa (venga de un clic en el mapa, en la
   *  lista, o de la URL) pintando el pin correspondiente distinto. */
  function resaltar(id){
    if (seleccionActual && markersPorId[seleccionActual]){
      var prev = porId[seleccionActual];
      if (prev) markersPorId[seleccionActual].setIcon(pinIcon(colorDe(prev), false));
    }
    seleccionActual = id || null;
    if (seleccionActual && markersPorId[seleccionActual]){
      var actual = porId[seleccionActual];
      if (actual) markersPorId[seleccionActual].setIcon(pinIcon(colorDe(actual), true));
    }
  }

  function refrescarPopupsAbiertos(){
    // los popups con contenido ya generado (`_popupHtmlListo`) no se
    // tocan solos; si el usuario reabre uno, `popupopen` vuelve a
    // llamar a popupHtml() y ya toma dirección/estado actualizados.
  }

  /** Etapa 4: control de Leaflet con el botón "buscar en esta área",
   *  oculto hasta que el usuario mueva el mapa a mano. */
  function crearControlArea(){
    var Control = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function(){
        var div = L.DomUtil.create('div', 'mapa-control-area oculto');
        var boton = L.DomUtil.create('button', 'btn-buscar-area', div);
        boton.type = 'button';
        boton.textContent = 'buscar en esta área';
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.on(boton, 'click', function(){
          var b = map.getBounds();
          filterStore.setArea({
            sur: b.getSouth(), norte: b.getNorth(),
            oeste: b.getWest(), este: b.getEast()
          });
          div.classList.add('oculto');
        });
        return div;
      }
    });
    controlArea = new Control();
    controlArea.addTo(map);
  }

  function mostrarBotonArea(){
    if (!controlArea) return;
    var el = controlArea.getContainer();
    if (el) el.classList.remove('oculto');
  }

  /** Etapa 4: centra el mapa en el lugar seleccionado (clic en una
   *  fila de la lista, o selección restaurada desde la URL). Usa
   *  `zoomToShowLayer` en vez de `panTo` porque el pin puede estar
   *  escondido dentro de un racimo — esa función hace el zoom/paneo
   *  necesario y recién entonces llama al callback para abrir el
   *  popup, ya con el marcador visible de verdad. */
  function centrarEnSeleccion(id){
    if (!map || !clusterGroup) return;
    var marker = markersPorId[id];
    if (!marker || !clusterGroup.hasLayer(marker)) return; // no está en el mapa con el filtro actual
    moviendoProgramatico = true;
    clusterGroup.zoomToShowLayer(marker, function(){
      marker.openPopup();
    });
    // el vuelo (paneo + eventual des-clusterizado) puede disparar más
    // de un 'moveend'; damos un margen generoso antes de volver a
    // tratar los movimientos como gestos del usuario.
    setTimeout(function(){ moviendoProgramatico = false; }, 700);
  }

  function initMapa(){
    map = L.map(dom.mapaReal, { scrollWheelZoom: false }).setView([-32.4825, -58.2372], 13);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19
    }).addTo(map);

    clusterGroup = L.markerClusterGroup({
      iconCreateFunction: clusterIcon,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 46,
      chunkedLoading: true
    });
    map.addLayer(clusterGroup);

    agregarMarcadores();
    crearControlArea();

    // Etapa 4: solo ofrecer "buscar en esta área" cuando el que movió
    // el mapa fue el usuario (arrastre/zoom a mano), no cuando lo
    // movimos nosotros desde centrarEnSeleccion().
    map.on('moveend', function(){
      if (moviendoProgramatico) return;
      mostrarBotonArea();
    });

    filterStore.onChange(function(tipo){
      if (tipo === 'seleccion'){
        resaltar(filterStore.estado.seleccionado);
        if (filterStore.estado.seleccionado) centrarEnSeleccion(filterStore.estado.seleccionado);
        return;
      }
      if (tipo === 'favorito') return; // no cambia qué se ve en el mapa
      render();
    });

    // si ya había una selección activa (deep-link restaurado desde la
    // URL, Etapa 1) cuando el mapa recién arranca —porque el usuario
    // scrolleó hasta acá con `?lugar=` en la URL— centrar de una vez.
    if (filterStore.estado.seleccionado){
      resaltar(filterStore.estado.seleccionado);
      centrarEnSeleccion(filterStore.estado.seleccionado);
    }

    // Etapa 6: rotar el teléfono (o cruzar el breakpoint mobile/
    // desktop, que cambia el alto real de `.area`) deja a Leaflet con
    // una medida de contenedor vieja. Debounce corto porque
    // 'resize'/'orientationchange' pueden disparar varias veces seguidas.
    var temporizadorResize = null;
    window.addEventListener('resize', function(){
      if (temporizadorResize) clearTimeout(temporizadorResize);
      temporizadorResize = setTimeout(function(){ map.invalidateSize(); }, 200);
    });
    window.addEventListener('orientationchange', function(){
      setTimeout(function(){ map.invalidateSize(); }, 250);
    });
  }

  function arrancarMapaPesado(){
    cargarCssAsync(LEAFLET_CSS);
    cargarCssAsync(CLUSTER_CSS);
    cargarCssAsync(CLUSTER_DEFAULT_CSS);

    cargarScriptAsync(LEAFLET_JS, function(){ return typeof window.L !== 'undefined'; })
      .then(function(){
        return cargarScriptAsync(CLUSTER_JS, function(){
          return typeof window.L !== 'undefined' && typeof window.L.markerClusterGroup !== 'undefined';
        });
      })
      .then(initMapa)
      .catch(function(){
        if (dom.mapaReal){
          dom.mapaReal.innerHTML = '<p style="padding:20px;color:var(--tinta-60);font-family:var(--f-ui);font-size:13px">No se pudo cargar el mapa. Revisá tu conexión y recargá la página.</p>';
        }
      });
  }

  /** Difiere el trabajo pesado (Leaflet + 1.468 marcadores) hasta que
   *  el contenedor esté por entrar en viewport. */
  function iniciarPerezoso(){
    if (!dom.mapaReal) return;
    if ('IntersectionObserver' in window){
      var obs = new IntersectionObserver(function(entries){
        for (var i = 0; i < entries.length; i++){
          if (entries[i].isIntersecting){
            obs.disconnect();
            if (!arrancado){ arrancado = true; arrancarMapaPesado(); }
            return;
          }
        }
      }, { rootMargin: '800px 0px', threshold: 0 });
      obs.observe(dom.mapaReal);
    } else if (!arrancado){
      arrancado = true;
      arrancarMapaPesado();
    }
  }

  return {
    iniciarPerezoso: iniciarPerezoso,
    // Etapa 4: main.js lo llama cuando la selección cambia por un
    // clic en la lista (o restaurada desde la URL) para que el mapa
    // también reaccione. Si el mapa todavía no arrancó (perezoso, no
    // entró en viewport) no hace nada — se sincroniza solo al
    // iniciarse, ver el `if` al final de initMapa().
    centrarEnSeleccion: function(id){ centrarEnSeleccion(id); },
    // Etapa 6: lo llama ui/mobile-sheet.js cuando el toggle "mapa"/
    // "lista" cambia el estado de la hoja (el contenedor del mapa no
    // cambia de tamaño en ese gesto, pero es barato y evita dejar el
    // mapa mal medido si el usuario tocó el toggle antes de que el
    // mapa terminara de cargar perezosamente). No hace nada si el
    // mapa todavía no arrancó.
    invalidateSize: function(){ if (map) map.invalidateSize(); }
  };
}
