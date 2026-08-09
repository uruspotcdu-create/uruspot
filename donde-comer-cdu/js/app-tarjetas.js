/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — js/app-tarjetas.js
   Tercer módulo real (auditoría de ingeniería, Oportunidad 3,
   2026-08-06) de la separación de app.js por responsabilidad: el
   grupo "render de tarjetas" del informe original, completo.

   Dos funciones con dos contratos distintos, a propósito:

   `pintarEsqueleto(panelEl)` — no necesita `configurar()`: su única
   dependencia (`DOM.panelDescubrimiento`) se la pasa quien la llama,
   como parámetro. No lee `estado` ni `uiState`, así que no hace falta
   nada más elaborado.

   `pintarTarjetas(lista, favoritos, opts)` — a diferencia de la
   anterior, sí lee Y ESCRIBE `uiState` (`scrollPosition`,
   `visualState`) además de leer `DOM.panelDescubrimiento` y
   `DOM.estadoResultados` y tres constantes de app.js
   (`TARJETAS_POR_PAGINA`, `ENTRADA_VIDRIO_TIMEOUT_MS`, `VISUAL_STATE`).
   Mismo contrato que `app-telemetria.js`: `configurar(contexto)` con
   funciones de acceso, llamado una vez desde app.js, nunca valores
   capturados por closure — así `uiState` que ve este módulo es
   siempre la instancia viva de app.js, no una foto vieja de antes del
   último render. Sin `configurar()` previo: fail-open con
   console.warn, no pinta nada (mismo criterio que AppTelemetria).

   Las funciones de formato/escape (`escapeHTML`, `mapsHref`, `slug`,
   `distanciaMetros`, `formatoDistancia`, `prefiereMovimientoReducido`)
   NO pasan por contexto — son 100% puras (ver app-formato.js) y este
   módulo las consulta directo de `window.AppFormato`, igual que
   `window.URU_RUBROS_META`/`window.URU_RUBROS_ICONO_SVG`, que ya eran
   globales antes de esta extracción y siguen siéndolo.

   `contexto` esperado (ver app.js, sección de wiring):
     obtenerDOM()          → objeto DOM cacheado (panelDescubrimiento, estadoResultados)
     obtenerEstadoUI()     → uiState (referencia viva, no copia)
     obtenerConstantes()   → { TARJETAS_POR_PAGINA, ENTRADA_VIDRIO_TIMEOUT_MS, VISUAL_STATE }

   Carga: sin dependencias propias del módulo, pero debe estar
   disponible DESPUÉS de app-formato.js (usa `window.AppFormato` desde
   su propio nivel superior) y ANTES de que app.min.js llame a
   `AppTarjetas.configurar(...)` y a estas funciones (arranque de
   `inicializar()` y recuperación de errores) — por eso va junto a
   ciclo-vida.js, app-telemetria.js y app-formato.js en index.html,
   antes de motor.bundle.js — no dentro de ningún bundle.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var contexto = null;

  function avisarSinConfigurar(metodo) {
    if (global.console) {
      console.warn('[AppTarjetas] ' + metodo + '() llamado antes de configurar() — no se pinta nada.');
    }
  }

  // Fail hard-visible si AppFormato no cargó (mismo criterio que el
  // resto del proyecto): funciones-stub neutras en vez de que
  // pintarTarjetas explote al primer lugar de la lista.
  var Formato = global.AppFormato;
  if (!Formato) {
    console.error('[AppTarjetas] AppFormato no está cargado — revisar que js/app-formato.js esté en index.html, antes de app-tarjetas.js.');
    Formato = {
      escapeHTML: function (s) { return String(s); },
      mapsHref: function () { return null; },
      slug: function () { return null; },
      distanciaMetros: function () { return 0; },
      formatoDistancia: function () { return ''; },
      prefiereMovimientoReducido: function () { return false; }
    };
  }

  /**
   * Esqueleto inicial mientras carga el catálogo.
   * @param {HTMLElement} panelEl — DOM.panelDescubrimiento de quien llama.
   */
  function pintarEsqueleto(panelEl) {
    if (!panelEl) return;
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
    panelEl.innerHTML = '';
    panelEl.appendChild(frag);
  }

  /**
   * Pinta las tarjetas de lugares en el panel de descubrimiento.
   * Con stagger, paginación, favoritos y acciones contextuales.
   * @param {Array} lista
   * @param {Object} favoritos
   * @param {Object} opts
   */
  function pintarTarjetas(lista, favoritos, opts) {
    if (!contexto) { avisarSinConfigurar('pintarTarjetas'); return; }

    var DOM = contexto.obtenerDOM();
    var uiState = contexto.obtenerEstadoUI();
    var K = contexto.obtenerConstantes();

    if (!DOM.panelDescubrimiento) return;

    // Guardar scroll actual
    uiState.scrollPosition = window.scrollY || document.documentElement.scrollTop;

    // Anunciar cantidad de resultados para screen readers
    if (DOM.estadoResultados) {
      DOM.estadoResultados.textContent = lista.length
        ? (lista.length + ' resultado' + (lista.length === 1 ? '' : 's') + '.')
        : 'Sin resultados.';
    }

    if (!lista.length) {
      DOM.panelDescubrimiento.innerHTML = '';

      var tieneBusqueda = uiState.consultaActual.trim().length > 0;
      var tieneFiltroRubro = !!uiState.filtroRubroActivo;
      var acciones = '';

      if (tieneBusqueda) {
        acciones += '<button type="button" class="btn" data-accion="limpiar-busqueda">Limpiar búsqueda</button>';
      }
      if (tieneFiltroRubro) {
        var metaFiltro = window.URU_RUBROS_META && window.URU_RUBROS_META[uiState.filtroRubroActivo];
        acciones += '<button type="button" class="btn" data-accion="limpiar-filtro-rubro">' +
          (metaFiltro ? 'Salir de "' + Formato.escapeHTML(metaFiltro[0]) + '"' : 'Ver todos los rubros') + '</button>';
      }

      DOM.panelDescubrimiento.innerHTML =
        '<div class="vacio">' +
        '<p>' + (opts.vacioTexto || 'No encontramos lugares con esos criterios.') + '</p>' +
        (acciones ? '<div class="vacio-acciones">' + acciones + '</div>' : '') +
        '</div>';
      uiState.visualState = K.VISUAL_STATE.EMPTY;
      return;
    }

    uiState.visualState = K.VISUAL_STATE.SUCCESS;
    var limite = K.TARJETAS_POR_PAGINA * uiState.paginaTarjetas;
    var visible = lista.slice(0, limite);
    var restantes = lista.length - visible.length;
    var movimientoReducido = Formato.prefiereMovimientoReducido();

    // Comparador inline (Fase 4, evolutivo A→C — ver motor-comparacion.js
    // para el porqué de la separación de este cálculo en un módulo
    // propio). `panel--comparando` solo afecta CSS (tarjeta-lugar.css):
    // separación visual más clara entre tarjetas cuando el usuario está
    // eligiendo entre pocas opciones, no una reestructuración de layout.
    DOM.panelDescubrimiento.classList.toggle('panel--comparando', !!opts.comparacion);

    // PERF (auditoría performance, 2026-08-03, hallazgo 1.2 — confirmado
    // con Chrome DevTools Performance: long task de 58.8ms, con 33
    // llamadas a manejarFinEntradaTarjeta cayendo en el mismo frame,
    // producto de reconstruir TODO el listado en cada "Cargar más").
    // render() ya marca opts.soloAgregarNuevas cuando lo único que
    // cambió fue la página. Igual se verifica acá contra el DOM real
    // (no solo contra el número de página en memoria): si por lo que
    // sea el panel no tiene ya las tarjetas que "deberían" estar
    // pintadas (nadie más toca panelDescubrimiento hoy, pero no cuesta
    // nada no asumirlo), se cae al camino de reconstrucción completa de
    // siempre — nunca se agregan tarjetas de más ni se deja el listado
    // a medio pintar.
    var articulosExistentes = 0;
    var incremental = false;
    if (opts.soloAgregarNuevas) {
      articulosExistentes = DOM.panelDescubrimiento.getElementsByClassName('tarjeta').length;
      incremental = articulosExistentes > 0 && articulosExistentes < visible.length;
    }

    if (!incremental) {
      DOM.panelDescubrimiento.innerHTML = '';
    } else {
      // Se va a re-crear el pie de paginación al final (o se omite si
      // ya no quedan restantes) — sacar el anterior primero para no
      // duplicarlo.
      var piePaginaExistente = DOM.panelDescubrimiento.querySelector('.paginacion');
      if (piePaginaExistente) piePaginaExistente.remove();
    }

    // Nota de comparación: solo en la reconstrucción completa, no en
    // "cargar más" incremental (opts.comparacion nunca convive con
    // paginación real de todos modos — el rango comparable es 2-4 y
    // TARJETAS_POR_PAGINA es 8 — pero se guarda la misma guarda que ya
    // usa el resto de esta función por consistencia).
    if (!incremental && opts.comparacion) {
      var notaComparacion = document.createElement('p');
      notaComparacion.className = 'nota-comparacion';
      notaComparacion.textContent = 'Comparando ' + opts.comparacion.cantidad + ' de tus guardados' +
        (opts.comparacion.mismoRubro ? '.' : ' (de distinto rubro).');
      DOM.panelDescubrimiento.appendChild(notaComparacion);
    }

    var nuevas = incremental ? visible.slice(articulosExistentes) : visible;
    var offset = incremental ? articulosExistentes : 0;

    var frag = document.createDocumentFragment();
    nuevas.forEach(function (lugar, idxRel) {
      var i = offset + idxRel;
      var art = document.createElement('article');
      var comparacionLugar = opts.comparacion ? opts.comparacion.porId[lugar.id] : null;
      art.className = 'tarjeta' + (opts.narrativa ? ' tarjeta--narrativa' : '') +
        (comparacionLugar ? ' tarjeta--comparando' : '');
      art.dataset.lugarId = lugar.id;

      var metaRubro = window.URU_RUBROS_META && window.URU_RUBROS_META[lugar.grupo];
      var rubro = metaRubro ? metaRubro[0] : lugar.categoria;
      if (metaRubro) art.style.setProperty('--chip-color', 'var(' + metaRubro[2] + ')');

      if (!movimientoReducido) {
        art.style.animationDelay = (Math.min(i, 24) * 0.03) + 's';
        // PERF (auditoría performance, 2026-08-02): mientras la
        // tarjeta está entrando (fade-up + posible stagger de hasta
        // 720ms) se suprime su backdrop-filter vía .tarjeta--entrando
        // (css/tarjeta-lugar.css). Con hasta 8 tarjetas entrando a la
        // vez, cada una con su propio vidrio esmerilado, el
        // compositor tenía que recomponer varias capas de blur en
        // movimiento simultáneamente — el blur en sí no se nota
        // ausente durante ~420ms de movimiento (la atención está en
        // la posición/opacidad, no en el desenfoque de fondo), así
        // que se recupera automáticamente en 'animationend' sin
        // cambio visual perceptible en reposo.
        art.classList.add('tarjeta--entrando');
        // Red de seguridad (mismo idioma que programarRenderTrasSalida
        // más abajo: evento + setTimeout de respaldo): el listener
        // delegado de 'animationend' en DOM.panelDescubrimiento
        // (inicializarListeners) saca la clase en el caso normal,
        // mucho antes de este timeout — esto solo cubre el caso raro
        // en que la animación nunca dispare 'animationend'. Quitar una
        // clase que ya no está puesta es un no-op, así que no hay
        // riesgo de doble efecto.
        setTimeout(function () { art.classList.remove('tarjeta--entrando'); }, K.ENTRADA_VIDRIO_TIMEOUT_MS);
      }

      var linkMaps = Formato.mapsHref(lugar);
      var linkTel = lugar.telefono ? 'tel:' + lugar.telefono.replace(/[^\d+]/g, '') : null;
      var slugLugar = Formato.slug(lugar);
      var primaria = slugLugar ? 'ficha' : (linkMaps ? 'maps' : (linkTel ? 'tel' : null));

      var miniTexto = lugar.descripcion ||
        (lugar.categoria && rubro !== lugar.categoria ? rubro + ' · ' + lugar.categoria : lugar.categoria || rubro);
      var miniEsGenerica = !lugar.descripcion;

      var distanciaTxt = (uiState.cercaTuyoActivo && uiState.ubicacionUsuario &&
        typeof lugar.lat === 'number' && typeof lugar.lng === 'number')
        ? Formato.formatoDistancia(Formato.distanciaMetros(uiState.ubicacionUsuario.lat, uiState.ubicacionUsuario.lng, lugar.lat, lugar.lng))
        : null;

      var pendienteTxt = lugar.estado === 'pendiente' ? '<span class="tarjeta-pendiente">en revisión</span>' : '';

      // Pictograma de rubro compartido Canvas↔DOM (URUSPOT-PENDIENTES §6):
      // ya se usaba en el filtro "Por rubro", la leyenda del mapa y la
      // ficha — acá se conecta la tarjeta de descubrimiento, la superficie
      // de mayor tráfico y la que faltaba. Reusa exactamente la misma
      // función/clase (.rubro-icono, chip.css) para no introducir una
      // segunda convención visual del mismo dato.
      // 2026-08-09 (pasada #2, "mejoralas mucho más"): el ícono sube de
      // 13 a 15px y se envuelve en .tarjeta-rubro-icono (badge circular
      // con el propio --chip-color de fondo, tarjeta-lugar.css) — antes
      // era un trazo suelto flotando junto al texto, ahora es una marca
      // de identidad real por rubro, mismo lenguaje que ya usan los
      // íconos circulares de .manifiesto-card__icono (descubrimiento.css)
      // pero tintados por rubro en vez de con el gradiente de marca.
      var iconoRubro = (metaRubro && window.URU_RUBROS_ICONO_SVG)
        ? '<span class="tarjeta-rubro-icono">' + window.URU_RUBROS_ICONO_SVG(lugar.grupo, { tam: 15 }) + '</span>'
        : '';

      // Marca de agua grande y muy tenue del mismo pictograma, de fondo
      // en la esquina de la tarjeta (mismo SVG, mismo --chip-color,
      // solo que a 108px y 8% de opacidad vía CSS) — le da identidad
      // visual real a cada rubro sin depender de fotos que el dataset
      // todavía no tiene (ver nota de .tarjeta--con-imagen más abajo en
      // este archivo, preparado para Fase 1.5). z-index:-1 (mismo nivel
      // que .tarjeta::after) para quedar siempre detrás del texto.
      var marcaAguaRubro = (metaRubro && window.URU_RUBROS_ICONO_SVG)
        ? window.URU_RUBROS_ICONO_SVG(lugar.grupo, { tam: 108, clase: 'tarjeta-marca-agua' })
        : '';

      // Fase 4 — MUST HAVE (Fase 3A §7/§10, Fase 3D §7): el rating ya
      // vivía en el registro (ver cargarCatalogo) pero solo se pintaba
      // en pintarDestacados() — el flujo principal de tarjetas nunca lo
      // mostró. Mismo formato que destacados (★ 4,8) para no introducir
      // una segunda convención visual del mismo dato.
      var ratingTxt = (typeof lugar.rating === 'number')
        ? '★ ' + lugar.rating.toFixed(1).replace('.', ',') +
          (typeof lugar.ratingCount === 'number' ? ' (' + lugar.ratingCount.toLocaleString('es-AR') + ')' : '')
        : null;

      // Fase 4 — MUST HAVE (Fase 3A §4/§10, Fase 3B §2, Fase 3D §7): la
      // razón solo llega en opts.razones cuando origen es
      // 'iniciativa_propia' (búsqueda/curaduría nunca la traen, y no
      // deben — Blueprint V2 invariante: nunca aplican scoring). Ausencia
      // silenciosa si por lo que sea no hay razón para ese id puntual.
      var razonTxt = (opts.razones && opts.razones[lugar.id]) ? opts.razones[lugar.id] : null;

      // Badges del comparador inline: solo marcan un atributo cuando
      // realmente distingue a este lugar del resto de los comparados
      // (motor-comparacion.js ya descarta empates — nunca llegan acá
      // dos badges "mejor rating" en la misma tanda).
      var badgeMejorRating = (comparacionLugar && comparacionLugar.esMejorRating)
        ? '<span class="tarjeta-badge-comparacion">★ mejor rating</span>' : '';
      var badgeMasCercano = (comparacionLugar && comparacionLugar.esMasCercano)
        ? '<span class="tarjeta-badge-comparacion">📍 más cerca</span>' : '';

      art.innerHTML =
        marcaAguaRubro +
        '<div class="tarjeta-rubro">' + iconoRubro + Formato.escapeHTML(rubro) + pendienteTxt +
        (ratingTxt ? '<span class="tarjeta-rating" aria-label="Calificación ' + Formato.escapeHTML(lugar.rating.toFixed(1).replace('.', ',')) + ' sobre 5' + (typeof lugar.ratingCount === 'number' ? ', ' + lugar.ratingCount.toLocaleString('es-AR') + ' reseñas' : '') + '">' + Formato.escapeHTML(ratingTxt) + '</span>' : '') +
        (distanciaTxt ? '<span class="tarjeta-distancia" aria-label="A ' + Formato.escapeHTML(distanciaTxt) + ' de tu ubicación">📍 ' + Formato.escapeHTML(distanciaTxt) + '</span>' : '') +
        badgeMejorRating + badgeMasCercano + '</div>' +
        // Fase 4, Cap. 6 "Apertura de ficha": "El elemento de origen (la
        // tarjeta tocada) se convierte visualmente en el encabezado de
        // la ficha — continuidad de forma, no un salto a una pantalla
        // nueva y ajena". Con las fichas como páginas estáticas propias
        // (no una SPA), el único puente real disponible sin reescribir
        // la navegación es View Transitions cross-document (progresivo:
        // sin soporte, navega igual que siempre — cero riesgo de
        // regresión). El nombre usa el mismo slug que ya resuelve el
        // href de "ver ficha" (ver locales/ficha.js, mismo criterio de
        // apareo del otro lado).
        '<h3 class="tarjeta-nombre"' + (slugLugar ? ' style="view-transition-name:vt-titulo-' + slugLugar + '"' : '') + '>' + Formato.escapeHTML(lugar.nombre) + '</h3>' +
        (miniTexto
          ? '<div class="tarjeta-mini' + (miniEsGenerica ? ' tarjeta-mini--generica' : '') + '">' + Formato.escapeHTML(miniTexto) + '</div>'
          : '<div class="tarjeta-direccion">' + (lugar.direccion ? Formato.escapeHTML(lugar.direccion) : 'cargando dirección…') + '</div>') +
        (razonTxt ? '<div class="tarjeta-razon">' + Formato.escapeHTML(razonTxt) + '</div>' : '') +
        '<div class="tarjeta-acciones">' +
        (slugLugar ? '<a class="tarjeta-btn' + (primaria === 'ficha' ? ' tarjeta-btn--primaria' : '') + '" data-accion="aceptar" data-origen="' + opts.origen + '" href="locales/' + slugLugar + '/">ver ficha</a>' : '') +
        (linkMaps ? '<a class="tarjeta-btn tarjeta-btn--maps' + (primaria === 'maps' ? ' tarjeta-btn--primaria' : '') + '" data-accion="maps" href="' + linkMaps + '" target="_blank" rel="noopener" aria-label="Abrir en Google Maps">' + (primaria === 'maps' ? '📍 cómo llegar' : '📍 mapa') + '</a>' : '') +
        (linkTel ? '<a class="tarjeta-btn tarjeta-btn--tel' + (primaria === 'tel' ? ' tarjeta-btn--primaria' : '') + '" data-accion="llamar" href="' + linkTel + '" aria-label="Llamar">📞 llamar</a>' : '') +
        '<button class="tarjeta-btn tarjeta-btn--fav' + (favoritos[lugar.id] ? ' activo' : '') + '" type="button" data-accion="guardar" aria-pressed="' + (favoritos[lugar.id] ? 'true' : 'false') + '" aria-label="' + (favoritos[lugar.id] ? 'Quitar de guardados' : 'Guardar') + '">' + (favoritos[lugar.id] ? '★ guardado' : '☆ guardar') + '</button>' +
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
        '<button type="button" class="btn" data-accion="cargar-mas">Cargar ' + Math.min(restantes, K.TARJETAS_POR_PAGINA) + ' más</button>' +
        '<span class="paginacion-conteo">' + visible.length + ' de ' + lista.length + '</span>';
      DOM.panelDescubrimiento.appendChild(piePagina);
    } else if (opts.origen === 'iniciativa_propia' && opts.hayMasSugerencias) {
      // Fase 4 — Journey/UX (hallazgo "'Mostrar más' sigue siendo
      // paginación simple, no una nueva tanda con exclusión de lo ya
      // visto"): a diferencia del "cargar-mas" de arriba (que solo
      // revela más de una lista YA calculada), este botón dispara en
      // render() una llamada nueva al motor con `excluirIds` = todo lo
      // que esta tanda de recorte ya mostró (ver uiState.tandaRecorte).
      // Solo aparece cuando ya se ve el cupo completo de la tanda
      // actual (restantes === 0) Y el motor confirmó que evaluó más
      // candidatos que los que entregó — nunca se ofrece "más" si no
      // hay nada distinto para mostrar.
      var piePaginaTanda = document.createElement('div');
      piePaginaTanda.className = 'paginacion';
      piePaginaTanda.innerHTML =
        '<button type="button" class="btn" data-accion="mas-sugerencias-recorte">Ver más sugerencias</button>';
      DOM.panelDescubrimiento.appendChild(piePaginaTanda);
    }
  }

  global.AppTarjetas = {
    // Llamado una única vez por app.js, durante su propia
    // inicialización (idempotente a propósito, igual criterio que
    // AppTelemetria.configurar()).
    configurar: function (nuevoContexto) {
      contexto = nuevoContexto || null;
    },
    pintarEsqueleto: pintarEsqueleto,
    pintarTarjetas: pintarTarjetas
  };

})(window);

