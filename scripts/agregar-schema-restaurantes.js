#!/usr/bin/env node
'use strict';
/*
 * scripts/agregar-schema-restaurantes.js
 * ---------------------------------------------------------------------
 * Origen (auditoría SEO, 2026-08): de las 61 fichas de
 * los-mejores-restaurantes-cdu/<slug>/, 60 no tenían ningún JSON-LD
 * (schema.org), a diferencia de donde-comer-cdu/locales/*, que sí lo
 * tiene. Sin structured data, Google no puede mostrar rich snippets
 * (rating, dirección, teléfono) para ninguna de esas 60 páginas.
 *
 * Este script agrega un bloque Restaurant válido a cada ficha que no
 * tenga uno, usando EXCLUSIVAMENTE datos ya presentes en la propia
 * página (el JSON embebido en <script id="ficha-data">, el rating/
 * reseñas visibles en el hero, la categoría del eyebrow-text, el
 * canonical). No inventa ni completa nada:
 *   - Si la ficha no tiene rating visible (no todas lo tienen todavía),
 *     el bloque sale sin `aggregateRating` — no se fabrica un número.
 *   - No incluye `image`: ninguna de las 61 fichas tiene foto propia
 *     todavía (ni <img> ni og:image), así que agregar el campo sería
 *     inventar una URL que no existe. Cuando la DSA cargue fotos
 *     reales, hay que sumar `image` acá.
 *   - No incluye `geo` (latitude/longitude): estas fichas no traen
 *     coordenadas verificadas como sí las tienen las de
 *     donde-comer-cdu/locales/ (que vienen de lugares-core.json). En
 *     cambio usa `hasMap` con el place_id real de Google, que sí está
 *     verificado en cada ficha.
 *   - `address.streetAddress` se separa del sufijo fijo ", Concepción
 *     del Uruguay, Entre Ríos" que se repite igual en las 61 fichas —
 *     no es un dato por-lugar, es una constante del proyecto entero.
 *
 * Es idempotente: si una ficha ya tiene `application/ld+json`, se
 * salta (no duplica ni pisa un schema existente).
 *
 * MODO DRY-RUN POR DEFECTO: sin --write, solo imprime un reporte de
 * qué JSON-LD generaría para cada ficha y NO toca ningún archivo. Son
 * negocios reales — un dato mal parseado (rating, teléfono, dirección)
 * publicado como structured data es peor que no tener structured data.
 * Revisá el reporte antes de correr con --write (mismo criterio que ya
 * usa scripts/generar-jsonld-fichas.js para donde-comer-cdu/locales/*).
 *
 * Uso:
 *   node scripts/agregar-schema-restaurantes.js            → reporte, no escribe
 *   node scripts/agregar-schema-restaurantes.js --write     → inyecta el <script>
 *                                                              JSON-LD antes de
 *                                                              </head> en cada ficha
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ESCRIBIR = process.argv.includes('--write');

function resolverRoot() {
  try {
    const top = execSync('git rev-parse --show-toplevel', {
      cwd: __dirname, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (top && fs.existsSync(path.join(top, 'los-mejores-restaurantes-cdu'))) return top;
  } catch (e) { /* sin git — seguimos al fallback */ }
  return path.join(__dirname, '..');
}

const ROOT = resolverRoot();
const DIR = path.join(ROOT, 'los-mejores-restaurantes-cdu');

const slugs = fs.readdirSync(DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

let procesadas = 0, saltadas = 0;
const reporte = [];

for (const slug of slugs) {
  const file = path.join(DIR, slug, 'index.html');
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, 'utf8');

  if (html.includes('application/ld+json')) { saltadas++; continue; }

  const fichaMatch = html.match(/<script id="ficha-data" type="application\/json">\s*([\s\S]*?)\s*<\/script>/);
  if (!fichaMatch) { reporte.push(`SIN ficha-data: ${slug}`); continue; }
  let ficha;
  try { ficha = JSON.parse(fichaMatch[1]); } catch (e) { reporte.push(`JSON inválido en ficha-data: ${slug}`); continue; }

  const canonicalMatch = html.match(/rel="canonical" href="([^"]+)"/);
  const canonical = canonicalMatch ? canonicalMatch[1] : `https://uruspot.pages.dev/los-mejores-restaurantes-cdu/${slug}/`;

  const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
  const description = ficha.share_text || (descMatch ? descMatch[1] : ficha.nombre);

  // Categoría: del eyebrow-text ("🔥 Pizzería" -> "Pizzería"), sin inventar si no está.
  const catMatch = html.match(/<span class="eyebrow-text">[^<]*?\s([^<]+)<\/span>/);
  const categoria = catMatch ? catMatch[1].trim() : null;

  // Rating: solo si está realmente en la página.
  const ratingMatch = html.match(/Rating de Google: ([\d.]+) de 5/);
  const reviewsMatch = html.match(/(\d+)\s*reseñas en Google/);

  // Dirección: separar streetAddress del sufijo fijo de ciudad/provincia,
  // que se repite igual en las 62 fichas (constante del proyecto, no dato
  // inventado por página).
  const SUFIJO = ', Concepción del Uruguay, Entre Ríos';
  let streetAddress = ficha.direccion || null;
  if (streetAddress && streetAddress.endsWith(SUFIJO)) {
    streetAddress = streetAddress.slice(0, -SUFIJO.length);
  }

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: ficha.nombre,
    description: description,
    url: canonical
  };
  if (categoria) ld.servesCuisine = categoria;
  if (ficha.telefono) ld.telephone = ficha.telefono;
  if (streetAddress) {
    ld.address = {
      '@type': 'PostalAddress',
      streetAddress: streetAddress,
      addressLocality: 'Concepción del Uruguay',
      addressRegion: 'Entre Ríos',
      addressCountry: 'AR'
    };
  }
  if (ficha.place_id) {
    ld.hasMap = `https://www.google.com/maps/place/?q=place_id:${ficha.place_id}`;
  }
  if (ratingMatch && reviewsMatch) {
    ld.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: ratingMatch[1],
      reviewCount: reviewsMatch[1],
      bestRating: '5'
    };
  }

  const script = `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n</script>\n`;

  if (ESCRIBIR) {
    const nuevoHtml = html.replace('</head>', `${script}</head>`);
    fs.writeFileSync(file, nuevoHtml, 'utf8');
    console.log(`[escrito] ${slug}`);
  } else {
    console.log(`\n=== ${slug} ===`);
    console.log(JSON.stringify(ld, null, 2));
  }
  procesadas++;
}

console.log('\n--------------------------------------------------');
console.log(`Procesadas (JSON-LD ${ESCRIBIR ? 'agregado' : 'propuesto'}): ${procesadas}`);
console.log(`Ya tenían JSON-LD (saltadas): ${saltadas}`);
if (reporte.length) {
  console.log('\nAdvertencias:');
  reporte.forEach(r => console.log('  - ' + r));
}
if (!ESCRIBIR) {
  console.log('\nDRY-RUN: no se escribió ningún archivo. Revisá el reporte de arriba y');
  console.log('corré con --write cuando estés conforme con lo que se extrajo.');
}
