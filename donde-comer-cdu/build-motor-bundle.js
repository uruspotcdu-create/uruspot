#!/usr/bin/env node
/*
 * scripts/build-motor-bundle.js
 * ---------------------------------------------------------------------
 * Concatena los 11 módulos "core" (motor-config, rubros-meta,
 * locales-slug, motor-plano, motor-exposicion, motor-comparacion,
 * motor-mapa, proyeccion, motor-render, motor-indice-busqueda,
 * datos-virtualizador) en un único js/motor.bundle.js, en el mismo
 * orden que index.html.
 *
 * motor-comparacion.js se agregó el 2026-08-05: existía ya como
 * consumidor en app.js (window.URU_COMPARACION, rama RAMA_CURADURIA)
 * desde antes de que el módulo mismo existiera — el bundle nunca lo
 * incluía porque el archivo fuente no estaba. Sin dependencias hacia
 * los demás módulos (no lee CFG ni PLANO), así que su posición en
 * este orden no importa para ninguno de los pares que contract-tests.js
 * verifica; va junto a motor-exposicion.js por afinidad temática
 * (ambos deciden qué/cómo mostrar del registro), no por necesidad.
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
 * MINIFICACIÓN (perf, iteración 4): el 58% de este bundle eran
 * comentarios de documentación de los módulos fuente — valiosos para
 * quien EDITA js/motor-*.js, pero puro peso muerto para quien solo
 * los descarga y ejecuta en el navegador (jamás los lee). Se
 * conservan intactos en los módulos fuente (nada se borra ahí); acá
 * se usa terser en modo conservador — SOLO strip de comentarios y
 * espacios (`compress:false, mangle:false`), CERO reescritura de
 * lógica o nombres — para no introducir ningún riesgo funcional. Los
 * marcadores `/* ==== *\/` y esta cabecera se preservan explícitamente
 * (ver `comments` en minificar() abajo) porque contract-tests.js los
 * necesita para seguir verificando el orden real de carga.
 *
 * Uso:
 *   node scripts/build-motor-bundle.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const terser = require('terser');

const JS_DIR = path.join(__dirname, '..', 'donde-comer-cdu', 'js');
const SALIDA = path.join(JS_DIR, 'motor.bundle.js');

// Conserva SOLO lo que algo en el repo necesita seguir leyendo del
// bundle generado: los marcadores de módulo (contract-tests.js) y la
// cabecera "GENERADO, NO EDITAR A MANO" (para que quien abra el
// archivo por error sepa dónde está la fuente real). Todo lo demás
// —la documentación de diseño de cada módulo, ya intacta en su
// archivo fuente— se descarta acá.
function conservarComentario(_nodo, comentario) {
  var v = comentario.value;
  if (/GENERADO, NO EDITAR A MANO/.test(v)) return true;
  if (/^\s*====\s*[\w.-]+\.js\s*====\s*$/.test(v)) return true;
  return false;
}

async function minificar(codigo) {
  var resultado = await terser.minify(codigo, {
    compress: false,
    mangle: false,
    format: { comments: conservarComentario }
  });
  if (resultado.error) throw resultado.error;
  return resultado.code;
}

const ORDEN = [
  'motor-config.js',
  'rubros-meta.js',
  'locales-slug.js',
  'motor-plano.js',
  'motor-exposicion.js',
  'motor-comparacion.js',
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

async function build() {
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

  const sinMinificar = cabecera + partes.join('\n');
  const bytesSinMinificar = Buffer.byteLength(sinMinificar);

  const minificado = await minificar(sinMinificar);
  fs.writeFileSync(SALIDA, minificado, 'utf8');

  const bytesBundle = fs.statSync(SALIDA).size;
  console.log(`Bundle generado: ${SALIDA}`);
  console.log(`${ORDEN.length} módulos → 1 archivo.`);
  console.log(`Sin minificar: ${bytesSinMinificar} bytes → minificado: ${bytesBundle} bytes (-${(100 * (1 - bytesBundle / bytesSinMinificar)).toFixed(1)}%).`);
}

build().catch((err) => {
  console.error('Falló el build de motor.bundle.js:', err);
  process.exit(1);
});
