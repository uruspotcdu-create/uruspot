#!/usr/bin/env node
/*
 * scripts/build-ambiente-bundle.js
 * ---------------------------------------------------------------------
 * Concatena los 27 módulos del Ambient Engine (js/ambiente-*.js) en un
 * único js/ambiente.bundle.js, en el MISMO orden documentado en el
 * comentario "Ambient Engine — Fase 0 + Fase 1 + Fase 2" de index.html
 * (grafo de dependencias real entre grupos funcionales).
 *
 * Por qué: cada módulo es un IIFE autocontenido —
 *   (function (global) { ... })(window);
 * — sin nada en scope global fuera de eso, así que concatenarlos en
 * orden es funcionalmente idéntico a cargarlos como 27 <script defer>
 * separados: mismo grafo de ejecución, cero riesgo de colisión de
 * nombres. La única diferencia es que el navegador hace 1 request en
 * vez de 27 (perf, 2026-07-31).
 *
 * ESTE ARCHIVO NO ES UN BUNDLER GENÉRICO: la lista ORDEN está escrita
 * a mano y DEBE reflejar exactamente el orden de <script> de
 * index.html. Si agregás, quitás o reordenás un módulo ambiente-*.js
 * en index.html, actualizá ORDEN acá también — el script valida que
 * ambas listas coincidan y falla fuerte si no.
 *
 * Uso:
 *   node scripts/build-ambiente-bundle.js
 *
 * Hay que correrlo cada vez que se edita algún js/ambiente-*.js, antes
 * de commitear — igual que index.html documenta que hay que tocar el
 * orden a mano si cambia el grafo de dependencias. No corre solo en
 * ningún hook todavía (el repo es "sin build step" por decisión, este
 * es un paso opcional que solo aplica a este bundle puntual).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const JS_DIR = path.join(__dirname, '..', 'donde-comer-cdu', 'js');
const INDEX_HTML = path.join(__dirname, '..', 'donde-comer-cdu', 'index.html');
const SALIDA = path.join(JS_DIR, 'ambiente.bundle.js');

// Orden real, copiado del grafo de dependencias documentado en
// index.html (comentario "Ambient Engine — Fase 0 + Fase 1 + Fase 2").
const ORDEN = [
  'ambiente-config.js',
  'ambiente-assets.js',
  'ambiente-diagnostico.js',
  'ambiente-accesibilidad.js',
  'ambiente-rendimiento.js',
  'ambiente-estados.js',
  'ambiente-profundidad.js',
  'ambiente-gramatica.js',
  'ambiente-ritmo.js',
  'ambiente-respiracion.js',
  'ambiente-movimiento.js',
  'ambiente-escenas.js',
  'ambiente-luz.js',
  'ambiente-clima.js',
  'ambiente-interaccion.js',
  'ambiente-planos.js',
  'ambiente-reticula.js',
  'ambiente-topografia.js',
  'ambiente-corrientes.js',
  'ambiente-coordenadas.js',
  'ambiente-brujula.js',
  'ambiente-particulas-deriva.js',
  'ambiente-halos.js',
  'ambiente-horario-tinte.js',
  'ambiente-capa-fondo.js',
  'ambiente-flags.js',
  'ambiente-orquestador.js'
];

function ordenEnIndexHtml() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const matches = [...html.matchAll(/<script src="js\/(ambiente-[a-z-]+\.js)" defer><\/script>/g)];
  return matches.map((m) => m[1]);
}

function validarContraIndexHtml() {
  const real = ordenEnIndexHtml();
  const iguales = real.length === ORDEN.length && real.every((f, i) => f === ORDEN[i]);
  if (!iguales) {
    console.error('El orden de ORDEN en este script NO coincide con los <script> de index.html.');
    console.error('En index.html:', real);
    console.error('En este script:', ORDEN);
    console.error('Actualizá ORDEN en scripts/build-ambiente-bundle.js antes de generar el bundle.');
    process.exit(1);
  }
}

function build() {
  validarContraIndexHtml();

  const partes = ORDEN.map((archivo) => {
    const contenido = fs.readFileSync(path.join(JS_DIR, archivo), 'utf8');
    return `/* ==== ${archivo} ==== */\n${contenido.trimEnd()}\n`;
  });

  const cabecera = `/*\n * js/ambiente.bundle.js — GENERADO, NO EDITAR A MANO.\n` +
    ` * Fuente: js/ambiente-*.js (27 módulos) + scripts/build-ambiente-bundle.js\n` +
    ` * Para modificar el Ambient Engine, editá el módulo ambiente-*.js\n` +
    ` * correspondiente y volvé a correr:\n` +
    ` *   node scripts/build-ambiente-bundle.js\n` +
    ` * Generado: ${new Date().toISOString()}\n */\n\n`;

  fs.writeFileSync(SALIDA, cabecera + partes.join('\n'), 'utf8');

  const bytesOriginal = ORDEN.reduce(
    (acc, f) => acc + fs.statSync(path.join(JS_DIR, f)).size, 0
  );
  const bytesBundle = fs.statSync(SALIDA).size;
  console.log(`Bundle generado: ${SALIDA}`);
  console.log(`${ORDEN.length} módulos → 1 archivo (${bytesBundle} bytes, cabecera incluida).`);
  console.log('27 requests HTTP → 1 request para este bloque.');
}

build();
