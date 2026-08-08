#!/usr/bin/env node
/*
 * scripts/build-css-bundle.js
 * ---------------------------------------------------------------------
 * Concatena los CSS que hoy carga index.html como <link rel="stylesheet">
 * individuales y render-blocking (tokens, motion-gramatica, los 2 tokens
 * del Ambient Engine, ambiente-planos/capa-fondo/estilos, boton,
 * tarjeta-lugar, chip, badge-estado, destacados, mapa, descubrimiento,
 * pwa-instalar, actualizacion-disponible) en un único
 * css/critical.bundle.css, en el MISMO orden que index.html.
 *
 * Por qué (perf, 2026-07-31): cada <link> es una request HTTP separada.
 * El navegador bloquea First Contentful Paint hasta resolver las 16 —
 * con HTTP/2 se paralelizan las descargas, pero el CSSOM no se
 * construye hasta que la última termina, y cada archivo extra suma
 * latencia de conexión/parseo. Antes de este cambio: 16 requests,
 * ~169 KB sin comprimir repartidos. Después: 1 request.
 *
 * ESTE PROYECTO ES "sitio estático, sin build step para HTML/CSS" según
 * package.json — este script es la EXCEPCIÓN deliberada a esa regla,
 * igual que ya lo son build-motor-bundle.js y build-ambiente-bundle.js
 * para JS. No agrega bundling a ningún otro CSS del proyecto (los CSS
 * de /locales/*, impresion.css con media="print", y
 * contenido-editorial.css con su propio preload+noscript quedan como
 * están, a propósito — ver sección 8 de index.html para el porqué de
 * cada uno).
 *
 * SIN DEPENDENCIAS NUEVAS a propósito: no agrega ninguna devDependency
 * a package.json. La "minificación" acá es deliberadamente mínima —
 * solo quita comentarios /* ... *\/ y colapsa líneas en blanco
 * repetidas — nada de compactar selectores, fusionar reglas ni tocar
 * la cascada. Si en el futuro se quiere una minificación más agresiva
 * (whitespace intra-línea, etc.), evaluar clean-css como devDependency
 * en un patch aparte, con su propio package.json/package-lock.json.
 *
 * IMPORTANTE — CSS no tiene el mismo concepto de "scope por IIFE" que
 * JS: todas las reglas concatenadas caen en la MISMA cascada. Por eso
 * ORDEN de abajo tiene que ser EXACTAMENTE el orden de <link> que tenía
 * index.html antes de este cambio (especificidad igual → gana el que
 * viene después). Si tocás el orden acá, el resultado visual puede
 * cambiar aunque el build "funcione" sin errores — no lo reordenes sin
 * verificar visualmente.
 *
 * Quitar comentarios de un CSS con regex es en general frágil (un
 * comentario que contenga literalmente "*\/" dentro de su propio texto
 * cierra el bloque antes de tiempo — exactamente el bug que esto
 * mismo destapó en css/motion-gramatica.css, ya corregido en el
 * archivo fuente). Por eso esta función es deliberadamente simple —
 * matchea /* ... *\/ de forma no-greedy — y confía en que los CSS
 * fuente no tengan esa secuencia dentro de un comentario. Si alguna
 * vez se agrega un CSS nuevo a ORDEN, revisar que no la tenga.
 *
 * Uso:
 *   node scripts/build-css-bundle.js
 *
 * Hay que correrlo cada vez que se edita alguno de los CSS de ORDEN,
 * antes de commitear.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'donde-comer-cdu');
const SALIDA = path.join(ROOT, 'css', 'critical.bundle.css');

// Mismo orden que tenían los <link rel="stylesheet"> en index.html.
// Rutas relativas a donde-comer-cdu/.
const ORDEN = [
  'css/tokens.css',
  'css/motion-gramatica.css',
  'assets/ambient/_tokens/ambiente-tokens-visual.css',
  'assets/ambient/_tokens/ambiente-tokens-movimiento.css',
  'css/ambiente-planos.css',
  'css/ambiente-capa-fondo.css',
  'css/ambiente-estilos.css',
  'css/boton.css',
  'css/tarjeta-lugar.css',
  'css/chip.css',
  'css/chip-indicador.css',
  'css/badge-estado.css',
  'css/destacados.css',
  'css/mapa.css',
  'css/descubrimiento.css',
  'css/pwa-instalar.css',
  'css/actualizacion-disponible.css'
];

function validarQueArchivosExisten() {
  const faltantes = ORDEN.filter((archivo) => !fs.existsSync(path.join(ROOT, archivo)));
  if (faltantes.length) {
    console.error('ORDEN en scripts/build-css-bundle.js incluye archivos que no existen:');
    console.error(faltantes);
    process.exit(1);
  }
}

// Quita comentarios /* ... */ (no-greedy, sin soporte de anidado —
// igual que CSS real) y colapsa 3+ líneas en blanco seguidas a 1.
// No toca whitespace intra-línea ni el contenido de las reglas.
function limpiar(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function build() {
  validarQueArchivosExisten();

  const partes = ORDEN.map((archivo) => {
    const contenido = fs.readFileSync(path.join(ROOT, archivo), 'utf8');
    return `/* ==== ${archivo} ==== */\n${limpiar(contenido)}\n`;
  });

  const cabecera = `/*\n * css/critical.bundle.css — GENERADO, NO EDITAR A MANO.\n` +
    ` * Fuente: ${ORDEN.length} archivos + scripts/build-css-bundle.js\n` +
    ` * Para modificar, editá el CSS fuente correspondiente y volvé a correr:\n` +
    ` *   node scripts/build-css-bundle.js\n` +
    ` * Generado: ${new Date().toISOString()}\n */\n\n`;

  const salidaFinal = cabecera + partes.join('\n');
  fs.writeFileSync(SALIDA, salidaFinal, 'utf8');

  const bytesOriginal = ORDEN.reduce(
    (acc, archivo) => acc + fs.statSync(path.join(ROOT, archivo)).size,
    0
  );
  const bytesBundle = fs.statSync(SALIDA).size;
  console.log(`Bundle generado: ${SALIDA}`);
  console.log(`${ORDEN.length} archivos → 1 archivo.`);
  console.log(`Fuentes: ${bytesOriginal} bytes → bundle: ${bytesBundle} bytes (-${(100 * (1 - bytesBundle / bytesOriginal)).toFixed(1)}%).`);
}

build();

