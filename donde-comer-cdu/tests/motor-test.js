/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — tests del motor
   Sin framework: el repo no tenía ninguno, y agregar uno solo para
   esto sería más peso que valor. Corre con: node tests/motor.test.js
   Sale con código 1 si algo falla (sirve para CI).
   ═══════════════════════════════════════════════════════════════════ */

global.localStorage = (function () {
  var store = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; },
    clear: function () { store = {}; }
  };
})();

require('../js/motor-config.js');
require('../js/motor-mapa.js');
var PLANO = require('../js/motor-plano.js');
var EXPO = require('../js/motor-exposicion.js');
var MAPA = global.URU_MAPA;
var CFG = global.URU_CONFIG;

var fallos = 0, total = 0;
function assert(desc, cond) {
  total++;
  if (!cond) { fallos++; console.error('✗ ' + desc); }
  else console.log('✓ ' + desc);
}

/* ── 1. Región: arranque por defecto cae en Guía ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  var r = PLANO.region(e);
  assert('estado inicial (sin evidencia) cae en región Guía', r.nombre === 'guia');
})();

/* ── 2. Aceptar empuja autonomía hacia Exploración/Acción Directa con el tiempo ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  for (var i = 0; i < 10; i++) {
    e = PLANO.aplicarAccion(e, 'aceptar', { lugarId: 'X' + i, porIniciativaPropia: true });
  }
  assert('10 aceptaciones seguidas suben la autonomía por encima del umbral de Guía',
    e.autonomia >= CFG.regiones.autonomiaUmbralGuia);
})();

/* ── 3. Nombrar salta a Acción Directa sin importar la posición previa ── */
(function () {
  var e = PLANO.estadoInicial('cdu'); // autonomía baja → sería Guía
  e = PLANO.aplicarAccion(e, 'nombrar', { consulta: 'bulonera' });
  var r = PLANO.region(e);
  assert('Nombrar fuerza Acción Directa aunque la autonomía sea baja (Guía)',
    r.nombre === 'accionDirecta' && r.variante === 'nombrada');
})();

/* ── 4. Guardar 2 veces en la ventana activa Curaduría; 1 sola vez no ── */
(function () {
  var e1 = PLANO.estadoInicial('cdu');
  e1 = PLANO.aplicarAccion(e1, 'guardar', { lugarId: 'A' });
  assert('un solo Guardar NO activa Curaduría', e1.sesion.curaduriaActiva === false);

  var e2 = PLANO.aplicarAccion(e1, 'guardar', { lugarId: 'B' });
  assert('el segundo Guardar dentro de la ventana SÍ activa Curaduría', e2.sesion.curaduriaActiva === true);
})();

/* ── 5. Decaimiento: un rechazo aislado no empuja el plano ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  var friccionAntes = e.friccion;
  e = PLANO.aplicarAccion(e, 'rechazar', { grupo: 'gastronomia' });
  assert('un rechazo aislado no mueve la fricción tolerable', e.friccion === friccionAntes);
})();

/* ── 6. Decaimiento: un patrón repetido SÍ se vuelve estable ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  var n = CFG.acciones.rechazar.repeticionesParaEstable;
  for (var i = 0; i < n; i++) {
    e = PLANO.aplicarAccion(e, 'rechazar', { grupo: 'gastronomia' });
  }
  var evitar = PLANO.gruposAEvitar(e, Date.now());
  assert('rechazar el mismo rubro ' + n + ' veces lo marca como patrón a evitar',
    evitar.indexOf('gastronomia') !== -1);
})();

/* ── 7. Decaimiento real: rechazos viejos (fuera de ventana) no cuentan ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  var ventanaMs = CFG.acciones.rechazar.ventanaDecaimientoDias * 24 * 3600 * 1000;
  var haceMucho = Date.now() - ventanaMs - 1000;
  var n = CFG.acciones.rechazar.repeticionesParaEstable;
  e.rechazos.gastronomia = [];
  for (var i = 0; i < n; i++) e.rechazos.gastronomia.push(haceMucho);
  var evitar = PLANO.gruposAEvitar(e, Date.now());
  assert('rechazos fuera de la ventana de decaimiento ya no cuentan como patrón',
    evitar.indexOf('gastronomia') === -1);
})();

/* ── 8. Madurez por contexto: el rol depende de aperturas de ESTE contexto ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  assert('0 aperturas → rol anfitrión', PLANO.rolPorAperturas(e.aperturas) === 'anfitrion');
  e.aperturas = 500;
  assert('500 aperturas → rol casa', PLANO.rolPorAperturas(e.aperturas) === 'casa');
  assert('rol casa → sin reposo forzado', PLANO.reposoForzadoActivo(e) === false);
  e.aperturas = 5;
  assert('rol anfitrión → con reposo forzado', PLANO.reposoForzadoActivo(e) === true);
})();

/* ── 9. Presupuesto de exposición: recorta y respeta el tamaño configurado ── */
(function () {
  var registro = [];
  for (var i = 0; i < 50; i++) registro.push({ id: 'L' + i, grupo: 'gastronomia', nombre: 'Lugar ' + i });
  var e = PLANO.estadoInicial('cdu');
  var recorte = EXPO.recortePorIniciativaPropia(registro, e, 'guia');
  assert('el recorte de Guía nunca supera el tamaño configurado', recorte.length <= CFG.exposicion.recorteGuia);
  assert('el recorte de Guía nunca muestra el catálogo completo (50 lugares)', recorte.length < registro.length);
})();

/* ── 10. Exposición explícita (búsqueda) NO aplica presupuesto ── */
(function () {
  var registro = [];
  for (var i = 0; i < 50; i++) registro.push({ id: 'L' + i, grupo: 'gastronomia', nombre: 'Pizza ' + i, categoria: 'pizzería', direccion: '' });
  var resultados = EXPO.resultadosPorAccionExplicita(registro, 'pizza');
  assert('una búsqueda explícita devuelve TODOS los que matchean, sin recorte artificial', resultados.length === 50);
})();

/* ── 11. Mapa: la herramienta solo aparece con criterio espacial en Acción Directa ── */
(function () {
  assert('"cerca de mí" se detecta como consulta espacial', MAPA.esConsultaEspacial('algo cerca de mí'));
  assert('"bulonera uruguay" NO se detecta como consulta espacial', !MAPA.esConsultaEspacial('bulonera uruguay'));
  assert('el mapa-herramienta no aparece en Guía aunque la consulta sea espacial',
    MAPA.debeMostrarHerramienta('guia', 'cerca de mí') === false);
  assert('el mapa-herramienta sí aparece en Acción Directa con consulta espacial',
    MAPA.debeMostrarHerramienta('accionDirecta', 'cerca de mí') === true);
})();

/* ── 12. Mapa: la textura nunca supera la densidad máxima configurada ── */
(function () {
  var registro = [];
  for (var i = 0; i < 1468; i++) registro.push({ id: 'L' + i, lat: -32.48, lng: -58.24 });
  var puntos = MAPA.puntosTextura(registro);
  assert('la textura ambiental nunca muestra las 1.468 posiciones', puntos.length <= CFG.mapa.texturaDensidadMax);
})();

console.log('\n' + (total - fallos) + '/' + total + ' pruebas OK');
if (fallos > 0) process.exit(1);
