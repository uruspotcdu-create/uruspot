/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — render-engine-tests.js

   Plan Maestro de Modularización, Fase 4a — validación de
   RenderEngine.calcular() (la mitad DECISORIA de render(), extraída
   de app.js §14 a render-engine.js). Mismo patrón sin framework que
   motor-comparacion-tests.js. Corre con:
     node js/render-engine-tests.js
   Sale con código 1 si algo falla (run-tests.js la integra como
   suite 7/7).

   Por qué existe: el propio render-engine.js documenta en su cabecera
   un incidente de recuperación (import roto, invisible en producción
   por correr sobre un bundle viejo). Hasta este archivo, la lógica de
   decisión de render() — qué rama, qué lista, si hubo cambio real —
   no tenía NINGÚN test automático, pese a ser exactamente la lógica
   que el Plan de Fase 4 (§4B.3) pedía validar rama por rama antes de
   confiar en la extracción. Este archivo cierra ese hueco con la
   misma exigencia que el resto de la red de seguridad del repo.

   Dependencias reales (no mockeadas) donde existen como módulos puros:
   razonesPorLugarId/hayCambioEnLista vienen de pure-utils.js, igual
   que en app.js — así el test ejercita la MISMA lógica de hash de
   IDs que corre en producción, no una reimplementación paralela que
   podría desincronizarse.

   `window` se stubea sobre `global` (mismo criterio que
   global.localStorage en motor-test.js): render-engine.js lee
   `window.URU_COMPARACION` directamente porque en el navegador real
   siempre existe `window` — acá se emula para poder correrlo con
   `node` sin flags ni bundler.
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

if (typeof global.window === 'undefined') {
  global.window = global;
}

var pureUtils = require('./pure-utils.js');
var razonesPorLugarId = pureUtils.razonesPorLugarId;
var hayCambioEnLista = pureUtils.hayCambioEnLista;
var crearRenderEngine = require('./render-engine.js').crearRenderEngine;

var fallos = 0, total = 0;
function assert(desc, cond) {
  total++;
  if (!cond) { fallos++; console.error('✗ ' + desc); }
  else console.log('✓ ' + desc);
}

var RAMA_CURADURIA = 'curaduria';
var RAMA_BUSCADOR = 'buscador';
var RAMA_RECORTE = 'recorte';

function lugar(id) { return { id: id }; }

/**
 * Fabrica una instancia nueva de RenderEngine con mocks controlables.
 * `overrides` permite pisar cualquier dep puntual por test sin
 * repetir todo el bloque.
 */
function fabricarEngine(overrides) {
  overrides = overrides || {};

  var uiState = Object.assign({
    ubicacionUsuario: null,
    filtroRubroActivo: null,
    sorprendemeActivo: false,
    sorpresaSeed: null,
    tandaRecorte: null,
    pedirMasRecorte: false,
    paginaTarjetas: 0,
    ultimaRamaRenderizada: null
  }, overrides.uiState || {});

  var regionNombre = overrides.regionNombre || 'centro';
  var ramaForzada = overrides.rama || RAMA_RECORTE;

  var registro = overrides.registro || [lugar('a'), lugar('b'), lugar('c')];

  var llamadasRecorte = 0;
  var explicadoPorDefecto = overrides.explicado || function () {
    return {
      lugares: [
        { lugar: lugar('r1'), razones: ['cerca'] },
        { lugar: lugar('r2'), razones: ['bien puntuado'] }
      ],
      candidatosEvaluados: 5
    };
  };

  var EXPO = {
    coleccionCurada: overrides.coleccionCurada || function (reg, ids) {
      return reg.filter(function (l) { return ids.indexOf(l.id) !== -1; });
    },
    recortePorIniciativaPropiaExplicado: function (reg, estado, nombreRegion, contexto) {
      llamadasRecorte++;
      return explicadoPorDefecto(reg, estado, nombreRegion, contexto);
    }
  };

  var deps = {
    obtenerRegistro: function () { return registro; },
    razonesPorLugarId: razonesPorLugarId,
    hayCambioEnLista: hayCambioEnLista,
    RAMA_CURADURIA: RAMA_CURADURIA,
    RAMA_BUSCADOR: RAMA_BUSCADOR,
    obtenerEstado: function () { return {}; },
    obtenerPLANO: function () { return { region: function () { return { nombre: regionNombre }; } }; },
    obtenerEXPO: function () { return EXPO; },
    uiState: uiState,
    ClimateContext: { obtener: function () { return null; } },
    ramaActual: function () { return ramaForzada; },
    listaPorAccionExplicita: overrides.listaPorAccionExplicita || function () { return [lugar('x'), lugar('y')]; },
    ordenarPorCercania: function (lista) { return lista; },
    ramaDistinta: function (rama) { return uiState.ultimaRamaRenderizada !== rama; },
    debugLog: function () {}
  };

  return {
    engine: crearRenderEngine(deps),
    uiState: uiState,
    llamadasRecorte: function () { return llamadasRecorte; }
  };
}

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 1 — Rama RAMA_BUSCADOR
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarEngine({ rama: RAMA_BUSCADOR });
  var r = f.engine.calcular({});
  assert('RAMA_BUSCADOR: devuelve resultado (no null) en el primer render', r !== null);
  assert('RAMA_BUSCADOR: usa listaPorAccionExplicita()', r.lista.length === 2 && r.lista[0].id === 'x');
  assert('RAMA_BUSCADOR: opts.origen === accion_explicita', r.opts.origen === 'accion_explicita');
  assert('RAMA_BUSCADOR: opts.narrativa === false', r.opts.narrativa === false);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 2 — Rama RAMA_CURADURIA
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarEngine({
    rama: RAMA_CURADURIA,
    registro: [lugar('a'), lugar('b'), lugar('c')]
  });
  var favoritos = { a: true, b: false, c: true };
  var r = f.engine.calcular(favoritos);
  assert('RAMA_CURADURIA: filtra solo favoritos truthy', r.lista.length === 2 &&
    r.lista.every(function (l) { return l.id === 'a' || l.id === 'c'; }));
  assert('RAMA_CURADURIA: opts.vacioTexto está seteado', typeof r.opts.vacioTexto === 'string' && r.opts.vacioTexto.length > 0);
  assert('RAMA_CURADURIA: opts.comparacion es null sin URU_COMPARACION global', r.opts.comparacion === null);
})();

(function () {
  var f = fabricarEngine({ rama: RAMA_CURADURIA, registro: [lugar('a')] });
  var r = f.engine.calcular({});
  assert('RAMA_CURADURIA: sin favoritos guardados devuelve lista vacía (no rompe)', r.lista.length === 0);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 3 — Rama recorte (iniciativa propia): tanda nueva vs reuso
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarEngine({ rama: RAMA_RECORTE, regionNombre: 'guia' });
  var r1 = f.engine.calcular({});
  assert('recorte: primera tanda llama a recortePorIniciativaPropiaExplicado una vez', f.llamadasRecorte() === 1);
  assert('recorte: lista resultante trae los lugares de la tanda', r1.lista.length === 2 &&
    r1.lista[0].id === 'r1' && r1.lista[1].id === 'r2');
  assert('recorte: opts.razones se completa desde razonesPorLugarId', r1.opts.razones.r1 === 'cerca');
  assert('recorte: hayMasSugerencias true cuando candidatosEvaluados > entregados',
    r1.opts.hayMasSugerencias === true);

  // Segundo render, MISMO estado (misma región/rubro/sorpresa, sin
  // pedirMasRecorte): debe reusar uiState.tandaRecorte sin volver a
  // pegarle al motor de recorte — igual criterio que documenta el
  // comentario "claveTanda"/"tandaVigente" en render-engine.js.
  var r2 = f.engine.calcular({});
  assert('recorte: sin pedirMasRecorte, NO vuelve a llamar al motor', f.llamadasRecorte() === 1);
  assert('recorte: segundo render sin cambios reales devuelve null (nada que pintar)', r2 === null);
})();

(function () {
  var tandaN = 0;
  var f = fabricarEngine({
    rama: RAMA_RECORTE,
    regionNombre: 'guia',
    explicado: function (reg, estado, nombreRegion, contexto) {
      tandaN++;
      // La segunda tanda (pedirMasRecorte=true) debe llegar con
      // excluirIds poblado con los ids de la tanda anterior.
      if (tandaN === 2) {
        return {
          lugares: contexto.excluirIds && contexto.excluirIds.indexOf('r1') !== -1
            ? [{ lugar: lugar('r3'), razones: ['nuevo'] }]
            : [],
          candidatosEvaluados: 5
        };
      }
      return { lugares: [{ lugar: lugar('r1'), razones: ['cerca'] }, { lugar: lugar('r2'), razones: ['top'] }], candidatosEvaluados: 2 };
    }
  });

  var r1 = f.engine.calcular({});
  f.uiState.pedirMasRecorte = true;
  // Forzar detección de cambio en el próximo calcular(): "Mostrar más"
  // en la app real dispara paginaTarjetas++ antes de llamar a render()
  // de nuevo (ver comentario de hayoCambio en render-engine.js).
  f.uiState.paginaTarjetas = 1;
  var r2 = f.engine.calcular({});

  assert('recorte "mostrar más": pasa excluirIds con la tanda anterior', tandaN === 2);
  assert('recorte "mostrar más": acumula la lista base + la nueva tanda',
    r2.lista.length === 3 && r2.lista[2].id === 'r3');
  assert('recorte "mostrar más": pedirMasRecorte se resetea a false', f.uiState.pedirMasRecorte === false);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 4 — Detección de cambios: sin cambios, paginación, favoritos
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarEngine({ rama: RAMA_BUSCADOR });
  var favoritos = {};
  var r1 = f.engine.calcular(favoritos);
  var r2 = f.engine.calcular(favoritos);
  assert('sin cambios: segundo calcular() con mismo estado devuelve null', r1 !== null && r2 === null);
})();

(function () {
  // BUGFIX histórico (ver comentario en render-engine.js): "Cargar
  // más" no cambia rama ni lista candidata, solo uiState.paginaTarjetas.
  // Sin el fix, hayoCambio daba false y esto nunca repintaba.
  var f = fabricarEngine({ rama: RAMA_BUSCADOR });
  var favoritos = {};
  f.engine.calcular(favoritos);
  f.uiState.paginaTarjetas = 1;
  var r2 = f.engine.calcular(favoritos);
  assert('paginación: avanzar paginaTarjetas SÍ produce un render (no null)', r2 !== null);
  assert('paginación: opts.soloAgregarNuevas === true (misma rama/lista/favoritos)', r2.opts.soloAgregarNuevas === true);
})();

(function () {
  // Cambiar de rama en el medio de una "tanda" paginada no debe
  // marcarse como soloAgregarNuevas — es una reconstrucción real.
  var uiStateCompartido = { paginaTarjetas: 0 };
  var f1 = fabricarEngine({ rama: RAMA_BUSCADOR, uiState: uiStateCompartido });
  f1.engine.calcular({});
  // No hay forma directa de cambiar de rama con el mismo engine en
  // este harness (rama se fija al fabricar), así que se verifica la
  // otra cara del mismo chequeo: favoritos distintos por referencia
  // invalidan soloAgregarNuevas aunque la página haya avanzado.
  var f2 = fabricarEngine({ rama: RAMA_BUSCADOR });
  f2.engine.calcular({ a: true });
  f2.uiState.paginaTarjetas = 1;
  var r2 = f2.engine.calcular({ a: true, b: true }); // objeto de favoritos DISTINTO por referencia
  assert('paginación + favoritos nuevos: soloAgregarNuevas === false', r2.opts.soloAgregarNuevas === false);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 5 — Cambio de región y rama anterior
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarEngine({ rama: RAMA_BUSCADOR, regionNombre: 'centro' });
  var r1 = f.engine.calcular({});
  assert('primer render: huboCambioDeRegion === false (no hay región previa)', r1.huboCambioDeRegion === false);
})();

(function () {
  // Región cambia de verdad entre dos calcular() sucesivos: se simula
  // reescribiendo la dep obtenerPLANO a mitad de camino, ya que
  // ramaActual() y regionNombre están fijos en la fábrica del harness.
  var uiState = {
    ubicacionUsuario: null, filtroRubroActivo: null, sorprendemeActivo: false,
    sorpresaSeed: null, tandaRecorte: null, pedirMasRecorte: false,
    paginaTarjetas: 0, ultimaRamaRenderizada: null
  };
  var regionActual = 'centro';
  var deps = {
    obtenerRegistro: function () { return [lugar('a'), lugar('b')]; },
    razonesPorLugarId: razonesPorLugarId,
    hayCambioEnLista: hayCambioEnLista,
    RAMA_CURADURIA: RAMA_CURADURIA,
    RAMA_BUSCADOR: RAMA_BUSCADOR,
    obtenerEstado: function () { return {}; },
    obtenerPLANO: function () { return { region: function () { return { nombre: regionActual }; } }; },
    obtenerEXPO: function () {
      return { coleccionCurada: function () { return []; }, recortePorIniciativaPropiaExplicado: function () { return { lugares: [], candidatosEvaluados: 0 }; } };
    },
    uiState: uiState,
    ClimateContext: { obtener: function () { return null; } },
    ramaActual: function () { return RAMA_BUSCADOR; },
    listaPorAccionExplicita: function () { return [lugar('x')]; },
    ordenarPorCercania: function (l) { return l; },
    ramaDistinta: function (rama) { return uiState.ultimaRamaRenderizada !== rama; },
    debugLog: function () {}
  };
  var engine = crearRenderEngine(deps);
  engine.calcular({});
  regionActual = 'costa';
  uiState.paginaTarjetas = 1; // fuerza que haya "cambio" para no cortar por rama/lista idénticas
  var r2 = engine.calcular({});
  assert('segundo render con región distinta: huboCambioDeRegion === true', r2.huboCambioDeRegion === true);
})();

(function () {
  var f = fabricarEngine({ rama: RAMA_BUSCADOR });
  var r1 = f.engine.calcular({});
  assert('primer render: ramaAnterior es null (no había render previo)', r1.ramaAnterior === null);
  f.uiState.paginaTarjetas = 1;
  var r2 = f.engine.calcular({});
  assert('segundo render: ramaAnterior captura la rama ANTES de pisarla', r2.ramaAnterior === RAMA_BUSCADOR);
  assert('uiState.ultimaRamaRenderizada quedó actualizada a la rama actual', f.uiState.ultimaRamaRenderizada === RAMA_BUSCADOR);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 6 — obtenerCache() / reiniciarCache()
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  var f = fabricarEngine({ rama: RAMA_BUSCADOR });
  f.engine.calcular({});
  var cache1 = f.engine.obtenerCache();
  var cache2 = f.engine.obtenerCache();
  assert('obtenerCache(): devuelve la MISMA referencia mutable entre llamadas', cache1 === cache2);
  assert('obtenerCache(): refleja el último render (lista poblada)', cache1.lista && cache1.lista.length === 2);
})();

(function () {
  var f = fabricarEngine({ rama: RAMA_BUSCADOR });
  f.engine.calcular({});
  f.uiState.paginaTarjetas = 3;
  f.engine.calcular({}); // recalcular para que cache.paginaTarjetas capture el 3
  f.engine.reiniciarCache();
  var cache = f.engine.obtenerCache();
  assert('reiniciarCache(): lista/favoritos/region/rama/html vuelven a null',
    cache.lista === null && cache.favoritos === null && cache.region === null &&
    cache.rama === null && cache.html === null);
  // Paridad de comportamiento documentada en la cabecera del archivo:
  // reiniciarCache() NO toca paginaTarjetas a propósito (mismo criterio
  // que limpiar() en app.js antes de esta extracción).
  assert('reiniciarCache(): NO resetea paginaTarjetas (paridad con el original)', cache.paginaTarjetas === 3);
})();

/* ═══════════════════════════════════════════════════════════════════
   RESUMEN
   ═══════════════════════════════════════════════════════════════════ */

console.log('');
console.log(total - fallos + '/' + total + ' pruebas de render-engine OK');

if (fallos > 0) {
  process.exit(1);
}

