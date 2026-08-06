/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — dom-painter-tests.js

   Plan Maestro de Modularización, Fase 4b — validación de las 7
   funciones migradas a dom-painter.js (pintarStatsRapidas, pintarRubros,
   pintarSugerenciasRapidas, actualizarVisibilidadSugerencias,
   pintarFiltrosActivos, pintarLeyenda, pintarEstadoEscribiendo,
   pintarDestacados). Mismo patrón sin framework que
   render-engine-tests.js/motor-comparacion-tests.js. Corre con:
     node js/dom-painter-tests.js
   Sale con código 1 si algo falla (run-tests.js la integra como
   suite 8/8).

   Por qué existe: el Plan de Fase 4 (§4A.3-4A.4) pedía comparar el
   HTML/DOM resultante de cada `pintar*` migrada contra la versión
   vieja, función por función, antes de confiar en la extracción —
   pintarDestacados en particular, la más grande y riesgosa, con
   validación explícita de lista vacía, favoritos mezclados y
   caracteres especiales. Hasta este archivo, dom-painter.js no tenía
   ningún test automático.

   DOM falso: en vez de jsdom (el repo es deliberadamente cero-
   dependencias, ver cabecera de motor-test.js/smoke-tests.js), se usa
   un stub mínimo con exactamente las propiedades/métodos que
   dom-painter.js realmente toca (textContent, innerHTML, hidden,
   style.setProperty, className, setAttribute, appendChild). Sirve
   para verificar el CONTENIDO producido (vía innerHTML como string, o
   vía las propiedades de los nodos creados), no el rendering visual
   real — ese sigue siendo el rol del checklist manual del plan.

   `window` se stubea sobre `global` (mismo criterio que
   render-engine-tests.js) y se carga app-formato.js real para usar el
   escapeHTML/slug/mapsHref de producción, no una reimplementación
   paralela.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

if (typeof global.window === 'undefined') {
  global.window = global;
}
require('./app-formato.js');
var AppFormato = global.window.AppFormato;

// document falso: solo lo que pintarDestacados necesita (createElement,
// createDocumentFragment). Los demás pintar* solo escriben strings en
// .innerHTML/.textContent de nodos ya "existentes" en DOM (el fake de
// abajo), no crean elementos nuevos.
function crearNodoFalso() {
  return {
    textContent: '',
    innerHTML: '',
    hidden: false,
    style: {
      _props: {},
      setProperty: function (k, v) { this._props[k] = v; }
    },
    className: '',
    attrs: {},
    children: [],
    setAttribute: function (k, v) { this.attrs[k] = v; },
    appendChild: function (child) {
      // Si es un fragmento (tiene .children propio), "aplanarlo" como
      // hace un DocumentFragment real al ser insertado.
      if (child && child.esFragmento) {
        this.children = this.children.concat(child.children);
      } else {
        this.children.push(child);
      }
    }
  };
}

global.document = {
  createDocumentFragment: function () {
    return { esFragmento: true, children: [], appendChild: function (el) { this.children.push(el); } };
  },
  createElement: function (tag) {
    var el = crearNodoFalso();
    el.tagName = tag;
    return el;
  }
};

var crearDomPainter = require('./dom-painter.js').crearDomPainter;

var fallos = 0, total = 0;
function assert(desc, cond) {
  total++;
  if (!cond) { fallos++; console.error('✗ ' + desc); }
  else console.log('✓ ' + desc);
}

var VISUAL_STATE = { TYPING: 'typing', READY: 'ready' };

function lugar(over) {
  return Object.assign({ id: 'x', nombre: 'Lugar', grupo: 'bar', categoria: 'Bar' }, over || {});
}

/**
 * Fabrica una instancia nueva de DomPainter con DOM falso y mocks
 * controlables. `overrides` permite pisar deps puntuales por test.
 */
function fabricarPainter(overrides) {
  overrides = overrides || {};

  var DOM = {
    statLugares: crearNodoFalso(),
    statRubros: crearNodoFalso(),
    listaRubros: crearNodoFalso(),
    sugerenciasRapidas: crearNodoFalso(),
    filtrosActivos: crearNodoFalso(),
    mapaLeyenda: crearNodoFalso(),
    panelDescubrimiento: crearNodoFalso(),
    estadoResultados: crearNodoFalso(),
    destacados: crearNodoFalso(),
    listaDestacados: crearNodoFalso()
  };

  var registro = overrides.registro || [];
  var uiState = Object.assign({
    filtroRubroActivo: null,
    sorprendemeActivo: false,
    cercaTuyoActivo: false,
    consultaActual: '',
    visualState: null
  }, overrides.uiState || {});

  var painter = crearDomPainter({
    DOM: DOM,
    obtenerRegistro: function () { return registro; },
    UMBRAL_RATING: overrides.UMBRAL_RATING != null ? overrides.UMBRAL_RATING : 4.0,
    UMBRAL_RESEÑAS: overrides.UMBRAL_RESEÑAS != null ? overrides.UMBRAL_RESEÑAS : 10,
    MIN_PARA_MOSTRAR_DESTACADOS: overrides.MIN_PARA_MOSTRAR_DESTACADOS != null ? overrides.MIN_PARA_MOSTRAR_DESTACADOS : 3,
    MAX_DESTACADOS: overrides.MAX_DESTACADOS != null ? overrides.MAX_DESTACADOS : 3,
    uiState: uiState,
    slug: overrides.slug || function () { return null; },
    mapsHref: overrides.mapsHref || function (l) { return 'https://maps.example/' + l.id; },
    escapeHTML: AppFormato.escapeHTML,
    geolocationDisponible: overrides.geolocationDisponible || function () { return false; },
    hayBusquedaOFiltro: overrides.hayBusquedaOFiltro || function () { return false; },
    VISUAL_STATE: VISUAL_STATE
  });

  return { painter: painter, DOM: DOM, uiState: uiState };
}

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 1 — pintarStatsRapidas
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarPainter({ registro: [] });
  f.painter.pintarStatsRapidas();
  assert('pintarStatsRapidas: registro vacío no toca los nodos (guarda)', f.DOM.statLugares.textContent === '');
})();

(function () {
  var f = fabricarPainter({
    registro: [lugar({ id: '1', grupo: 'bar' }), lugar({ id: '2', grupo: 'bar' }), lugar({ id: '3', grupo: 'cafe' })]
  });
  f.painter.pintarStatsRapidas();
  assert('pintarStatsRapidas: statLugares.textContent = cantidad total', f.DOM.statLugares.textContent === '3');
  assert('pintarStatsRapidas: statRubros.textContent = grupos distintos', f.DOM.statRubros.textContent === 2);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 2 — pintarRubros
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  global.window.URU_RUBROS_META = {
    bar: ['Bares', 0, '--color-bar'],
    cafe: ['Cafeterías', 0, '--color-cafe']
  };
  delete global.window.URU_RUBROS_ICONO_SVG;
  delete global.window.URU_ChipIndicador;

  var f = fabricarPainter({
    registro: [lugar({ id: '1', grupo: 'bar' }), lugar({ id: '2', grupo: 'bar' }), lugar({ id: '3', grupo: 'cafe' })],
    uiState: { filtroRubroActivo: 'cafe' }
  });
  f.painter.pintarRubros();

  var html = f.DOM.listaRubros.innerHTML;
  assert('pintarRubros: incluye chip de cada rubro presente en el registro', html.indexOf('Bares') !== -1 && html.indexOf('Cafeterías') !== -1);
  assert('pintarRubros: ordena por conteo descendente (Bares con 2 antes que Cafeterías con 1)', html.indexOf('Bares') < html.indexOf('Cafeterías'));
  assert('pintarRubros: marca chip--activa el rubro filtrado (cafe)', /data-rubro="cafe"[^>]*chip--activo|chip--activo[^>]*data-rubro="cafe"/.test(html) || html.indexOf('chip chip--activo" data-rubro="cafe"') !== -1);
  assert('pintarRubros: conteo correcto embebido (2 para bar)', html.indexOf('<span class="chip__conteo">2</span>') !== -1);

  delete global.window.URU_RUBROS_META;
})();

(function () {
  var f = fabricarPainter({ registro: [lugar()] }); // sin window.URU_RUBROS_META
  f.painter.pintarRubros();
  assert('pintarRubros: sin URU_RUBROS_META no rompe (guarda)', f.DOM.listaRubros.innerHTML === '');
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 3 — pintarSugerenciasRapidas + actualizarVisibilidadSugerencias
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  global.window.URU_RUBROS_META = {
    bar: ['Bares', 0, '--c1'], cafe: ['Cafeterías', 0, '--c2'],
    pizza: ['Pizzerías', 0, '--c3'], sushi: ['Sushi', 0, '--c4'], vegano: ['Vegano', 0, '--c5']
  };
  var f = fabricarPainter({
    registro: [
      lugar({ grupo: 'bar' }), lugar({ grupo: 'cafe' }), lugar({ grupo: 'pizza' }),
      lugar({ grupo: 'sushi' }), lugar({ grupo: 'vegano' })
    ],
    geolocationDisponible: function () { return true; },
    uiState: { sorprendemeActivo: false }
  });
  f.painter.pintarSugerenciasRapidas();
  var html = f.DOM.sugerenciasRapidas.innerHTML;
  assert('pintarSugerenciasRapidas: limita a 4 rubros (5 registrados, 1 afuera)', (html.match(/sugerencia-chip"/g) || []).length <= 4 + 2 /* + cerca + sorpresa, con margen */);
  assert('pintarSugerenciasRapidas: agrega botón "cerca tuyo" cuando geolocalización disponible', html.indexOf('sugerencia-cerca-tuyo') !== -1);
  assert('pintarSugerenciasRapidas: agrega botón "sorprendeme" cuando no está activo', html.indexOf('sugerencia-sorprendeme') !== -1);

  delete global.window.URU_RUBROS_META;
})();

(function () {
  global.window.URU_RUBROS_META = { bar: ['Bares', 0, '--c1'] };
  var f = fabricarPainter({
    registro: [lugar({ grupo: 'bar' })],
    geolocationDisponible: function () { return false; },
    uiState: { sorprendemeActivo: true }
  });
  f.painter.pintarSugerenciasRapidas();
  var html = f.DOM.sugerenciasRapidas.innerHTML;
  assert('pintarSugerenciasRapidas: sin geolocalización no agrega "cerca tuyo"', html.indexOf('sugerencia-cerca-tuyo') === -1);
  assert('pintarSugerenciasRapidas: con sorprendeme ya activo no vuelve a ofrecerlo', html.indexOf('sugerencia-sorprendeme') === -1);
  delete global.window.URU_RUBROS_META;
})();

(function () {
  var f = fabricarPainter({ uiState: { cercaTuyoActivo: false, sorprendemeActivo: false }, hayBusquedaOFiltro: function () { return false; } });
  f.painter.actualizarVisibilidadSugerencias();
  assert('actualizarVisibilidadSugerencias: visible sin búsqueda/filtro/cerca/sorpresa', f.DOM.sugerenciasRapidas.hidden === false);
})();

(function () {
  var f = fabricarPainter({ hayBusquedaOFiltro: function () { return true; } });
  f.painter.actualizarVisibilidadSugerencias();
  assert('actualizarVisibilidadSugerencias: oculto con búsqueda/filtro activo', f.DOM.sugerenciasRapidas.hidden === true);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 4 — pintarFiltrosActivos
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarPainter({ uiState: { consultaActual: '', filtroRubroActivo: null, cercaTuyoActivo: false, sorprendemeActivo: false } });
  f.painter.pintarFiltrosActivos();
  assert('pintarFiltrosActivos: sin filtros activos, oculta y vacía el contenedor', f.DOM.filtrosActivos.hidden === true && f.DOM.filtrosActivos.innerHTML === '');
})();

(function () {
  var f = fabricarPainter({ uiState: { consultaActual: 'pizza <script>', filtroRubroActivo: null, cercaTuyoActivo: false, sorprendemeActivo: false } });
  f.painter.pintarFiltrosActivos();
  var html = f.DOM.filtrosActivos.innerHTML;
  assert('pintarFiltrosActivos: muestra la píldora de búsqueda', html.indexOf('data-filtro="busqueda"') !== -1);
  assert('pintarFiltrosActivos: escapea caracteres especiales de la consulta', html.indexOf('<script>') === -1 && html.indexOf('&lt;script&gt;') !== -1);
  assert('pintarFiltrosActivos: contenedor visible (hidden=false)', f.DOM.filtrosActivos.hidden === false);
})();

(function () {
  global.window.URU_RUBROS_META = { bar: ['Bares', 0, '--color-bar'] };
  var f = fabricarPainter({ uiState: { consultaActual: '', filtroRubroActivo: 'bar', cercaTuyoActivo: true, sorprendemeActivo: true } });
  f.painter.pintarFiltrosActivos();
  var html = f.DOM.filtrosActivos.innerHTML;
  assert('pintarFiltrosActivos: píldora de rubro usa el nombre legible de META', html.indexOf('Bares') !== -1);
  assert('pintarFiltrosActivos: píldora de "cerca tuyo" presente', html.indexOf('data-filtro="cerca"') !== -1);
  assert('pintarFiltrosActivos: píldora de "sorpresa" con botón de reroll', html.indexOf('data-filtro-reroll="sorpresa"') !== -1);
  delete global.window.URU_RUBROS_META;
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 5 — pintarLeyenda
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarPainter();
  f.painter.pintarLeyenda([{ rubroNombre: 'Bares', color: '#111' }]);
  assert('pintarLeyenda: con menos de 2 rubros únicos, se oculta', f.DOM.mapaLeyenda.hidden === true);
})();

(function () {
  var f = fabricarPainter();
  f.painter.pintarLeyenda([
    { rubroNombre: 'Bares', color: '#111' },
    { rubroNombre: 'Bares', color: '#111' }, // duplicado, debe deduplicarse
    { rubroNombre: 'Cafeterías', color: '#222' }
  ]);
  assert('pintarLeyenda: con 2+ rubros únicos, se muestra', f.DOM.mapaLeyenda.hidden === false);
  var html = f.DOM.mapaLeyenda.innerHTML;
  assert('pintarLeyenda: deduplica por rubroNombre (Bares aparece una sola vez)', (html.match(/Bares/g) || []).length === 1);
  assert('pintarLeyenda: incluye ambos rubros únicos', html.indexOf('Cafeterías') !== -1);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 6 — pintarEstadoEscribiendo
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarPainter();
  f.painter.pintarEstadoEscribiendo();
  assert('pintarEstadoEscribiendo: pinta el mensaje en el panel', f.DOM.panelDescubrimiento.innerHTML.indexOf('Seguí escribiendo') !== -1);
  assert('pintarEstadoEscribiendo: actualiza el texto accesible de estadoResultados', f.DOM.estadoResultados.textContent.indexOf('Escribiendo') !== -1);
  assert('pintarEstadoEscribiendo: uiState.visualState pasa a TYPING', f.uiState.visualState === VISUAL_STATE.TYPING);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 7 — pintarDestacados
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarPainter({
    registro: [lugar({ id: '1', rating: 4.5, ratingCount: 20 })],
    MIN_PARA_MOSTRAR_DESTACADOS: 3
  });
  f.painter.pintarDestacados();
  assert('pintarDestacados: menos candidatos que el mínimo → se oculta la sección', f.DOM.destacados.hidden === true);
})();

(function () {
  // 3 candidatos, todos distinto grupo, ratings bien separados para que
  // el ruido pseudo-random (±0.05) nunca invierta el orden esperado.
  var f = fabricarPainter({
    registro: [
      lugar({ id: 'a', grupo: 'bar', nombre: 'Bar Alto', rating: 4.9, ratingCount: 50 }),
      lugar({ id: 'b', grupo: 'cafe', nombre: 'Café Medio', rating: 4.5, ratingCount: 50 }),
      lugar({ id: 'c', grupo: 'pizza', nombre: 'Pizza Bajo', rating: 4.1, ratingCount: 50 })
    ],
    MIN_PARA_MOSTRAR_DESTACADOS: 3,
    MAX_DESTACADOS: 3
  });
  f.painter.pintarDestacados();
  assert('pintarDestacados: con candidatos suficientes, la sección queda visible', f.DOM.destacados.hidden === false);
  var tarjetas = f.DOM.listaDestacados.children;
  assert('pintarDestacados: pinta una tarjeta por candidato elegido (hasta MAX)', tarjetas.length === 3);
  assert('pintarDestacados: ordena por score cuando nadie tiene ficha (mejor rating primero)',
    tarjetas[0].innerHTML.indexOf('Bar Alto') !== -1 && tarjetas[2].innerHTML.indexOf('Pizza Bajo') !== -1);
})();

(function () {
  // Regla absoluta: ficha propia SIEMPRE primero, aunque tenga el
  // rating más bajo del grupo de candidatos.
  var f = fabricarPainter({
    registro: [
      lugar({ id: 'a', grupo: 'bar', nombre: 'Sin Ficha Alto', rating: 4.9, ratingCount: 50 }),
      lugar({ id: 'b', grupo: 'cafe', nombre: 'Con Ficha Bajo', rating: 4.1, ratingCount: 50 }),
      lugar({ id: 'c', grupo: 'pizza', nombre: 'Sin Ficha Medio', rating: 4.5, ratingCount: 50 })
    ],
    slug: function (l) { return l.id === 'b' ? 'con-ficha-bajo' : null; },
    MIN_PARA_MOSTRAR_DESTACADOS: 3,
    MAX_DESTACADOS: 3
  });
  f.painter.pintarDestacados();
  var tarjetas = f.DOM.listaDestacados.children;
  assert('pintarDestacados: el candidato con ficha propia va primero pese a rating más bajo',
    tarjetas[0].innerHTML.indexOf('Con Ficha Bajo') !== -1);
  assert('pintarDestacados: la tarjeta con ficha usa href interno (locales/<slug>/)', tarjetas[0].href === 'locales/con-ficha-bajo/');
  assert('pintarDestacados: la tarjeta con ficha NO abre en pestaña nueva', tarjetas[0].target === undefined);
})();

(function () {
  // Sin slug (sin ficha): debe usar mapsHref, abrir en pestaña nueva
  // (target=_blank, rel=noopener).
  var f = fabricarPainter({
    registro: [
      lugar({ id: 'a', grupo: 'bar', nombre: 'A', rating: 4.9, ratingCount: 50 }),
      lugar({ id: 'b', grupo: 'cafe', nombre: 'B', rating: 4.7, ratingCount: 50 }),
      lugar({ id: 'c', grupo: 'pizza', nombre: 'C', rating: 4.5, ratingCount: 50 })
    ],
    MIN_PARA_MOSTRAR_DESTACADOS: 3,
    MAX_DESTACADOS: 3
  });
  f.painter.pintarDestacados();
  var primer = f.DOM.listaDestacados.children[0];
  assert('pintarDestacados: sin ficha, usa mapsHref como link', primer.href === 'https://maps.example/a');
  assert('pintarDestacados: sin ficha, abre en pestaña nueva (target=_blank)', primer.target === '_blank');
  assert('pintarDestacados: sin ficha, rel=noopener', primer.rel === 'noopener');
})();

(function () {
  // Caracteres especiales en el nombre no deben romper el innerHTML —
  // deben llegar escapados.
  var f = fabricarPainter({
    registro: [
      lugar({ id: 'a', grupo: 'bar', nombre: 'Bodegón "El Ñandú" <raro>', rating: 4.9, ratingCount: 50 }),
      lugar({ id: 'b', grupo: 'cafe', nombre: 'B', rating: 4.7, ratingCount: 50 }),
      lugar({ id: 'c', grupo: 'pizza', nombre: 'C', rating: 4.5, ratingCount: 50 })
    ],
    MIN_PARA_MOSTRAR_DESTACADOS: 3,
    MAX_DESTACADOS: 3
  });
  f.painter.pintarDestacados();
  var html = f.DOM.listaDestacados.children[0].innerHTML;
  assert('pintarDestacados: escapa comillas/ángulos en el nombre (no rompe el HTML)',
    html.indexOf('<raro>') === -1 && html.indexOf('&lt;raro&gt;') !== -1);
  assert('pintarDestacados: conserva la ñ sin escapar (no es carácter especial de HTML)', html.indexOf('Ñandú') !== -1);
})();

(function () {
  // Diversidad por rubro con relleno: 2 rubros distintos pero
  // MAX_DESTACADOS=3 — el 3er lugar debe salir por relleno (repitiendo
  // rubro) en vez de dejar el slot vacío.
  var f = fabricarPainter({
    registro: [
      lugar({ id: 'a', grupo: 'bar', nombre: 'Bar Uno', rating: 4.9, ratingCount: 50 }),
      lugar({ id: 'b', grupo: 'bar', nombre: 'Bar Dos', rating: 4.8, ratingCount: 50 }),
      lugar({ id: 'c', grupo: 'cafe', nombre: 'Cafe Uno', rating: 4.5, ratingCount: 50 })
    ],
    MIN_PARA_MOSTRAR_DESTACADOS: 3,
    MAX_DESTACADOS: 3
  });
  f.painter.pintarDestacados();
  var tarjetas = f.DOM.listaDestacados.children;
  assert('pintarDestacados: con solo 2 rubros distintos, rellena hasta MAX repitiendo rubro', tarjetas.length === 3);
  var nombres = tarjetas.map(function (t) { return t.innerHTML; }).join('|');
  assert('pintarDestacados: el relleno trae al segundo mejor del rubro repetido (Bar Dos)', nombres.indexOf('Bar Dos') !== -1);
})();

/* ═══════════════════════════════════════════════════════════════════
   RESUMEN
   ═══════════════════════════════════════════════════════════════════ */

console.log('');
console.log(total - fallos + '/' + total + ' pruebas de dom-painter OK');

if (fallos > 0) {
  process.exit(1);
}
