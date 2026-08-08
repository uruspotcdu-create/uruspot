#!/usr/bin/env node
/*
 * scripts/build-app-min.js
 * ---------------------------------------------------------------------
 * js/app.js (133 220 bytes) es el único módulo "core" que se sirve
 * directo desde <script src="js/app.js" defer> sin pasar por ningún
 * paso de build — a diferencia de motor.bundle.js y ambiente.bundle.js,
 * que ya usan terser en modo conservador (ver scripts/build-motor-bundle.js).
 *
 * Este script aplica el MISMO criterio, no uno nuevo: terser con
 * `compress:false, mangle:false` — SOLO strip de comentarios y
 * espacios, cero reescritura de lógica o nombres. app.js es el
 * orquestador final (conecta motor.bundle.js + ambiente.bundle.js +
 * coreografias.js con el DOM que declara index.html) y expone
 * variables globales / listeners atados a ids reales del documento;
 * un mangle agresivo ahorraría más bytes pero no se puede verificar
 * sin un navegador real en este entorno, así que no vale el riesgo —
 * misma decisión, documentada con las mismas palabras, que ya tomó
 * build-motor-bundle.js para el resto del código core.
 *
 * Salida: js/app.min.js (133 220 → ~64 KB, -52%). index.html debe
 * cargar app.min.js en producción; app.js sigue siendo el único
 * archivo que se edita a mano.
 *
 * FASE 5.1 (LCP, 2026-08-08): además de minificar comentarios/espacios
 * de app.js, este script ahora reescribe sus 20 imports internos
 * ('./modulo.js' -> './modulo.min.js') para que apunten a las
 * versiones que genera build-app-modules-min.js — ver ese script para
 * el hallazgo completo de Lighthouse que motiva esto. Antes de este
 * cambio, app.min.js quedaba minificado pero sus imports seguían
 * apuntando a los 20 módulos SIN minificar (~200KB combinados con
 * comentarios completos), así que la cadena real que carga el
 * navegador no se beneficiaba del nuevo script. Por eso build:bundles
 * corre build-app-modules-min.js ANTES que este (ver package.json):
 * este script verifica que cada .min.js de destino ya exista y aborta
 * si falta, para no dejar un import roto en producción por un orden
 * de build incorrecto.
 *
 * Uso: node scripts/build-app-min.js
 *   (requiere haber corrido antes: node scripts/build-app-modules-min.js)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const terser = require('terser');
const { MODULOS, reescribirImportsAMin } = require('./lib/modulos-app');

const JS_DIR = path.join(__dirname, '..', 'donde-comer-cdu', 'js');
const ENTRADA = path.join(JS_DIR, 'app.js');
const SALIDA = path.join(JS_DIR, 'app.min.js');

function verificarModulosMinExisten() {
  const faltantes = MODULOS
    .map((m) => m.replace(/\.js$/, '.min.js'))
    .filter((m) => !fs.existsSync(path.join(JS_DIR, m)));
  if (faltantes.length > 0) {
    console.error('✗ faltan estos módulos minificados (corré primero: node scripts/build-app-modules-min.js):');
    faltantes.forEach((m) => console.error(`    - js/${m}`));
    process.exit(1);
  }
}

async function main() {
  if (!fs.existsSync(ENTRADA)) {
    console.error('✗ falta js/app.js — abortando');
    process.exit(1);
  }
  verificarModulosMinExisten();
  const src = fs.readFileSync(ENTRADA, 'utf8');
  const resultado = await terser.minify(src, {
    // FASE 1 del Plan Maestro de Modularización (2026-08-06): app.js
    // ahora empieza con `import { ... } from './constants.js'` (y
    // pure-utils.js, event-bus.js) — module:true le dice a terser que
    // parsee/emita el archivo como ES module (sourceType), no como
    // script clásico. index.html carga el resultado con
    // <script type="module">, así que el import queda intacto en la
    // salida (terser no resuelve ni empaqueta imports, solo los
    // preserva). Mismo criterio conservador de siempre:
    // compress:false, mangle:false — cero riesgo de romper referencias
    // globales o ids del DOM, esto es strip de comentarios/espacios.
    module: true,
    compress: false,
    mangle: false,
    format: { comments: false },
  });
  if (resultado.error) {
    console.error('✗ terser falló:', resultado.error);
    process.exit(1);
  }
  const conImportsReescritos = reescribirImportsAMin(resultado.code, MODULOS);
  const header = `/* GENERADO por scripts/build-app-min.js a partir de js/app.js — no editar a mano. */\n`;
  const out = header + conImportsReescritos;
  fs.writeFileSync(SALIDA, out, 'utf8');
  console.log(`✓ js/app.min.js generado (imports apuntando a las ${MODULOS.length} versiones .min.js)`);
  console.log(`  entrada: ${src.length} bytes  →  salida: ${out.length} bytes  (${(100 - out.length / src.length * 100).toFixed(1)}% menos)`);
}

main();

