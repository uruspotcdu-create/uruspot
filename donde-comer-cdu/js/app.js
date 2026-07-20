/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — app.js
   El mapa dejó de ser una capa aparte cargada por su cuenta: ahora es
   una vista más del mismo estado que alimenta las tarjetas. Región,
   recorte y presupuesto de exposición se calculan una sola vez por
   render() y de ahí se derivan tanto las tarjetas como los puntos que
   entran al mapa — nunca dos fuentes de verdad para "qué se muestra".
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
   'mapaTextura', 'mapaHerramienta', 'mapaInfo', 'contadorCuraduria', 'btnVerGuardados']
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
    });
  }

  if (DOM.panelDescubrimiento) {
    DOM.panelDescubrimiento.addEventListener('click', function (e) {
      var btnAceptar = e.target.closest('[data-accion="aceptar"]');
      var btnRechazar = e.target.closest('[data-accion="rechazar"]');
      var btnGuardar = e.target.closest('[data-accion="guardar"]');
      var carta0 = e.target.closest('[data-lugar-id]');

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
      // Click en la tarjeta (no en un botón): si el lugar está en el
      // mapa activo, centralo y abrí su ficha — selección sincronizada
      // en el sentido tarjeta → mapa.
      if (carta0 && motorMapa) {
        motorMapa.enfocar(carta0.dataset.lugarId);
      }
    });

    // Hover/focus de tarjeta → resalta el punto correspondiente en el
    // mapa. Delegado con capture porque mouseover/mouseout no burbujean.
    DOM.panelDescubrimiento.addEventListener('mouseover', function (e) {
      var carta = e.target.closest('[data-lugar-id]');
      if (carta && motorMapa) motorMapa.resaltar(carta.dataset.lugarId);
    });
    DOM.panelDescubrimiento.addEventListener('mouseout', function (e) {
      var carta = e.target.closest('[data-lugar-id]');
      if (carta && motorMapa) motorMapa.quitarResaltado();
    });
  }

  if (DOM.btnVerGuardados) {
    DOM.btnVerGuardados.addEventListener('click', function () {
      estado.sesion.curaduriaActiva = true;
      render();
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

  /* ── 5. Render por región ──
     Una sola lista por región alimenta tarjetas y mapa: así se
     garantiza que nunca puedan mostrar conjuntos distintos.        */

  function render() {
    if (!REGISTRO.length || !DOM.panelDescubrimiento) return;

    var favoritos = leerFavoritos();
    var reg = PLANO.region(estado);
    ultimaRegionRenderizada = reg.nombre;

    actualizarCabecera(reg);
    actualizarMapaTextura();

    var lista;
    if (reg.nombre === 'guia') {
      lista = EXPO.recortePorIniciativaPropia(REGISTRO, estado, 'guia');
      pintarTarjetas(lista, favoritos, { origen: 'iniciativa_propia', narrativa: true });
    } else if (reg.nombre === 'exploracion') {
      lista = EXPO.recortePorIniciativaPropia(REGISTRO, estado, 'exploracion');
      pintarTarjetas(lista, favoritos, { origen: 'iniciativa_propia', narrativa: false });
    } else if (reg.nombre === 'accionDirecta') {
      lista = EXPO.resultadosPorAccionExplicita(REGISTRO, consultaActual);
      pintarTarjetas(lista, favoritos, { origen: 'accion_explicita', narrativa: false });
    } else if (reg.nombre === 'curaduria') {
      var idsGuardados = Object.keys(favoritos).filter(function (id) { return favoritos[id]; });
      lista = EXPO.coleccionCurada(REGISTRO, idsGuardados);
      pintarTarjetas(lista, favoritos, { origen: 'accion_explicita', narrativa: false, vacioTexto: 'Todavía no guardaste nada. Guardá dos lugares seguidos y esto se convierte en tu lista.' });
    }
    actualizarMapaHerramienta(reg.nombre, lista || []);
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

  /* ── 6. Textura ambiental (sin cambios de fondo, no es interactiva) ── */

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

  /* ── 7. Mapa-herramienta: motor propio, gobernado por motor-mapa.js ──
     Este bloque no decide nada por su cuenta — solo traduce lo que
     motor-mapa.js ya resolvió (¿corresponde mostrar el mapa? ¿con qué
     recorte?) al motor de render. Ver motor-mapa.js: el mapa-
     herramienta es exclusivo de Acción Directa con resultados
     georreferenciados, con el mismo tipo de recorte acotado que el
     resto del sistema — nunca el padrón completo.                    */
  var motorMapa = null;

  function inicializarMotorMapa() {
    if (motorMapa || !DOM.mapaHerramienta || !window.URU_MOTOR_MAPA_RENDER) return;
    motorMapa = window.URU_MOTOR_MAPA_RENDER.crear(DOM.mapaHerramienta, {
      lat: -32.4833, lng: -58.2333, zoom: 14,
      ariaLabel: 'Mapa de los resultados de tu búsqueda'
    });
    motorMapa.on('hover', function (punto) { resaltarTarjeta(punto.id, true); });
    motorMapa.on('hoverOut', function () { resaltarTarjeta(null, false); });
    motorMapa.on('click', function (punto) {
      var el = DOM.panelDescubrimiento.querySelector('[data-lugar-id="' + cssEscape(punto.id) + '"]');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  function resaltarTarjeta(id, activo) {
    var previa = DOM.panelDescubrimiento.querySelector('.tarjeta--resaltada');
    if (previa) previa.classList.remove('tarjeta--resaltada');
    if (activo && id) {
      var el = DOM.panelDescubrimiento.querySelector('[data-lugar-id="' + cssEscape(id) + '"]');
      if (el) el.classList.add('tarjeta--resaltada');
    }
  }

  function cssEscape(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function actualizarMapaHerramienta(nombreRegion, lista) {
    if (!DOM.mapaHerramienta) return;
    var debeMostrar = MAPA.debeMostrarHerramienta(nombreRegion, lista);

    if (!debeMostrar) {
      DOM.mapaHerramienta.hidden = true;
      if (DOM.mapaInfo) DOM.mapaInfo.hidden = true;
      return;
    }

    DOM.mapaHerramienta.hidden = false;
    if (DOM.mapaInfo) DOM.mapaInfo.hidden = false;
    inicializarMotorMapa();
    if (!motorMapa) return;

    var conCoordenadas = lista.filter(function (l) { return typeof l.lat === 'number' && typeof l.lng === 'number'; });
    var recorte = MAPA.puntosHerramienta(conCoordenadas);
    var puntos = recorte.map(function (l) {
      return { id: l.id, lat: l.lat, lng: l.lng, nombre: l.nombre, direccion: l.direccion, href: 'locales/' + slug(l) + '/' };
    });
    motorMapa.establecerPuntos(puntos);
    motorMapa.encuadrarTodos(48);
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

})();
