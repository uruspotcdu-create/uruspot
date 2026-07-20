/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — app.js
   Reemplaza a fase4-motor.js como orquestador único de esta página.
   No decide nada por sí mismo: llama a URU_PLANO (posición en el
   plano, seis acciones), URU_EXPOSICION (qué mostrar) y URU_MAPA
   (doble rol) y traduce el resultado a DOM. Toda decisión de
   arquitectura vive en esos tres módulos + motor-config.js.

   Conserva del motor viejo lo que era una buena decisión técnica,
   no de arquitectura: carga bloqueante de lugares-core.json + carga
   perezosa de detalles/estado (mismo contrato, documentado en
   split_dataset.py).
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var CIUDAD = 'concepcion-del-uruguay'; // clave de contexto para madurez por (usuario × ciudad)
  var PLANO = window.URU_PLANO;
  var EXPO = window.URU_EXPOSICION;
  var MAPA = window.URU_MAPA;

  var REGISTRO = [];          // lugares-core.json, en orden de padrón (no se usa como orden de UI por defecto)
  var porId = Object.create(null);
  var estado = null;          // estado de motor-plano para este contexto
  var consultaActual = '';
  var permanenciaTimer = null;

  var DOM = {};
  ['rolActual', 'inputBuscar', 'panelDescubrimiento', 'tituloRegion', 'subtituloRegion',
   'mapaTextura', 'mapaHerramienta', 'contadorCuraduria', 'btnVerGuardados']
    .forEach(function (id) { DOM[id] = document.getElementById(id); });

  /* ── 1. Arranque de contexto (madurez, sección 3 del Blueprint) ── */
  estado = PLANO.leerEstado(CIUDAD);
  estado = PLANO.registrarApertura(estado);
  PLANO.guardarEstado(estado);

  /* ── 2. Carga de datos (igual contrato que antes) ── */
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

  // NOMBRAR: escribir en el buscador con intención de búsqueda directa.
  if (DOM.inputBuscar) {
    DOM.inputBuscar.addEventListener('input', function (e) {
      consultaActual = e.target.value;
      if (consultaActual.trim().length >= 2) {
        estado = PLANO.aplicarAccion(estado, 'nombrar', { consulta: consultaActual });
        PLANO.guardarEstado(estado);
      } else if (!consultaActual.trim()) {
        // Búsqueda vaciada: se libera el forzado de Acción Directa y
        // el plano vuelve a decidir la región por sí mismo.
        estado.sesion.accionDirectaForzada = null;
      }
      render();
    });
  }

  // ACEPTAR / RECHAZAR / GUARDAR: delegado sobre el panel de resultados.
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
        return; // el link de "ver ficha" sigue su curso normal (navegación)
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
    });
  }

  if (DOM.btnVerGuardados) {
    DOM.btnVerGuardados.addEventListener('click', function () {
      estado.sesion.curaduriaActiva = true;
      render();
    });
  }

  // PERMANECER: tiempo de exposición sin acción, mientras la pestaña está visible.
  function tickPermanencia() {
    if (document.hidden) return;
    estado = PLANO.aplicarAccion(estado, 'permanecer', { segundos: 5 });
    PLANO.guardarEstado(estado);
    // Solo re-renderiza si el empuje efectivamente cambió de región,
    // para no interrumpir a alguien leyendo una ficha.
    var regionNueva = PLANO.region(estado).nombre;
    if (regionNueva !== ultimaRegionRenderizada) render();
  }
  permanenciaTimer = setInterval(tickPermanencia, 5000);

  // ABANDONAR: salir sin ninguna otra acción — no mueve el plano,
  // solo persiste el punto de partida para la próxima apertura.
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

  /* ── 4. Favoritos (persistencia simple, sin cambios de contrato) ── */
  function leerFavoritos() {
    try { return JSON.parse(localStorage.getItem('uruspot_favoritos') || '{}'); }
    catch (e) { return {}; }
  }
  function guardarFavoritos(f) {
    try { localStorage.setItem('uruspot_favoritos', JSON.stringify(f)); } catch (e) { /* no-op */ }
  }

  /* ── 5. Render por región ── */
  var ultimaRegionRenderizada = null;

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
      ocultarHerramienta();
    } else if (reg.nombre === 'exploracion') {
      var recorteExplo = EXPO.recortePorIniciativaPropia(REGISTRO, estado, 'exploracion');
      pintarTarjetas(recorteExplo, favoritos, { origen: 'iniciativa_propia', narrativa: false });
      ocultarHerramienta();
    } else if (reg.nombre === 'accionDirecta') {
      var resultados = EXPO.resultadosPorAccionExplicita(REGISTRO, consultaActual);
      pintarTarjetas(resultados, favoritos, { origen: 'accion_explicita', narrativa: false });
      if (MAPA.debeMostrarHerramienta('accionDirecta', consultaActual)) {
        mostrarHerramienta(MAPA.puntosHerramienta(resultados));
      } else {
        ocultarHerramienta();
      }
    } else if (reg.nombre === 'curaduria') {
      var idsGuardados = Object.keys(favoritos).filter(function (id) { return favoritos[id]; });
      var coleccion = EXPO.coleccionCurada(REGISTRO, idsGuardados);
      pintarTarjetas(coleccion, favoritos, { origen: 'accion_explicita', narrativa: false, vacioTexto: 'Todavía no guardaste nada. Guardá dos lugares seguidos y esto se convierte en tu lista.' });
      ocultarHerramienta();
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

  function slug(lugar) { return lugar.id.toLowerCase(); } // ajustar si el slug real difiere del id

  /* ── 6. Mapa de doble rol ── */
  function actualizarMapaTextura() {
    if (!DOM.mapaTextura || !REGISTRO.length) return;
    if (!window.URU_CONFIG.mapa.texturaSiempreVisible) return;
    if (DOM.mapaTextura.dataset.pintado === '1') return; // se pinta una sola vez, es ambiental, no reactiva
    var puntos = MAPA.puntosTextura(REGISTRO);
    var frag = document.createDocumentFragment();
    puntos.forEach(function (l) {
      if (typeof l.lat !== 'number' || typeof l.lng !== 'number') return;
      var p = document.createElement('div');
      p.className = 'punto-textura';
      p.style.left = (Math.random() * 100) + '%'; // posicionamiento real por lat/lng queda para la pasada de diseño visual
      p.style.top = (Math.random() * 100) + '%';
      frag.appendChild(p);
    });
    DOM.mapaTextura.appendChild(frag);
    DOM.mapaTextura.dataset.pintado = '1';
  }

  function mostrarHerramienta(puntos) {
    if (!DOM.mapaHerramienta) return;
    DOM.mapaHerramienta.hidden = false;
    DOM.mapaHerramienta.innerHTML = '<p class="mapa-herramienta-nota">' + puntos.length + ' resultado(s) cercano(s) — mapa interactivo real: pendiente de integración de Leaflet/Places en esta pasada.</p>';
  }
  function ocultarHerramienta() {
    if (DOM.mapaHerramienta) DOM.mapaHerramienta.hidden = true;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

})();
