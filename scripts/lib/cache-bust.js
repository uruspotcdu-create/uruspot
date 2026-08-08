#!/usr/bin/env node
'use strict';

const fs = require('fs');
const crypto = require('crypto');

const LARGO_HASH = 10;

function calcularHash(rutaArchivo) {
  const contenido = fs.readFileSync(rutaArchivo);
  return crypto.createHash('sha256').update(contenido).digest('hex').slice(0, LARGO_HASH);
}

function actualizarVersionEnHtml(rutaIndexHtml, rutaArchivoGenerado, referenciaEnHtml) {
  const hash = calcularHash(rutaArchivoGenerado);
  const html = fs.readFileSync(rutaIndexHtml, 'utf8');

  const escapada = referenciaEnHtml.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patron = new RegExp(`${escapada}(\\?v=[a-f0-9]+)?(["'])`, 'g');

  let encontrada = false;
  const htmlActualizado = html.replace(patron, (_match, _viejoQuery, comilla) => {
    encontrada = true;
    return `${referenciaEnHtml}?v=${hash}${comilla}`;
  });

  if (!encontrada) {
    console.error(`cache-bust: no se encontro ninguna referencia a "${referenciaEnHtml}" en ${rutaIndexHtml}.`);
    process.exit(1);
  }

  if (htmlActualizado !== html) {
    fs.writeFileSync(rutaIndexHtml, htmlActualizado, 'utf8');
    console.log(`  cache-bust: ${referenciaEnHtml} -> ?v=${hash}`);
  } else {
    console.log(`  cache-bust: ${referenciaEnHtml} sin cambios (?v=${hash} ya estaba)`);
  }
}

module.exports = { actualizarVersionEnHtml, calcularHash };