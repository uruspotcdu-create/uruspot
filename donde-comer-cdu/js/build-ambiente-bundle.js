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
  'ambiente-contrato.js',
  'ambiente-assets.js',
  'ambiente-diagnostico.js',
  'ambiente-metrics.js',
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

// index.html ya NO tiene un <script> por cada módulo (perf, 2026-07-31:
// los 27 se concatenaron en un único js/ambiente.bundle.js) — comparar
// ORDEN contra index.html quedó obsoleto porque ahí ya no queda ningún
// rastro del orden individual para comparar. El invariante que sigue
// siendo real y vale la pena proteger es otro: que ORDEN contenga
// exactamente los archivos ambiente-*.js que existen en disco, ni uno
// de más ni uno de menos — así un módulo nuevo que se cree y se olvide
// agregar acá (o uno que se borre y quede colgado en ORDEN) sigue
// haciendo fallar el build en vez de generar un bundle incompleto o
// con basura en silencio.
function archivosAmbienteEnDisco() {
  return fs.readdirSync(JS_DIR)
    // ambiente-lifecycle-tests.js (y cualquier futuro *-tests.js) no es
    // un módulo del motor — es una suite de Node ejecutada por
    // run-tests.js (ver SUITES ahí), nunca cargada en el navegador ni
    // parte del bundle.
    .filter((nombre) => /^ambiente-[a-z-]+\.js$/.test(nombre) && !/-tests\.js$/.test(nombre))
    .sort();
}

function validarContraDirectorio() {
  const enDisco = archivosAmbienteEnDisco();
  const enOrden = ORDEN.slice().sort();
  const faltanEnOrden = enDisco.filter((f) => !ORDEN.includes(f));
  const sobranEnOrden = enOrden.filter((f) => !enDisco.includes(f));
  if (faltanEnOrden.length || sobranEnOrden.length) {
    console.error('ORDEN en scripts/build-ambiente-bundle.js no coincide con los archivos js/ambiente-*.js en disco.');
    if (faltanEnOrden.length) console.error('Existen en disco pero faltan en ORDEN:', faltanEnOrden);
    if (sobranEnOrden.length) console.error('Están en ORDEN pero no existen en disco:', sobranEnOrden);
    console.error('Actualizá ORDEN en scripts/build-ambiente-bundle.js antes de generar el bundle.');
    process.exit(1);
  }
}

function build() {
  validarContraDirectorio();

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
