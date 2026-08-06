// js/smoke-test.js — URU SPOT
// ---------------------------------------------------------------------
// FASE 0 del roadmap de mejora (2026-07-26): red de seguridad mínima,
// sin dependencias externas, corrible con `node js/smoke-test.js`.
//
// Qué verifica: que cada asset LOCAL referenciado desde index.html
// (`<script src="js/...">`, `<link href="css/...">`, tanto stylesheet
// como preload) exista físicamente en disco. Esto es exactamente lo
// que habría atrapado, el día que se rompió, la referencia rota a
// `js/lazy-css-editorial.js` (confirmada y corregida en la Fase 1 de
// este mismo roadmap) — un recurso referenciado en el HTML que no
// existe se traduce en un 404 silencioso en cada carga de página.
//
// Qué NO verifica (fuera de alcance deliberado de este test, ver
// contract-test.js para la Fase 2 y motor-test.js para la lógica de
// negocio): contenido de los archivos, ejecución real en navegador,
// contrato de ids DOM↔JS.
//
// SEGUNDO CHEQUEO (Plan Maestro de Modularización, Fase 4, hallazgo de
// recuperación en render-engine.js, 2026-08-06): además de las
// referencias de index.html, este test ahora recorre TODAS las
// declaraciones ES import relativas de cada módulo bajo js/ y verifica
// que el archivo importado exista en disco. Esto es exactamente lo que
// habría atrapado, en el momento del commit y no días después, el
// import roto de `render-engine.js` que quedó apuntando a un módulo
// inexistente — invisible en producción solo porque el sitio real
// corría un bundle viejo (app.min.js) en vez de la fuente. Sin este
// chequeo, un import roto en cualquier módulo ES (no solo
// render-engine.js) puede volver a colarse sin que ninguna suite lo
// note hasta que alguien lo pise manualmente en el navegador.
//
// Sale con código 0 si todo existe, 1 si falta algo.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname.replace(/[/\\]js$/, '');
const HTML_PATH = path.join(ROOT, 'index.html');

function leerHtml() {
  if (!fs.existsSync(HTML_PATH)) {
    console.error(`ERROR: no se encontró ${HTML_PATH}`);
    process.exit(1);
  }
  const crudo = fs.readFileSync(HTML_PATH, 'utf8');
  // Crítico: este HTML tiene documentación arquitectónica embebida en
  // comentarios <!-- --> que a veces CITA literalmente etiquetas
  // <script>/<link> como texto de ejemplo (ver §16 de la propia
  // documentación). Si no se despojan los comentarios antes de
  // escanear, ese texto se confunde con una etiqueta real y produce
  // falsos positivos/negativos. Se reemplaza cada comentario por
  // espacios (no se borra) para no desplazar los offsets de línea.
  return crudo.replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length));
}

// Extrae src="js/..." de <script> y href="css/..." de <link>, sin
// parser de HTML completo a propósito (cero dependencias) — suficiente
// porque el patrón de estos atributos en este repo es consistente.
function extraerReferenciasLocales(html) {
  const refs = [];

  const scriptRe = /<script[^>]*\ssrc=["']([^"']+\.js)["'][^>]*>/g;
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    refs.push({ tipo: 'script', ruta: m[1] });
  }

  const linkRe = /<link[^>]*\shref=["']([^"']+\.css)["'][^>]*>/g;
  while ((m = linkRe.exec(html)) !== null) {
    refs.push({ tipo: 'link', ruta: m[1] });
  }

  // Solo assets locales relativos (no http(s)://, no absolutos a otra
  // app raíz distinta de este módulo) — filtramos por prefijo esperado.
  return refs.filter(
    (r) => r.ruta.startsWith('js/') || r.ruta.startsWith('css/')
  );
}

// Recorre js/**/*.js (no node_modules, no locales/) y devuelve, por
// cada archivo, los imports relativos (`./x.js` o `../x.js`) que
// declara. Regex simple a propósito (mismo criterio que
// extraerReferenciasLocales): cubre `import X from '...'`,
// `import { X } from '...'` y `import { X } from "..."`, que es el
// único estilo de import usado en este repo (ver render-engine.js,
// dom-painter.js, app.js).
function listarArchivosJs(dir, acc) {
  acc = acc || [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entrada) => {
    if (entrada.name === 'node_modules' || entrada.name === 'locales') return;
    const abs = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      listarArchivosJs(abs, acc);
    } else if (entrada.isFile() && entrada.name.endsWith('.js')) {
      acc.push(abs);
    }
  });
  return acc;
}

function extraerImportsRelativos(archivoAbs) {
  const crudo = fs.readFileSync(archivoAbs, 'utf8');
  // Mismo criterio que leerHtml(): despojar comentarios de línea (//)
  // y de bloque (/* */) antes de escanear, para que este propio
  // archivo (que documenta el patrón de import en sus comentarios) no
  // se detecte a sí mismo como un import roto. No toca strings, así
  // que un `//` o `/*` dentro de una URL string es un riesgo teórico
  // aceptado (no ocurre en los imports relativos de este repo).
  const contenido = crudo
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/\/\/.*$/gm, (m) => ' '.repeat(m.length));
  const imports = [];
  const importRe = /\bimport\s+(?:[^'"]*?\s+from\s+)?["'](\.\.?\/[^"']+)["']/g;
  let m;
  while ((m = importRe.exec(contenido)) !== null) {
    imports.push(m[1]);
  }
  return imports;
}

function verificarImportsDeModulos() {
  const jsDir = path.join(ROOT, 'js');
  const archivos = listarArchivosJs(jsDir);
  const rotos = [];
  let totalImports = 0;

  archivos.forEach((archivoAbs) => {
    const imports = extraerImportsRelativos(archivoAbs);
    imports.forEach((importado) => {
      totalImports += 1;
      const destinoAbs = path.resolve(path.dirname(archivoAbs), importado);
      if (!fs.existsSync(destinoAbs)) {
        rotos.push({
          desde: path.relative(ROOT, archivoAbs),
          hacia: importado
        });
      }
    });
  });

  return { totalArchivos: archivos.length, totalImports, rotos };
}

function correr() {
  const html = leerHtml();
  const refs = extraerReferenciasLocales(html);

  if (refs.length === 0) {
    console.error(
      'ERROR: no se encontró ninguna referencia local a js/ o css/ en index.html — ' +
        'esto probablemente indica un problema en el propio regex del smoke test, ' +
        'no en el repositorio (revisar si cambió el formato de las etiquetas).'
    );
    process.exit(1);
  }

  const faltantes = [];
  refs.forEach((ref) => {
    const abs = path.join(ROOT, ref.ruta);
    if (!fs.existsSync(abs)) {
      faltantes.push(ref);
    }
  });

  console.log(`Referencias locales encontradas en index.html: ${refs.length}`);
  refs.forEach((ref) => {
    const abs = path.join(ROOT, ref.ruta);
    const ok = fs.existsSync(abs);
    console.log(`${ok ? '✓' : '✗'} [${ref.tipo}] ${ref.ruta}`);
  });

  if (faltantes.length > 0) {
    console.error('');
    console.error(
      `SMOKE TEST FALLÓ: ${faltantes.length} referencia(s) rota(s) en index.html:`
    );
    faltantes.forEach((f) => console.error(`  - ${f.ruta}`));
    process.exit(1);
  }

  console.log('');
  console.log(`✓ index.html: ${refs.length}/${refs.length} assets locales existen.`);
  console.log('');

  const resultadoImports = verificarImportsDeModulos();
  console.log(
    `Imports ES relativos encontrados en ${resultadoImports.totalArchivos} archivo(s) bajo js/: ` +
      `${resultadoImports.totalImports}`
  );

  if (resultadoImports.rotos.length > 0) {
    console.error('');
    console.error(
      `SMOKE TEST FALLÓ: ${resultadoImports.rotos.length} import(s) ES roto(s):`
    );
    resultadoImports.rotos.forEach((r) => {
      console.error(`  - ${r.desde}  →  import "${r.hacia}"  (no existe)`);
    });
    process.exit(1);
  }

  console.log(`✓ imports ES: ${resultadoImports.totalImports}/${resultadoImports.totalImports} resuelven a un archivo real.`);
  console.log('');
  console.log('SMOKE TEST OK.');
  process.exit(0);
}

correr();
