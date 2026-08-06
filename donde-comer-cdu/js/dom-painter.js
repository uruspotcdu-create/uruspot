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

   Progreso: 2 de 8 funciones migradas (pintarStatsRapidas,
   pintarDestacados). El resto (pintarRubros, pintarSugerenciasRapidas,
   pintarFiltrosActivos, pintarTarjetas, pintarLeyenda,
   pintarEstadoEscribiendo) sigue en app.js — se migran una a la vez,
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
  var slug = deps.slug;
  var mapsHref = deps.mapsHref;
  var escapeHTML = deps.escapeHTML;

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
    }
  };
}
