#!/usr/bin/env node
/*
 * scripts/build-motor-bundle.js
 * ---------------------------------------------------------------------
 * Concatena los 10 módulos "core" (motor-config, rubros-meta,
 * locales-slug, motor-plano, motor-exposicion, motor-mapa, proyeccion,
 * motor-render, motor-indice-busqueda, datos-virtualizador) en un
 * único js/motor.bundle.js, en el mismo orden que index.html.
 *
 * Mismo criterio que scripts/build-ambiente-bundle.js: cada módulo es
 * un IIFE autocontenido — (function (global) {...})(window) o
 * equivalente con typeof window !== 'undefined' ? window : global —
 * así que concatenar en orden es funcionalmente idéntico a cargarlos
 * por separado. datos-virtualizador.js es la única excepción: no
 * recibe `global` como parámetro (usa `window.Virtualizador = ...`
 * directo adentro de su IIFE), pero sigue siendo autocontenido, así
 * que da igual para este propósito. Ese archivo también trae un BOM
 * (U+FEFF) al principio — inocuo dentro de un bundle (la spec de
 * ECMAScript lo trata como whitespace en cualquier posición, no solo
 * al inicio de archivo), pero este script lo recorta igual por
 * prolijidad.
 *
 * IMPORTANTE — a diferencia del bundle de ambiente-*.js, este archivo
 * bundlea módulos que js/contract-tests.js verifica por nombre
 * individual (motor-config antes que motor-plano, etc.). Por eso cada
 * módulo se escribe acá con un marcador
 *   /* ==== nombre-archivo.js ==== *\/
 * — contract-tests.js lo lee para seguir verificando el orden real
 * DENTRO del bundle, no solo la posición del <script> del bundle en
 * el documento. No borrar ni reformatear esos marcadores sin también
 * actualizar contract-tests.js.
 *
 * Uso:
 *   node scripts/build-motor-bundle.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const JS_DIR = path.join(__dirname, '..', 'donde-comer-cdu', 'js');
const SALIDA = path.join(JS_DIR, 'motor.bundle.js');

const ORDEN = [
  'motor-config.js',
  'rubros-meta.js',
  'locales-slug.js',
  'motor-plano.js',
  'motor-exposicion.js',
  'motor-mapa.js',
  'proyeccion.js',
  'motor-render.js',
  'motor-indice-busqueda.js',
  'datos-virtualizador.js'
];

// La comparación contra <script> individuales de index.html quedó
// obsoleta el mismo 2026-07-31 en que estos 10 módulos se concatenaron
// a motor.bundle.js: desde entonces index.html solo tiene el <script>
// del bundle, así que esa comparación siempre daba "En index.html: []"
// y el build fallaba siempre (ver misma clase de bug ya corregida en
// build-ambiente-bundle.js). El invariante que sigue vivo y vale la
// pena proteger acá es más simple: que cada archivo de ORDEN exista
// realmente en JS_DIR — así un nombre mal escrito o un módulo borrado
// sigue haciendo fallar el build en vez de generar un bundle roto o
// incompleto en silencio. El orden real dentro del bundle lo sigue
// verificando js/contract-tests.js leyendo los marcadores.
function validarQueArchivosExisten() {
  const faltantes = ORDEN.filter((archivo) => !fs.existsSync(path.join(JS_DIR, archivo)));
  if (faltantes.length) {
    console.error('ORDEN en scripts/build-motor-bundle.js incluye archivos que no existen en js/:');
    console.error(faltantes);
    process.exit(1);
  }
}

function quitarBOM(texto) {
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

function build() {
  validarQueArchivosExisten();

  const partes = ORDEN.map((archivo) => {
    const contenido = quitarBOM(fs.readFileSync(path.join(JS_DIR, archivo), 'utf8'));
    return `/* ==== ${archivo} ==== */\n${contenido.trimEnd()}\n`;
  });

  const cabecera = `/*\n * js/motor.bundle.js — GENERADO, NO EDITAR A MANO.\n` +
    ` * Fuente: ${ORDEN.length} módulos + scripts/build-motor-bundle.js\n` +
    ` * Para modificar, editá el módulo correspondiente y volvé a correr:\n` +
    ` *   node scripts/build-motor-bundle.js\n` +
    ` * js/contract-tests.js lee los marcadores /* ==== archivo.js ==== *\\/\n` +
    ` * de este archivo para seguir verificando el orden real.\n` +
    ` * Generado: ${new Date().toISOString()}\n */\n\n`;

  fs.writeFileSync(SALIDA, cabecera + partes.join('\n'), 'utf8');

  const bytesBundle = fs.statSync(SALIDA).size;
  console.log(`Bundle generado: ${SALIDA}`);
  console.log(`${ORDEN.length} módulos → 1 archivo (${bytesBundle} bytes, cabecera incluida).`);
}

build();
