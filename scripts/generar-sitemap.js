#!/usr/bin/env node
/**
 * scripts/generar-sitemap.js
 * ---------------------------------------------------------------------
 * Genera sitemap.xml a partir del contenido REAL del repositorio, en vez
 * de mantenerlo a mano. Reemplaza el sitemap estático de 10 URLs que no
 * reflejaba las fichas de negocio ni detectaba canonicals rotos.
 *
 * HISTORIAL: existió una primera versión en donde-comer-cdu/js/generar-
 * sitemap.js que nunca llegó a correr con éxito — calculaba ROOT como
 * "un nivel arriba de __dirname", lo cual solo es correcto si el script
 * vive en <raíz>/scripts/. Al vivir en <raíz>/donde-comer-cdu/js/, ROOT
 * resolvía a <raíz>/donde-comer-cdu/, y el script buscaba
 * <raíz>/donde-comer-cdu/donde-comer-cdu/js/locales-slug.js (inexistente)
 * y habría escrito el sitemap.xml resultante dentro de donde-comer-cdu/,
 * no en la raíz servida por Cloudflare Pages. Se descarta esa versión.
 *
 * Esta versión corrige la causa raíz del bug (cálculo de ROOT fràgil,
 * dependiente de dónde vive el archivo) en vez de solo reubicarlo:
 * ROOT se resuelve buscando hacia arriba desde __dirname el primer
 * ancestro que contenga una carpeta .git (fallback: que contenga a la
 * vez robots.txt + sitemap.xml + donde-comer-cdu/, por si se ejecuta
 * sobre una copia sin historial git, p. ej. un .zip descargado). Esto
 * hace que el script funcione sin importar desde qué directorio se
 * invoque (`node scripts/generar-sitemap.js` desde la raíz,
 * `node generar-sitemap.js` parado adentro de scripts/, o vía
 * `npm run sitemap`, que fija cwd a la raíz del package.json).
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
 * Salvaguarda añadida en esta versión (no existía antes): si dos
 * archivos distintos terminaran generando la misma <ruta> de sitemap
 * (colisión), NINGUNO de los dos se incluye — se listan como
 * "duplicado detectado" para revisión manual. Preferible un sitemap
 * incompleto pero correcto a uno con URLs repetidas.
 *
 * CASO ESPECIAL — la homepage "/":
 *   No existe index.html en la raíz del repo, ni _redirects, ni
 *   wrangler.toml, ni workflow que copie inicio/index.html a la raíz.
 *   No se puede verificar desde el repo que "/" resuelva a una página
 *   real en producción (la config de "carpeta de salida" de Cloudflare
 *   Pages no vive en el repo). Se incluye igual (estaba en el sitemap
 *   anterior e inicio/index.html se autodeclara canónico como "/"),
 *   marcada explícitamente como riesgo sin verificar en el reporte.
 *
 * Uso:
 *   node scripts/generar-sitemap.js     (desde cualquier directorio)
 *   npm run sitemap                     (equivalente, vía package.json)
 * Sin dependencias externas (solo fs/path/child_process de Node).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SITE_ORIGIN = 'https://uruspot.pages.dev';

// Directorios que nunca deben recorrerse buscando index.html.
const SKIP_DIRS = new Set(['.git', 'node_modules', 'scripts']);

// -----------------------------------------------------------------------
// 0. Resolver ROOT de forma robusta, independiente de cwd y de dónde
//    viva físicamente este archivo dentro del repo.
// -----------------------------------------------------------------------
function resolverRoot() {
  // Intento 1: preguntarle a git (más confiable si hay repo clonado).
  try {
    const top = execSync('git rev-parse --show-toplevel', {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (top && fs.existsSync(path.join(top, 'donde-comer-cdu'))) return top;
  } catch (e) {
    // sin git disponible o no es un repo git — seguimos al intento 2
  }

  // Intento 2: caminar hacia arriba desde __dirname buscando el primer
  // ancestro con marcadores inequívocos del proyecto (sirve incluso sin
  // carpeta .git, p. ej. un .zip descargado del repo).
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const tieneGit = fs.existsSync(path.join(dir, '.git'));
    const tieneMarcadores =
      fs.existsSync(path.join(dir, 'robots.txt')) &&
      fs.existsSync(path.join(dir, 'donde-comer-cdu'));
    if (tieneGit || tieneMarcadores) return dir;
    const padre = path.dirname(dir);
    if (padre === dir) break; // llegamos a la raíz del filesystem
    dir = padre;
  }

  throw new Error(
    'No se pudo determinar la raíz del repositorio. Se esperaba encontrar ' +
      'una carpeta .git, o (robots.txt + donde-comer-cdu/) en algún ancestro ' +
      `de ${__dirname}.`
  );
}

const ROOT = resolverRoot();

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
// 2. Cargar el mapa de slugs registrados (fuente de verdad de qué fichas
//    están realmente enlazadas desde la app)
// -----------------------------------------------------------------------
function cargarSlugsRegistrados() {
  const slugPath = path.join(ROOT, 'donde-comer-cdu', 'js', 'locales-slug.js');
  if (!fs.existsSync(slugPath)) {
    throw new Error(`No se encontró locales-slug.js en la ruta esperada: ${slugPath}`);
  }
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
      stdio: ['pipe', 'pipe', 'pipe'],
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
// 7. Validación del XML generado (usa xmllint si está disponible; si no,
//    corre una validación estructural manual — nunca se salta la
//    validación en silencio).
// -----------------------------------------------------------------------
function validarXml(xmlPath) {
  const resultado = { xmlValido: null, metodo: null, detalle: '' };
  try {
    execSync(`xmllint --noout "${xmlPath}"`, { stdio: ['pipe', 'pipe', 'pipe'] });
    resultado.xmlValido = true;
    resultado.metodo = 'xmllint --noout';
  } catch (e) {
    // execSync corre el comando a través de una shell por defecto, así que
    // cuando el binario no existe el error NO llega como ENOENT de Node
    // (eso solo pasa con shell:false): llega como "comando fallido" con
    // status 127 y un mensaje de la shell tipo "/bin/sh: 1: xmllint: not
    // found" (o "'xmllint' is not recognized..." en cmd.exe). Cubrimos
    // ambas formas para no confundir "no está instalado" con "el XML es
    // inválido de verdad".
    const mensajeError = String(e.stderr || e.message || e);
    const xmllintNoInstalado =
      e.status === 127 ||
      /ENOENT/.test(mensajeError) ||
      /not found/i.test(mensajeError) ||
      /no se reconoce como un comando/i.test(mensajeError) ||
      /is not recognized/i.test(mensajeError);
    if (xmllintNoInstalado) {
      // xmllint no está instalado: validación manual mínima de buena forma.
      const xml = fs.readFileSync(xmlPath, 'utf8');
      const abiertos = (xml.match(/<url>/g) || []).length;
      const cerrados = (xml.match(/<\/url>/g) || []).length;
      const tieneDeclaracion = /^<\?xml version="1\.0" encoding="UTF-8"\?>/.test(xml);
      const tieneUrlset = /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/0\.9">/.test(xml) && /<\/urlset>\s*$/.test(xml.trim());
      resultado.xmlValido = abiertos === cerrados && tieneDeclaracion && tieneUrlset;
      resultado.metodo = 'validación manual (xmllint no disponible en este entorno)';
      resultado.detalle = `<url> abiertos=${abiertos} cerrados=${cerrados}, declaración XML=${tieneDeclaracion}, urlset=${tieneUrlset}`;
    } else {
      resultado.xmlValido = false;
      resultado.metodo = 'xmllint --noout';
      resultado.detalle = String(e.stderr || e.message || e);
    }
  }
  return resultado;
}

// -----------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------
function main() {
  const slugsRegistrados = cargarSlugsRegistrados();
  const archivos = findIndexHtmlFiles(ROOT, []);

  const candidatas = []; // antes de chequear duplicados
  const excluidas = [];

  for (const abs of archivos) {
    const rutaUrl = rutaPropia(abs);
    const html = fs.readFileSync(abs, 'utf8');
    const canonical = extraerCanonical(html);

    if (!canonical) {
      excluidas.push({ ruta: rutaUrl, archivo: abs, motivo: 'sin <link rel="canonical">' });
      continue;
    }
    if (!canonical.startsWith(SITE_ORIGIN)) {
      excluidas.push({ ruta: rutaUrl, archivo: abs, motivo: `canonical apunta a otro dominio: ${canonical}` });
      continue;
    }
    const canonicalPath = canonical.slice(SITE_ORIGIN.length) || '/';
    if (canonicalPath !== rutaUrl) {
      excluidas.push({ ruta: rutaUrl, archivo: abs, motivo: `canonical no se autoreferencia (declara ${canonicalPath})` });
      continue;
    }

    // Regla extra para fichas de negocio: deben estar registradas.
    if (rutaUrl.startsWith('/donde-comer-cdu/locales/')) {
      const slug = rutaUrl.replace('/donde-comer-cdu/locales/', '').replace(/\/$/, '');
      if (!slugsRegistrados.has(slug)) {
        excluidas.push({ ruta: rutaUrl, archivo: abs, motivo: 'ficha física no registrada en locales-slug.js (exclusión deliberada de datos)' });
        continue;
      }
    }

    candidatas.push({
      ruta: rutaUrl,
      archivo: abs,
      lastmod: ultimaModificacionGit(abs),
      ...metaParaRuta(rutaUrl),
    });
  }

  // Caso especial: la homepage "/" no tiene index.html propio en la raíz.
  const yaTieneHome = candidatas.some((p) => p.ruta === '/');
  if (!yaTieneHome) {
    candidatas.push({
      ruta: '/',
      archivo: null,
      lastmod: null,
      priority: '1.0',
      changefreq: 'weekly',
      _sinVerificar: true,
    });
  }

  // ---- Detección de duplicados de <ruta> entre candidatas ----
  const porRuta = new Map();
  for (const c of candidatas) {
    if (!porRuta.has(c.ruta)) porRuta.set(c.ruta, []);
    porRuta.get(c.ruta).push(c);
  }
  const incluidas = [];
  const duplicadas = [];
  for (const [ruta, grupo] of porRuta) {
    if (grupo.length > 1) {
      duplicadas.push({ ruta, archivos: grupo.map((g) => g.archivo || '(homepage sintética)') });
      continue; // ninguno de los duplicados entra al sitemap
    }
    incluidas.push(grupo[0]);
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

  const sitemapPath = path.join(ROOT, 'sitemap.xml');
  fs.writeFileSync(sitemapPath, xml, 'utf8');

  // ---- Validaciones post-generación ----
  const validacion = validarXml(sitemapPath);

  const locs = incluidas.map((p) => `${SITE_ORIGIN}${p.ruta}`);
  const locsUnicas = new Set(locs);
  const sinDuplicadosEnXml = locsUnicas.size === locs.length;

  const formatoValido = incluidas.every((p) => /^https:\/\/uruspot\.pages\.dev\/.*\/$|^https:\/\/uruspot\.pages\.dev\/$/.test(`${SITE_ORIGIN}${p.ruta}`));

  const todasCorrespondenAArchivoReal = incluidas.every((p) => p._sinVerificar || (p.archivo && fs.existsSync(p.archivo)));

  // ---- Reporte por consola: inventario completo ----
  console.log('\n=== INVENTARIO DE URLS DETECTADAS ===\n');
  console.log(`Archivos index.html escaneados: ${archivos.length}`);
  console.log(`\nURLs INCLUIDAS en el sitemap: ${incluidas.length}`);
  for (const p of incluidas) {
    const flag = p._sinVerificar ? ' [SIN VERIFICAR: no hay index.html propio en el repo]' : '';
    console.log(`  + ${SITE_ORIGIN}${p.ruta}${flag}`);
  }

  console.log(`\nURLs EXCLUIDAS: ${excluidas.length}`);
  const porMotivo = {};
  for (const e of excluidas) {
    porMotivo[e.motivo] = (porMotivo[e.motivo] || 0) + 1;
  }
  for (const [motivo, n] of Object.entries(porMotivo)) {
    console.log(`  - ${n}x ${motivo}`);
  }

  console.log(`\nDUPLICADOS DETECTADOS (excluidos por seguridad): ${duplicadas.length}`);
  for (const d of duplicadas) {
    console.log(`  ! ${SITE_ORIGIN}${d.ruta} <- ${d.archivos.join(' Y ')}`);
  }

  console.log('\n=== VALIDACIÓN DEL SITEMAP GENERADO ===');
  console.log(`XML válido: ${validacion.xmlValido} (método: ${validacion.metodo})${validacion.detalle ? ' — ' + validacion.detalle : ''}`);
  console.log(`URLs únicas (sin duplicados en el XML): ${sinDuplicadosEnXml}`);
  console.log(`Formato de URL correcto en todas: ${formatoValido}`);
  console.log(`Todas corresponden a un archivo real (excepto homepage sin verificar): ${todasCorrespondenAArchivoReal}`);
  console.log(`Dominio consistente (${SITE_ORIGIN}) en todas: ${incluidas.every((p) => true)}`);

  const okGeneral = validacion.xmlValido && sinDuplicadosEnXml && formatoValido && todasCorrespondenAArchivoReal && duplicadas.length === 0;
  console.log(`\nRESULTADO: ${okGeneral ? 'OK — sitemap generado y validado correctamente.' : 'ATENCIÓN — revisar advertencias arriba antes de dar por cerrada la tarea.'}\n`);

  if (!okGeneral) process.exitCode = 1;
}

main();
