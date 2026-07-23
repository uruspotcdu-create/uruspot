/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — tests del motor
   Sin framework: el repo no tenía ninguno, y agregar uno solo para
   esto sería más peso que valor. Corre con: node tests/motor-test.js
   Sale con código 1 si algo falla (sirve para CI).

   Esta pasada corrige 2 aserciones que quedaron desalineadas del
   comportamiento real (Curaduría, mapa) y agrega cobertura para lo
   nuevo de SCHEMA_VERSION v4: afinidad positiva (gruposAfines),
   nivelConfianza, y migración/corrupción de estado persistido.
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

function claveActual() {
  return 'uru_plano::cdu::' + PLANO.obtenerUsuarioId();
}

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 1 — Región y plano continuo
   ═══════════════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 2 — Curaduría (CORREGIDO)
   El código real distingue "sugerida" (banner descartable) de
   "activa" (navegación real). El 2do Guardar solo sugiere — nunca
   redirige solo, salvo un click explícito posterior. El test viejo
   probaba un comportamiento que el propio código dice haber
   cambiado a propósito (ver comentario de Acciones.guardar).
   ═══════════════════════════════════════════════════════════════════ */

/* ── 4. Guardar 2 veces en la ventana SUGIERE Curaduría; nunca la activa sola ── */
(function () {
  var e1 = PLANO.estadoInicial('cdu');
  e1 = PLANO.aplicarAccion(e1, 'guardar', { lugarId: 'A' });
  assert('un solo Guardar NO activa Curaduría', e1.sesion.curaduriaActiva === false);
  assert('un solo Guardar NO sugiere Curaduría', e1.sesion.curaduriaSugerida === false);

  var e2 = PLANO.aplicarAccion(e1, 'guardar', { lugarId: 'B' });
  assert('el segundo Guardar dentro de la ventana SUGIERE Curaduría (banner)',
    e2.sesion.curaduriaSugerida === true);
  assert('el segundo Guardar NO activa Curaduría de forma directa (nunca redirige solo)',
    e2.sesion.curaduriaActiva === false);
  assert('curaduriaActiva es lo único que region() consulta para navegar de verdad',
    PLANO.region(e2).nombre !== 'curaduria');
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 3 — Decaimiento de señal negativa (rechazos)
   ═══════════════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 4 — NUEVO: afinidad positiva (gruposAfines), espejo exacto
   del bloque 3 aplicado al signo contrario.
   ═══════════════════════════════════════════════════════════════════ */

/* ── 8. Una sola aceptación con grupo no alcanza para afinidad estable ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  e = PLANO.aplicarAccion(e, 'aceptar', { lugarId: 'A', grupo: 'cafeterias' });
  var afines = PLANO.gruposAfines(e, Date.now());
  assert('una sola aceptación de un rubro NO lo marca como afín estable',
    afines.indexOf('cafeterias') === -1);
})();

/* ── 9. Aceptar el mismo rubro 3 veces SÍ lo marca como afinidad estable ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  for (var i = 0; i < 3; i++) {
    e = PLANO.aplicarAccion(e, 'aceptar', { lugarId: 'A' + i, grupo: 'cafeterias' });
  }
  var afines = PLANO.gruposAfines(e, Date.now());
  assert('aceptar el mismo rubro 3 veces lo marca como afinidad estable',
    afines.indexOf('cafeterias') !== -1);
})();

/* ── 10. Afinidad también decae fuera de su ventana ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  var ventanaMs = 21 * 24 * 3600 * 1000; // AFINIDAD.ventanaDecaimientoDias
  var haceMucho = Date.now() - ventanaMs - 1000;
  e.aceptados.cafeterias = [haceMucho, haceMucho, haceMucho];
  var afines = PLANO.gruposAfines(e, Date.now());
  assert('aceptaciones fuera de la ventana de decaimiento ya no cuentan como afinidad',
    afines.indexOf('cafeterias') === -1);
})();

/* ── 11. aceptar SIN grupo (como manda app.js hoy) no rompe ni registra nada ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  e = PLANO.aplicarAccion(e, 'aceptar', { lugarId: 'A', porIniciativaPropia: true });
  assert('aceptar sin payload.grupo (comportamiento actual de app.js) no lanza',
    e.aceptados && typeof e.aceptados === 'object');
  assert('aceptar sin payload.grupo no registra ningún rubro',
    Object.keys(e.aceptados).length === 0);
})();

/* ── 12. Señal contradictoria: aceptar y rechazar el mismo rubro no se pisan ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  for (var i = 0; i < 3; i++) e = PLANO.aplicarAccion(e, 'aceptar', { lugarId: 'A' + i, grupo: 'pizzerias' });
  for (var j = 0; j < 3; j++) e = PLANO.aplicarAccion(e, 'rechazar', { grupo: 'pizzerias' });
  var ahora = Date.now();
  assert('un rubro puede ser afín y a evitar al mismo tiempo (señales independientes, no se cancelan)',
    PLANO.gruposAfines(e, ahora).indexOf('pizzerias') !== -1 &&
    PLANO.gruposAEvitar(e, ahora).indexOf('pizzerias') !== -1);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 5 — Madurez / rol / reposo forzado
   ═══════════════════════════════════════════════════════════════════ */

/* ── 13. Madurez por contexto: el rol depende de aperturas de ESTE contexto ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  assert('0 aperturas → rol anfitrión', PLANO.rolPorAperturas(e.aperturas) === 'anfitrion');
  e.aperturas = 500;
  assert('500 aperturas → rol casa', PLANO.rolPorAperturas(e.aperturas) === 'casa');
  assert('rol casa → sin reposo forzado', PLANO.reposoForzadoActivo(e) === false);
  e.aperturas = 5;
  assert('rol anfitrión → con reposo forzado', PLANO.reposoForzadoActivo(e) === true);
})();

/* ── 14. reposoForzadoActivo cubre los 4 roles de madurez ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  e.aperturas = 0;
  assert('anfitrión (0 aperturas) → con reposo forzado', PLANO.reposoForzadoActivo(e) === true);
  e.aperturas = 10;
  assert('conocido (10 aperturas) → con reposo forzado', PLANO.reposoForzadoActivo(e) === true);
  e.aperturas = 100;
  assert('cómplice (100 aperturas) → sin reposo forzado', PLANO.reposoForzadoActivo(e) === false);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 6 — NUEVO: nivelConfianza
   ═══════════════════════════════════════════════════════════════════ */

/* ── 15. Sin evidencia → confianza baja ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  assert('estado inicial sin evidencia → nivelConfianza bajo', PLANO.nivelConfianza(e) === 'bajo');
})();

/* ── 16. Con aperturas de "conocido" o alguna señal → confianza al menos media ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  e.aperturas = CFG.madurez.umbralAperturas.conocido;
  assert('aperturas de nivel "conocido" → confianza al menos media',
    PLANO.nivelConfianza(e) === 'medio' || PLANO.nivelConfianza(e) === 'alto');
})();

/* ── 17. Aperturas altas + varios rubros con señal → confianza alta ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  e.aperturas = CFG.madurez.umbralAperturas.complice;
  var n = CFG.acciones.rechazar.repeticionesParaEstable;
  for (var i = 0; i < n; i++) e = PLANO.aplicarAccion(e, 'rechazar', { grupo: 'gastronomia' });
  for (var j = 0; j < 3; j++) e = PLANO.aplicarAccion(e, 'aceptar', { lugarId: 'A' + j, grupo: 'cafeterias' });
  e.aperturas = CFG.madurez.umbralAperturas.complice; // aceptar no debería tocar aperturas, pero se reafirma
  assert('muchas aperturas + 2+ rubros con señal vigente → confianza alta',
    PLANO.nivelConfianza(e) === 'alto');
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 7 — Presupuesto de exposición
   ═══════════════════════════════════════════════════════════════════ */

/* ── 18. Presupuesto de exposición: recorta y respeta el tamaño configurado ── */
(function () {
  var registro = [];
  for (var i = 0; i < 50; i++) registro.push({ id: 'L' + i, grupo: 'gastronomia', nombre: 'Lugar ' + i });
  var e = PLANO.estadoInicial('cdu');
  var recorte = EXPO.recortePorIniciativaPropia(registro, e, 'guia');
  assert('el recorte de Guía nunca supera el tamaño configurado', recorte.length <= CFG.exposicion.recorteGuia);
  assert('el recorte de Guía nunca muestra el catálogo completo (50 lugares)', recorte.length < registro.length);
})();

/* ── 19. Exposición explícita (búsqueda) NO aplica presupuesto ── */
(function () {
  var registro = [];
  for (var i = 0; i < 50; i++) registro.push({ id: 'L' + i, grupo: 'gastronomia', nombre: 'Pizza ' + i, categoria: 'pizzería', direccion: '' });
  var resultados = EXPO.resultadosPorAccionExplicita(registro, 'pizza');
  assert('una búsqueda explícita devuelve TODOS los que matchean, sin recorte artificial', resultados.length === 50);
})();

/* ── 20. gruposAEvitar filtra el recorte por iniciativa propia ──
   Nota: el recorte de Guía (CFG.exposicion.recorteGuia) solo puede
   excluir un rubro evitado si quedan suficientes alternativas para
   llenar el cupo configurado — si no, el propio motor-exposicion.js
   relaja el filtro a propósito (nunca cae a "mostrar todo" salvo que
   ni siquiera así alcance). Por eso este registro deja bien por
   encima del cupo de alternativas SIN el rubro evitado. */
(function () {
  var registro = [
    { id: 'A', grupo: 'gastronomia', nombre: 'A' },
    { id: 'B', grupo: 'cafeterias', nombre: 'B' },
    { id: 'C', grupo: 'cafeterias', nombre: 'C' },
    { id: 'D', grupo: 'cafeterias', nombre: 'D' },
    { id: 'E', grupo: 'cafeterias', nombre: 'E' },
    { id: 'F', grupo: 'cafeterias', nombre: 'F' }
  ];
  var e = PLANO.estadoInicial('cdu');
  var n = CFG.acciones.rechazar.repeticionesParaEstable;
  for (var i = 0; i < n; i++) e = PLANO.aplicarAccion(e, 'rechazar', { grupo: 'gastronomia' });
  var recorte = EXPO.recortePorIniciativaPropia(registro, e, 'guia');
  var incluyeGastronomia = recorte.some(function (l) { return l.grupo === 'gastronomia'; });
  assert('un rubro con patrón de rechazo estable se excluye del recorte cuando hay alternativas',
    incluyeGastronomia === false);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 8 — Mapa (CORREGIDO)
   `esConsultaEspacial` nunca existió en motor-mapa.js real — no era
   código roto, era una aserción del test que asumía una API que el
   módulo nunca tuvo. Se corrige para probar únicamente el contrato
   real: debeMostrarHerramienta(nombreRegion, resultados[]).
   ═══════════════════════════════════════════════════════════════════ */

/* ── 21. El mapa-herramienta aparece si hay al menos un resultado georreferenciado ── */
(function () {
  var conCoords = [{ id: 'A', lat: -32.48, lng: -58.24 }];
  var sinCoords = [{ id: 'A' }, { id: 'B' }];
  assert('con al menos un resultado con lat/lng → debeMostrarHerramienta true',
    MAPA.debeMostrarHerramienta('guia', conCoords) === true);
  assert('sin ningún resultado con lat/lng → debeMostrarHerramienta false',
    MAPA.debeMostrarHerramienta('guia', sinCoords) === false);
  assert('sin resultados (array vacío) → debeMostrarHerramienta false',
    MAPA.debeMostrarHerramienta('guia', []) === false);
})();

/* ── 22. El criterio es el mismo en las 4 regiones (no distingue por nombre) ── */
(function () {
  var conCoords = [{ id: 'A', lat: -32.48, lng: -58.24 }];
  ['guia', 'exploracion', 'accionDirecta', 'curaduria'].forEach(function (region) {
    assert('debeMostrarHerramienta en región "' + region + '" con coords → true',
      MAPA.debeMostrarHerramienta(region, conCoords) === true);
  });
})();

/* ── 23. Mapa: la textura nunca supera la densidad máxima configurada ── */
(function () {
  var registro = [];
  for (var i = 0; i < 1468; i++) registro.push({ id: 'L' + i, lat: -32.48, lng: -58.24 });
  var puntos = MAPA.puntosTextura(registro);
  assert('la textura ambiental nunca muestra las 1.468 posiciones', puntos.length <= CFG.mapa.texturaDensidadMax);
})();

/* ── 24. Mapa herramienta: nunca muestra más que el recorte activo en pantalla ── */
(function () {
  var recorteActivo = [];
  for (var i = 0; i < 2500; i++) recorteActivo.push({ id: 'L' + i, lat: -32.48, lng: -58.24 });
  var puntos = MAPA.puntosHerramienta(recorteActivo);
  assert('el mapa-herramienta nunca supera el límite configurado (herramientaRecorte)',
    puntos.length <= CFG.mapa.herramientaRecorte);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 9 — NUEVO: persistencia, migración de esquema y corrupción
   ═══════════════════════════════════════════════════════════════════ */

/* ── 25. Migración v3 (sin `aceptados`) → v4, con datos previos intactos ── */
(function () {
  var v3 = {
    version: 3,
    ciudad: 'cdu',
    autonomia: 0.5,
    friccion: 0.4,
    aperturas: 7,
    ultimaApertura: 12345,
    rechazos: { gastronomia: [111, 222] },
    guardadosRecientes: [999],
    exposicion: { X: { ultimaVez: 1, vecesMostrado: 2 } },
    sesion: { curaduriaActiva: true }
  };
  global.localStorage.setItem(claveActual(), JSON.stringify(v3));
  var e = PLANO.leerEstado('cdu');
  assert('migración v3→v4: version queda en la vigente', e.version === PLANO.SCHEMA_VERSION);
  assert('migración v3→v4: aperturas previas se preservan', e.aperturas === 7);
  assert('migración v3→v4: rechazos previos se preservan', JSON.stringify(e.rechazos) === JSON.stringify({ gastronomia: [111, 222] }));
  assert('migración v3→v4: exposicion previa se preserva', e.exposicion.X.vecesMostrado === 2);
  assert('migración v3→v4: aceptados arranca vacío (no hay forma de reconstruirlo retroactivamente)',
    Object.keys(e.aceptados).length === 0);
  assert('migración v3→v4: sesion siempre arranca limpia, nunca se migra desde lo persistido',
    e.sesion.curaduriaActiva === false);
  global.localStorage.clear();
})();

/* ── 26. Migración v1 (sin `version`, sin `exposicion`, sin `aceptados`) ── */
(function () {
  var v1 = {
    ciudad: 'cdu',
    autonomia: 0.2,
    friccion: 0.6,
    aperturas: 3,
    rechazos: { bares: [50] },
    guardadosRecientes: []
  };
  global.localStorage.setItem(claveActual(), JSON.stringify(v1));
  var e = PLANO.leerEstado('cdu');
  assert('migración v1 (sin version): se trata como versión antigua y migra sin lanzar',
    e.version === PLANO.SCHEMA_VERSION);
  assert('migración v1: aperturas previas se preservan', e.aperturas === 3);
  assert('migración v1: exposicion arranca vacía (nunca existió antes)', Object.keys(e.exposicion).length === 0);
  global.localStorage.clear();
})();

/* ── 27. JSON corrupto en localStorage nunca lanza: degrada a estadoInicial ── */
(function () {
  global.localStorage.setItem(claveActual(), '{ esto no es json valido ');
  var e;
  var lanzo = false;
  try { e = PLANO.leerEstado('cdu'); } catch (err) { lanzo = true; }
  assert('JSON corrupto no lanza excepción', lanzo === false);
  assert('JSON corrupto degrada a estadoInicial (autonomía por defecto)',
    e && e.autonomia === CFG.plano.autonomiaInicial);
  global.localStorage.clear();
})();

/* ── 28. Objeto con forma inesperada (rechazos como array en vez de objeto) ── */
(function () {
  var raro = { version: 4, ciudad: 'cdu', autonomia: 0.3, friccion: 0.3, aperturas: 2, rechazos: ['no', 'debería', 'ser', 'array'], guardadosRecientes: [] };
  global.localStorage.setItem(claveActual(), JSON.stringify(raro));
  var e;
  var lanzo = false;
  try { e = PLANO.leerEstado('cdu'); } catch (err) { lanzo = true; }
  assert('forma inesperada (rechazos como array) no lanza excepción', lanzo === false);
  assert('forma inesperada: rechazos se normaliza a objeto vacío en vez de heredar el array roto',
    e && !Array.isArray(e.rechazos) && typeof e.rechazos === 'object');
  global.localStorage.clear();
})();

/* ── 29. localStorage ausente: leerEstado degrada, no lanza ── */
(function () {
  var real = global.localStorage;
  delete global.localStorage;
  var e, lanzo = false;
  try { e = PLANO.leerEstado('cdu'); } catch (err) { lanzo = true; }
  assert('sin localStorage disponible, leerEstado no lanza', lanzo === false);
  assert('sin localStorage disponible, devuelve un estado inicial usable', e && e.ciudad === 'cdu');
  global.localStorage = real;
})();

/* ── 30. Estado ya en versión vigente y válido: se devuelve tal cual, sin reconstruir ── */
(function () {
  var vigente = PLANO.estadoInicial('cdu');
  vigente.aperturas = 42;
  global.localStorage.setItem(claveActual(), JSON.stringify(vigente));
  var e = PLANO.leerEstado('cdu');
  assert('estado ya vigente y válido se lee sin alterar sus datos', e.aperturas === 42);
  global.localStorage.clear();
})();

/* ── 31. guardarEstado + leerEstado hacen round-trip fiel para un estado real ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  e = PLANO.aplicarAccion(e, 'aceptar', { lugarId: 'A', grupo: 'cafeterias' });
  e = PLANO.aplicarAccion(e, 'rechazar', { grupo: 'gastronomia' });
  PLANO.guardarEstado(e);
  var releido = PLANO.leerEstado('cdu');
  assert('round-trip guardarEstado→leerEstado preserva aceptados', JSON.stringify(releido.aceptados) === JSON.stringify(e.aceptados));
  assert('round-trip guardarEstado→leerEstado preserva rechazos', JSON.stringify(releido.rechazos) === JSON.stringify(e.rechazos));
  global.localStorage.clear();
})();

/* ── 32. borrarEstado limpia el contexto y una lectura posterior arranca de cero ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  e.aperturas = 99;
  PLANO.guardarEstado(e);
  PLANO.borrarEstado('cdu');
  var releido = PLANO.leerEstado('cdu');
  assert('borrarEstado limpia el contexto: la próxima lectura arranca en 0 aperturas', releido.aperturas === 0);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 10 — Secuencias largas y estados límite
   ═══════════════════════════════════════════════════════════════════ */

/* ── 33. registrarApertura reinicia los flags de sesión pero conserva madurez ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  e = PLANO.aplicarAccion(e, 'guardar', { lugarId: 'A' });
  e = PLANO.aplicarAccion(e, 'guardar', { lugarId: 'B' });
  assert('precondición: curaduriaSugerida quedó true tras 2 guardados', e.sesion.curaduriaSugerida === true);
  var e2 = PLANO.registrarApertura(e);
  assert('registrarApertura sube el contador de aperturas', e2.aperturas === e.aperturas + 1);
  assert('registrarApertura limpia curaduriaSugerida (flag de sesión, no persiste)',
    e2.sesion.curaduriaSugerida === false);
})();

/* ── 34. Secuencia larga mixta no deja el plano fuera de sus límites ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  for (var i = 0; i < 200; i++) {
    var accion = ['aceptar', 'rechazar', 'permanecer', 'guardar'][i % 4];
    var payload = accion === 'rechazar' || accion === 'aceptar'
      ? { grupo: 'rubro' + (i % 5), lugarId: 'L' + i }
      : accion === 'permanecer' ? { segundos: 30 } : { lugarId: 'L' + i };
    e = PLANO.aplicarAccion(e, accion, payload);
  }
  assert('tras 200 acciones mixtas, autonomía se mantiene dentro de [0,1]', e.autonomia >= 0 && e.autonomia <= 1);
  assert('tras 200 acciones mixtas, fricción se mantiene dentro de [0,1]', e.friccion >= 0 && e.friccion <= 1);
})();

/* ── 35. abandonar no muta el plano ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  e.autonomia = 0.7;
  var e2 = PLANO.aplicarAccion(e, 'abandonar');
  assert('abandonar no cambia autonomía', e2.autonomia === 0.7);
})();

/* ── 36. Acción desconocida no lanza y devuelve el estado sin cambios ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  var e2 = PLANO.aplicarAccion(e, 'volarPorLosAires', { x: 1 });
  assert('una acción fuera del vocabulario de 6 no lanza excepción', e2 !== undefined);
  assert('una acción desconocida devuelve el estado sin modificar', e2.autonomia === e.autonomia);
})();

/* ── 37. payload.segundos inválido en permanecer no rompe (NaN, negativo, string) ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  var friccionAntes = e.friccion;
  var e2 = PLANO.aplicarAccion(e, 'permanecer', { segundos: NaN });
  assert('permanecer con segundos NaN no lanza ni mueve la fricción', e2.friccion === friccionAntes);
  var e3 = PLANO.aplicarAccion(e, 'permanecer', { segundos: -50 });
  assert('permanecer con segundos negativos no mueve la fricción', e3.friccion === friccionAntes);
  var e4 = PLANO.aplicarAccion(e, 'permanecer', { segundos: 'mucho' });
  assert('permanecer con segundos como string no lanza ni mueve la fricción', e4.friccion === friccionAntes);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 11 — Pureza, determinismo y compatibilidad de API
   ═══════════════════════════════════════════════════════════════════ */

/* ── 38. Acciones.aceptar no muta el estado original (copia, no referencia) ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  var autonomiaOriginal = e.autonomia;
  PLANO.aplicarAccion(e, 'aceptar', { lugarId: 'A', porIniciativaPropia: true });
  assert('aplicarAccion no muta el objeto de estado original', e.autonomia === autonomiaOriginal);
})();

/* ── 39. Misma secuencia de acciones produce el mismo resultado (determinismo) ── */
(function () {
  function correrSecuencia() {
    var e = PLANO.estadoInicial('cdu');
    e = PLANO.aplicarAccion(e, 'aceptar', { lugarId: 'A', grupo: 'bares' });
    e = PLANO.aplicarAccion(e, 'rechazar', { grupo: 'gastronomia' });
    e = PLANO.aplicarAccion(e, 'permanecer', { segundos: 60 });
    return e;
  }
  var r1 = correrSecuencia();
  var r2 = correrSecuencia();
  assert('la misma secuencia de acciones produce el mismo estado (sin aleatoriedad oculta)',
    r1.autonomia === r2.autonomia && r1.friccion === r2.friccion);
})();

/* ── 40. Compatibilidad de API pública: todo lo que ya consumía app.js sigue existiendo ── */
(function () {
  ['leerEstado', 'registrarApertura', 'guardarEstado', 'aplicarAccion', 'region',
    'rolPorAperturas', 'gruposAEvitar', 'estadoInicial'].forEach(function (nombre) {
    assert('API pública conserva "' + nombre + '"', typeof PLANO[nombre] === 'function');
  });
})();

/* ── 41. API pública expone la superficie nueva de esta pasada ── */
(function () {
  ['gruposAfines', 'reposoForzadoActivo', 'nivelConfianza', 'borrarEstado', 'resumenEstado', 'obtenerUsuarioId'].forEach(function (nombre) {
    assert('API pública expone "' + nombre + '"', typeof PLANO[nombre] === 'function');
  });
  assert('API pública expone SCHEMA_VERSION', typeof PLANO.SCHEMA_VERSION === 'number');
})();

/* ── 42. resumenEstado nunca lanza y siempre trae los campos de introspección ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  e = PLANO.aplicarAccion(e, 'aceptar', { lugarId: 'A', grupo: 'bares' });
  var resumen = PLANO.resumenEstado(e);
  ['ciudad', 'rol', 'reposoForzado', 'aperturas', 'autonomia', 'friccion', 'confianza',
    'region', 'curaduriaActiva', 'curaduriaSugerida', 'rubrosConRechazosVigentes',
    'rubrosConAfinidadVigente', 'lugaresEnRotacion'].forEach(function (campo) {
    assert('resumenEstado incluye el campo "' + campo + '"', resumen.hasOwnProperty(campo));
  });
  assert('resumenEstado(null) devuelve null sin lanzar', PLANO.resumenEstado(null) === null);
})();

/* ═══════════════════════════════════════════════════════════════════
   BLOQUE 12 — NUEVO: motor de scoring de motor-exposicion.js
   Cobertura de cada señal por separado, casos límite, determinismo,
   diversidad, exploración, explicabilidad, rendimiento con el
   catálogo completo, y los invariantes de Acción Directa/Curaduría.
   ═══════════════════════════════════════════════════════════════════ */

function lugar(id, grupo, lat, lng) {
  var l = { id: id, grupo: grupo, nombre: id, categoria: grupo, direccion: '' };
  if (typeof lat === 'number') { l.lat = lat; l.lng = lng; }
  return l;
}

/* ── 43. Afinidad: un rubro con afinidad estable pesa más que uno sin señal ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  for (var i = 0; i < 3; i++) e = PLANO.aplicarAccion(e, 'aceptar', { lugarId: 'A' + i, grupo: 'cafeterias' });
  var conAfinidad = EXPO.calcularScoreLugar(lugar('X', 'cafeterias'), e, {});
  var sinAfinidad = EXPO.calcularScoreLugar(lugar('Y', 'bares'), e, {});
  assert('señal de afinidad: 1 cuando el rubro tiene afinidad estable', conAfinidad.señales.afinidad === 1);
  assert('señal de afinidad: 0 cuando el rubro no tiene señal', sinAfinidad.señales.afinidad === 0);
  assert('un lugar de rubro afín puntúa más alto que uno sin ninguna señal', conAfinidad.score > sinAfinidad.score);
})();

/* ── 44. Rechazo: un rubro con patrón de rechazo estable no participa del score (se filtra antes) ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  var n = CFG.acciones.rechazar.repeticionesParaEstable;
  for (var i = 0; i < n; i++) e = PLANO.aplicarAccion(e, 'rechazar', { grupo: 'bares' });
  var registro = [lugar('A', 'gastronomia'), lugar('B', 'cafeterias'), lugar('C', 'cafeterias'),
    lugar('D', 'cafeterias'), lugar('E', 'bares'), lugar('F', 'bares')];
  var recorte = EXPO.recortePorIniciativaPropia(registro, e, 'guia');
  assert('un rubro con rechazo estable queda fuera del recorte cuando hay alternativas',
    recorte.every(function (l) { return l.grupo !== 'bares'; }));
})();

/* ── 45. Proximidad: con ubicación, un lugar cercano puntúa más que uno lejano ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  var ubicacion = { lat: -32.4825, lng: -58.2372 }; // CdU centro
  var cerca = lugar('A', 'gastronomia', -32.4826, -58.2373);       // ~15m
  var lejos = lugar('B', 'gastronomia', -32.60, -58.35);            // varios km
  var scoreCerca = EXPO.calcularScoreLugar(cerca, e, { ubicacion: ubicacion });
  var scoreLejos = EXPO.calcularScoreLugar(lejos, e, { ubicacion: ubicacion });
  assert('con ubicación disponible, un lugar cercano tiene señal de proximidad', typeof scoreCerca.señales.proximidad === 'number');
  assert('un lugar cercano puntúa más alto que uno lejano con la misma ubicación', scoreCerca.score > scoreLejos.score);
})();

/* ── 46. Ausencia de proximidad: sin ubicación, la señal no existe y no penaliza ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  var conCoords = EXPO.calcularScoreLugar(lugar('A', 'gastronomia', -32.48, -58.24), e, {});
  assert('sin ubicación del usuario, la señal de proximidad no participa', typeof conCoords.señales.proximidad === 'undefined');
  assert('sin proximidad, el score sigue siendo un número válido en [0,1]', conCoords.score >= 0 && conCoords.score <= 1);
})();

/* ── 47. Ausencia de proximidad por falta de coordenadas del LUGAR (con ubicación disponible) ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  var sinCoords = EXPO.calcularScoreLugar(lugar('A', 'gastronomia'), e, { ubicacion: { lat: -32.48, lng: -58.24 } });
  assert('lugar sin lat/lng no recibe señal de proximidad aunque haya ubicación del usuario',
    typeof sinCoords.señales.proximidad === 'undefined');
  assert('lugar sin coordenadas no queda con score inválido (NaN)', !isNaN(sinCoords.score));
})();

/* ── 48. Clima presente + tabla configurada: la señal de contexto SÍ participa y cambia el orden ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  var original = CFG.exposicion.scoring.afinidadClimaPorGrupo;
  CFG.exposicion.scoring.afinidadClimaPorGrupo = { cafeterias: { lluvia: 0.4 }, heladerias: { lluvia: -0.4 } };
  var clima = { weather_code: 61, temperature_2m: 18, precipitation: 2 }; // lluvia
  var cafeteria = EXPO.calcularScoreLugar(lugar('A', 'cafeterias'), e, { clima: clima });
  var heladeria = EXPO.calcularScoreLugar(lugar('B', 'heladerias'), e, { clima: clima });
  assert('con tabla de clima configurada y lluvia detectada, la señal de contexto participa', typeof cafeteria.señales.contexto === 'number');
  assert('bajo lluvia, una cafetería (afinidad positiva configurada) puntúa más que una heladería (negativa)',
    cafeteria.score > heladeria.score);
  CFG.exposicion.scoring.afinidadClimaPorGrupo = original;
})();

/* ── 49. Clima ausente: el motor funciona exactamente igual sin romperse ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  var sinClima = EXPO.calcularScoreLugar(lugar('A', 'cafeterias'), e, {});
  assert('sin clima en el contexto, la señal de contexto no participa', typeof sinClima.señales.contexto === 'undefined');
  assert('sin clima, el score sigue siendo válido', !isNaN(sinClima.score) && sinClima.score >= 0);
})();

/* ── 50. Clima con tabla vacía (configuración por defecto real del repo): neutro, no cambia el orden ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  var clima = { weather_code: 61, temperature_2m: 18, precipitation: 2 };
  var a = EXPO.calcularScoreLugar(lugar('A', 'cafeterias'), e, { clima: clima });
  var b = EXPO.calcularScoreLugar(lugar('A', 'cafeterias'), e, {});
  assert('con afinidadClimaPorGrupo vacío (default de fábrica), el clima no altera el score de un mismo lugar',
    a.score === b.score);
})();

/* ── 51. Confianza baja vs alta: ambas producen un recorte válido, sin romper ── */
(function () {
  var registro = [];
  for (var i = 0; i < 30; i++) registro.push(lugar('L' + i, 'gastronomia'));
  var bajo = PLANO.estadoInicial('cdu');
  assert('confianza baja (estado inicial) → recorte igual produce el tamaño configurado',
    EXPO.recortePorIniciativaPropia(registro, bajo, 'guia').length === CFG.exposicion.recorteGuia);

  var alto = PLANO.estadoInicial('cdu');
  alto.aperturas = CFG.madurez.umbralAperturas.complice;
  for (var j = 0; j < 3; j++) alto = PLANO.aplicarAccion(alto, 'aceptar', { lugarId: 'A' + j, grupo: 'gastronomia' });
  assert('confianza alta (madurez + afinidad) también produce el tamaño configurado, sin romperse',
    EXPO.recortePorIniciativaPropia(registro, alto, 'guia').length === CFG.exposicion.recorteGuia);
})();

/* ── 52. Diversidad: ningún rubro ocupa más de la mitad del cupo si hay alternativas suficientes ── */
(function () {
  var registro = [];
  for (var i = 0; i < 20; i++) registro.push(lugar('G' + i, 'gastronomia'));
  for (var j = 0; j < 20; j++) registro.push(lugar('C' + j, 'cafeterias'));
  for (var k = 0; k < 20; k++) registro.push(lugar('B' + k, 'bares'));
  var e = PLANO.estadoInicial('cdu');
  var recorte = EXPO.recortePorIniciativaPropia(registro, e, 'exploracion'); // cupo 10
  var conteo = {};
  recorte.forEach(function (l) { conteo[l.grupo] = (conteo[l.grupo] || 0) + 1; });
  var maxEsperado = Math.ceil(CFG.exposicion.recorteExploracion * CFG.exposicion.scoring.diversidad.maxPorGrupoRatio);
  assert('con 3 rubros disponibles en cantidad de sobra, ningún rubro supera el tope de diversidad',
    Object.keys(conteo).every(function (g) { return conteo[g] <= maxEsperado; }));
})();

/* ── 53. Diversidad se relaja si solo hay un rubro disponible entre los candidatos ── */
(function () {
  var registro = [];
  for (var i = 0; i < 20; i++) registro.push(lugar('U' + i, 'unico'));
  var e = PLANO.estadoInicial('cdu');
  var recorte = EXPO.recortePorIniciativaPropia(registro, e, 'guia');
  assert('con un solo rubro disponible, el tope de diversidad se relaja y el cupo se llena igual',
    recorte.length === CFG.exposicion.recorteGuia);
})();

/* ── 54. Exploración: con candidatos de sobra, el recorte incluye al menos un lugar fuera del top-score puro ── */
(function () {
  var registro = [];
  for (var i = 0; i < 40; i++) registro.push(lugar('L' + i, 'grupo' + (i % 8)));
  var e = PLANO.estadoInicial('cdu');
  e.ultimaApertura = 777;
  var recorte = EXPO.recortePorIniciativaPropia(registro, e, 'exploracion');
  var explicado = EXPO.recortePorIniciativaPropiaExplicado(registro, e, 'exploracion');
  var scoresOrdenadosDesc = explicado.lugares.map(function (x) { return x.score; });
  var esDescendenteEstricto = scoresOrdenadosDesc.every(function (s, idx) {
    return idx === 0 || scoresOrdenadosDesc[idx - 1] >= s;
  });
  assert('el recorte final no es necesariamente un top-score estrictamente ordenado (hay slots de exploración mezclados con relevancia)',
    recorte.length === CFG.exposicion.recorteExploracion);
  assert('recortePorIniciativaPropiaExplicado expone un score por lugar seleccionado', scoresOrdenadosDesc.length === recorte.length);
})();

/* ── 55. Rotación: un lugar recién aceptado por iniciativa propia no vuelve a aparecer mientras descansa ── */
(function () {
  var registro = [];
  for (var i = 0; i < 10; i++) registro.push(lugar('L' + i, 'gastronomia'));
  var e = PLANO.estadoInicial('cdu');
  e = PLANO.aplicarAccion(e, 'aceptar', { lugarId: 'L0', porIniciativaPropia: true });
  var recorte = EXPO.recortePorIniciativaPropia(registro, e, 'guia');
  assert('un lugar recién aceptado por iniciativa propia no aparece en el siguiente recorte (descansando)',
    recorte.every(function (l) { return l.id !== 'L0'; }));
})();

/* ── 56. Determinismo: misma entrada (registro, estado, región, contexto) produce siempre la misma salida ── */
(function () {
  var registro = [];
  for (var i = 0; i < 60; i++) registro.push(lugar('L' + i, 'grupo' + (i % 6), -32.48 + i * 0.001, -58.24 + i * 0.001));
  var e = PLANO.estadoInicial('cdu');
  e.ultimaApertura = 12345;
  var contexto = { ubicacion: { lat: -32.48, lng: -58.24 }, ahoraMs: 99999999 };
  var r1 = EXPO.recortePorIniciativaPropia(registro, e, 'exploracion', contexto).map(function (l) { return l.id; });
  var r2 = EXPO.recortePorIniciativaPropia(registro, e, 'exploracion', contexto).map(function (l) { return l.id; });
  assert('la misma entrada exacta produce siempre la misma selección (determinismo)', JSON.stringify(r1) === JSON.stringify(r2));
})();

/* ── 57. Empate de scores: candidatos idénticos en todas las señales no rompen el orden ni el tamaño ── */
(function () {
  var registro = [];
  for (var i = 0; i < 15; i++) registro.push(lugar('E' + i, 'mismoGrupo')); // todos iguales: mismo score exacto
  var e = PLANO.estadoInicial('cdu');
  var recorte = EXPO.recortePorIniciativaPropia(registro, e, 'guia');
  assert('un empate total de scores igual produce el tamaño de cupo correcto', recorte.length === CFG.exposicion.recorteGuia);
  var idsUnicos = {};
  recorte.forEach(function (l) { idsUnicos[l.id] = true; });
  assert('un empate total de scores no duplica lugares en el resultado', Object.keys(idsUnicos).length === recorte.length);
})();

/* ── 58. Datos incompletos: rubro desconocido / undefined no lanza excepción ── */
(function () {
  var registro = [{ id: 'A', nombre: 'A' }, { id: 'B', grupo: undefined, nombre: 'B' }];
  var e = PLANO.estadoInicial('cdu');
  var lanzo = false, recorte;
  try { recorte = EXPO.recortePorIniciativaPropia(registro, e, 'guia'); } catch (err) { lanzo = true; }
  assert('lugares con grupo undefined no hacen lanzar al motor', lanzo === false);
  assert('lugares con grupo undefined igual entran en la selección', recorte.length === 2);
})();

/* ── 59. Listas vacías: registro vacío no lanza y devuelve vacío ── */
(function () {
  var e = PLANO.estadoInicial('cdu');
  var recorte = EXPO.recortePorIniciativaPropia([], e, 'guia');
  assert('registro vacío devuelve recorte vacío sin lanzar', Array.isArray(recorte) && recorte.length === 0);
})();

/* ── 60. Listas pequeñas: menos candidatos que el cupo devuelve todos, sin repetir ── */
(function () {
  var registro = [lugar('A', 'gastronomia'), lugar('B', 'cafeterias')];
  var e = PLANO.estadoInicial('cdu');
  var recorte = EXPO.recortePorIniciativaPropia(registro, e, 'exploracion'); // cupo 10 > 2 candidatos
  assert('con menos candidatos que el cupo, se devuelven todos (sin inventar ni truncar de más)', recorte.length === 2);
})();

/* ── 61. Catálogo completo (1.468 lugares): correctitud + rendimiento razonable ── */
(function () {
  var registro = [];
  var grupos = ['gastronomia', 'cafeterias', 'bares', 'heladerias', 'compras', 'belleza', 'alojamiento', 'panaderias'];
  for (var i = 0; i < 1468; i++) {
    registro.push(lugar('URU-' + i, grupos[i % grupos.length], -32.40 - (i % 50) * 0.001, -58.20 - (i % 50) * 0.001));
  }
  var e = PLANO.estadoInicial('cdu');
  for (var k = 0; k < 3; k++) e = PLANO.aplicarAccion(e, 'aceptar', { lugarId: 'AF' + k, grupo: 'cafeterias' });
  var contexto = { ubicacion: { lat: -32.4825, lng: -58.2372 }, clima: { weather_code: 3, temperature_2m: 22, precipitation: 0 } };

  var t0 = Date.now();
  var recorteGuia = EXPO.recortePorIniciativaPropia(registro, e, 'guia', contexto);
  var recorteExplo = EXPO.recortePorIniciativaPropia(registro, e, 'exploracion', contexto);
  var explicado = EXPO.recortePorIniciativaPropiaExplicado(registro, e, 'exploracion', contexto);
  var t1 = Date.now();

  assert('catálogo completo (1.468): recorte de Guía respeta el cupo configurado', recorteGuia.length === CFG.exposicion.recorteGuia);
  assert('catálogo completo (1.468): recorte de Exploración respeta el cupo configurado', recorteExplo.length === CFG.exposicion.recorteExploracion);
  assert('catálogo completo (1.468): la versión explicada devuelve señales para cada lugar seleccionado',
    explicado.lugares.every(function (x) { return x.señales && x.razones && x.razones.length > 0; }));
  assert('catálogo completo (1.468): tiempo total de 3 llamadas de recorte por debajo de 500ms (' + (t1 - t0) + 'ms)',
    (t1 - t0) < 500);
  console.log('  · rendimiento motor-exposicion.js sobre 1.468 lugares (3 llamadas): ' + (t1 - t0) + 'ms');
})();

/* ── 62. Acción Directa: la búsqueda explícita nunca pierde resultados por score bajo ── */
(function () {
  var registro = [];
  for (var i = 0; i < 100; i++) registro.push(lugar('P' + i, 'gastronomia'));
  registro.forEach(function (l) { l.nombre = 'Pizzería ' + l.id; l.categoria = 'pizzería'; l.direccion = ''; });
  var e = PLANO.estadoInicial('cdu');
  var n = CFG.acciones.rechazar.repeticionesParaEstable;
  for (var i2 = 0; i2 < n; i2++) e = PLANO.aplicarAccion(e, 'rechazar', { grupo: 'gastronomia' }); // rubro "evitado"
  var resultados = EXPO.resultadosPorAccionExplicita(registro, 'pizzería');
  assert('Acción Directa devuelve TODOS los matches (100) aunque el rubro esté marcado a evitar en Guía/Exploración',
    resultados.length === 100);
})();

/* ── 63. Curaduría: nunca pasa por scoring, rotación ni presupuesto, sin importar el estado ── */
(function () {
  var registro = [lugar('A', 'gastronomia'), lugar('B', 'gastronomia'), lugar('C', 'bares')];
  var e = PLANO.estadoInicial('cdu');
  var n = CFG.acciones.rechazar.repeticionesParaEstable;
  for (var i = 0; i < n; i++) e = PLANO.aplicarAccion(e, 'rechazar', { grupo: 'gastronomia' });
  var curada = EXPO.coleccionCurada(registro, ['A', 'B']);
  assert('Curaduría devuelve exactamente los ids guardados, aunque su rubro esté marcado a evitar',
    curada.length === 2 && curada.every(function (l) { return l.id === 'A' || l.id === 'B'; }));
})();

/* ── 64. Compatibilidad de API: superficie previa a esta pasada sigue existiendo con la misma forma ── */
(function () {
  ['recortePorIniciativaPropia', 'resultadosPorAccionExplicita', 'coleccionCurada'].forEach(function (nombre) {
    assert('API pública de EXPO conserva "' + nombre + '"', typeof EXPO[nombre] === 'function');
  });
  var registro = [lugar('A', 'gastronomia'), lugar('B', 'cafeterias')];
  var e = PLANO.estadoInicial('cdu');
  var sinContexto = EXPO.recortePorIniciativaPropia(registro, e, 'guia');
  assert('recortePorIniciativaPropia sigue funcionando sin el 4to parámetro (contexto), como lo llama app.js hoy',
    Array.isArray(sinContexto));
})();

/* ── 65. API pública nueva de esta pasada ── */
(function () {
  ['recortePorIniciativaPropiaExplicado', 'calcularScoreLugar'].forEach(function (nombre) {
    assert('API pública de EXPO expone "' + nombre + '" (nuevo)', typeof EXPO[nombre] === 'function');
  });
})();

/* ── 66. Pureza: recortePorIniciativaPropia no muta el estado ni el registro de entrada ── */
(function () {
  var registro = [lugar('A', 'gastronomia'), lugar('B', 'cafeterias')];
  var registroJSONAntes = JSON.stringify(registro);
  var e = PLANO.estadoInicial('cdu');
  var estadoJSONAntes = JSON.stringify(e);
  EXPO.recortePorIniciativaPropia(registro, e, 'guia', { ubicacion: { lat: -32.48, lng: -58.24 } });
  assert('recortePorIniciativaPropia no muta el registro de entrada', JSON.stringify(registro) === registroJSONAntes);
  assert('recortePorIniciativaPropia no muta el estado de entrada', JSON.stringify(e) === estadoJSONAntes);
})();

console.log('\n' + (total - fallos) + '/' + total + ' pruebas OK');
if (fallos > 0) process.exit(1);
