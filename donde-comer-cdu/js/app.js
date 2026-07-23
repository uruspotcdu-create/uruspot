/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — app.js
   El mapa dejó de ser una capa aparte cargada por su cuenta: ahora es
   una vista más del mismo estado que alimenta las tarjetas. Región,
   recorte y presupuesto de exposición se calculan una sola vez por
   render() y de ahí se derivan tanto las tarjetas como los puntos que
   entran al mapa — nunca dos fuentes de verdad para "qué se muestra".

   ───────────────────────────────────────────────────────────────────
   Auditoría y evolución de esta pasada:

   BUGS REALES corregidos
   • Al borrar la búsqueda hasta dejar exactamente 1 carácter (ni
     ≥2 ni vacío), ninguna rama del `if` limpiaba
     `accionDirectaForzada` — quedaba pegado en "nombrada" desde una
     búsqueda anterior más larga. Ahora la condición cubre los dos
     casos con un solo `else`.
   • Tres mutaciones directas de `estado.sesion` (limpiar búsqueda,
     activar Curaduría desde "ver guardados", desactivarla al elegir
     un rubro) nunca llamaban `PLANO.guardarEstado(estado)` —
     inconsistente con el resto del archivo, que siempre persiste
     después de mutar. Se agregó el guardado que faltaba en los tres
     casos.
   • `ubicacionUsuario`, `cercaTuyoActivo`, `distanciaMetros` y
     `formatoDistancia` estaban completamente implementados pero sin
     ningún control que los disparara — el motor de "cerca de mí"
     existía pero no estaba enchufado a nada. Se completa la función:
     un botón (creado por JS, con detección de soporte de
     geolocalización) que activa el orden por cercanía y una insignia
     de distancia en cada tarjeta.
   • `DOM.mapaInfo` y `DOM.contadorCuraduria` se mostraban/ocultaban
     pero nunca tenían contenido — cajas vacías. Ahora informan
     "mostrando X de Y en el mapa" y la cantidad de guardados.

   RENDIMIENTO
   • Cada tecla en el buscador disparaba un render() completo sobre
     hasta 1.468 lugares. Se agrega un debounce corto (160ms): el
     estado se actualiza al instante, el render pesado se posterga.

   ACCESIBILIDAD
   • Chips de rubro con `aria-pressed` para comunicar su estado.
   • Región `aria-live="polite"` que anuncia cuántos resultados hay
     tras cada búsqueda/filtro, para quien no puede ver la grilla.
   • Stagger de tarjetas, ripple de botones y revelado al hacer
     scroll respetan `prefers-reduced-motion`.

   ROBUSTEZ
   • Si falla la carga inicial del catálogo, ahora hay un botón
     "Reintentar" en el propio mensaje de error.

   No se tocó ningún otro archivo: la superficie que usa este módulo
   (URU_PLANO, URU_EXPOSICION, URU_MAPA, URU_MOTOR_MAPA_RENDER,
   URU_LOCALES_SLUGS, URU_RUBROS_META) sigue siendo exactamente la
   misma.
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var CIUDAD = 'concepcion-del-uruguay';
  var PLANO = window.URU_PLANO;
  var EXPO = window.URU_EXPOSICION;
  var MAPA = window.URU_MAPA;

  function prefiereMovimientoReducido() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  var REGISTRO = [];
  var porId = Object.create(null);
  var estado = null;
  var consultaActual = '';
  var filtroRubroActivo = null; // grupo activo del índice "Por rubro", o null = todos
  var TARJETAS_POR_PAGINA = 8;
  var paginaTarjetas = 1; // cuántas páginas de TARJETAS_POR_PAGINA hay reveladas
  var ubicacionUsuario = null; // {lat,lng} — solo si el usuario lo pide y el navegador lo concede
  var cercaTuyoActivo = false;
  // Guía/Exploración recortan por defecto (ver render()); este flag es
  // el escape hatch manual pedido explícitamente: "ver catálogo
  // completo" siempre visible, nunca escondido detrás del recorte.
  var verCatalogoCompleto = false;
  var ultimaRamaRenderizada = null; // última rama visual mostrada ('curaduria' | 'buscador' | 'recorte:*'), usada por tickPermanencia() para evitar re-renders innecesarios
  var permanenciaTimer = null;
  var ultimaRegionRenderizada = '';
  var debounceBuscarId = null;

  var DOM = {};
  ['rolActual', 'inputBuscar', 'panelDescubrimiento', 'tituloRegion', 'subtituloRegion',
   'mapaTextura', 'mapaContainer', 'mapaHerramienta', 'mapaInfo', 'mapaLeyenda', 'contadorCuraduria', 'btnVerGuardados',
   'listaRubros', 'statLugares', 'statRubros', 'faqLista', 'estadoResultados', 'destacados', 'listaDestacados']
    .forEach(function (id) { DOM[id] = document.getElementById(id); });

  /* ── 1. Arranque de contexto ── */
  estado = PLANO.leerEstado(CIUDAD);
  estado = PLANO.registrarApertura(estado);
  PLANO.guardarEstado(estado);
  actualizarContadorGuardados(); // los favoritos no dependen del catálogo: se puede pintar de inmediato

  /* ── 2. Carga de datos ── */
  pintarEsqueleto();
  cargarCatalogo();

  // fetch con: (a) bypass de caché HTTP (evita quedarse pegado a una
  // respuesta 404 vieja que el navegador guardó justo después de un
  // deploy, mientras el CDN de GitHub Pages todavía propagaba el
  // archivo nuevo), y (b) validación explícita de status — antes,
  // un 404 devuelto por el CDN se intentaba leer igual como JSON,
  // tiraba un SyntaxError de parseo genérico y no quedaba rastro claro
  // de que en realidad era un 404 de red.
  function fetchJSON(url, intentosRestantes) {
    if (intentosRestantes === undefined) intentosRestantes = 2;
    return fetch(url, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) {
          var err = new Error('HTTP ' + r.status + ' al pedir ' + url);
          err.status = r.status;
          throw err;
        }
        return r.json();
      })
      .catch(function (err) {
        if (intentosRestantes > 0) {
          // Reintento corto: cubre el caso típico de CDN que todavía
          // no terminó de propagar el archivo tras un deploy reciente.
          return new Promise(function (resolve) { setTimeout(resolve, 800); })
            .then(function () { return fetchJSON(url, intentosRestantes - 1); });
        }
        throw err;
      });
  }

  function cargarCatalogo() {
    fetchJSON('lugares-core.json')
      .then(function (core) {
        REGISTRO = core.map(function (l) {
          var reg = {
            id: l.id, nombre: l.nombre, categoria: l.categoria, grupo: l.grupo,
            lat: l.lat, lng: l.lng, direccion: null, telefono: null, descripcion: null, estado: 'verificado',
            // rating/rating_count: auditoría Fase 4. split_dataset.py ya los
            // incluye en lugares-core.json como CORE_FIELDS_OPTIONAL,
            // documentados ahí mismo como pensados para un "spotlight mejor
            // puntuados" — pero ningún punto de este archivo los leía. Ver
            // pintarDestacados() más abajo, que es ese spotlight.
            rating: (typeof l.rating === 'number') ? l.rating : null,
            ratingCount: (typeof l.rating_count === 'number') ? l.rating_count : null
          };
          porId[l.id] = reg;
          return reg;
        });
        cargarDetallesEnSegundoPlano();
        pintarRubros();
        pintarStatsRapidas();
        pintarDestacados();
        render();
      })
      .catch(function (err) {
        console.error('No se pudo cargar lugares-core.json', err);
        if (DOM.panelDescubrimiento) {
          var detalle = err && err.message ? err.message : 'error desconocido';
          DOM.panelDescubrimiento.innerHTML =
            '<p class="vacio error" role="alert">No se pudo cargar la información. ' +
            '<button type="button" class="btn" data-accion="reintentar-carga">Reintentar</button>' +
            '<br><small>' + detalle.replace(/[<>]/g, '') + '</small></p>';
          var btnReintentar = DOM.panelDescubrimiento.querySelector('[data-accion="reintentar-carga"]');
          if (btnReintentar) {
            btnReintentar.addEventListener('click', function () {
              pintarEsqueleto();
              cargarCatalogo();
            });
          }
        }
      });
  }

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

  // Spotlight "Destacados" — auditoría Fase 4. Independiente de
  // Guía/Exploración/Curaduría: no consume ni modifica PLANO/EXPO, no
  // depende de ubicación ni de sesión. Selección:
  //   1. Candidatos: rating >= UMBRAL_RATING y rating_count >=
  //      UMBRAL_RESEÑAS (evita que un 5.0 con una sola reseña opaque
  //      a un 4.8 con cientos — señal real, no ruido).
  //   2. Score = rating + log10(rating_count)/10: desempata a favor
  //      de más reseñas sin que el conteo domine sobre la puntuación.
  //   3. Diversidad: máximo 1 lugar por rubro entre los elegidos —
  //      sin este límite, gastronomía (el grupo con más candidatos,
  //      ver auditoría de datos) ocuparía el strip entero.
  //   4. Rotación diaria determinística (semilla = día del año): el
  //      spotlight cambia de un día a otro sin ser aleatorio dentro
  //      del mismo día — mismo lugar si recargás la página, distinto
  //      mañana. Dentro de "candidatos ya filtrados", no altera CUÁLES
  //      calificaron, solo el orden de desempate entre los que superan
  //      el piso de diversidad.
  var UMBRAL_RATING = 4.6;
  var UMBRAL_RESEÑAS = 15;
  var MAX_DESTACADOS = 6;
  var MIN_PARA_MOSTRAR = 3; // por debajo de esto, la sección queda oculta — no forzamos relleno

  function pintarDestacados() {
    if (!DOM.destacados || !DOM.listaDestacados) return;

    var candidatos = REGISTRO.filter(function (l) {
      return typeof l.rating === 'number' && l.rating >= UMBRAL_RATING &&
             typeof l.ratingCount === 'number' && l.ratingCount >= UMBRAL_RESEÑAS;
    });

    if (candidatos.length < MIN_PARA_MOSTRAR) {
      DOM.destacados.hidden = true;
      return;
    }

    var diaDelAnio = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
    var seed = diaDelAnio;
    function pseudoRandom(n) {
      var x = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453;
      return x - Math.floor(x);
    }

    candidatos.forEach(function (l, i) {
      var score = l.rating + Math.log(l.ratingCount) / Math.LN10 / 10;
      l._scoreDestacado = score + pseudoRandom(i) * 0.05; // ruido mínimo: desempata sin reordenar el ranking real
    });
    candidatos.sort(function (a, b) { return b._scoreDestacado - a._scoreDestacado; });

    var elegidos = [];
    var rubrosUsados = Object.create(null);
    candidatos.forEach(function (l) {
      if (elegidos.length >= MAX_DESTACADOS) return;
      if (rubrosUsados[l.grupo]) return;
      rubrosUsados[l.grupo] = true;
      elegidos.push(l);
    });
    // Si la diversidad por rubro dejó el strip corto (poca variedad de
    // categorías entre los candidatos), se completa con el resto del
    // ranking real, sin inventar candidatos nuevos.
    if (elegidos.length < Math.min(MAX_DESTACADOS, candidatos.length)) {
      candidatos.forEach(function (l) {
        if (elegidos.length >= MAX_DESTACADOS) return;
        if (elegidos.indexOf(l) !== -1) return;
        elegidos.push(l);
      });
    }

    var frag = document.createDocumentFragment();
    elegidos.forEach(function (lugar) {
      var metaRubro = window.URU_RUBROS_META && window.URU_RUBROS_META[lugar.grupo];
      var rubro = metaRubro ? metaRubro[0] : lugar.categoria;
      var slugLugar = slug(lugar);
      var linkMaps = mapsHref(lugar);
      var href = slugLugar ? ('locales/' + slugLugar + '/') : linkMaps;
      var card = document.createElement(href ? 'a' : 'div');
      card.className = 'destacado-card';
      card.setAttribute('role', 'listitem');
      if (href) {
        card.href = href;
        if (!slugLugar) { card.target = '_blank'; card.rel = 'noopener'; }
      }
      if (metaRubro) card.style.setProperty('--chip-color', metaRubro[2]);
      card.innerHTML =
        '<div class="destacado-card__rubro">' + escapeHTML(rubro) + '</div>' +
        '<div class="destacado-card__nombre">' + escapeHTML(lugar.nombre) + '</div>' +
        '<div class="destacado-card__rating">★ ' + lugar.rating.toFixed(1).replace('.', ',') +
          '<span class="destacado-card__conteo">(' + lugar.ratingCount.toLocaleString('es-AR') + ')</span></div>';
      frag.appendChild(card);
    });
    DOM.listaDestacados.innerHTML = '';
    DOM.listaDestacados.appendChild(frag);
    DOM.destacados.hidden = false;
  }

  function cargarDetallesEnSegundoPlano() {
    var lanzar = function () {
      fetchJSON('lugares-detalles.json').then(function (det) {
        det.forEach(function (d) {
          var reg = porId[d.id];
          if (reg) { reg.direccion = d.direccion || null; reg.telefono = d.telefono || null; reg.descripcion = d.descripcion || null; }
        });
        render();
      }).catch(function (e) { console.warn('lugares-detalles.json no disponible', e); });

      fetchJSON('lugares-estado.json').then(function (mapa) {
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
      // Antes: solo se limpiaba accionDirectaForzada cuando la caja
      // quedaba totalmente vacía. Si el usuario borraba hasta dejar
      // exactamente 1 carácter, no entraba en ninguna de las dos
      // ramas y el estado de "búsqueda forzada" de una consulta
      // anterior más larga quedaba pegado. Un solo if/else que cubre
      // ambos casos (0 o 1 carácter = "no hay búsqueda real") evita
      // el hueco.
      if (consultaActual.trim().length >= 2) {
        estado = PLANO.aplicarAccion(estado, 'nombrar', { consulta: consultaActual });
      } else {
        estado.sesion.accionDirectaForzada = null;
      }
      PLANO.guardarEstado(estado);
      // El render es la parte cara (filtra hasta ~1.400 lugares,
      // reconstruye tarjetas y mapa): se posterga un poco para no
      // repetirlo en cada tecla de una tipeada rápida. El estado en
      // sí (arriba) se persiste de inmediato, sin esperar.
      clearTimeout(debounceBuscarId);
      debounceBuscarId = setTimeout(render, 160);
    });
  }

  // Helper compartido: una tarjeta que va a desaparecer de la grilla
  // (rechazada, o des-guardada mientras se está viendo "tus
  // guardados") primero recibe su transición de salida real
  // (opacity/transform, CSS) y recién cuando esa transición termina
  // se dispara el render() que reconstruye todo el panel. Evita que
  // el propio render() destruya el elemento en el mismo tick en que
  // se le pidió que se animara — el bug que hacía que "no me
  // interesa" (y, con el fix de abajo, "quitar de guardados") se
  // sintieran como un salto brusco en vez de un gesto con feedback.
  function programarRenderTrasSalida(carta) {
    if (prefiereMovimientoReducido()) { render(); return; }
    carta.classList.add('descartada');
    var yaRenderizo = false;
    var terminar = function () {
      if (yaRenderizo) return;
      yaRenderizo = true;
      render();
    };
    carta.addEventListener('transitionend', terminar, { once: true });
    setTimeout(terminar, 260); // red de seguridad si transitionend no dispara
  }

  if (DOM.panelDescubrimiento) {
    DOM.panelDescubrimiento.addEventListener('click', function (e) {
      var btnAceptar = e.target.closest('[data-accion="aceptar"]');
      var btnRechazar = e.target.closest('[data-accion="rechazar"]');
      var btnGuardar = e.target.closest('[data-accion="guardar"]');
      var btnCompartir = e.target.closest('[data-accion="compartir"]');
      var btnCargarMas = e.target.closest('[data-accion="cargar-mas"]');
      var btnLimpiarBusqueda = e.target.closest('[data-accion="limpiar-busqueda"]');
      var btnLimpiarFiltroRubro = e.target.closest('[data-accion="limpiar-filtro-rubro"]');
      var carta0 = e.target.closest('[data-lugar-id]');

      if (btnLimpiarBusqueda) {
        consultaActual = '';
        if (DOM.inputBuscar) DOM.inputBuscar.value = '';
        estado.sesion.accionDirectaForzada = null;
        PLANO.guardarEstado(estado);
        render();
        return;
      }
      if (btnLimpiarFiltroRubro) {
        filtroRubroActivo = null;
        pintarRubros(); // los chips deben reflejar que ya ninguno quedó activo
        render();
        return;
      }

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
        var grupo1 = porId[id1] ? porId[id1].grupo : undefined;
        estado = PLANO.aplicarAccion(estado, 'aceptar', { lugarId: id1, porIniciativaPropia: porIniciativa, grupo: grupo1 });
        PLANO.guardarEstado(estado);
        return;
      }
      if (btnRechazar) {
        var carta = btnRechazar.closest('[data-lugar-id]');
        var id2 = carta.dataset.lugarId;
        var grupo = porId[id2] ? porId[id2].grupo : 'sin_rubro';
        estado = PLANO.aplicarAccion(estado, 'rechazar', { grupo: grupo });
        PLANO.guardarEstado(estado);
        // BUG REAL corregido: `render()` se llamaba en el mismo tick
        // en el que se agregaba la clase 'descartada', destruyendo la
        // tarjeta (pintarTarjetas hace innerHTML='') antes de que el
        // navegador llegara a pintar un solo frame con la transición
        // opacity/transform en curso (definida en tarjeta-lugar.css).
        // El click "no me interesa" saltaba directo al resultado
        // final sin ningún feedback visual — se sentía brusco/roto,
        // como si el click no hubiera hecho nada hasta que de golpe
        // la tarjeta ya no estaba.
        programarRenderTrasSalida(carta);
        return;
      }
      if (btnGuardar) {
        var carta2 = btnGuardar.closest('[data-lugar-id]');
        var id3 = carta2.dataset.lugarId;
        var favoritos = leerFavoritos();
        favoritos[id3] = !favoritos[id3];
        guardarFavoritos(favoritos);
        // BUG REAL corregido: antes se llamaba a la acción 'guardar'
        // sin importar si este click acababa de GUARDAR o de QUITAR
        // el favorito — ver motor-plano.js. Ahora se informa el
        // sentido real (`guardado: true/false`), así "quitar" nunca
        // cuenta para el disparador que activa la vista de guardados.
        var quedoGuardado = !!favoritos[id3];
        estado = PLANO.aplicarAccion(estado, 'guardar', { lugarId: id3, guardado: quedoGuardado });
        PLANO.guardarEstado(estado);
        btnGuardar.classList.toggle('activo', quedoGuardado);
        btnGuardar.setAttribute('aria-pressed', String(quedoGuardado));
        btnGuardar.setAttribute('aria-label', quedoGuardado ? 'Quitar de guardados' : 'Guardar');
        btnGuardar.textContent = quedoGuardado ? '★ guardado' : '☆ guardar';
        actualizarContadorGuardados();
        // BUG REAL corregido (auditoría Fase 3): esto llamaba render()
        // completo en TODO caso, incluso fuera de "Tus guardados" —
        // donde guardar/quitar un favorito no cambia qué tarjetas
        // corresponde mostrar, solo el ícono de esta tarjeta puntual.
        // Reconstruir la grilla entera (innerHTML='' + recrear cada
        // nodo + reiniciar el stagger de TODAS las tarjetas visibles)
        // por un toggle de ícono era trabajo de layout innecesario en
        // la acción más frecuente y de menor riesgo de toda la
        // interfaz, y además rompía el principio de motion "esto pasó
        // → esto es la consecuencia": el usuario tocaba una estrella y
        // la pantalla entera se reconstruía. Solo hace falta
        // reconstruir cuando la tarjeta debe DESAPARECER de la lista
        // actual — es decir, al quitar un guardado mientras se está
        // viendo "Tus guardados" — reusando el mismo patrón de salida
        // con transición que ya usa "no me interesa".
        if (estado.sesion.curaduriaActiva && !quedoGuardado) {
          programarRenderTrasSalida(carta2);
        }
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
      PLANO.guardarEstado(estado);
      pintarRubros();
      render();
      if (DOM.tituloRegion) DOM.tituloRegion.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  if (DOM.btnVerGuardados) {
    DOM.btnVerGuardados.addEventListener('click', function () {
      estado.sesion.curaduriaActiva = true;
      PLANO.guardarEstado(estado);
      paginaTarjetas = 1;
      render();
      // Foco al título de la nueva vista: quien navega con lector de
      // pantalla o teclado necesita una señal explícita de que el
      // contenido cambió por completo, no solo el texto silencioso.
      if (DOM.tituloRegion) { DOM.tituloRegion.setAttribute('tabindex', '-1'); DOM.tituloRegion.focus({ preventScroll: false }); }
    });
  }

  // Banner discreto para "guardaste 2+ lugares": reemplaza el redirect
  // duro que existía antes (guardar 2x te sacaba de golpe a "Tu
  // lista" sin avisar). Ahora solo un click explícito (acá o en
  // btnVerGuardados) activa curaduriaActiva de verdad — ver
  // motor-plano.js: Acciones.guardar ya no toca curaduriaActiva,
  // solo curaduriaSugerida.
  var bannerCuraduria = null;
  function asegurarBannerCuraduria() {
    if (bannerCuraduria || !DOM.panelDescubrimiento || !DOM.panelDescubrimiento.parentNode) return;
    bannerCuraduria = document.createElement('div');
    bannerCuraduria.className = 'mapa-info'; // reutiliza el componente de aviso ya existente (mapa.css)
    bannerCuraduria.setAttribute('role', 'status');
    bannerCuraduria.hidden = true;
    var texto = document.createElement('span');
    texto.textContent = 'Armaste el comienzo de una lista. ';
    var btnIr = document.createElement('button');
    btnIr.type = 'button';
    btnIr.className = 'btn btn--activo';
    btnIr.textContent = 'Ver tus guardados';
    btnIr.addEventListener('click', function () {
      estado.sesion.curaduriaActiva = true;
      estado.sesion.curaduriaSugerida = false;
      PLANO.guardarEstado(estado);
      paginaTarjetas = 1;
      render();
    });
    var btnCerrar = document.createElement('button');
    btnCerrar.type = 'button';
    btnCerrar.className = 'btn btn--icono';
    btnCerrar.setAttribute('aria-label', 'Descartar aviso');
    btnCerrar.textContent = '✕';
    btnCerrar.addEventListener('click', function () {
      estado.sesion.curaduriaSugerida = false;
      PLANO.guardarEstado(estado);
      bannerCuraduria.hidden = true;
    });
    bannerCuraduria.appendChild(texto);
    bannerCuraduria.appendChild(btnIr);
    bannerCuraduria.appendChild(btnCerrar);
    DOM.panelDescubrimiento.parentNode.insertBefore(bannerCuraduria, DOM.panelDescubrimiento);
  }

  function actualizarBannerCuraduriaSugerida(reg) {
    var debeMostrar = reg.nombre !== 'curaduria' && !!estado.sesion.curaduriaSugerida;
    if (!debeMostrar) { if (bannerCuraduria) bannerCuraduria.hidden = true; return; }
    asegurarBannerCuraduria();
    if (bannerCuraduria) bannerCuraduria.hidden = false;
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

  // Antes: DOM.contadorCuraduria se buscaba en el DOM pero nunca se
  // le asignaba contenido — una caja vacía. Ahora refleja cuántos
  // lugares hay guardados, y se oculta sola si no hay ninguno.
  function actualizarContadorGuardados() {
    if (!DOM.contadorCuraduria) return;
    var favoritos = leerFavoritos();
    var cantidad = Object.keys(favoritos).filter(function (id) { return favoritos[id]; }).length;
    DOM.contadorCuraduria.textContent = cantidad ? String(cantidad) : '';
    DOM.contadorCuraduria.hidden = cantidad === 0;
  }

  /* ── 5. Render por región ──
     Una sola lista por región alimenta tarjetas y mapa: así se
     garantiza que nunca puedan mostrar conjuntos distintos.        */

  // Devuelve el catálogo acotado únicamente por lo que el usuario pide
  // de forma explícita: búsqueda y/o rubro elegido en "Por rubro".
  // Esta es la rama BUSCADOR — nunca recorta, la búsqueda explícita
  // tiene prioridad máxima sobre cualquier heurística del plano.
  function listaPorAccionExplicita() {
    var lista = EXPO.resultadosPorAccionExplicita(REGISTRO, consultaActual);
    if (filtroRubroActivo) {
      lista = lista.filter(function (l) { return l.grupo === filtroRubroActivo; });
    }
    return lista;
  }

  function hayBusquedaOFiltro() {
    return consultaActual.trim().length > 0 || !!filtroRubroActivo;
  }

  // Fuente única de verdad de "qué rama visual corresponde mostrar".
  // Antes esta decisión estaba escrita dos veces —una en render(), otra
  // como `esRecorteReal` dentro de actualizarCabecera()— con el riesgo
  // real de que una cambiara sin la otra y la cabecera dijera una cosa
  // mientras el panel mostraba otra. También es la pieza que faltaba
  // para que tickPermanencia() sepa si de verdad hace falta re-
  // renderizar: antes comparaba solo PLANO.region(estado).nombre, que
  // puede cambiar (guia→exploracion) sin que la rama visible cambie
  // (p. ej. con un filtro de rubro activo, que ya fuerza "buscador" en
  // los dos casos) — disparaba un render completo (DOM + mapa) sin que
  // hubiera nada distinto que mostrar. Verificado con evidencia
  // ejecutable antes de este cambio.
  function ramaActual(reg) {
    if (reg.nombre === 'curaduria') return 'curaduria';
    if (reg.nombre === 'accionDirecta' || hayBusquedaOFiltro() || verCatalogoCompleto) return 'buscador';
    return 'recorte:' + reg.nombre; // 'recorte:guia' vs 'recorte:exploracion' — tamaños distintos, hay que distinguirlos
  }

  function render() {
    if (!REGISTRO.length || !DOM.panelDescubrimiento) return;

    var favoritos = leerFavoritos();
    var reg = PLANO.region(estado);
    var rama = ramaActual(reg);
    ultimaRamaRenderizada = rama;

    actualizarCabecera(reg, rama);
    actualizarMapaTextura();
    actualizarBannerCuraduriaSugerida(reg);

    var lista, opts;
    if (rama === 'curaduria') {
      var idsGuardados = Object.keys(favoritos).filter(function (id) { return favoritos[id]; });
      lista = EXPO.coleccionCurada(REGISTRO, idsGuardados);
      lista = ordenarPorCercania(lista);
      opts = { origen: 'accion_explicita', narrativa: false, vacioTexto: 'Todavía no guardaste nada. Guardá un lugar y aparece acá.' };
    } else if (rama === 'buscador') {
      // BUSCADOR: quien nombró lo que quiere (o filtró/buscó, aunque
      // el plano todavía no cruzó el umbral) o pidió "ver catálogo
      // completo" nunca se topa con un recorte — prioridad máxima de
      // lo explícito sobre lo inferido.
      lista = listaPorAccionExplicita();
      lista = ordenarPorCercania(lista);
      opts = { origen: 'accion_explicita', narrativa: false };
    } else {
      // GUÍA / EXPLORACIÓN reales: recorte por presupuesto de
      // exposición (motor-config.js), evitando rubros con patrón
      // estable de rechazo y rotando 72h los ya aceptados por
      // iniciativa propia. El catálogo completo sigue a un click de
      // distancia — ver botón "ver catálogo completo" en actualizarCabecera().
      lista = EXPO.recortePorIniciativaPropia(REGISTRO, estado, reg.nombre);
      lista = ordenarPorCercania(lista);
      opts = { origen: 'iniciativa_propia', narrativa: false };
    }
    pintarTarjetas(lista, favoritos, opts);
    actualizarMapaHerramienta(reg.nombre, lista || []);
  }

  // Completa la funcionalidad de "cerca de mí": ya existían
  // distanciaMetros/formatoDistancia listos, pero nada los llamaba.
  // Orden estable (no reordena si no hay ubicación) y sin distorsión:
  // los lugares sin coordenadas se van al final en vez de romper el
  // orden o desaparecer.
  // BUG DE CLARIDAD corregido (auditoría Fase 3): activar "cerca de
  // mí" reordena las tarjetas y ya muestra la distancia en cada una
  // (Fase 2), pero ningún texto de cabecera confirmaba que el orden
  // había cambiado — alguien que no mira con atención cada tarjeta
  // podía no notar el reordenamiento, y para un lector de pantalla
  // (que no "ve" el nuevo orden) era información invisible.
  function sufijoCercania() {
    return (cercaTuyoActivo && ubicacionUsuario) ? ' Ordenado por cercanía.' : '';
  }

  function ordenarPorCercania(lista) {
    if (!cercaTuyoActivo || !ubicacionUsuario) return lista;
    return lista.slice().sort(function (a, b) {
      var da = (typeof a.lat === 'number' && typeof a.lng === 'number')
        ? distanciaMetros(ubicacionUsuario.lat, ubicacionUsuario.lng, a.lat, a.lng) : Infinity;
      var db = (typeof b.lat === 'number' && typeof b.lng === 'number')
        ? distanciaMetros(ubicacionUsuario.lat, ubicacionUsuario.lng, b.lat, b.lng) : Infinity;
      return da - db;
    });
  }

  // Botón "ver catálogo completo": creado por JS (mismo criterio que
  // "cerca de mí" — progressive enhancement, no toca el HTML), visible
  // únicamente cuando hay un recorte real activo (Guía/Exploración sin
  // búsqueda/filtro). Escape hatch pedido explícitamente: el recorte
  // nunca puede ser la única forma de llegar al padrón completo.
  var btnVerCatalogoCompleto = null;
  function asegurarBotonVerCatalogoCompleto() {
    if (btnVerCatalogoCompleto || !DOM.subtituloRegion || !DOM.subtituloRegion.parentNode) return;
    btnVerCatalogoCompleto = document.createElement('button');
    btnVerCatalogoCompleto.type = 'button';
    btnVerCatalogoCompleto.className = 'btn btn--link-volver';
    btnVerCatalogoCompleto.addEventListener('click', function () {
      verCatalogoCompleto = !verCatalogoCompleto;
      paginaTarjetas = 1;
      render();
    });
    DOM.subtituloRegion.insertAdjacentElement('afterend', btnVerCatalogoCompleto);
  }

  // "Volver a todos": escape hatch de la vista "tu lista" (curaduría).
  // Mismo criterio que btnVerCatalogoCompleto de arriba — creado por JS
  // en vez de vivir en el HTML, porque solo tiene sentido una vez que
  // hay JS corriendo y estado de curaduría activo. Bug real encontrado
  // en auditoría: este botón se esperaba por `id="btnVolverATodos"`
  // en el HTML (con addEventListener y toggles de .hidden ya escritos
  // más abajo) pero ese elemento nunca existió en ningún punto del
  // documento — `DOM.btnVolverATodos` era siempre `null`, así que
  // entrar a "tu lista" no dejaba ninguna forma de volver a todos los
  // lugares. Se resuelve con el mismo patrón de creación dinámica que
  // ya usa el archivo, en vez de volver a tocar el contrato HTML↔JS.
  var btnVolverATodos = null;
  function asegurarBotonVolverATodos() {
    if (btnVolverATodos || !DOM.subtituloRegion || !DOM.subtituloRegion.parentNode) return;
    btnVolverATodos = document.createElement('button');
    btnVolverATodos.type = 'button';
    btnVolverATodos.className = 'btn btn--link-volver';
    btnVolverATodos.textContent = '← Ver todos los lugares';
    btnVolverATodos.hidden = true;
    btnVolverATodos.addEventListener('click', function () {
      estado.sesion.curaduriaActiva = false;
      PLANO.guardarEstado(estado);
      paginaTarjetas = 1;
      render();
      if (DOM.tituloRegion) { DOM.tituloRegion.setAttribute('tabindex', '-1'); DOM.tituloRegion.focus({ preventScroll: false }); }
    });
    DOM.subtituloRegion.insertAdjacentElement('afterend', btnVolverATodos);
  }

  function actualizarCabecera(reg) {
    if (DOM.rolActual) {
      var rol = PLANO.rolPorAperturas(estado.aperturas);
      var NOMBRES = { anfitrion: 'Recién llegado', conocido: 'Conocido', complice: 'Cómplice', casa: 'Casa' };
      DOM.rolActual.textContent = NOMBRES[rol];
    }
    if (!DOM.tituloRegion || !DOM.subtituloRegion) return;

    if (btnVerCatalogoCompleto) btnVerCatalogoCompleto.hidden = true;
    asegurarBotonVolverATodos();

    if (reg.nombre === 'curaduria') {
      DOM.tituloRegion.textContent = 'Tu lista';
      DOM.subtituloRegion.textContent = 'Lo que guardaste, sin recorte ni rotación.' + sufijoCercania();
      if (btnVolverATodos) btnVolverATodos.hidden = false;
      return;
    }
    if (btnVolverATodos) btnVolverATodos.hidden = true;

    var rubroMeta = filtroRubroActivo && window.URU_RUBROS_META ? window.URU_RUBROS_META[filtroRubroActivo] : null;

    var esRecorteReal = (reg.nombre === 'guia' || reg.nombre === 'exploracion') && !hayBusquedaOFiltro() && !verCatalogoCompleto;

    // BUSCADOR: hay búsqueda, filtro, o el usuario ya pidió ver todo.
    if (!esRecorteReal) {
      if (consultaActual.trim()) {
        DOM.tituloRegion.textContent = 'Resultados';
        DOM.subtituloRegion.textContent = (rubroMeta
          ? 'Coincidencias con "' + consultaActual.trim() + '" en ' + rubroMeta[0] + '.'
          : 'Esto es lo que coincide con lo que escribiste.') + sufijoCercania();
      } else if (rubroMeta) {
        DOM.tituloRegion.textContent = rubroMeta[0];
        DOM.subtituloRegion.textContent = 'Todos los lugares verificados de este rubro.' + sufijoCercania();
      } else {
        DOM.tituloRegion.textContent = 'Todos los lugares';
        DOM.subtituloRegion.textContent = 'El padrón completo (' + REGISTRO.length + ' lugares).' + sufijoCercania();
      }
      // "Volver a lo sugerido" solo tiene sentido si estamos viendo
      // todo por el override manual (no porque haya una búsqueda o
      // filtro real de por medio — ahí no hay "sugerido" al que volver).
      if (verCatalogoCompleto && !hayBusquedaOFiltro() && reg.nombre !== 'accionDirecta') {
        asegurarBotonVerCatalogoCompleto();
        if (btnVerCatalogoCompleto) {
          btnVerCatalogoCompleto.textContent = '← Volver a lo sugerido';
          btnVerCatalogoCompleto.hidden = false;
        }
      }
      return;
    }

    // GUÍA / EXPLORACIÓN reales: copy distinta porque el contenido
    // ahora sí es distinto (recorte de 4 u 8 lugares, no el padrón
    // entero) — antes estas dos ramas eran cosméticamente idénticas.
    asegurarBotonVerCatalogoCompleto();
    if (btnVerCatalogoCompleto) {
      btnVerCatalogoCompleto.textContent = 'Ver catálogo completo →';
      btnVerCatalogoCompleto.hidden = false;
    }
    if (reg.nombre === 'guia') {
      DOM.tituloRegion.textContent = 'Para arrancar';
      DOM.subtituloRegion.textContent = 'Una selección chica para no abrumar. Guardá o descartá para afinarla.' + sufijoCercania();
    } else {
      DOM.tituloRegion.textContent = 'Para explorar';
      DOM.subtituloRegion.textContent = 'Más variedad para curiosear. Buscá si ya sabés qué querés.' + sufijoCercania();
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
      // aria-pressed: sin esto, un lector de pantalla no tenía forma
      // de saber que el chip es un botón de estado (activo/inactivo),
      // solo que es un botón — perdía la mitad de la información que
      // el color y la clase "chip--activo" ya comunican visualmente.
      // El ícono es puramente decorativo acá (aria-hidden, dentro del
      // helper): el nombre del rubro sigue siendo texto real en el
      // botón, así que un lector de pantalla no pierde nada si el
      // ícono faltara. El color se lo da la CSS var --chip-color que
      // el botón ya declara, no un atributo fijo — así el ícono
      // hereda el mismo cambio de color que el estado :hover/activo.
      var icono = window.URU_RUBROS_ICONO_SVG ? window.URU_RUBROS_ICONO_SVG(k, { tam: 15 }) : '';
      return '<button type="button" class="chip' + (activo ? ' chip--activo' : '') + '" data-rubro="' + k + '" aria-pressed="' + activo + '" style="--chip-color:' + meta[2] + '">' +
        icono +
        escapeHTML(meta[0]) + '<span class="chip__conteo">' + conteo[k] + '</span>' +
        '</button>';
    }).join('');
  }

  // Región viva para lectores de pantalla: anuncia cuántos resultados
  // quedaron tras buscar o filtrar, sin que haga falta "mirar" la
  // grilla de tarjetas para saberlo. Oculta visualmente (clip a 1px)
  // pero presente para tecnología de asistencia — sin depender de
  // ninguna clase CSS del proyecto que no podemos verificar desde
  // este archivo.
  // BUG REAL corregido (auditoría Fase 3): esta función creaba su
  // PROPIA región aria-live con estilos inline, duplicando exactamente
  // lo que #estadoResultados ya hace en index.html (mismo role="status"
  // aria-live="polite", misma técnica de ocultamiento que .u-sr-only
  // ya resuelve en CSS) — pero #estadoResultados nunca estaba en la
  // lista DOM de arriba, así que quedaba huérfano en el HTML mientras
  // este archivo creaba un nodo nuevo en cada carga. Se usa el hook
  // real; cero nodos nuevos, cero estilos inline.

  function pintarTarjetas(lista, favoritos, opts) {
    DOM.panelDescubrimiento.innerHTML = '';
    if (DOM.estadoResultados) {
      DOM.estadoResultados.textContent = lista.length
        ? (lista.length + ' resultado' + (lista.length === 1 ? '' : 's') + ' encontrado' + (lista.length === 1 ? '' : 's') + '.')
        : 'Sin resultados.';
    }
    if (!lista.length) {
      var tieneBusqueda = consultaActual.trim().length > 0;
      var tieneFiltroRubro = !!filtroRubroActivo;
      var acciones = '';
      if (tieneBusqueda) {
        acciones += '<button type="button" class="btn" data-accion="limpiar-busqueda">Limpiar búsqueda</button>';
      }
      if (tieneFiltroRubro) {
        var metaFiltro = window.URU_RUBROS_META && window.URU_RUBROS_META[filtroRubroActivo];
        acciones += '<button type="button" class="btn" data-accion="limpiar-filtro-rubro">' +
          (metaFiltro ? 'Salir de "' + escapeHTML(metaFiltro[0]) + '"' : 'Ver todos los rubros') + '</button>';
      }
      DOM.panelDescubrimiento.innerHTML =
        '<div class="vacio">' +
          '<p>' + (opts.vacioTexto || 'No encontramos lugares con esos criterios.') + '</p>' +
          (acciones ? '<div class="vacio-acciones">' + acciones + '</div>' : '') +
        '</div>';
      return;
    }
    var limite = TARJETAS_POR_PAGINA * paginaTarjetas;
    var visible = lista.slice(0, limite);
    var restantes = lista.length - visible.length;
    var movimientoReducido = prefiereMovimientoReducido();

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
      // Se omite por completo si el usuario pidió menos movimiento.
      if (!movimientoReducido) {
        art.style.animationDelay = (Math.min(i, 24) * 0.03) + 's';
      }
      var linkMaps = mapsHref(lugar);
      var linkTel = lugar.telefono ? 'tel:' + lugar.telefono.replace(/[^\d+]/g, '') : null;
      var slugLugar = slug(lugar);
      // Jerarquía real de acciones (auditoría Fase 3): con ficha propia
      // en menos del 4% del padrón (ver locales-slug.js), "ver ficha"
      // no puede ser LA acción primaria de la tarjeta en general — para
      // la enorme mayoría sin ficha, la acción con más valor real es
      // "cómo llegar" (garantizada: todo registro trae lat/lng desde
      // lugares-core.json). Se calcula una sola vez qué botón es
      // primario en ESTA tarjeta puntual, en vez de que las 5-6
      // acciones compitan visualmente por la misma atención.
      var primaria = slugLugar ? 'ficha' : (linkMaps ? 'maps' : (linkTel ? 'tel' : null));
      // Mini-línea: descripción real del lugar si la tenemos; si no,
      // un genérico "grupo · categoría" (nunca una frase inventada
      // sobre el negocio en sí, como "no acepta turnos" o similar).
      var miniTexto = lugar.descripcion ||
        (lugar.categoria && rubro !== lugar.categoria ? rubro + ' · ' + lugar.categoria : lugar.categoria || rubro);
      var miniEsGenerica = !lugar.descripcion;
      var distanciaTxt = (cercaTuyoActivo && ubicacionUsuario && typeof lugar.lat === 'number' && typeof lugar.lng === 'number')
        ? formatoDistancia(distanciaMetros(ubicacionUsuario.lat, ubicacionUsuario.lng, lugar.lat, lugar.lng))
        : null;
      // BUG REAL (auditoría Fase 3): cargarDetallesEnSegundoPlano() ya
      // calcula lugar.estado ('verificado'/'pendiente') desde
      // lugares-estado.json hace tiempo, pero ningún punto del archivo
      // lo leía — se computaba y se descartaba. Es exactamente el tipo
      // de dato real que refuerza la promesa central del producto
      // ("caminado y verificado") en el punto de decisión, no solo en
      // el stat del hero. Se muestra únicamente para la minoría
      // 'pendiente' (transparencia sin diluir la mayoría ya verificada).
      var pendienteTxt = lugar.estado === 'pendiente' ? '<span class="tarjeta-pendiente">en revisión</span>' : '';
      art.innerHTML =
        '<div class="tarjeta-rubro">' + escapeHTML(rubro) + pendienteTxt + (distanciaTxt ? '<span class="tarjeta-distancia">📍 ' + escapeHTML(distanciaTxt) + '</span>' : '') + '</div>' +
        '<h3 class="tarjeta-nombre">' + escapeHTML(lugar.nombre) + '</h3>' +
        (miniTexto
          ? '<div class="tarjeta-mini' + (miniEsGenerica ? ' tarjeta-mini--generica' : '') + '">' + escapeHTML(miniTexto) + '</div>'
          : '<div class="tarjeta-direccion">' + (lugar.direccion ? escapeHTML(lugar.direccion) : 'cargando dirección…') + '</div>') +
        '<div class="tarjeta-acciones">' +
          (slugLugar ? '<a class="tarjeta-btn' + (primaria === 'ficha' ? ' tarjeta-btn--primaria' : '') + '" data-accion="aceptar" data-origen="' + opts.origen + '" href="locales/' + slugLugar + '/">ver ficha</a>' : '') +
          (linkMaps ? '<a class="tarjeta-btn tarjeta-btn--maps' + (primaria === 'maps' ? ' tarjeta-btn--primaria' : '') + '" data-accion="maps" href="' + linkMaps + '" target="_blank" rel="noopener" aria-label="Abrir en Google Maps">' + (primaria === 'maps' ? '📍 cómo llegar' : '📍 mapa') + '</a>' : '') +
          (linkTel ? '<a class="tarjeta-btn tarjeta-btn--tel' + (primaria === 'tel' ? ' tarjeta-btn--primaria' : '') + '" data-accion="llamar" href="' + linkTel + '" aria-label="Llamar">📞 llamar</a>' : '') +
          // BUG REAL corregido: a diferencia de los chips de rubro
          // (que sí llevan aria-pressed, ver pintarRubros), este botón
          // de favorito no comunicaba su estado a un lector de
          // pantalla — solo cambiaba de clase/ícono, visual puro. Se
          // agrega aria-pressed (se actualiza también al toggle, ver
          // el listener de click) y un aria-label que refleja la
          // acción real disponible en cada estado.
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
    var meta = window.URU_RUBROS_META || {};
    var frag = document.createDocumentFragment();
    var i = 0;
    puntos.forEach(function (l) {
      if (typeof l.lat !== 'number' || typeof l.lng !== 'number') return;
      var p = document.createElement('div');
      p.className = 'punto-textura';
      p.style.left = (Math.random() * 100) + '%';
      p.style.top = (Math.random() * 100) + '%';
      p.style.setProperty('--i', i);
      var colorRubro = meta[l.grupo] && meta[l.grupo][2];
      if (colorRubro) p.style.setProperty('--dot-color', colorRubro);
      i++;
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

    // #mapaContainer es el <div class="mapa-container"> que envuelve
    // el mapa, su cartel informativo y su leyenda; nace con `hidden`
    // en el HTML a propósito (no debe existir visualmente hasta que
    // haya algo georreferenciado para mostrar). `[hidden]` en un
    // contenedor padre oculta a TODOS sus hijos sin importar el
    // estado individual de cada uno — por eso este alternado tiene
    // que pasar acá, junto con el de mapaHerramienta, y no alcanza
    // con tocar solo el hijo. Antes de este parche, DOM.mapaContainer
    // ni siquiera estaba en la lista de elementos vigilados, así que
    // el mapa quedaba oculto para siempre sin importar qué pasara acá
    // abajo.
    if (!debeMostrar) {
      DOM.mapaHerramienta.hidden = true;
      if (DOM.mapaInfo) DOM.mapaInfo.hidden = true;
      if (DOM.mapaLeyenda) DOM.mapaLeyenda.hidden = true;
      if (DOM.mapaContainer) DOM.mapaContainer.hidden = true;
      return;
    }

    if (DOM.mapaContainer) DOM.mapaContainer.hidden = false;
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
        rubroNombre: meta ? meta[0] : l.categoria,
        // rubroKey: para que pintarLeyenda() pueda pedirle el ícono a
        // URU_RUBROS_ICONO_SVG (mismo helper que usan los chips) en
        // vez de rearmar el <svg> a mano por su cuenta.
        rubroKey: l.grupo,
        // Pictograma del rubro (ver rubros-meta.js) — si el rubro
        // todavía no tiene ícono cargado, queda undefined y
        // motor-render.js (canvas) cae solo a la inicial de letra.
        rubroIcono: meta ? meta[3] : null
      };
    });
    motorMapa.establecerPuntos(puntos);
    motorMapa.encuadrarTodos(48);
    pintarLeyenda(puntos);

    // Antes: DOM.mapaInfo se mostraba/ocultaba pero nunca tenía texto
    // — una caja vacía. El mapa-herramienta siempre respeta el mismo
    // recorte acotado que motor-mapa.js le fija (nunca el padrón
    // completo); cuando ese recorte deja afuera resultados con
    // coordenadas reales, vale la pena decirlo para que no parezca
    // que "falta" algo en el mapa por error.
    if (DOM.mapaInfo) {
      DOM.mapaInfo.textContent = recorte.length < conCoordenadas.length
        ? 'Mostrando ' + recorte.length + ' de ' + conCoordenadas.length + ' lugares con ubicación en el mapa.'
        : recorte.length + ' lugar' + (recorte.length === 1 ? '' : 'es') + ' en el mapa.';
    }
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
      // Mismo helper y misma CSS var --chip-color que usa
      // pintarRubros(): la leyenda del mapa, los chips "Por rubro" y
      // los pines hablan ahora el mismo lenguaje (color + pictograma),
      // no tres convenciones visuales distintas para el mismo dato.
      // Si el rubro todavía no tiene ícono cargado, se cae al punto
      // de color de siempre — nunca queda un hueco vacío.
      var icono = (p.rubroKey && window.URU_RUBROS_ICONO_SVG) ? window.URU_RUBROS_ICONO_SVG(p.rubroKey, { tam: 13 }) : '';
      var marca = icono || '<span class="mapa-leyenda-punto" style="background:' + p.color + '"></span>';
      return '<span class="mapa-leyenda-chip" style="--chip-color:' + p.color + '">' + marca + escapeHTML(p.rubroNombre) + '</span>';
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
     puede dejar contenido oculto. Si el usuario pidió menos
     movimiento, se revela todo de una sin esperar el scroll — el
     "fade-in" es el tipo de movimiento que prefers-reduced-motion
     está pensado para evitar. */
  if (prefiereMovimientoReducido()) {
    document.querySelectorAll('.u-reveal').forEach(function (el) { el.classList.add('visible'); });
  } else if ('IntersectionObserver' in window) {
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
  // Sin soporte de IntersectionObserver y sin pedido de movimiento
  // reducido: .u-reveal queda visible por defecto (ver tokens.css),
  // no hace falta ninguna acción acá.

  /* ── 10. Ripple sutil en botones (.btn) — puramente decorativo,
     nunca reemplaza el click real, que sigue disparando por el
     listener normal del elemento. Se omite con movimiento reducido:
     es decoración pura, cero pérdida funcional al saltarla. ── */
  document.addEventListener('pointerdown', function (e) {
    if (prefiereMovimientoReducido()) return;
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

  /* ── 11. "Cerca de mí" ──
     El motor (distanciaMetros/formatoDistancia/ubicacionUsuario/
     cercaTuyoActivo) ya estaba armado en este archivo pero sin
     ningún control que lo activara. Se agrega un botón junto al
     buscador — creado por JS y no en el HTML, ya que esta pasada
     trabaja únicamente sobre este archivo — con detección de
     soporte real de geolocalización (no se muestra si el navegador
     no la ofrece, en vez de mostrar un botón que siempre falla). ── */
  (function inicializarCercaDeMi() {
    if (!navigator.geolocation || !DOM.inputBuscar || !DOM.inputBuscar.parentNode) return;

    var TEXTO_DEFECTO = '📍 Cerca de mí';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--cerca-tuyo';
    btn.textContent = TEXTO_DEFECTO;
    btn.setAttribute('aria-pressed', 'false');
    DOM.inputBuscar.insertAdjacentElement('afterend', btn);

    var aviso = null;
    function mostrarAviso(texto) {
      if (aviso) aviso.remove();
      aviso = document.createElement('span');
      aviso.className = 'aviso-cerca-tuyo';
      aviso.setAttribute('role', 'status');
      aviso.textContent = texto;
      btn.insertAdjacentElement('afterend', aviso);
      setTimeout(function () { if (aviso) { aviso.remove(); aviso = null; } }, 4000);
    }

    function activar() {
      btn.disabled = true;
      btn.textContent = 'Ubicándote…';
      navigator.geolocation.getCurrentPosition(function (pos) {
        ubicacionUsuario = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        cercaTuyoActivo = true;
        btn.disabled = false;
        btn.textContent = TEXTO_DEFECTO + ' ✓';
        btn.setAttribute('aria-pressed', 'true');
        btn.classList.add('activo');
        render();
      }, function (err) {
        btn.disabled = false;
        btn.textContent = TEXTO_DEFECTO;
        console.warn('No se pudo obtener la ubicación', err);
        mostrarAviso('No pudimos acceder a tu ubicación. Revisá los permisos del navegador.');
      }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
    }

    function desactivar() {
      cercaTuyoActivo = false;
      ubicacionUsuario = null;
      btn.textContent = TEXTO_DEFECTO;
      btn.setAttribute('aria-pressed', 'false');
      btn.classList.remove('activo');
      render();
    }

    btn.addEventListener('click', function () {
      if (cercaTuyoActivo) desactivar();
      else activar();
    });
  })();

})();
