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
  var filtroRubroActivo = null; // grupo activo del índice "Por rubro", o null = todos
  var TARJETAS_POR_PAGINA = 8;
  var paginaTarjetas = 1; // cuántas páginas de TARJETAS_POR_PAGINA hay reveladas
  var ubicacionUsuario = null; // {lat,lng} — solo si el usuario lo pide y el navegador lo concede
  var cercaTuyoActivo = false;
  var permanenciaTimer = null;
  var ultimaRegionRenderizada = '';

  var DOM = {};
  ['rolActual', 'inputBuscar', 'panelDescubrimiento', 'tituloRegion', 'subtituloRegion',
   'mapaTextura', 'mapaHerramienta', 'mapaInfo', 'mapaLeyenda', 'contadorCuraduria', 'btnVerGuardados',
   'listaRubros', 'statLugares', 'statRubros', 'faqLista']
    .forEach(function (id) { DOM[id] = document.getElementById(id); });

  /* ── 1. Arranque de contexto ── */
  estado = PLANO.leerEstado(CIUDAD);
  estado = PLANO.registrarApertura(estado);
  PLANO.guardarEstado(estado);

  /* ── 2. Carga de datos ── */
  pintarEsqueleto();
  fetch('lugares-core.json')
    .then(function (r) { return r.json(); })
    .then(function (core) {
      REGISTRO = core.map(function (l) {
        var reg = {
          id: l.id, nombre: l.nombre, categoria: l.categoria, grupo: l.grupo,
          lat: l.lat, lng: l.lng, direccion: null, telefono: null, descripcion: null, estado: 'verificado'
        };
        porId[l.id] = reg;
        return reg;
      });
      cargarDetallesEnSegundoPlano();
      pintarRubros();
      pintarStatsRapidas();
      render();
    })
    .catch(function (err) {
      console.error('No se pudo cargar lugares-core.json', err);
      if (DOM.panelDescubrimiento) {
        DOM.panelDescubrimiento.innerHTML = '<p class="error">No se pudo cargar la información. Probá recargar la página.</p>';
      }
    });

  // Placeholder visual mientras llega el fetch: mismo grid que las
  // tarjetas reales, para que no haya salto de layout al reemplazarlas.
  function pintarEsqueleto() {
    if (!DOM.panelDescubrimiento) return;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 6; i++) {
      var art = document.createElement('div');
      art.className = 'tarjeta tarjeta--esqueleto';
      art.innerHTML =
        '<div class="u-skeleton esqueleto-linea esqueleto-linea--rubro"></div>' +
        '<div class="u-skeleton esqueleto-linea esqueleto-linea--nombre"></div>' +
        '<div class="u-skeleton esqueleto-linea esqueleto-linea--direccion"></div>' +
        '<div class="u-skeleton esqueleto-linea esqueleto-linea--acciones"></div>';
      frag.appendChild(art);
    }
    DOM.panelDescubrimiento.innerHTML = '';
    DOM.panelDescubrimiento.appendChild(frag);
  }

  // Estadísticas rápidas del hero: conteo real de REGISTRO, nunca un
  // número inventado — si REGISTRO todavía no cargó, no se pinta nada.
  function pintarStatsRapidas() {
    if (!REGISTRO.length) return;
    if (DOM.statLugares) DOM.statLugares.textContent = REGISTRO.length.toLocaleString('es-AR');
    if (DOM.statRubros) {
      var grupos = Object.create(null);
      REGISTRO.forEach(function (l) { grupos[l.grupo] = true; });
      DOM.statRubros.textContent = Object.keys(grupos).length;
    }
  }

  function cargarDetallesEnSegundoPlano() {
    var lanzar = function () {
      fetch('lugares-detalles.json').then(function (r) { return r.json(); }).then(function (det) {
        det.forEach(function (d) {
          var reg = porId[d.id];
          if (reg) { reg.direccion = d.direccion || null; reg.telefono = d.telefono || null; reg.descripcion = d.descripcion || null; }
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
      paginaTarjetas = 1;
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
      var btnCompartir = e.target.closest('[data-accion="compartir"]');
      var btnCargarMas = e.target.closest('[data-accion="cargar-mas"]');
      var carta0 = e.target.closest('[data-lugar-id]');

      if (btnCompartir) {
        var cartaC = btnCompartir.closest('[data-lugar-id]');
        var lugarC = porId[cartaC.dataset.lugarId];
        var urlFicha = window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'locales/' + slug(lugarC) + '/';
        var payload = { title: lugarC.nombre + ' — URU SPOT', text: lugarC.categoria || '', url: urlFicha };
        if (navigator.share) {
          navigator.share(payload).catch(function () {});
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(urlFicha).then(function () {
            var txtOriginal = btnCompartir.innerHTML;
            btnCompartir.innerHTML = '✓';
            setTimeout(function () { btnCompartir.innerHTML = txtOriginal; }, 1600);
          });
        }
        return;
      }
      if (btnCargarMas) {
        paginaTarjetas++;
        render();
        return;
      }
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

  if (DOM.listaRubros) {
    DOM.listaRubros.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-rubro]');
      if (!chip) return;
      var rubro = chip.dataset.rubro;
      filtroRubroActivo = (filtroRubroActivo === rubro) ? null : rubro;
      paginaTarjetas = 1;
      estado.sesion.curaduriaActiva = false; // filtrar por rubro siempre vuelve a la vista "todos"
      pintarRubros();
      render();
      if (DOM.tituloRegion) DOM.tituloRegion.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  if (DOM.btnVerGuardados) {
    DOM.btnVerGuardados.addEventListener('click', function () {
      estado.sesion.curaduriaActiva = true;
      paginaTarjetas = 1;
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
    if (reg.nombre === 'curaduria') {
      var idsGuardados = Object.keys(favoritos).filter(function (id) { return favoritos[id]; });
      lista = EXPO.coleccionCurada(REGISTRO, idsGuardados);
      pintarTarjetas(lista, favoritos, { origen: 'accion_explicita', narrativa: false, vacioTexto: 'Todavía no guardaste nada. Guardá un lugar y aparece acá.' });
    } else {
      // Antes acá se recortaba a 4-10 lugares "por iniciativa propia"
      // (motor-exposicion.js: recortePorIniciativaPropia). Se retiró
      // a pedido: el catálogo completo (+1400 lugares) tiene que verse
      // siempre, no solo cuando alguien escribe una búsqueda. Ahora
      // se muestra siempre el padrón entero, acotado únicamente por lo
      // que el usuario pide de forma explícita: texto de búsqueda y/o
      // rubro elegido en "Por rubro". recortePorIniciativaPropia() y
      // el presupuesto de exposición (motor-config.js) quedan sin usar
      // acá — no se borraron por si en el futuro se quiere retomar
      // una vista "sugerido" separada de esta.
      lista = EXPO.resultadosPorAccionExplicita(REGISTRO, consultaActual);
      if (filtroRubroActivo) {
        lista = lista.filter(function (l) { return l.grupo === filtroRubroActivo; });
      }
      pintarTarjetas(lista, favoritos, { origen: 'accion_explicita', narrativa: false });
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

    if (reg.nombre === 'curaduria') {
      DOM.tituloRegion.textContent = 'Tu lista';
      DOM.subtituloRegion.textContent = 'Lo que guardaste, sin recorte ni rotación.';
      return;
    }

    var rubroMeta = filtroRubroActivo && window.URU_RUBROS_META ? window.URU_RUBROS_META[filtroRubroActivo] : null;
    if (consultaActual.trim()) {
      DOM.tituloRegion.textContent = 'Resultados';
      DOM.subtituloRegion.textContent = rubroMeta
        ? 'Coincidencias con "' + consultaActual.trim() + '" en ' + rubroMeta[0] + '.'
        : 'Esto es lo que coincide con lo que escribiste.';
    } else if (rubroMeta) {
      DOM.tituloRegion.textContent = rubroMeta[0];
      DOM.subtituloRegion.textContent = 'Todos los lugares verificados de este rubro.';
    } else {
      DOM.tituloRegion.textContent = 'Todos los lugares';
      DOM.subtituloRegion.textContent = 'El padrón completo, siempre visible. Buscá o filtrá por rubro para acotar.';
    }
  }

  function pintarRubros() {
    if (!DOM.listaRubros || !REGISTRO.length || !window.URU_RUBROS_META) return;
    var conteo = Object.create(null);
    REGISTRO.forEach(function (l) { conteo[l.grupo] = (conteo[l.grupo] || 0) + 1; });
    var claves = Object.keys(window.URU_RUBROS_META)
      .filter(function (k) { return conteo[k]; })
      .sort(function (a, b) { return conteo[b] - conteo[a]; });

    DOM.listaRubros.innerHTML = claves.map(function (k) {
      var meta = window.URU_RUBROS_META[k];
      var activo = filtroRubroActivo === k;
      return '<button type="button" class="chip' + (activo ? ' chip--activo' : '') + '" data-rubro="' + k + '" style="--chip-color:' + meta[2] + '">' +
        '<span class="chip__punto" style="background:' + meta[2] + '"></span>' +
        escapeHTML(meta[0]) + '<span class="chip__conteo">' + conteo[k] + '</span>' +
        '</button>';
    }).join('');
  }

  function pintarTarjetas(lista, favoritos, opts) {
    DOM.panelDescubrimiento.innerHTML = '';
    if (!lista.length) {
      DOM.panelDescubrimiento.innerHTML = '<p class="vacio">' + (opts.vacioTexto || 'No encontramos nada con esa búsqueda.') + '</p>';
      return;
    }
    var limite = TARJETAS_POR_PAGINA * paginaTarjetas;
    var visible = lista.slice(0, limite);
    var restantes = lista.length - visible.length;

    var frag = document.createDocumentFragment();
    visible.forEach(function (lugar, i) {
      var art = document.createElement('article');
      art.className = 'tarjeta' + (opts.narrativa ? ' tarjeta--narrativa' : '');
      art.dataset.lugarId = lugar.id;
      var metaRubro = window.URU_RUBROS_META && window.URU_RUBROS_META[lugar.grupo];
      var rubro = metaRubro ? metaRubro[0] : lugar.categoria;
      if (metaRubro) art.style.setProperty('--chip-color', metaRubro[2]);
      // Stagger acotado a las primeras ~24 tarjetas visibles en pantalla:
      // más allá de eso el delay ya no se percibe y solo demora el resto.
      art.style.animationDelay = (Math.min(i, 24) * 0.03) + 's';
      var linkMaps = mapsHref(lugar);
      var linkTel = lugar.telefono ? 'tel:' + lugar.telefono.replace(/[^\d+]/g, '') : null;
      // Mini-línea: descripción real del lugar si la tenemos; si no,
      // un genérico "grupo · categoría" (nunca una frase inventada
      // sobre el negocio en sí, como "no acepta turnos" o similar).
      var miniTexto = lugar.descripcion ||
        (lugar.categoria && rubro !== lugar.categoria ? rubro + ' · ' + lugar.categoria : lugar.categoria || rubro);
      var miniEsGenerica = !lugar.descripcion;
      var slugLugar = slug(lugar);
      art.innerHTML =
        '<div class="tarjeta-rubro">' + escapeHTML(rubro) + '</div>' +
        '<h3 class="tarjeta-nombre">' + escapeHTML(lugar.nombre) + '</h3>' +
        (miniTexto
          ? '<div class="tarjeta-mini' + (miniEsGenerica ? ' tarjeta-mini--generica' : '') + '">' + escapeHTML(miniTexto) + '</div>'
          : '<div class="tarjeta-direccion">' + (lugar.direccion ? escapeHTML(lugar.direccion) : 'cargando dirección…') + '</div>') +
        '<div class="tarjeta-acciones">' +
          (slugLugar ? '<a class="tarjeta-btn" data-accion="aceptar" data-origen="' + opts.origen + '" href="locales/' + slugLugar + '/">ver ficha</a>' : '') +
          (linkMaps ? '<a class="tarjeta-btn tarjeta-btn--maps" data-accion="maps" href="' + linkMaps + '" target="_blank" rel="noopener" aria-label="Abrir en Google Maps">📍 mapa</a>' : '') +
          (linkTel ? '<a class="tarjeta-btn tarjeta-btn--tel" data-accion="llamar" href="' + linkTel + '" aria-label="Llamar">📞 llamar</a>' : '') +
          '<button class="tarjeta-btn tarjeta-btn--fav' + (favoritos[lugar.id] ? ' activo' : '') + '" type="button" data-accion="guardar" aria-label="Guardar">' + (favoritos[lugar.id] ? '★ guardado' : '☆ guardar') + '</button>' +
          (slugLugar ? '<button class="tarjeta-btn tarjeta-btn--compartir" type="button" data-accion="compartir" aria-label="Compartir">🔗</button>' : '') +
          '<button class="tarjeta-btn tarjeta-btn--descartar" type="button" data-accion="rechazar">no me interesa</button>' +
        '</div>';
      frag.appendChild(art);
    });
    DOM.panelDescubrimiento.appendChild(frag);

    if (restantes > 0) {
      var piePagina = document.createElement('div');
      piePagina.className = 'paginacion';
      piePagina.innerHTML =
        '<button type="button" class="btn" data-accion="cargar-mas">Cargar ' + Math.min(restantes, TARJETAS_POR_PAGINA) + ' más</button>' +
        '<span class="paginacion-conteo">' + visible.length + ' de ' + lista.length + '</span>';
      DOM.panelDescubrimiento.appendChild(piePagina);
    }
  }

  // BUG REAL corregido: antes esto devolvía lugar.id.toLowerCase()
  // ("uru-00187"), pero las carpetas de locales/ están nombradas por
  // el negocio ("bartolo-bar"), no por ID — todo enlace "ver ficha"
  // del sitio apuntaba a una URL inexistente. Ver js/locales-slugs.js.
  // Devuelve null si ese lugar todavía no tiene ficha propia — así
  // el botón se puede ocultar en vez de llevar a un 404.
  function slug(lugar) {
    var mapa = window.URU_LOCALES_SLUGS;
    return (mapa && mapa[lugar.id]) || null;
  }

  // Un solo toque, ubicación exacta: coordenada si existe (siempre la
  // hay desde lugares-core.json), dirección como respaldo si algún
  // registro llegara sin lat/lng.
  function mapsHref(lugar) {
    if (typeof lugar.lat === 'number' && typeof lugar.lng === 'number') {
      return 'https://www.google.com/maps/search/?api=1&query=' + lugar.lat + ',' + lugar.lng;
    }
    if (lugar.direccion) {
      return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lugar.nombre + ', ' + lugar.direccion);
    }
    return null;
  }

  // Distancia real (Haversine), no una estimación inventada — solo se
  // usa cuando el propio navegador del usuario entregó su posición.
  function distanciaMetros(lat1, lng1, lat2, lng2) {
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function formatoDistancia(m) {
    if (m < 1000) return Math.round(m / 10) * 10 + ' m';
    return (m / 1000).toFixed(1).replace('.0', '') + ' km';
  }

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
      if (DOM.mapaLeyenda) DOM.mapaLeyenda.hidden = true;
      return;
    }

    DOM.mapaHerramienta.hidden = false;
    if (DOM.mapaInfo) DOM.mapaInfo.hidden = false;
    inicializarMotorMapa();
    if (!motorMapa) return;

    var conCoordenadas = lista.filter(function (l) { return typeof l.lat === 'number' && typeof l.lng === 'number'; });
    var recorte = MAPA.puntosHerramienta(conCoordenadas);
    var puntos = recorte.map(function (l) {
      var meta = window.URU_RUBROS_META && window.URU_RUBROS_META[l.grupo];
      var slugL = slug(l);
      return {
        id: l.id, lat: l.lat, lng: l.lng, nombre: l.nombre, direccion: l.direccion,
        href: slugL ? 'locales/' + slugL + '/' : null,
        color: meta ? meta[2] : '#C97A83',
        rubroNombre: meta ? meta[0] : l.categoria
      };
    });
    motorMapa.establecerPuntos(puntos);
    motorMapa.encuadrarTodos(48);
    pintarLeyenda(puntos);
  }

  function pintarLeyenda(puntos) {
    if (!DOM.mapaLeyenda) return;
    var vistos = Object.create(null);
    var unicos = [];
    puntos.forEach(function (p) {
      if (vistos[p.rubroNombre]) return;
      vistos[p.rubroNombre] = true;
      unicos.push(p);
    });
    if (unicos.length < 2) { DOM.mapaLeyenda.hidden = true; return; } // con un solo rubro, el color no aporta nada
    DOM.mapaLeyenda.innerHTML = unicos.map(function (p) {
      return '<span class="mapa-leyenda-chip"><span class="mapa-leyenda-punto" style="background:' + p.color + '"></span>' + escapeHTML(p.rubroNombre) + '</span>';
    }).join('');
    DOM.mapaLeyenda.hidden = false;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ── 8. FAQ (accordion) ── */
  if (DOM.faqLista) {
    DOM.faqLista.addEventListener('click', function (e) {
      var pregunta = e.target.closest('.faq-pregunta');
      if (!pregunta) return;
      var item = pregunta.closest('.faq-item');
      var abierta = pregunta.getAttribute('aria-expanded') === 'true';
      pregunta.setAttribute('aria-expanded', String(!abierta));
      item.classList.toggle('faq-item--abierta', !abierta);
    });
  }

  /* ── 9. Revelado al hacer scroll (progressive enhancement) ──
     Si el navegador no soporta IntersectionObserver, .u-reveal ya
     queda visible por CSS (ver tokens.css .no-js), así que esto nunca
     puede dejar contenido oculto. */
  if ('IntersectionObserver' in window) {
    var observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        if (entrada.isIntersecting) {
          entrada.target.classList.add('visible');
          observador.unobserve(entrada.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.u-reveal').forEach(function (el) {
      el.classList.add('u-reveal--armado'); // recién ahora puede quedar oculta: ya hay observer que la va a revelar
      observador.observe(el);
    });
  }
  // Sin soporte de IntersectionObserver: .u-reveal queda visible por
  // defecto (ver tokens.css), no hace falta ninguna acción acá.

  /* ── 10. Ripple sutil en botones (.btn) — puramente decorativo,
     nunca reemplaza el click real, que sigue disparando por el
     listener normal del elemento. ── */
  document.addEventListener('pointerdown', function (e) {
    var btn = e.target.closest('.btn');
    if (!btn) return;
    var rect = btn.getBoundingClientRect();
    var span = document.createElement('span');
    var lado = Math.max(rect.width, rect.height);
    span.className = 'btn__ripple';
    span.style.width = span.style.height = lado + 'px';
    span.style.left = (e.clientX - rect.left - lado / 2) + 'px';
    span.style.top = (e.clientY - rect.top - lado / 2) + 'px';
    btn.appendChild(span);
    span.addEventListener('animationend', function () { span.remove(); });
  });

})();
