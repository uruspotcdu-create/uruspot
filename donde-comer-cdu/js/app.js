/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — app.js [VERSIÓN MEJORADA]
   
   CAMBIOS CLAVE:
   • Mapa SIEMPRE visible y cargado — no solo en búsqueda directa
   • Interfaz didáctica con filtros interactivos
   • Mejor UX con mapas premium estilo Google Maps
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var CIUDAD = 'concepcion-del-uruguay';
  var PLANO = window.URU_PLANO;
  var EXPO = window.URU_EXPOSICION;
  var MAPA = window.URU_MAPA;

  var REGISTRO = [];
  var porId = Object.create(null);
  var estado = null;
  var consultaActual = '';
  var permanenciaTimer = null;
  var ultimaRegionRenderizada = '';

  var DOM = {};
  ['rolActual', 'inputBuscar', 'panelDescubrimiento', 'tituloRegion', 'subtituloRegion',
   'mapaTextura', 'mapaHerramienta', 'contadorCuraduria', 'btnVerGuardados']
    .forEach(function (id) { DOM[id] = document.getElementById(id); });

  /* ── 1. Arranque de contexto ── */
  estado = PLANO.leerEstado(CIUDAD);
  estado = PLANO.registrarApertura(estado);
  PLANO.guardarEstado(estado);

  /* ── 2. Carga de datos ── */
  fetch('lugares-core.json')
    .then(function (r) { return r.json(); })
    .then(function (core) {
      REGISTRO = core.map(function (l) {
        var reg = {
          id: l.id, nombre: l.nombre, categoria: l.categoria, grupo: l.grupo,
          lat: l.lat, lng: l.lng, direccion: null, telefono: null, estado: 'verificado'
        };
        porId[l.id] = reg;
        return reg;
      });
      cargarDetallesEnSegundoPlano();
      // CAMBIO: Cargar Leaflet inmediatamente, no solo al buscar
      inicializarMapaPremium();
      render();
    })
    .catch(function (err) {
      console.error('No se pudo cargar lugares-core.json', err);
      if (DOM.panelDescubrimiento) {
        DOM.panelDescubrimiento.innerHTML = '<p class="error">No se pudo cargar la información. Probá recargar la página.</p>';
      }
    });

  function cargarDetallesEnSegundoPlano() {
    var lanzar = function () {
      fetch('lugares-detalles.json').then(function (r) { return r.json(); }).then(function (det) {
        det.forEach(function (d) {
          var reg = porId[d.id];
          if (reg) { reg.direccion = d.direccion || null; reg.telefono = d.telefono || null; }
        });
        render();
        if (mapaLeaflet) actualizarMapaPuntos();
      }).catch(function (e) { console.warn('lugares-detalles.json no disponible', e); });

      fetch('lugares-estado.json').then(function (r) { return r.json(); }).then(function (mapa) {
        var PENDIENTE = ['pendiente', 'no encontrado', 'requiere confirmacion', 'requiere_confirmacion'];
        mapa.forEach(function (m) {
          var reg = porId[m.id];
          if (!reg || !m.estado_verificacion) return;
          var low = m.estado_verificacion.toLowerCase();
          reg.estado = PENDIENTE.some(function (p) { return low.indexOf(p) !== -1; }) ? 'pendiente' : 'verificado';
        });
      }).catch(function (e) { console.warn('lugares-estado.json no disponible', e); });
    };
    if ('requestIdleCallback' in window) requestIdleCallback(lanzar, { timeout: 2000 });
    else setTimeout(lanzar, 200);
  }

  /* ── 3. Wiring de las seis acciones a eventos reales de UI ── */

  if (DOM.inputBuscar) {
    DOM.inputBuscar.addEventListener('input', function (e) {
      consultaActual = e.target.value;
      if (consultaActual.trim().length >= 2) {
        estado = PLANO.aplicarAccion(estado, 'nombrar', { consulta: consultaActual });
        PLANO.guardarEstado(estado);
      } else if (!consultaActual.trim()) {
        estado.sesion.accionDirectaForzada = null;
      }
      render();
      // CAMBIO: Actualizar mapa cuando hay búsqueda
      if (mapaLeaflet) actualizarMapaPuntos();
    });
  }

  if (DOM.panelDescubrimiento) {
    DOM.panelDescubrimiento.addEventListener('click', function (e) {
      var btnAceptar = e.target.closest('[data-accion="aceptar"]');
      var btnRechazar = e.target.closest('[data-accion="rechazar"]');
      var btnGuardar = e.target.closest('[data-accion="guardar"]');

      if (btnAceptar) {
        var id1 = btnAceptar.closest('[data-lugar-id]').dataset.lugarId;
        var porIniciativa = btnAceptar.dataset.origen === 'iniciativa_propia';
        estado = PLANO.aplicarAccion(estado, 'aceptar', { lugarId: id1, porIniciativaPropia: porIniciativa });
        PLANO.guardarEstado(estado);
        return;
      }
      if (btnRechazar) {
        var carta = btnRechazar.closest('[data-lugar-id]');
        var id2 = carta.dataset.lugarId;
        var grupo = porId[id2] ? porId[id2].grupo : 'sin_rubro';
        estado = PLANO.aplicarAccion(estado, 'rechazar', { grupo: grupo });
        PLANO.guardarEstado(estado);
        carta.classList.add('descartada');
        render();
        if (mapaLeaflet) actualizarMapaPuntos();
        return;
      }
      if (btnGuardar) {
        var carta2 = btnGuardar.closest('[data-lugar-id]');
        var id3 = carta2.dataset.lugarId;
        var favoritos = leerFavoritos();
        favoritos[id3] = !favoritos[id3];
        guardarFavoritos(favoritos);
        estado = PLANO.aplicarAccion(estado, 'guardar', { lugarId: id3 });
        PLANO.guardarEstado(estado);
        btnGuardar.classList.toggle('activo', !!favoritos[id3]);
        render();
        return;
      }
    });
  }

  if (DOM.btnVerGuardados) {
    DOM.btnVerGuardados.addEventListener('click', function () {
      estado.sesion.curaduriaActiva = true;
      render();
      if (mapaLeaflet) actualizarMapaPuntos();
    });
  }

  function tickPermanencia() {
    if (document.hidden) return;
    estado = PLANO.aplicarAccion(estado, 'permanecer', { segundos: 5 });
    PLANO.guardarEstado(estado);
    var regionNueva = PLANO.region(estado).nombre;
    if (regionNueva !== ultimaRegionRenderizada) render();
  }
  permanenciaTimer = setInterval(tickPermanencia, 5000);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      estado = PLANO.aplicarAccion(estado, 'abandonar');
      PLANO.guardarEstado(estado);
    }
  });
  window.addEventListener('pagehide', function () {
    estado = PLANO.aplicarAccion(estado, 'abandonar');
    PLANO.guardarEstado(estado);
  });

  /* ── 4. Favoritos ── */
  function leerFavoritos() {
    try { return JSON.parse(localStorage.getItem('uruspot_favoritos') || '{}'); }
    catch (e) { return {}; }
  }
  function guardarFavoritos(f) {
    try { localStorage.setItem('uruspot_favoritos', JSON.stringify(f)); } catch (e) { /* no-op */ }
  }

  /* ── 5. Render por región ── */

  function render() {
    if (!REGISTRO.length || !DOM.panelDescubrimiento) return;

    var favoritos = leerFavoritos();
    var reg = PLANO.region(estado);
    ultimaRegionRenderizada = reg.nombre;

    actualizarCabecera(reg);
    actualizarMapaTextura();

    if (reg.nombre === 'guia') {
      var recorteGuia = EXPO.recortePorIniciativaPropia(REGISTRO, estado, 'guia');
      pintarTarjetas(recorteGuia, favoritos, { origen: 'iniciativa_propia', narrativa: true });
    } else if (reg.nombre === 'exploracion') {
      var recorteExplo = EXPO.recortePorIniciativaPropia(REGISTRO, estado, 'exploracion');
      pintarTarjetas(recorteExplo, favoritos, { origen: 'iniciativa_propia', narrativa: false });
    } else if (reg.nombre === 'accionDirecta') {
      var resultados = EXPO.resultadosPorAccionExplicita(REGISTRO, consultaActual);
      pintarTarjetas(resultados, favoritos, { origen: 'accion_explicita', narrativa: false });
    } else if (reg.nombre === 'curaduria') {
      var idsGuardados = Object.keys(favoritos).filter(function (id) { return favoritos[id]; });
      var coleccion = EXPO.coleccionCurada(REGISTRO, idsGuardados);
      pintarTarjetas(coleccion, favoritos, { origen: 'accion_explicita', narrativa: false, vacioTexto: 'Todavía no guardaste nada. Guardá dos lugares seguidos y esto se convierte en tu lista.' });
    }
  }

  function actualizarCabecera(reg) {
    if (DOM.rolActual) {
      var rol = PLANO.rolPorAperturas(estado.aperturas);
      var NOMBRES = { anfitrion: 'Recién llegado', conocido: 'Conocido', complice: 'Cómplice', casa: 'Casa' };
      DOM.rolActual.textContent = NOMBRES[rol];
    }
    if (!DOM.tituloRegion || !DOM.subtituloRegion) return;
    var COPY = {
      guia: ['Para empezar', 'Cuatro lugares para arrancar. Cuantas más veces vuelvas, menos hace falta que te los muestre así.'],
      exploracion: ['Para explorar', 'Un poco más de margen para que algo te sorprenda.'],
      accionDirecta: reg.variante === 'nombrada'
        ? ['Resultados', 'Esto es lo que coincide con lo que escribiste.']
        : ['Directo al grano', 'Nada de narrativa: la respuesta más clara que tenemos.'],
      curaduria: ['Tu lista', 'Lo que guardaste, sin recorte ni rotación.']
    };
    var c = COPY[reg.nombre] || COPY.guia;
    DOM.tituloRegion.textContent = c[0];
    DOM.subtituloRegion.textContent = c[1];
  }

  function pintarTarjetas(lista, favoritos, opts) {
    DOM.panelDescubrimiento.innerHTML = '';
    if (!lista.length) {
      DOM.panelDescubrimiento.innerHTML = '<p class="vacio">' + (opts.vacioTexto || 'No encontramos nada con esa búsqueda.') + '</p>';
      return;
    }
    var frag = document.createDocumentFragment();
    lista.forEach(function (lugar) {
      var art = document.createElement('article');
      art.className = 'tarjeta' + (opts.narrativa ? ' tarjeta--narrativa' : '');
      art.dataset.lugarId = lugar.id;
      var rubro = window.URU_RUBROS_META && window.URU_RUBROS_META[lugar.grupo]
        ? window.URU_RUBROS_META[lugar.grupo][0] : lugar.categoria;
      art.innerHTML =
        '<div class="tarjeta-rubro">' + escapeHTML(rubro) + '</div>' +
        '<h3 class="tarjeta-nombre">' + escapeHTML(lugar.nombre) + '</h3>' +
        '<div class="tarjeta-direccion">' + (lugar.direccion ? escapeHTML(lugar.direccion) : 'cargando dirección…') + '</div>' +
        '<div class="tarjeta-acciones">' +
          '<a class="tarjeta-btn" data-accion="aceptar" data-origen="' + opts.origen + '" href="locales/' + slug(lugar) + '/">ver ficha</a>' +
          '<button class="tarjeta-btn tarjeta-btn--fav' + (favoritos[lugar.id] ? ' activo' : '') + '" type="button" data-accion="guardar">' + (favoritos[lugar.id] ? '★ guardado' : '☆ guardar') + '</button>' +
          '<button class="tarjeta-btn tarjeta-btn--descartar" type="button" data-accion="rechazar">no me interesa</button>' +
        '</div>';
      frag.appendChild(art);
    });
    DOM.panelDescubrimiento.appendChild(frag);
  }

  function slug(lugar) { return lugar.id.toLowerCase(); }

  /* ── 6. Mapa Premium 24/7 ── */
  var mapaLeaflet = null;
  var capaMarcadores = null;
  var leafletCargando = null;
  var puntosActuales = [];

  function actualizarMapaTextura() {
    if (!DOM.mapaTextura || !REGISTRO.length) return;
    if (!window.URU_CONFIG.mapa.texturaSiempreVisible) return;
    if (DOM.mapaTextura.dataset.pintado === '1') return;
    var puntos = MAPA.puntosTextura(REGISTRO);
    var frag = document.createDocumentFragment();
    puntos.forEach(function (l) {
      if (typeof l.lat !== 'number' || typeof l.lng !== 'number') return;
      var p = document.createElement('div');
      p.className = 'punto-textura';
      p.style.left = (Math.random() * 100) + '%';
      p.style.top = (Math.random() * 100) + '%';
      frag.appendChild(p);
    });
    DOM.mapaTextura.appendChild(frag);
    DOM.mapaTextura.dataset.pintado = '1';
  }

  // CAMBIO CRUCIAL: Cargar Leaflet inmediatamente
  function cargarLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletCargando) return leafletCargando;
    leafletCargando = new Promise(function (resolve, reject) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);

      var script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return leafletCargando;
  }

  // NUEVO: Inicializar mapa de forma hermosa y premium
  function inicializarMapaPremium() {
    cargarLeaflet().then(function () {
      if (mapaLeaflet || !DOM.mapaHerramienta) return;
      
      // Mostrar el mapa (NO hidden)
      DOM.mapaHerramienta.hidden = false;
      
      var contenedor = document.createElement('div');
      contenedor.id = 'mapaLeafletContenedor';
      contenedor.style.height = '380px';
      contenedor.style.borderRadius = '12px';
      contenedor.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
      DOM.mapaHerramienta.innerHTML = '';
      DOM.mapaHerramienta.appendChild(contenedor);

      mapaLeaflet = L.map(contenedor, { 
        preferCanvas: true,
        zoomControl: true,
        attributionControl: true
      }).setView([-32.4833, -58.2333], 14);
      
      // Tema oscuro mejorado
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        crossOrigin: 'anonymous'
      }).addTo(mapaLeaflet);
      
      capaMarcadores = L.layerGroup().addTo(mapaLeaflet);
      
      // Auto-actualizar cuando se carguen detalles
      actualizarMapaPuntos();
    }).catch(function (e) {
      console.warn('No se pudo cargar Leaflet', e);
      if (DOM.mapaHerramienta) {
        DOM.mapaHerramienta.innerHTML = '<p style="padding:20px; color:#666;">No se pudo cargar el mapa. Por favor recarga la página.</p>';
      }
    });
  }

  // NUEVO: Actualizar puntos en el mapa dinámicamente
  function actualizarMapaPuntos() {
    if (!mapaLeaflet || !capaMarcadores || !REGISTRO.length) return;
    
    capaMarcadores.clearLayers();
    var bounds = [];
    var mostrados = 0;
    
    REGISTRO.forEach(function (lugar) {
      if (!lugar.lat || !lugar.lng || (lugar.estado === 'pendiente' && Math.random() > 0.3)) return;
      
      var icono = L.divIcon({
        className: 'mapa-marcador',
        html: '<div class="mapa-marcador-punto"></div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15]
      });
      
      var marcador = L.marker([lugar.lat, lugar.lng], { icon: icono })
        .addTo(capaMarcadores)
        .bindPopup(
          '<div class="mapa-popup">' +
          '<strong>' + escapeHTML(lugar.nombre) + '</strong><br>' +
          (lugar.direccion ? escapeHTML(lugar.direccion) : '') +
          '<br><a href="locales/' + slug(lugar) + '/" style="color:#C97A83; text-decoration:none; font-weight:500;">→ Ver ficha completa</a>' +
          '</div>',
          { maxWidth: 280, className: 'mapa-popup-container' }
        );
      
      bounds.push([lugar.lat, lugar.lng]);
      mostrados++;
    });
    
    if (bounds.length > 0) {
      if (bounds.length === 1) mapaLeaflet.setView(bounds[0], 16);
      else mapaLeaflet.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      requestAnimationFrame(function () { if (mapaLeaflet) mapaLeaflet.invalidateSize(); });
    }
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

})();
