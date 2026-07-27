#!/usr/bin/env node
/**
 * generar-sitemap.js
 * ---------------------------------------------------------------------
 * Genera sitemap.xml a partir del contenido REAL del repositorio, en vez
 * de mantenerlo a mano. Reemplaza el sitemap estático de 10 URLs que no
 * reflejaba las fichas de negocio ni detectaba canonicals rotos.
 *
 * Regla de inclusión (aplicada a TODO index.html del repo, excepto los
 * excluidos explícitamente más abajo):
 *   1. El archivo debe declarar <link rel="canonical" href="...">.
 *   2. El dominio del canonical debe ser exactamente SITE_ORIGIN.
 *   3. La ruta del canonical debe ser IDÉNTICA a la ruta real del propio
 *      archivo (auto-referencia). Si el canonical apunta a otra URL,
 *      la página se excluye: su propio HTML está diciendo "no soy la
 *      versión canónica", así que no debe entrar al sitemap.
 *
 * Reglas adicionales para fichas de negocio (donde-comer-cdu/locales/*):
 *   4. El slug (nombre de carpeta) debe estar registrado en
 *      js/locales-slug.js — la fuente de verdad de qué fichas están
 *      realmente enlazadas desde la app. Fichas físicas no registradas
 *      (exclusión deliberada por ambigüedad de sucursal, documentada en
 *      ese mismo archivo) NO entran al sitemap.
 *
 * Exclusiones estructurales (no requieren mantenimiento manual, se
 * resuelven solas vía la regla 3):
 *   - los-mejores-restaurantes-cdu/index.html y sus subpáginas de
 *     negocio: su canonical apunta a otro dominio (el índice) o a rutas
 *     /donde-comer-cdu/locales/<slug>/ que no existen (las subpáginas).
 *   - las-mejores-heladerias-cdu/, las-mejores-hosterias-cdu/,
 *     las-mejores-panaderias-cdu/, los-mejores-bares-cdu/,
 *     los-mejores-gimnasios-cdu/: canonical apunta a
 *     uruspotcdu-create.github.io (dominio viejo), no a SITE_ORIGIN.
 *   - inicio/index.html: existe como archivo pero su propio canonical
 *     dice que la URL real es "/", no "/inicio/" — así que no genera
 *     una entrada duplicada.
 *
 * CASO ESPECIAL — la homepage "/":
 *   No existe index.html en la raíz del repo, ni _redirects, ni
 *   wrangler.toml, ni workflow que copie inicio/index.html a la raíz.
 *   No se puede verificar desde el repo que "/" resuelva a una página
 *   real en producción. Se incluye igual (estaba en el sitemap anterior
 *   y inicio/index.html se autodeclara canónico como "/"), marcada
 *   explícitamente como riesgo sin verificar — ver REPORTE al final de
 *   la ejecución y el hallazgo correspondiente en el informe entregado
 *   al usuario.
 *
 * Uso: node scripts/generar-sitemap.js
 * Sin dependencias externas (solo fs/path/child_process de Node).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SITE_ORIGIN = 'https://uruspot.pages.dev';

// Directorios que nunca deben recorrerse.
const SKIP_DIRS = new Set(['.git', 'node_modules', 'scripts']);

// -----------------------------------------------------------------------
// 1. Encontrar todos los index.html del repo
// -----------------------------------------------------------------------
function findIndexHtmlFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      findIndexHtmlFiles(path.join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name === 'index.html') {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// -----------------------------------------------------------------------
// 2. Cargar el mapa de slugs registrados (fuente de verdad de fichas
//    realmente enlazadas desde la app)
// -----------------------------------------------------------------------
function cargarSlugsRegistrados() {
  const slugPath = path.join(ROOT, 'donde-comer-cdu', 'js', 'locales-slug.js');
  const sandbox = {};
  sandbox.window = sandbox; // el archivo hace (function(global){...})(window)
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', fs.readFileSync(slugPath, 'utf8') + '\nreturn window.URU_LOCALES_SLUGS;');
  const mapa = fn(sandbox);
  return new Set(Object.values(mapa));
}

// -----------------------------------------------------------------------
// 3. Extraer el canonical de un archivo HTML
// -----------------------------------------------------------------------
function extraerCanonical(html) {
  const m = html.match(/rel="canonical"\s+href="([^"]+)"/);
  return m ? m[1] : null;
}

// -----------------------------------------------------------------------
// 4. Ruta URL "propia" de un archivo, a partir de su ubicación en disco
// -----------------------------------------------------------------------
function rutaPropia(absFilePath) {
  const rel = path.relative(ROOT, path.dirname(absFilePath)).split(path.sep).join('/');
  return rel === '' ? '/' : `/${rel}/`;
}

// -----------------------------------------------------------------------
// 5. lastmod real: fecha del último commit que tocó el archivo
// -----------------------------------------------------------------------
function ultimaModificacionGit(absFilePath) {
  try {
    const out = execSync(`git log -1 --format=%cd --date=short -- "${absFilePath}"`, {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
    return out || null;
  } catch (e) {
    return null;
  }
}

// -----------------------------------------------------------------------
// 6. Prioridad/changefreq según el tipo de página
// -----------------------------------------------------------------------
function metaParaRuta(rutaUrl) {
  if (rutaUrl === '/') return { priority: '1.0', changefreq: 'weekly' };
  if (rutaUrl === '/donde-comer-cdu/') return { priority: '0.9', changefreq: 'weekly' };
  if (rutaUrl.startsWith('/donde-comer-cdu/locales/')) return { priority: '0.7', changefreq: 'monthly' };
  return { priority: '0.8', changefreq: 'monthly' }; // landings de rubro
}

// -----------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------
function main() {
  const slugsRegistrados = cargarSlugsRegistrados();
  const archivos = findIndexHtmlFiles(ROOT, []);

  const incluidas = [];
  const excluidas = [];

  for (const abs of archivos) {
    const rutaUrl = rutaPropia(abs);
    const html = fs.readFileSync(abs, 'utf8');
    const canonical = extraerCanonical(html);

    if (!canonical) {
      excluidas.push({ ruta: rutaUrl, motivo: 'sin <link rel="canonical">' });
      continue;
    }
    if (!canonical.startsWith(SITE_ORIGIN)) {
      excluidas.push({ ruta: rutaUrl, motivo: `canonical apunta a otro dominio: ${canonical}` });
      continue;
    }
    const canonicalPath = canonical.slice(SITE_ORIGIN.length) || '/';
    if (canonicalPath !== rutaUrl) {
      excluidas.push({ ruta: rutaUrl, motivo: `canonical no se autoreferencia (apunta a ${canonicalPath})` });
      continue;
    }

    // Regla extra para fichas de negocio: deben estar registradas.
    if (rutaUrl.startsWith('/donde-comer-cdu/locales/')) {
      const slug = rutaUrl.replace('/donde-comer-cdu/locales/', '').replace(/\/$/, '');
      if (!slugsRegistrados.has(slug)) {
        excluidas.push({ ruta: rutaUrl, motivo: 'ficha física no registrada en locales-slug.js (exclusión deliberada de datos)' });
        continue;
      }
    }

    incluidas.push({
      ruta: rutaUrl,
      lastmod: ultimaModificacionGit(abs),
      ...metaParaRuta(rutaUrl),
    });
  }

  // Caso especial: la homepage "/" no tiene index.html propio en la raíz.
  // Se agrega manualmente porque no hay archivo que recorrer, con la
  // salvedad documentada en el header de este script y en el informe.
  if (!incluidas.some((p) => p.ruta === '/')) {
    incluidas.push({
      ruta: '/',
      lastmod: null,
      priority: '1.0',
      changefreq: 'weekly',
      _sinVerificar: true,
    });
  }

  incluidas.sort((a, b) => a.ruta.localeCompare(b.ruta));

  // ---- Construir XML ----
  const hoy = new Date().toISOString().slice(0, 10);
  const urls = incluidas
    .map((p) => {
      const lastmod = p.lastmod || hoy;
      return `  <url>\n    <loc>${SITE_ORIGIN}${p.ruta}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`;
    })
    .join('\n\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/0.9">\n\n${urls}\n\n</urlset>\n`;

  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml, 'utf8');

  // ---- Reporte por consola ----
  console.log(`\n=== SITEMAP GENERADO ===`);
  console.log(`URLs incluidas: ${incluidas.length}`);
  const sinVerificar = incluidas.filter((p) => p._sinVerificar);
  if (sinVerificar.length) {
    console.log(`  ⚠ Sin verificar (no hay archivo fuente en el repo): ${sinVerificar.map((p) => p.ruta).join(', ')}`);
  }
  console.log(`\nURLs excluidas: ${excluidas.length}`);
  const porMotivo = {};
  for (const e of excluidas) {
    porMotivo[e.motivo] = (porMotivo[e.motivo] || 0) + 1;
  }
  for (const [motivo, n] of Object.entries(porMotivo)) {
    console.log(`  - ${n}x ${motivo}`);
  }
  console.log('');
}

main();
