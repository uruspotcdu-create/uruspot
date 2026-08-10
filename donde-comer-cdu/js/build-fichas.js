/* build-fichas.js — regenera los index.html de donde-comer-cdu/locales/
 * a partir de ficha.json (shell) + cuerpo.html (contenido) + la
 * estructura compartida de ficha-template.js.
 *
 * Modo build (default):  escribe cada locales/<slug>/index.html.
 * Modo --verify:         compara en memoria contra lo commiteado, no
 *                         escribe nada, sale con código != 0 si hay
 *                         drift (mismo patrón que build:bundles, ver
 *                         ROADMAP.md P0-3). Pensado para correr en
 *                         `npm test` y detectar ediciones manuales de
 *                         un index.html que se desincronizaron de su
 *                         ficha.json/cuerpo.html.
 *
 * Todo se lee/escribe como latin1 a propósito, igual que
 * extraer-fichas.js: preserva bytes exactos, incluidos los de fichas
 * con codificación preexistente no-UTF-8 real. Ver
 * docs/project-context/FICHAS_ARQUITECTURA.md.
 *
 * [IMPORTANTE 3] (auditoría SEO, 2026-08): se suma validarLongitudesMeta
 * (./validar-meta-longitud.js) al mismo loop que ya lee cada ficha.json,
 * para detectar title/metaDescription por encima de los límites que
 * Google trunca en SERP (60/160 caracteres) — antes esto no se
 * chequeaba en ningún lado del pipeline, así que el problema podía
 * repetirse en las 1500 fichas sin que nadie lo notara. Es un WARNING,
 * no un error: no cambia el código de salida de fichas:build ni de
 * fichas:verify (que siguen dependiendo solo de errores/drift reales),
 * solo hace visible el problema en cada corrida. Ver ese archivo para
 * el detalle de por qué se decidió así.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { renderFicha } = require("./ficha-template.js");
const { validarLongitudesMeta } = require("./validar-meta-longitud.js");
const LOCALES_DIR = path.join(__dirname, "..", "locales");
const VERIFY = process.argv.includes("--verify");
function leerLatin1(p) {
  return fs.readFileSync(p, "latin1");
}
function escribirLatin1(p, contenido) {
  fs.writeFileSync(p, Buffer.from(contenido, "latin1"));
}
function main() {
  const slugs = fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  let procesadas = 0;
  let cambiadas = 0;
  const drift = [];
  const errores = [];
  const warningsSeo = [];
  for (const slug of slugs) {
    const dir = path.join(LOCALES_DIR, slug);
    const fichaJsonPath = path.join(dir, "ficha.json");
    const cuerpoPath = path.join(dir, "cuerpo.html");
    const indexPath = path.join(dir, "index.html");
    if (!fs.existsSync(fichaJsonPath) || !fs.existsSync(cuerpoPath)) {
      // Directorio en locales/ que no es una ficha migrada (todavía).
      continue;
    }
    try {
      const shell = JSON.parse(leerLatin1(fichaJsonPath));
      const cuerpo = leerLatin1(cuerpoPath);
      const generado = renderFicha(shell, cuerpo);
      warningsSeo.push(...validarLongitudesMeta(slug, shell));
      if (VERIFY) {
        const actual = fs.existsSync(indexPath) ? leerLatin1(indexPath) : null;
        if (actual !== generado) {
          drift.push(slug);
        }
      } else {
        const actual = fs.existsSync(indexPath) ? leerLatin1(indexPath) : null;
        if (actual !== generado) {
          escribirLatin1(indexPath, generado);
          cambiadas++;
        }
      }
      procesadas++;
    } catch (e) {
      errores.push(slug + ": " + e.message);
    }
  }
  if (warningsSeo.length) {
    console.log("SEO — " + warningsSeo.length + " advertencia(s) de longitud (title/metaDescription):");
    warningsSeo.forEach((w) => console.log(" - " + w));
  }
  if (VERIFY) {
    console.log("fichas:verify — " + procesadas + " fichas chequeadas.");
    if (drift.length) {
      console.log("DRIFT detectado (" + drift.length + "):");
      drift.forEach((s) => console.log(" - " + s));
    }
    if (errores.length) {
      console.log("ERRORES:");
      errores.forEach((e) => console.log(" - " + e));
    }
    if (drift.length || errores.length) process.exit(1);
    console.log("OK — todas las fichas coinciden con su ficha.json/cuerpo.html.");
  } else {
    console.log(
      "fichas:build — " + procesadas + " fichas procesadas, " + cambiadas + " regeneradas."
    );
    if (errores.length) {
      console.log("ERRORES:");
      errores.forEach((e) => console.log(" - " + e));
      process.exit(1);
    }
  }
}
main();
