/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — dom-painter.js

   FASE 4b del Plan Maestro de Modularización. Extraído de app.js §14
   (Renderizado Principal): la mitad de PINTADO — las funciones
   `pintar*`/`actualizar*` que escriben directamente en el DOM a
   partir de los datos que ya decidió RenderEngine.calcular() (ver
   render-engine.js, Fase 4a, ya cableado en app.js).

   Mismo criterio que render-engine.js/cache.js/favorites.js: sin
   feature flag, sin ejecución en paralelo. Extracción directa,
   función por función, reemplazando cada `pintarX()` de app.js por
   una llamada a `DomPainter.pintarX(...)` en el mismo call-site,
   pasando por parámetro lo que antes se leía de closures/globales.

   Progreso: 7 de 8 funciones migradas (pintarStatsRapidas,
   pintarDestacados, pintarRubros, pintarSugerenciasRapidas,
   pintarFiltrosActivos, pintarLeyenda, pintarEstadoEscribiendo).
   pintarTarjetas ya vive en app-tarjetas.js; se mantiene separado por
   sus animaciones y listeners propios.

   FIX (2026-08-06): actualizarMapaHerramienta()/actualizarMapaTextura()
   habían sido migradas acá en algún momento posterior con una
   implementación que no coincide con el resto de la app (API de mapa
   distinta — window.L/Leaflet en vez de window.URU_MOTOR_MAPA_RENDER —
   y `motorMapa`/`ClimateContext` referenciados sin declararlos ni
   inyectarlos como dependencia) — tiraban TypeError/ReferenceError en
   cada render(), atrapado en silencio por el try/catch de render() en
   app.js. Se retiraron de acá; la versión correcta sigue viviendo en
   app.js §16 (nunca se había tocado, solo había quedado huérfana). Ver
   nota en el lugar donde estaban, más abajo.
   en ese orden (de menor a mayor riesgo), cada una con su propio
   commit y verificación manual antes de pasar a la siguiente.
   ═══════════════════════════════════════════════════════════════════ */

export function crearDomPainter(deps) {
  var DOM = deps.DOM;
  var obtenerRegistro = deps.obtenerRegistro;
  var UMBRAL_RATING = deps.UMBRAL_RATING;
  var UMBRAL_RESEÑAS = deps.UMBRAL_RESEÑAS;
  var MIN_PARA_MOSTRAR_DESTACADOS = deps.MIN_PARA_MOSTRAR_DESTACADOS;
  var MAX_DESTACADOS = deps.MAX_DESTACADOS;
  var uiState = deps.uiState;
  var slug = deps.slug;
  var mapsHref = deps.mapsHref;
  var escapeHTML = deps.escapeHTML;
  var geolocationDisponible = deps.geolocationDisponible;
  var hayBusquedaOFiltro = deps.hayBusquedaOFiltro;
  var VISUAL_STATE = deps.VISUAL_STATE;

  function actualizarVisibilidadSugerencias() {
    if (!DOM.sugerenciasRapidas) return;
    DOM.sugerenciasRapidas.hidden = hayBusquedaOFiltro() || uiState.cercaTuyoActivo || uiState.sorprendemeActivo;
  }

  return {
    /**
     * Estadísticas rápidas del hero (conteo de lugares y rubros).
     * Sin cambios de comportamiento respecto de la versión en app.js:
     * misma guarda de "sin catálogo cargado", mismos nodos, mismo
     * formato de número (es-AR).
     */
    pintarStatsRapidas: function () {
      if (!obtenerRegistro().length) return;
      if (DOM.statLugares) {
        DOM.statLugares.textContent = obtenerRegistro().length.toLocaleString('es-AR');
      }
      if (DOM.statRubros) {
        var grupos = Object.create(null);
        obtenerRegistro().forEach(function (l) {
          grupos[l.grupo] = true;
        });
        DOM.statRubros.textContent = Object.keys(grupos).length;
      }
    },

    pintarRubros: function () {
      if (!DOM.listaRubros || !obtenerRegistro().length || !window.URU_RUBROS_META) return;

      var conteo = Object.create(null);
      obtenerRegistro().forEach(function (l) {
        conteo[l.grupo] = (conteo[l.grupo] || 0) + 1;
      });

      var claves = Object.keys(window.URU_RUBROS_META)
        .filter(function (k) {
          return conteo[k];
        })
        .sort(function (a, b) {
          return conteo[b] - conteo[a];
        });

      DOM.listaRubros.innerHTML = claves.map(function (k) {
        var meta = window.URU_RUBROS_META[k];
        var activo = uiState.filtroRubroActivo === k;
        var icono = window.URU_RUBROS_ICONO_SVG ? window.URU_RUBROS_ICONO_SVG(k, { tam: 15 }) : '';
        return '<button type="button" class="chip' + (activo ? ' chip--activo' : '') +
          '" data-rubro="' + k + '" aria-pressed="' + activo +
          '" style="--chip-color:var(' + meta[2] + ')">' +
          icono +
          escapeHTML(meta[0]) + '<span class="chip__conteo">' + conteo[k] + '</span>' +
          '</button>';
      }).join('');

      if (window.URU_ChipIndicador) {
        window.URU_ChipIndicador.sincronizar(DOM.listaRubros, '.chip--activo');
      }
    },

    /**
     * Atajos iniciales de rubro, proximidad y sorpresa. El contenido se
     * construye una sola vez al cargar el catálogo; la visibilidad se
     * actualiza en cada render con actualizarVisibilidadSugerencias().
     */
    pintarSugerenciasRapidas: function () {
      if (!DOM.sugerenciasRapidas || !obtenerRegistro().length || !window.URU_RUBROS_META) return;

      var conteo = Object.create(null);
      obtenerRegistro().forEach(function (l) {
        conteo[l.grupo] = (conteo[l.grupo] || 0) + 1;
      });

      var topRubros = Object.keys(window.URU_RUBROS_META)
        .filter(function (k) { return conteo[k]; })
        .sort(function (a, b) { return conteo[b] - conteo[a]; })
        .slice(0, 4);

      if (!topRubros.length) return;

      var html = '<span class="sugerencias-rapidas__etiqueta">Empezá por acá</span>' +
        topRubros.map(function (k) {
          var meta = window.URU_RUBROS_META[k];
          var icono = window.URU_RUBROS_ICONO_SVG ? window.URU_RUBROS_ICONO_SVG(k, { tam: 15 }) : '';
          return '<button type="button" class="sugerencia-chip" data-rubro="' + k +
            '" style="--chip-color:var(' + meta[2] + ')">' + icono + escapeHTML(meta[0]) + '</button>';
        }).join('');

      if (geolocationDisponible()) {
        html += '<button type="button" class="sugerencia-chip sugerencia-chip--cerca" data-accion="sugerencia-cerca-tuyo">' +
          '📍 cerca tuyo</button>';
      }

      if (!uiState.sorprendemeActivo) {
        html += '<button type="button" class="sugerencia-chip sugerencia-chip--sorpresa" data-accion="sugerencia-sorprendeme">' +
          '🎲 sorprendeme</button>';
      }

      DOM.sugerenciasRapidas.innerHTML = html;
      actualizarVisibilidadSugerencias();
    },

    /** Alterna la visibilidad sin reconstruir los atajos. */
    actualizarVisibilidadSugerencias: actualizarVisibilidadSugerencias,

    /**
     * Resume las facetas activas y conserva los mismos data-* que usan
     * los listeners delegados de app.js para quitarlas o pedir otra
     * sorpresa.
     */
    pintarFiltrosActivos: function () {
      if (!DOM.filtrosActivos) return;

      var pills = [];
      var consulta = uiState.consultaActual.trim();

      if (consulta) {
        pills.push(
          '<span class="filtro-pill" data-filtro="busqueda">' +
          '<span class="filtro-pill__texto">“' + escapeHTML(consulta) + '”</span>' +
          '<button type="button" class="filtro-pill__quitar" data-filtro-quitar="busqueda" ' +
          'aria-label="Quitar búsqueda de ' + escapeHTML(consulta) + '">×</button>' +
          '</span>'
        );
      }

      if (uiState.filtroRubroActivo) {
        var meta = window.URU_RUBROS_META && window.URU_RUBROS_META[uiState.filtroRubroActivo];
        var nombreRubro = meta ? meta[0] : uiState.filtroRubroActivo;
        pills.push(
          '<span class="filtro-pill" data-filtro="rubro" style="--chip-color:' +
          (meta ? 'var(' + meta[2] + ')' : 'var(--color-granate-clara)') + '">' +
          '<span class="filtro-pill__texto">' + escapeHTML(nombreRubro) + '</span>' +
          '<button type="button" class="filtro-pill__quitar" data-filtro-quitar="rubro" ' +
          'aria-label="Quitar filtro de rubro ' + escapeHTML(nombreRubro) + '">×</button>' +
          '</span>'
        );
      }

      if (uiState.cercaTuyoActivo) {
        pills.push(
          '<span class="filtro-pill filtro-pill--cerca" data-filtro="cerca">' +
          '<span class="filtro-pill__texto">📍 cerca tuyo</span>' +
          '<button type="button" class="filtro-pill__quitar" data-filtro-quitar="cerca" ' +
          'aria-label="Dejar de ordenar por cercanía">×</button>' +
          '</span>'
        );
      }

      if (uiState.sorprendemeActivo) {
        pills.push(
          '<span class="filtro-pill filtro-pill--sorpresa" data-filtro="sorpresa">' +
          '<span class="filtro-pill__texto">🎲 sorpresa</span>' +
          '<button type="button" class="filtro-pill__reroll" data-filtro-reroll="sorpresa" ' +
          'aria-label="Mostrarme otra sorpresa distinta">↻</button>' +
          '<button type="button" class="filtro-pill__quitar" data-filtro-quitar="sorpresa" ' +
          'aria-label="Salir del modo sorpresa">×</button>' +
          '</span>'
        );
      }

      if (!pills.length) {
        DOM.filtrosActivos.hidden = true;
        DOM.filtrosActivos.innerHTML = '';
        return;
      }

      DOM.filtrosActivos.hidden = false;
      DOM.filtrosActivos.innerHTML = pills.join('');
    },

    /** Pinta la leyenda del mapa a partir de los puntos visibles. */
    pintarLeyenda: function (puntos) {
      if (!DOM.mapaLeyenda) return;

      var vistos = Object.create(null);
      var unicos = [];
      puntos.forEach(function (p) {
        if (vistos[p.rubroNombre]) return;
        vistos[p.rubroNombre] = true;
        unicos.push(p);
      });

      if (unicos.length < 2) {
        DOM.mapaLeyenda.hidden = true;
        return;
      }

      DOM.mapaLeyenda.innerHTML = unicos.map(function (p) {
        var icono = (p.rubroKey && window.URU_RUBROS_ICONO_SVG)
          ? window.URU_RUBROS_ICONO_SVG(p.rubroKey, { tam: 13 })
          : '';
        var marca = icono || '<span class="mapa-leyenda-punto" style="background:' + p.color + '"></span>';
        return '<span class="mapa-leyenda-chip" style="--chip-color:' + p.color + '">' +
          marca + escapeHTML(p.rubroNombre) + '</span>';
      }).join('');

      DOM.mapaLeyenda.hidden = false;
    },

    /** Estado transitorio para una búsqueda de una sola letra. */
    pintarEstadoEscribiendo: function () {
      if (!DOM.panelDescubrimiento) return;
      DOM.panelDescubrimiento.innerHTML =
        '<p class="escribiendo"><span class="escribiendo__punto" aria-hidden="true"></span>' +
        'Seguí escribiendo — buscamos a partir de 2 letras.</p>';
      if (DOM.estadoResultados) {
        DOM.estadoResultados.textContent = 'Escribiendo. Hacen falta al menos 2 letras para buscar.';
      }
      uiState.visualState = VISUAL_STATE.TYPING;
    },

    /**
     * Spotlight "Destacados" — selector inteligente de lugares top-rated.
     * Sin cambios de comportamiento respecto de la versión en app.js:
     * mismo criterio de candidatos (rating/reseñas mínimas), mismo
     * pseudo-random determinístico por día del año, misma regla
     * absoluta de "ficha propia primero", mismo relleno cuando no
     * alcanzan los rubros distintos, mismo markup de la card.
     */
    pintarDestacados: function () {
      if (!DOM.destacados || !DOM.listaDestacados) return;

      var candidatos = obtenerRegistro().filter(function (l) {
        return typeof l.rating === 'number' && l.rating >= UMBRAL_RATING &&
          typeof l.ratingCount === 'number' && l.ratingCount >= UMBRAL_RESEÑAS;
      });

      if (candidatos.length < MIN_PARA_MOSTRAR_DESTACADOS) {
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
        l._scoreDestacado = score + pseudoRandom(i) * 0.05;
      });
      // REGLA ABSOLUTA (misma que motor-exposicion.js: tieneFicha()): los
      // destacados con ficha propia van SIEMPRE primero. Si ninguno de
      // los candidatos por rating tiene ficha, esta comparación no
      // cambia nada (0-0=0) y queda el orden por score de siempre.
      candidatos.sort(function (a, b) {
        var fichaA = slug(a) ? 1 : 0;
        var fichaB = slug(b) ? 1 : 0;
        return (fichaB - fichaA) || (b._scoreDestacado - a._scoreDestacado);
      });

      var elegidos = [];
      var rubrosUsados = Object.create(null);
      candidatos.forEach(function (l) {
        if (elegidos.length >= MAX_DESTACADOS) return;
        if (rubrosUsados[l.grupo]) return;
        rubrosUsados[l.grupo] = true;
        elegidos.push(l);
      });

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
          if (!slugLugar) {
            card.target = '_blank';
            card.rel = 'noopener';
          }
        }
        if (metaRubro) card.style.setProperty('--rubro-color', 'var(' + metaRubro[2] + ')');

        // Pictograma de rubro (mismo criterio que en pintarTarjetas): los
        // destacados son la primera superficie que ve alguien al entrar,
        // tenía más sentido cerrarla acá que dejarla como única tarjeta
        // sin ícono del sitio.
        var iconoDestacado = (metaRubro && window.URU_RUBROS_ICONO_SVG)
          ? window.URU_RUBROS_ICONO_SVG(lugar.grupo, { tam: 12, clase: 'destacado-card__icono' })
          : '';

        card.innerHTML =
          '<div class="destacado-card__rubro">' + iconoDestacado + escapeHTML(rubro) + '</div>' +
          '<div class="destacado-card__nombre">' + escapeHTML(lugar.nombre) + '</div>' +
          '<div class="destacado-card__rating">★ ' + lugar.rating.toFixed(1).replace('.', ',') +
          '<span class="destacado-card__conteo">(' + lugar.ratingCount.toLocaleString('es-AR') + ')</span></div>';
        frag.appendChild(card);
      });

      DOM.listaDestacados.innerHTML = '';
      DOM.listaDestacados.appendChild(frag);
      DOM.destacados.hidden = false;
    },

    // ═══════════════════════════════════════════════════════════════════
    // FASE 4B: LAS 5 FUNCIONES FALTANTES
    // Migradas de app.js en 2026-08-06
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Muestra un aviso transitorio cuando cambia la región/rama visible.
     * Línea 2760 de app.js.
     */
    mostrarMicroSenalCambioRegion: function() {
      if (!DOM.tituloRegion || !DOM.subtituloRegion || !DOM.subtituloRegion.parentNode) return;

      if (dynamicElements.avisoCambioRegion) {
        dynamicElements.avisoCambioRegion.remove();
        dynamicElements.avisoCambioRegion = null;
      }

      var tituloNuevo = DOM.tituloRegion.textContent || '';
      var aviso = document.createElement('span');
      aviso.className = 'aviso-cambio-region';
      aviso.setAttribute('role', 'status');
      aviso.textContent = tituloNuevo ? 'Cambió lo que ves: ' + tituloNuevo : 'Cambió lo que ves.';

      DOM.subtituloRegion.insertAdjacentElement('afterend', aviso);
      dynamicElements.avisoCambioRegion = aviso;

      setTimeout(function () {
        if (aviso.parentNode) aviso.remove();
        if (dynamicElements.avisoCambioRegion === aviso) {
          dynamicElements.avisoCambioRegion = null;
        }
      }, CAMBIO_REGION_AVISO_MS);
    },

    /**
     * Muestra/oculta el banner "Armaste una lista" (curaduría sugerida).
     * Línea 1597 de app.js. Incluye helper asegurarBannerCuraduria.
     */
    actualizarBannerCuraduriaSugerida: function(reg) {
      var debeMostrar = estado.sesion.curaduriaSugerida && reg.nombre !== 'curaduria';

      if (!debeMostrar) {
        if (dynamicElements.bannerCuraduria) {
          dynamicElements.bannerCuraduria.hidden = true;
        }
        return;
      }

      if (!dynamicElements.bannerCuraduria) {
        this.asegurarBannerCuraduria();
      }

      if (dynamicElements.bannerCuraduria) {
        dynamicElements.bannerCuraduria.hidden = false;
      }
    },

    /** Helper: Crea el banner si no existe. */
    asegurarBannerCuraduria: function() {
      if (dynamicElements.bannerCuraduria || !DOM.panelDescubrimiento || !DOM.panelDescubrimiento.parentNode) {
        return;
      }

      var banner = document.createElement('div');
      banner.className = 'mapa-info';
      banner.setAttribute('role', 'status');
      banner.hidden = true;

      var texto = document.createElement('span');
      texto.textContent = 'Armaste el comienzo de una lista. ';

      var btnIr = document.createElement('button');
      btnIr.type = 'button';
      btnIr.className = 'btn btn--activo';
      btnIr.textContent = 'Ver tus guardados';
      btnIr.addEventListener('click', function () {
        estado = PLANO.aplicarAccion(estado, 'entrarCuraduria');
        PLANO.guardarEstado(estado);
        uiState.paginaTarjetas = 1;
        render();
      });

      var btnCerrar = document.createElement('button');
      btnCerrar.type = 'button';
      btnCerrar.className = 'btn btn--icono';
      btnCerrar.setAttribute('aria-label', 'Descartar aviso');
      btnCerrar.textContent = '✕';
      btnCerrar.addEventListener('click', function () {
        estado = PLANO.aplicarAccion(estado, 'descartarSugerenciaCuraduria');
        PLANO.guardarEstado(estado);
        banner.hidden = true;
      });

      banner.appendChild(texto);
      banner.appendChild(btnIr);
      banner.appendChild(btnCerrar);
      DOM.panelDescubrimiento.insertAdjacentElement('beforebegin', banner);

      dynamicElements.bannerCuraduria = banner;
    },

    /**
     * Actualiza el título y subtítulo de la región según la rama.
     * Línea 1463 de app.js. Incluye helpers asegurarBoton*.
     */
    actualizarCabecera: function(reg, rama) {
      if (DOM.rolActual) {
        var rol = PLANO.rolPorAperturas(estado.aperturas);
        DOM.rolActual.textContent = ROLES_NOMBRES[rol] || rol;
      }

      if (!DOM.tituloRegion || !DOM.subtituloRegion) return;

      if (dynamicElements.btnVerCatalogoCompleto) {
        dynamicElements.btnVerCatalogoCompleto.hidden = true;
      }
      this.asegurarBotonVolverATodos();

      if (reg.nombre === 'curaduria') {
        DOM.tituloRegion.textContent = 'Tu lista';
        DOM.subtituloRegion.textContent = 'Lo que guardaste, sin recorte ni rotación.' + sufijoCercania();
        if (dynamicElements.btnVolverATodos) {
          dynamicElements.btnVolverATodos.hidden = false;
        }
        return;
      }

      if (dynamicElements.btnVolverATodos) {
        dynamicElements.btnVolverATodos.hidden = true;
      }

      var rubroMeta = uiState.filtroRubroActivo && window.URU_RUBROS_META
        ? window.URU_RUBROS_META[uiState.filtroRubroActivo]
        : null;

      var esRecorteReal = (reg.nombre === 'guia' || reg.nombre === 'exploracion') &&
        !hayBusquedaTexto() && !uiState.verCatalogoCompleto;

      if (!esRecorteReal) {
        if (uiState.consultaActual.trim()) {
          DOM.tituloRegion.textContent = 'Resultados';
          DOM.subtituloRegion.textContent = (rubroMeta
            ? 'Coincidencias con "' + uiState.consultaActual.trim() + '" en ' + rubroMeta[0] + '.'
            : 'Esto es lo que coincide con lo que escribiste.') + sufijoCercania();
        } else if (rubroMeta) {
          DOM.tituloRegion.textContent = rubroMeta[0];
          DOM.subtituloRegion.textContent = 'Todos los lugares verificados de este rubro.' + sufijoCercania();
        } else {
          DOM.tituloRegion.textContent = 'Todos los lugares';
          DOM.subtituloRegion.textContent = 'El padrón completo (' + obtenerRegistro().length + ' lugares).' + sufijoCercania();
        }

        if (uiState.verCatalogoCompleto && !hayBusquedaOFiltro() && reg.nombre !== 'accionDirecta') {
          this.asegurarBotonVerCatalogoCompleto();
          if (dynamicElements.btnVerCatalogoCompleto) {
            dynamicElements.btnVerCatalogoCompleto.textContent = '← Volver a lo sugerido';
            dynamicElements.btnVerCatalogoCompleto.hidden = false;
          }
        }
        return;
      }

      this.asegurarBotonVerCatalogoCompleto();
      if (dynamicElements.btnVerCatalogoCompleto) {
        dynamicElements.btnVerCatalogoCompleto.textContent = 'Ver catálogo completo →';
        dynamicElements.btnVerCatalogoCompleto.hidden = false;
      }

      var sufijoRubro = rubroMeta ? (' Mostrando solo ' + rubroMeta[0].toLowerCase() + '.') : '';
      var sufijoSorpresa = uiState.sorprendemeActivo ? ' 🎲 Modo sorpresa activo.' : '';

      if (reg.nombre === 'guia') {
        DOM.tituloRegion.textContent = 'Para arrancar';
        DOM.subtituloRegion.textContent = 'Una selección chica para no abrumar. Guardá o descartá para afinarla.' +
          sufijoRubro + sufijoSorpresa + sufijoCercania();
      } else {
        DOM.tituloRegion.textContent = 'Para explorar';
        DOM.subtituloRegion.textContent = 'Más variedad para curiosear. Buscá si ya sabés qué querés.' +
          sufijoRubro + sufijoSorpresa + sufijoCercania();
      }
    },

    /** Helper: Asegura que existe el botón "ver catálogo completo". */
    asegurarBotonVerCatalogoCompleto: function() {
      if (dynamicElements.btnVerCatalogoCompleto || !DOM.subtituloRegion || !DOM.subtituloRegion.parentNode) return;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--link-volver';
      btn.addEventListener('click', function () {
        uiState.verCatalogoCompleto = !uiState.verCatalogoCompleto;
        uiState.paginaTarjetas = 1;
        render();
      });
      DOM.subtituloRegion.insertAdjacentElement('afterend', btn);
      dynamicElements.btnVerCatalogoCompleto = btn;
    },

    /** Helper: Asegura que existe el botón "volver a todos" (desde curaduría). */
    asegurarBotonVolverATodos: function() {
      if (dynamicElements.btnVolverATodos || !DOM.subtituloRegion || !DOM.subtituloRegion.parentNode) return;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--link-volver';
      btn.textContent = '← Ver todos los lugares';
      btn.hidden = true;
      btn.addEventListener('click', function () {
        estado = PLANO.aplicarAccion(estado, 'salirCuraduria');
        PLANO.guardarEstado(estado);
        uiState.paginaTarjetas = 1;
        render();
        if (DOM.tituloRegion) {
          DOM.tituloRegion.setAttribute('tabindex', '-1');
          DOM.tituloRegion.focus({ preventScroll: false });
        }
      });
      DOM.subtituloRegion.insertAdjacentElement('afterend', btn);
      dynamicElements.btnVolverATodos = btn;
    },

    /**
     * actualizarMapaHerramienta / actualizarMapaTextura: NO viven acá.
     * Fase 4b las había migrado a este archivo con una implementación
     * que no coincidía con el resto de la app (API de mapa distinta,
     * `motorMapa`/`ClimateContext` sin declarar) y rompía en cada
     * render() — ver el FIX del 2026-08-06 en app.js §14 (render()).
     * Se revirtió el call site a las funciones locales correctas de
     * app.js §16, que nunca se habían tocado. Si en el futuro se
     * quiere volver a migrar estas dos funciones acá, hay que
     * inyectar `motorMapa` (getter, se reasigna en runtime — mismo
     * patrón que motorMapa/estado en listeners.js) y `MAPA` como
     * dependencias explícitas, y portar la implementación real de
     * app.js §16 — NO la que estaba acá.
     */

  };
}

