'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CFG, PLANO, EXPOSICION } = require('./_setup.js');

function lugar(id, grupo, nombre, extra) {
  return Object.assign({
    id: id,
    grupo: grupo,
    nombre: nombre || id,
    categoria: grupo,
    direccion: 'Calle Falsa 123',
    lat: -32.48,
    lng: -58.24
  }, extra || {});
}

function registroDe(n, grupo) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(lugar('URU-' + i, grupo || 'gastronomia', 'Lugar ' + i));
  return out;
}

// ───────────────────────────────────────────────────────────────
// 1. recortePorIniciativaPropia — presupuesto (Blueprint v2, 4b)
// ───────────────────────────────────────────────────────────────
test('recortePorIniciativaPropia: en Guía nunca devuelve más que recorteGuia', () => {
  const registro = registroDe(50);
  const estado = PLANO.estadoInicial('x');
  const out = EXPOSICION.recortePorIniciativaPropia(registro, estado, 'guia');
  assert.ok(out.length <= CFG.exposicion.recorteGuia);
});

test('recortePorIniciativaPropia: en Exploración nunca devuelve más que recorteExploracion', () => {
  const registro = registroDe(50);
  const estado = PLANO.estadoInicial('x');
  const out = EXPOSICION.recortePorIniciativaPropia(registro, estado, 'exploracion');
  assert.ok(out.length <= CFG.exposicion.recorteExploracion);
});

test('recortePorIniciativaPropia: con registro más chico que el cupo, no explota ni duplica', () => {
  const registro = registroDe(2);
  const estado = PLANO.estadoInicial('x');
  const out = EXPOSICION.recortePorIniciativaPropia(registro, estado, 'guia');
  assert.equal(out.length, 2);
  const ids = out.map(l => l.id);
  assert.equal(new Set(ids).size, ids.length, 'no debería duplicar lugares');
});

// ───────────────────────────────────────────────────────────────
// 2. Exclusión por rubro evitado (rechazo estable) — sección 6
// ───────────────────────────────────────────────────────────────
test('recortePorIniciativaPropia: excluye por completo un rubro con rechazo estable, si hay alternativa suficiente', () => {
  const registro = registroDe(20, 'deporte').concat(registroDe(20, 'gastronomia'));
  let estado = PLANO.estadoInicial('x');
  const n = CFG.acciones.rechazar.repeticionesParaEstable;
  for (let i = 0; i < n; i++) estado = PLANO.aplicarAccion(estado, 'rechazar', { grupo: 'deporte' });

  const out = EXPOSICION.recortePorIniciativaPropia(registro, estado, 'exploracion');
  assert.ok(out.every(l => l.grupo !== 'deporte'), 'ningún resultado debería ser del rubro evitado');
});

test('recortePorIniciativaPropia: si excluir el rubro evitado deja MENOS del cupo, relaja esa exclusión (nunca queda vacío)', () => {
  // Todo el registro es del rubro evitado y es más chico que el cupo de exploración
  const registro = registroDe(3, 'deporte'); // 3 < recorteExploracion (10)
  let estado = PLANO.estadoInicial('x');
  const n = CFG.acciones.rechazar.repeticionesParaEstable;
  for (let i = 0; i < n; i++) estado = PLANO.aplicarAccion(estado, 'rechazar', { grupo: 'deporte' });

  const out = EXPOSICION.recortePorIniciativaPropia(registro, estado, 'exploracion');
  // La regla documentada: nunca se cae a "mostrar todo sin filtro" antes de
  // agotar la relajación de rotación/rubro — pero tampoco debe devolver 0.
  assert.equal(out.length, 3, 'debe relajar la exclusión de rubro para no quedar vacío');
});

// ───────────────────────────────────────────────────────────────
// 3. Descanso / rotación — descansoHoras (Blueprint v2, 4b)
// ───────────────────────────────────────────────────────────────
test('recortePorIniciativaPropia: un lugar mostrado recientemente "descansa" y no vuelve a salir si sobran candidatos', () => {
  const registro = registroDe(20);
  let estado = PLANO.estadoInicial('x');
  estado.exposicion['URU-0'] = { vecesMostrado: 1, ultimaVez: Date.now() }; // recién mostrado

  const out = EXPOSICION.recortePorIniciativaPropia(registro, estado, 'exploracion');
  assert.ok(!out.some(l => l.id === 'URU-0'), 'el lugar en descanso no debería reaparecer si hay 19 alternativas');
});

test('recortePorIniciativaPropia: un lugar cuyo descanso ya venció puede volver a aparecer', () => {
  const registro = registroDe(20);
  let estado = PLANO.estadoInicial('x');
  const descansoMs = CFG.exposicion.descansoHoras * 3600 * 1000;
  estado.exposicion['URU-0'] = { vecesMostrado: 1, ultimaVez: Date.now() - descansoMs - 1000 };

  // No podemos garantizar que el barajado lo elija, pero sí que YA NO está
  // categóricamente excluido: lo comprobamos vía la función interna de forma
  // indirecta, generando un registro donde es el único candidato posible.
  const soloEse = [registro[0]];
  const out = EXPOSICION.recortePorIniciativaPropia(soloEse, estado, 'guia');
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'URU-0');
});

// ───────────────────────────────────────────────────────────────
// 4. resultadosPorAccionExplicita — NUNCA aplica presupuesto ni rotación
// ───────────────────────────────────────────────────────────────
test('resultadosPorAccionExplicita: sin consulta, devuelve el registro completo (sin recorte)', () => {
  const registro = registroDe(500);
  const out = EXPOSICION.resultadosPorAccionExplicita(registro, '');
  assert.equal(out.length, 500);
});

test('resultadosPorAccionExplicita: aunque el match supere el recorte de exploración, no se trunca', () => {
  const registro = registroDe(50, 'gastronomia');
  const out = EXPOSICION.resultadosPorAccionExplicita(registro, 'gastronomia');
  assert.equal(out.length, 50, 'la búsqueda explícita nunca debe recortar por presupuesto');
});

test('resultadosPorAccionExplicita: busca sin distinguir mayúsculas/minúsculas', () => {
  const registro = [lugar('URU-1', 'gastronomia', 'La Parrilla del Puerto')];
  const out = EXPOSICION.resultadosPorAccionExplicita(registro, 'PARRILLA');
  assert.equal(out.length, 1);
});

test('resultadosPorAccionExplicita: matchea también por dirección, no solo nombre', () => {
  const registro = [lugar('URU-1', 'gastronomia', 'Cualquiera', { direccion: 'Av. Rocamora 850' })];
  const out = EXPOSICION.resultadosPorAccionExplicita(registro, 'rocamora');
  assert.equal(out.length, 1);
});

test('resultadosPorAccionExplicita: sin coincidencias, devuelve vacío (no el registro completo)', () => {
  const registro = registroDe(10);
  const out = EXPOSICION.resultadosPorAccionExplicita(registro, 'zzz-no-existe-zzz');
  assert.equal(out.length, 0);
});

// ───────────────────────────────────────────────────────────────
// 5. coleccionCurada — Acción explícita del usuario (guardados)
// ───────────────────────────────────────────────────────────────
test('coleccionCurada: devuelve solo los ids guardados, en cualquier cantidad', () => {
  const registro = registroDe(10);
  const out = EXPOSICION.coleccionCurada(registro, ['URU-2', 'URU-5']);
  assert.deepEqual(out.map(l => l.id).sort(), ['URU-2', 'URU-5']);
});

test('coleccionCurada: ids guardados que ya no existen en el registro se ignoran sin error', () => {
  const registro = registroDe(3);
  const out = EXPOSICION.coleccionCurada(registro, ['URU-2', 'URU-999-fantasma']);
  assert.deepEqual(out.map(l => l.id), ['URU-2']);
});

// ───────────────────────────────────────────────────────────────
// 6. Barajado determinístico por semilla
// ───────────────────────────────────────────────────────────────
test('recortePorIniciativaPropia: misma semilla (ultimaApertura) → mismo orden entre llamadas', () => {
  const registro = registroDe(30);
  const estado1 = PLANO.estadoInicial('x'); estado1.ultimaApertura = 12345;
  const estado2 = PLANO.estadoInicial('x'); estado2.ultimaApertura = 12345;
  const out1 = EXPOSICION.recortePorIniciativaPropia(registro, estado1, 'exploracion').map(l => l.id);
  const out2 = EXPOSICION.recortePorIniciativaPropia(registro, estado2, 'exploracion').map(l => l.id);
  assert.deepEqual(out1, out2, 'misma semilla debe producir el mismo orden (estabilidad dentro de sesión)');
});

test('recortePorIniciativaPropia: semillas distintas tienden a producir órdenes distintos', () => {
  const registro = registroDe(30);
  const estado1 = PLANO.estadoInicial('x'); estado1.ultimaApertura = 111;
  const estado2 = PLANO.estadoInicial('x'); estado2.ultimaApertura = 222222;
  const out1 = EXPOSICION.recortePorIniciativaPropia(registro, estado1, 'exploracion').map(l => l.id);
  const out2 = EXPOSICION.recortePorIniciativaPropia(registro, estado2, 'exploracion').map(l => l.id);
  assert.notDeepEqual(out1, out2, 'semillas distintas deberían rotar el resultado');
});
