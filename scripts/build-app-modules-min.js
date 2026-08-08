#!/usr/bin/env node
/*
 * scripts/build-app-modules-min.js
 * ---------------------------------------------------------------------
 * HALLAZGO (Fase 5.1, Lighthouse mobile real contra donde-comer-cdu):
 * app.min.js (ver build-app-min.js) minifica el ORQUESTADOR, pero
 * `terser` no resuelve ni empaqueta imports — solo los preserva. Eso
 * significa que los 20 módulos ES que app.min.js importa (directo o
 * transitivamente vía search.js -> cache.js) se siguen sirviendo TAL
 * CUAL están en el repo: sin minificar, ~200KB combinados, con
 * comentarios de documentación completos. Lighthouse lo señala como
 * oportunidad "unminified-javascript" (~600ms de ahorro estimado) y es
 * el principal sospechoso del LCP alto en carga fría de la home.
 *
 * Este script aplica EXACTAMENTE el mismo criterio conservador que ya
 * usan build-motor-bundle.js y build-app-min.js: terser con
 * `compress:false, mangle:false` — SOLO strip de comentarios y
 * espacios, cero reescritura de lógica o nombres. No bundlea (no
 * junta todo en un archivo, a diferencia de motor.bundle.js) porque
 * estos son ES modules reales con import/export entre sí — bundlearlos
 * requeriría un empaquetador de verdad (esbuild/rollup), que no está
 * entre las devDependencies del repo y sería un cambio de mayor
 * riesgo. Minificar cada uno por separado, en cambio, es aditivo y de
 * bajo riesgo: mismo número de requests, pero mucho menos peso por
 * request.
 *
 * Genera <nombre>.min.js al lado de cada <nombre>.js, y dentro de cada
 * .min.js reescribe los imports internos entre sí mismos (ej.
 * map-module.js importa render-engine.js) para que apunten a la
 * versión .min.js correspondiente — así la cadena completa queda
 * minificada, no solo el primer eslabón.
 *
 * build-app-min.js (ver ese archivo) hace el mismo reemplazo de rutas
 * sobre app.min.js, así que la cadena completa desde <script
 * type="module" src="js/app.min.js"> queda apuntando a versiones
 * minificadas de punta a punta.
 *
 * Uso:
 *   node scripts/build-app-modules-min.js
 *   (o como parte de: npm run build:bundles)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const terser = require('terser');
const { MODULOS, reescribirImportsAMin } = require('./lib/modulos-app');

const JS_DIR = path.join(__dirname, '..', 'donde-comer-cdu', 'js');

async function minificarModulo(nombreArchivo) {
  const entrada = path.join(JS_DIR, nombreArchivo);
  const salidaPath = path.join(JS_DIR, nombreArchivo.replace(/\.js$/, '.min.js'));

  if (!fs.existsSync(entrada)) {
    throw new Error(`Falta ${nombreArchivo} en ${JS_DIR}`);
  }

  const src = fs.readFileSync(entrada, 'utf8');
  const resultado = await terser.minify(src, {
    module: true,
    compress: false,
    mangle: false,
    format: { comments: false },
  });

  if (resultado.error) {
    throw new Error(`terser falló en ${nombreArchivo}: ${resultado.error}`);
  }

  const conImportsReescritos = reescribirImportsAMin(resultado.code);
  const header = `/* GENERADO por scripts/build-app-modules-min.js a partir de ${nombreArchivo} — no editar a mano. */\n`;
  const out = header + conImportsReescritos;
  fs.writeFileSync(salidaPath, out, 'utf8');

  return { nombreArchivo, entradaBytes: src.length, salidaBytes: out.length };
}

async function main() {
  console.log(`Minificando ${MODULOS.length} módulos (mismo criterio conservador que build-app-min.js)...\n`);
  let totalEntrada = 0;
  let totalSalida = 0;

  for (const modulo of MODULOS) {
    const r = await minificarModulo(modulo);
    totalEntrada += r.entradaBytes;
    totalSalida += r.salidaBytes;
    const ahorro = (100 - (r.salidaBytes / r.entradaBytes) * 100).toFixed(1);
    console.log(`  ✓ ${r.nombreArchivo.padEnd(28)} ${r.entradaBytes.toString().padStart(6)} → ${r.salidaBytes.toString().padStart(6)} bytes  (-${ahorro}%)`);
  }

  const ahorroTotal = (100 - (totalSalida / totalEntrada) * 100).toFixed(1);
  console.log(`\nTotal: ${totalEntrada} → ${totalSalida} bytes  (-${ahorroTotal}%)`);
  console.log('\n✓ js/*.min.js generados. Correr también build-app-min.js para que');
  console.log('  app.min.js apunte a estas versiones (mismo script se encarga del rewrite).');
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
