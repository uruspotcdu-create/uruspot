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
 * Uso: node scripts/build-app-min.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const terser = require('terser');

const JS_DIR = path.join(__dirname, '..', 'donde-comer-cdu', 'js');
const ENTRADA = path.join(JS_DIR, 'app.js');
const SALIDA = path.join(JS_DIR, 'app.min.js');

async function main() {
  if (!fs.existsSync(ENTRADA)) {
    console.error('✗ falta js/app.js — abortando');
    process.exit(1);
  }
  const src = fs.readFileSync(ENTRADA, 'utf8');
  const resultado = await terser.minify(src, {
    compress: false,
    mangle: false,
    format: { comments: false },
  });
  if (resultado.error) {
    console.error('✗ terser falló:', resultado.error);
    process.exit(1);
  }
  const header = `/* GENERADO por scripts/build-app-min.js a partir de js/app.js — no editar a mano. */\n`;
  const out = header + resultado.code;
  fs.writeFileSync(SALIDA, out, 'utf8');
  console.log(`✓ js/app.min.js generado`);
  console.log(`  entrada: ${src.length} bytes  →  salida: ${out.length} bytes  (${(100 - out.length / src.length * 100).toFixed(1)}% menos)`);
}

main();
