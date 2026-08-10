/* build-fichas.js — regenera donde-comer-cdu/locales/<slug>/index.html
 * a partir de ficha.json (shell) + cuerpo.html (contenido editorial),
 * usando ficha-template.js como única fuente de la estructura
 * compartida (ver ese archivo para qué se templa y qué se preserva).
 *
 * Dos modos:
 *   node build-fichas.js            → regenera y ESCRIBE los 51 index.html
 *   node build-fichas.js --verify   → regenera en memoria y compara
 *                                      contra el index.html commiteado,
 *                                      sin escribir nada. Sale con
 *                                      código != 0 si hay drift — mismo
 *                                      patrón que el resto de bundles del
 *                                      proyecto (ver ROADMAP.md P0-1/P0-3
 *                                      y scripts/build-*-bundle.js).
 *
 * Se lee/escribe todo como latin1 por el mismo motivo documentado en
 * extraer-fichas.js: preservar bytes exactos, incluido el bug de
 * codificación preexistente que no es responsabilidad de este pipeline
 * arreglar.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { renderFicha } = require("./ficha-template");

const LOCALES_DIR = path.join(__dirname, "..", "locales");

function leerLatin1(p) {
  return fs.readFileSync(p, "latin1");
}

function escribirLatin1(p, contenido) {
  // Guarda de seguridad: Buffer.from(str, "latin1") trunca en silencio
  // cualquier char code point > 255 a su byte bajo (ej. "—" U+2014 se
  // convierte en el byte de control 0x14) — corrompiendo el archivo sin
  // ningún error. Esto ya pasó una vez (guion largo en un comentario
  // estático de ficha-template.js, detectado recién por build --verify
  // contra los originales commiteados). Falla fuerte ANTES de escribir
  // nada, en vez de confiar en que --verify lo pesque después.
  for (let i = 0; i < contenido.length; i++) {
    const code = contenido.codePointAt(i);
    if (code > 255) {
      throw new Error(
        "Carácter fuera de rango latin1 (U+" +
          code.toString(16).toUpperCase() +
          " \"" +
          contenido[i] +
          "\") en posición " +
          i +
          " del HTML generado para " +
          p +
          " — escribiría bytes corruptos. Revisar ficha-template.js/ficha.json."
      );
    }
  }
  fs.writeFileSync(p, Buffer.from(contenido, "latin1"));
}

function main() {
  const verify = process.argv.includes("--verify");

  const slugs = fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  let ok = 0;
  const drift = [];
  const errores = [];

  for (const slug of slugs) {
    const dir = path.join(LOCALES_DIR, slug);
    const fichaJsonPath = path.join(dir, "ficha.json");
    const cuerpoPath = path.join(dir, "cuerpo.html");
    const indexPath = path.join(dir, "index.html");

    if (!fs.existsSync(fichaJsonPath) || !fs.existsSync(cuerpoPath)) {
      // Ficha todavía no migrada al pipeline de datos (o ficha nueva sin
      // terminar) — no es un error del build, se omite.
      continue;
    }

    try {
      const shell = JSON.parse(leerLatin1(fichaJsonPath));
      const cuerpo = leerLatin1(cuerpoPath);
      const html = renderFicha(shell, cuerpo);

      if (verify) {
        const actual = fs.existsSync(indexPath) ? leerLatin1(indexPath) : null;
        if (actual === null) {
          drift.push(slug + ": no existe index.html todavía");
        } else if (actual !== html) {
          // Reportar el primer punto de diferencia para debug rápido.
          let i = 0;
          const len = Math.min(actual.length, html.length);
          while (i < len && actual[i] === html[i]) i++;
          drift.push(
            slug +
              ": difiere en byte " +
              i +
              " (actual=" +
              JSON.stringify(actual.slice(Math.max(0, i - 20), i + 20)) +
              " generado=" +
              JSON.stringify(html.slice(Math.max(0, i - 20), i + 20)) +
              ")"
          );
        } else {
          ok++;
        }
      } else {
        escribirLatin1(indexPath, html);
        ok++;
      }
    } catch (e) {
      errores.push(slug + ": " + e.message);
    }
  }

  console.log(
    (verify ? "Verificadas" : "Regeneradas") + ":",
    ok,
    "/",
    slugs.length
  );

  if (drift.length) {
    console.log("DRIFT (generado != commiteado):");
    drift.forEach((d) => console.log(" -", d));
  }
  if (errores.length) {
    console.log("ERRORES:");
    errores.forEach((e) => console.log(" -", e));
  }
  if (drift.length || errores.length) process.exit(1);
}

main();
