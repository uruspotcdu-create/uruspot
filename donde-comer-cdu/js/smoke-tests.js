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
      `SMOKE TEST FALLÓ: ${faltantes.length} referencia(s) rota(s):`
    );
    faltantes.forEach((f) => console.error(`  - ${f.ruta}`));
    process.exit(1);
  }

  console.log('');
  console.log(`SMOKE TEST OK — ${refs.length}/${refs.length} assets locales existen.`);
  process.exit(0);
}

correr();
