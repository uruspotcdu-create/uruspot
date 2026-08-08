#!/usr/bin/env node
/**
 * agregar-icono-rubro-ficha.js
 * ---------------------------------------------------------------------
 * Cierra URUSPOT-PENDIENTES §6: "Pictograma de rubro compartido
 * Canvas↔DOM: 3 de 5 superficies, no 5 de 5" — URU_RUBROS_ICONO_SVG()
 * ya se usa en el filtro "Por rubro", la leyenda del mapa y la tarjeta
 * de descubrimiento, pero NO en la ficha (hero-eyebrow sigue siendo
 * solo texto).
 *
 * QUÉ HACE, por cada una de las 45 fichas en locales/<slug>/index.html:
 *
 * 1) Inyecta el campo "rubro" en el JSON embebido de #ficha-data
 *    (ej. {"nombre": "Antigua Fonda", ...} -> {"rubro": "alojamiento",
 *    "nombre": "Antigua Fonda", ...}), tomado de lugares-core.json
 *    (campo `grupo`) vía el mapeo id->slug de locales-slug.js — la
 *    misma fuente de verdad que ya usa el resto del sitio, sin
 *    inventar una nueva.
 *
 * 2) Agrega <script src="../js/rubros-meta.js" defer></script> antes
 *    de ficha.js, si todavía no está — necesario para que
 *    URU_RUBROS_ICONO_SVG() exista en esta página (hoy solo se carga
 *    en app.js/motor-mapa.js, nunca en las fichas).
 *
 * NO toca el HTML del hero-eyebrow directamente: el ícono se inserta
 * en runtime desde ficha.js (ver el segundo archivo que acompaña a
 * este script, aplicarIconoRubro() en ficha.js), leyendo DATA.rubro.
 * Así el markup estático de las 45 fichas no se duplica a mano.
 *
 * CÓMO EVITA CRLF/LF: reemplazos de texto puntual (split/join sobre un
 * string exacto), nunca reescritura de línea completa ni diff — cada
 * línea no tocada conserva su salto de línea original.
 *
 * USO (parado en donde-comer-cdu/, o pasando la ruta como argumento):
 *   node agregar-icono-rubro-ficha.js
 *   node agregar-icono-rubro-ficha.js --dry-run
 *   node agregar-icono-rubro-ficha.js "C:\ruta\a\donde-comer-cdu"
 *
 * Requiere solo Node.js (sin dependencias externas).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const argRuta = process.argv.slice(2).find(function (a) { return a !== '--dry-run'; });
const BASE_DIR = argRuta ? path.resolve(argRuta) : process.cwd();

const LOCALES_SLUG_PATH = path.join(BASE_DIR, 'js', 'locales-slug.js');
const LUGARES_CORE_PATH = path.join(BASE_DIR, 'lugares-core.json');
const LOCALES_DIR = path.join(BASE_DIR, 'locales');

const TAG_RUBROS_META = '<script src="../js/rubros-meta.js" defer></script>';
const TAG_FICHA_JS = '<script src="../ficha.js" defer></script>';

function cargarMapeoIdASlug() {
  // locales-slug.js se auto-ejecuta como (function(global){...})(this) y
  // cuelga URU_LOCALES_SLUGS de `global` — lo evaluamos en un sandbox
  // mínimo en vez de usar require(), porque el archivo no exporta con
  // module.exports (es un script de navegador, no un módulo CJS).
  const codigo = fs.readFileSync(LOCALES_SLUG_PATH, 'utf8');
  const sandbox = {};
  const fn = new Function('global', codigo + '\nreturn global.URU_LOCALES_SLUGS;');
  return fn(sandbox);
}

function main() {
  if (!fs.existsSync(LOCALES_SLUG_PATH) || !fs.existsSync(LUGARES_CORE_PATH) || !fs.existsSync(LOCALES_DIR)) {
    console.error('No se encontró js/locales-slug.js, lugares-core.json o locales/ dentro de: ' + BASE_DIR);
    console.error('Corré este script parado en donde-comer-cdu/, o pasá la ruta como argumento.');
    process.exit(1);
  }

  const idASlug = cargarMapeoIdASlug();
  const core = JSON.parse(fs.readFileSync(LUGARES_CORE_PATH, 'utf8'));
  const idAGrupo = {};
  core.forEach(function (l) { idAGrupo[l.id] = l.grupo; });

  let corregidos = 0;
  let yaOk = 0;
  let sinGrupo = [];
  let sinArchivo = [];

  Object.keys(idASlug).forEach(function (id) {
    const slug = idASlug[id];
    const grupo = idAGrupo[id];
    const indexPath = path.join(LOCALES_DIR, slug, 'index.html');

    if (!grupo) {
      sinGrupo.push(slug);
      return;
    }
    if (!fs.existsSync(indexPath)) {
      sinArchivo.push(slug);
      return;
    }

    let contenido = fs.readFileSync(indexPath, 'utf8');
    const yaTieneRubro = /"rubro"\s*:/.test(contenido);
    const yaTieneScript = contenido.includes(TAG_RUBROS_META);

    if (yaTieneRubro && yaTieneScript) {
      yaOk++;
      return;
    }

    if (!yaTieneRubro) {
      const marcaOriginal = '{"nombre": ';
      if (!contenido.includes(marcaOriginal)) {
        console.log('⚠ ' + slug + ': no se encontró el inicio esperado de #ficha-data, se omite.');
        return;
      }
      contenido = contenido.replace(marcaOriginal, '{"rubro": "' + grupo + '", "nombre": ');
    }

    if (!yaTieneScript) {
      if (!contenido.includes(TAG_FICHA_JS)) {
        console.log('⚠ ' + slug + ': no se encontró el <script> de ficha.js, se omite la inserción de rubros-meta.js.');
      } else {
        contenido = contenido.replace(TAG_FICHA_JS, TAG_RUBROS_META + '\n' + TAG_FICHA_JS);
      }
    }

    console.log('✔ ' + slug + '  (rubro: ' + grupo + ')');
    if (!DRY_RUN) {
      fs.writeFileSync(indexPath, contenido, 'utf8');
    }
    corregidos++;
  });

  console.log('');
  console.log('══════════════════════════════════════════════════════');
  console.log((DRY_RUN ? '[DRY RUN] ' : '') + 'Corregidos: ' + corregidos + ' / ' + Object.keys(idASlug).length);
  if (yaOk) console.log('Ya estaban correctos (sin cambios): ' + yaOk);
  if (sinGrupo.length) console.log('Sin `grupo` en lugares-core.json (revisar a mano): ' + sinGrupo.join(', '));
  if (sinArchivo.length) console.log('Sin carpeta/index.html real (revisar a mano): ' + sinArchivo.join(', '));
  if (DRY_RUN) {
    console.log('Nada se escribió en disco. Corré sin --dry-run para aplicar.');
  } else {
    console.log('Recordá también reemplazar js/ficha.js por la versión que');
    console.log('lee DATA.rubro y pinta el ícono en .hero-eyebrow.');
  }
}

main();

