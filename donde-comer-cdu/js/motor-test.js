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

console.log('\n' + (total - fallos) + '/' + total + ' pruebas OK');
if (fallos > 0) process.exit(1);
