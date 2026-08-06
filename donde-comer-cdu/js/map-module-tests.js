/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — map-module-tests.js

   Plan Maestro de Modularización, Fase 6 — validación de las cuatro
   funciones migradas a map-module.js (inicializarMotorMapa/
   resaltarTarjeta, internas; actualizarHerramienta, actualizarTextura,
   públicas). Mismo patrón sin framework que render-engine-tests.js/
   dom-painter-tests.js. Corre con:
     node js/map-module-tests.js
   Sale con código 1 si algo falla (run-tests.js la integra en SUITES).

   DOM/motor de mapa falsos: mismo criterio que dom-painter-tests.js —
   sin jsdom (repo cero-dependencias para tests), stubs mínimos con
   exactamente lo que map-module.js realmente toca. `motorMapa` se
   simula como un objeto con los mismos métodos que expone
   motor-mapa.js real (on/establecerPuntos/encuadrarTodos/
   establecerMarcadorUsuario/quitarMarcadorUsuario) — el motor Canvas
   en sí NO se testea acá (es motor-test.js quien cubre motor-mapa.js
   con la API real), solo el WIRING entre ese motor y el resto de la
   app.

   `window` se stubea sobre `global` (mismo criterio que
   render-engine-tests.js).
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

if (typeof global.window === 'undefined') {
  global.window = global;
}
if (typeof global.document === 'undefined') {
  global.document = {
    createDocumentFragment: function () {
      return { children: [], appendChild: function (n) { this.children.push(n); } };
    },
    createElement: function () {
      return { style: { setProperty: function () {} }, className: '' };
    }
  };
}

var crearMapaModulo = require('./map-module.js').crearMapaModulo;

var fallos = 0, total = 0;
function assert(desc, cond) {
  total++;
  if (!cond) { fallos++; console.error('✗ ' + desc); }
  else console.log('✓ ' + desc);
}

function lugar(id, overrides) {
  return Object.assign({
    id: id, lat: -32.48, lng: -58.23, nombre: 'Lugar ' + id,
    direccion: 'Calle ' + id, grupo: 'gastronomia'
  }, overrides || {});
}

/**
 * Nodo DOM falso mínimo: querySelector delega en un mapa id → nodo,
 * classList es un Set-like simple. Suficiente para resaltarTarjeta()
 * (única función que hace querySelector sobre panelDescubrimiento).
 */
function crearPanelFalso() {
  var tarjetas = {};
  return {
    _tarjetas: tarjetas,
    _registrarTarjeta: function (id) {
      var clases = {};
      var nodo = {
        classList: {
          add: function (c) { clases[c] = true; },
          remove: function (c) { delete clases[c]; },
          contains: function (c) { return !!clases[c]; }
        },
        scrollIntoView: function () {}
      };
      tarjetas[id] = nodo;
      return nodo;
    },
    querySelector: function (sel) {
      // '.tarjeta--resaltada' (buscar la resaltada actual) o
      // '[data-lugar-id="X"]' (buscar por id).
      if (sel === '.tarjeta--resaltada') {
        for (var id in tarjetas) {
          if (tarjetas[id].classList.contains('tarjeta--resaltada')) return tarjetas[id];
        }
        return null;
      }
      var m = /data-lugar-id="([^"]+)"/.exec(sel);
      return m ? (tarjetas[m[1]] || null) : null;
    }
  };
}

/**
 * Fabrica una instancia nueva de MapaModulo con mocks controlables.
 */
function fabricarModulo(overrides) {
  overrides = overrides || {};

  var panel = overrides.panel || crearPanelFalso();
  var DOM = Object.assign({
    mapaHerramienta: {},
    mapaContainer: { dataset: {}, hidden: true },
    mapaInfo: { hidden: true, textContent: '' },
    mapaLeyenda: { hidden: true },
    mapaTextura: null, // ver auditoría en map-module.js: siempre null en producción hoy
    panelDescubrimiento: panel
  }, overrides.DOM || {});

  var uiState = Object.assign({
    cercaTuyoActivo: false,
    ubicacionUsuario: null
  }, overrides.uiState || {});

  var registro = overrides.registro || [];

  var llamadas = { establecerPuntos: 0, encuadrarTodos: 0, marcadorUsuario: 0, quitarMarcador: 0 };
  var motorMapaFalso = {
    _handlers: {},
    on: function (evento, cb) { this._handlers[evento] = cb; },
    establecerPuntos: function (puntos) { llamadas.establecerPuntos++; this._ultimosPuntos = puntos; },
    encuadrarTodos: function (padding) { llamadas.encuadrarTodos++; this._ultimoPadding = padding; },
    establecerMarcadorUsuario: function () { llamadas.marcadorUsuario++; },
    quitarMarcadorUsuario: function () { llamadas.quitarMarcador++; }
  };

  var motorMapaCrearLlamado = 0;
  window.URU_MOTOR_MAPA_RENDER = overrides.hasOwnProperty('motorMapaRender')
    ? overrides.motorMapaRender
    : { crear: function () { motorMapaCrearLlamado++; return motorMapaFalso; } };

  var MAPA = overrides.MAPA || {
    debeMostrarHerramienta: function () { return overrides.debeMostrar !== undefined ? overrides.debeMostrar : true; },
    puntosHerramienta: function (lista) { return lista; },
    puntosTextura: function (reg) { return reg; }
  };

  var favoritos = overrides.favoritos || {};
  var pintarLeyendaLlamadas = [];
  var DomPainter = overrides.DomPainter || {
    pintarLeyenda: function (puntos) { pintarLeyendaLlamadas.push(puntos); }
  };

  var deps = {
    DOM: DOM,
    getMAPA: function () { return MAPA; },
    uiState: uiState,
    obtenerRegistro: function () { return registro; },
    leerFavoritos: function () { return favoritos; },
    DomPainter: DomPainter,
    cssEscape: overrides.cssEscape || function (s) { return s; },
    slug: overrides.slug || function (l) { return 'slug-' + l.id; },
    MAPA_PADDING_GUIA_PX: 40,
    MAPA_PADDING_EXPLORACION_PX: 20
  };

  return {
    modulo: crearMapaModulo(deps),
    DOM: DOM,
    uiState: uiState,
    panel: panel,
    motorMapaFalso: motorMapaFalso,
    llamadas: llamadas,
    motorMapaCrearLlamado: function () { return motorMapaCrearLlamado; },
    pintarLeyendaLlamadas: pintarLeyendaLlamadas
  };
}

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 1 — actualizarHerramienta(): mostrar/ocultar
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarModulo({ debeMostrar: false });
  f.modulo.actualizarHerramienta('guia', []);
  assert('debeMostrar=false: oculta mapaHerramienta', f.DOM.mapaHerramienta.hidden === true);
  assert('debeMostrar=false: oculta mapaInfo', f.DOM.mapaInfo.hidden === true);
  assert('debeMostrar=false: oculta mapaLeyenda', f.DOM.mapaLeyenda.hidden === true);
  assert('debeMostrar=false: oculta mapaContainer', f.DOM.mapaContainer.hidden === true);
  assert('debeMostrar=false: NO llega a crear el motor de mapa', f.motorMapaCrearLlamado() === 0);
})();

(function () {
  var f = fabricarModulo({ debeMostrar: true });
  f.modulo.actualizarHerramienta('exploracion', [lugar('a')]);
  assert('debeMostrar=true: muestra mapaHerramienta', f.DOM.mapaHerramienta.hidden === false);
  assert('debeMostrar=true: muestra mapaContainer', f.DOM.mapaContainer.hidden === false);
  assert('debeMostrar=true: muestra mapaInfo', f.DOM.mapaInfo.hidden === false);
  assert('debeMostrar=true: setea data-region en mapaContainer', f.DOM.mapaContainer.dataset.region === 'exploracion');
  assert('debeMostrar=true: inicializa el motor de mapa (lazy) una sola vez', f.motorMapaCrearLlamado() === 1);
})();

(function () {
  // Segunda llamada con el mismo módulo: el motor ya existe, no debe
  // volver a inicializarse (lazy init real, no una vez por llamada).
  var f = fabricarModulo({ debeMostrar: true });
  f.modulo.actualizarHerramienta('guia', [lugar('a')]);
  f.modulo.actualizarHerramienta('guia', [lugar('b')]);
  assert('lazy init: el motor se crea una sola vez a través de renders sucesivos', f.motorMapaCrearLlamado() === 1);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 2 — actualizarHerramienta(): puntos, filtro de coordenadas,
   marcador de usuario, leyenda
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarModulo({
    debeMostrar: true,
    favoritos: { a: true }
  });
  var lista = [lugar('a'), lugar('b', { lat: 'no-numero', lng: -58 }), lugar('c', { lng: undefined })];
  f.modulo.actualizarHerramienta('guia', lista);

  assert('filtra lugares sin lat/lng numéricos antes de pasarlos al motor',
    f.motorMapaFalso._ultimosPuntos.length === 1 && f.motorMapaFalso._ultimosPuntos[0].id === 'a');
  assert('marca esFavorito según leerFavoritos()', f.motorMapaFalso._ultimosPuntos[0].esFavorito === true);
  assert('arma href con el slug provisto', f.motorMapaFalso._ultimosPuntos[0].href === 'locales/slug-a/');
  assert('encuadrarTodos() recibe el padding de GUIA cuando la región no es exploración', f.motorMapaFalso._ultimoPadding === 40);
  assert('pintarLeyenda() recibe los mismos puntos calculados', f.pintarLeyendaLlamadas.length === 1 &&
    f.pintarLeyendaLlamadas[0][0].id === 'a');
  assert('mapaInfo informa cuántos lugares se muestran cuando no hay recorte', f.DOM.mapaInfo.textContent.indexOf('1 lugar') === 0);
})();

(function () {
  var f = fabricarModulo({ debeMostrar: true });
  f.modulo.actualizarHerramienta('exploracion', [lugar('a')]);
  assert('encuadrarTodos() recibe el padding de EXPLORACIÓN en esa región', f.motorMapaFalso._ultimoPadding === 20);
})();

(function () {
  var f = fabricarModulo({
    debeMostrar: true,
    uiState: { cercaTuyoActivo: true, ubicacionUsuario: { lat: -32.4, lng: -58.2 } }
  });
  f.modulo.actualizarHerramienta('guia', [lugar('a')]);
  assert('cerca de mí activo con ubicación: establece el marcador de usuario', f.llamadas.marcadorUsuario === 1);
  assert('cerca de mí activo con ubicación: NO lo quita', f.llamadas.quitarMarcador === 0);
})();

(function () {
  var f = fabricarModulo({ debeMostrar: true }); // cercaTuyoActivo=false por defecto
  f.modulo.actualizarHerramienta('guia', [lugar('a')]);
  assert('sin cerca de mí: quita el marcador de usuario en vez de establecerlo', f.llamadas.quitarMarcador === 1 && f.llamadas.marcadorUsuario === 0);
})();

(function () {
  var f = fabricarModulo({ debeMostrar: true });
  var recortada = [lugar('a')]; // MAPA.puntosHerramienta recorta a 1 de 2
  var f2 = fabricarModulo({
    debeMostrar: true,
    MAPA: {
      debeMostrarHerramienta: function () { return true; },
      puntosHerramienta: function () { return recortada; }
    }
  });
  f2.modulo.actualizarHerramienta('guia', [lugar('a'), lugar('b')]);
  assert('mapaInfo avisa recorte cuando puntosHerramienta() devuelve menos que conCoordenadas',
    f2.DOM.mapaInfo.textContent.indexOf('Mostrando 1 de 2') === 0);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 3 — hover/hoverOut/click del motor → resaltarTarjeta()
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarModulo({ debeMostrar: true });
  f.panel._registrarTarjeta('a');
  f.panel._registrarTarjeta('b');
  f.modulo.actualizarHerramienta('guia', [lugar('a')]);

  f.motorMapaFalso._handlers.hover({ id: 'a' });
  assert('hover del motor: resalta la tarjeta correspondiente', f.panel._tarjetas.a.classList.contains('tarjeta--resaltada'));

  f.motorMapaFalso._handlers.hoverOut();
  assert('hoverOut del motor: quita el resaltado', !f.panel._tarjetas.a.classList.contains('tarjeta--resaltada'));
})();

(function () {
  var f = fabricarModulo({ debeMostrar: true });
  f.panel._registrarTarjeta('a');
  f.panel._registrarTarjeta('b');
  f.modulo.actualizarHerramienta('guia', [lugar('a'), lugar('b')]);

  f.motorMapaFalso._handlers.hover({ id: 'a' });
  f.motorMapaFalso._handlers.hover({ id: 'b' });
  assert('resaltarTarjeta: solo una tarjeta resaltada a la vez (la anterior se limpia)',
    !f.panel._tarjetas.a.classList.contains('tarjeta--resaltada') &&
    f.panel._tarjetas.b.classList.contains('tarjeta--resaltada'));
})();

(function () {
  var f = fabricarModulo({ debeMostrar: true });
  var nodo = f.panel._registrarTarjeta('a');
  var scrolleo = false;
  nodo.scrollIntoView = function () { scrolleo = true; };
  f.modulo.actualizarHerramienta('guia', [lugar('a')]);

  f.motorMapaFalso._handlers.click({ id: 'a' });
  assert('click del motor: hace scrollIntoView en la tarjeta correspondiente', scrolleo === true);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 4 — getMotorMapa()
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarModulo({ debeMostrar: true });
  assert('getMotorMapa(): null antes de cualquier actualizarHerramienta()', f.modulo.getMotorMapa() === null);
  f.modulo.actualizarHerramienta('guia', [lugar('a')]);
  assert('getMotorMapa(): devuelve la instancia real una vez inicializado el motor', f.modulo.getMotorMapa() === f.motorMapaFalso);
})();

(function () {
  // window.URU_MOTOR_MAPA_RENDER ausente: no debe romper, motorMapa
  // queda null y getMotorMapa() lo refleja.
  var f = fabricarModulo({ debeMostrar: true, motorMapaRender: null });
  f.modulo.actualizarHerramienta('guia', [lugar('a')]);
  assert('sin URU_MOTOR_MAPA_RENDER: no crea el motor ni rompe', f.modulo.getMotorMapa() === null);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 5 — actualizarTextura()
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarModulo({ registro: [lugar('a')] });
  window.URU_CONFIG = { mapa: { texturaSiempreVisible: true } };
  // AUDITORÍA (ver cabecera de map-module.js): DOM.mapaTextura es
  // siempre null en producción hoy (no está en REQUIRED_DOM_IDS ni
  // OPTIONAL_DOM_IDS) — este test documenta ese comportamiento
  // preexistente, no lo corrige.
  f.modulo.actualizarTextura();
  assert('actualizarTextura(): sin DOM.mapaTextura, retorna sin romper (bug preexistente documentado)', true);
})();

(function () {
  var pintado = false;
  var mapaTexturaFalso = {
    dataset: {},
    appendChild: function () { pintado = true; },
    get dataset_pintado() { return this.dataset.pintado; }
  };
  var f = fabricarModulo({
    registro: [lugar('a'), lugar('b', { lat: undefined })],
    DOM: { mapaTextura: mapaTexturaFalso }
  });
  window.URU_CONFIG = { mapa: { texturaSiempreVisible: true } };
  f.modulo.actualizarTextura();
  assert('actualizarTextura(): con mapaTextura presente, pinta y marca dataset.pintado', pintado === true && mapaTexturaFalso.dataset.pintado === '1');
})();

(function () {
  var mapaTexturaFalso = { dataset: { pintado: '1' }, appendChild: function () { throw new Error('no debería pintar de nuevo'); } };
  var f = fabricarModulo({
    registro: [lugar('a')],
    DOM: { mapaTextura: mapaTexturaFalso }
  });
  window.URU_CONFIG = { mapa: { texturaSiempreVisible: true } };
  f.modulo.actualizarTextura(); // no debe lanzar
  assert('actualizarTextura(): ya pintado (dataset.pintado=1) no vuelve a pintar', true);
})();

(function () {
  var mapaTexturaFalso = { dataset: {}, appendChild: function () { throw new Error('no debería pintar'); } };
  var f = fabricarModulo({
    registro: [lugar('a')],
    DOM: { mapaTextura: mapaTexturaFalso }
  });
  window.URU_CONFIG = { mapa: { texturaSiempreVisible: false } };
  f.modulo.actualizarTextura();
  assert('actualizarTextura(): texturaSiempreVisible=false no pinta', mapaTexturaFalso.dataset.pintado === undefined);
})();

/* ═══════════════════════════════════════════════════════════════════
   RESUMEN
   ═══════════════════════════════════════════════════════════════════ */

console.log('');
console.log(total - fallos + '/' + total + ' pruebas de map-module OK');

if (fallos > 0) {
  process.exit(1);
}
