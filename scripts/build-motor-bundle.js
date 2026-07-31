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
const INDEX_HTML = path.join(__dirname, '..', 'donde-comer-cdu', 'index.html');
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

function ordenEnIndexHtml() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const matches = [...html.matchAll(/<script src="js\/([\w-]+\.js)" defer><\/script>/g)];
  const nombresValidos = new Set(ORDEN);
  return matches.map((m) => m[1]).filter((f) => nombresValidos.has(f));
}

function validarContraIndexHtml() {
  const real = ordenEnIndexHtml();
  const iguales = real.length === ORDEN.length && real.every((f, i) => f === ORDEN[i]);
  if (!iguales) {
    console.error('El orden de ORDEN en este script NO coincide con los <script> de index.html.');
    console.error('En index.html:', real);
    console.error('En este script:', ORDEN);
    process.exit(1);
  }
}

function quitarBOM(texto) {
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

function build() {
  validarContraIndexHtml();

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
