/* extraer-fichas.js — migración única, no se corre en cada build.
 *
 * Lee cada donde-comer-cdu/locales/<slug>/index.html actual (51 fichas,
 * cada una un documento estático hecho a mano) y separa dos cosas:
 *
 *   1. "shell" (ficha.json) — los campos que hoy se copian y pegan a mano
 *      en cada una de las 51 fichas: <title>, meta description, og:*,
 *      theme-color, nav-tag, nav-badge, y las dos líneas de <footer>.
 *      Es exactamente la parte mecánica que este generador reemplaza.
 *
 *   2. "cuerpo" (cuerpo.html) — todo el contenido editorial único de la
 *      ficha (Hero, Sobre el lugar, Historia, Catálogo, Percepción,
 *      Highlights, Puntajes, Horarios, Mapa, Reseñas, Presencia digital,
 *      FAQ, Veredicto). Se preserva BYTE A BYTE, sin tocarlo — es prosa
 *      editorial real escrita por el equipo, no datos templables, y
 *      forzarla a JSON no aporta reutilización real (ver
 *      docs/project-context/FICHAS_ARQUITECTURA.md).
 *
 *   3. El bloque JSON-LD completo, el <script id="ficha-data"> y los
 *      <script> finales (rubros-meta.js, ficha.js, y cualquier parche
 *      inline que tuviera la ficha) también se preservan literales, sin
 *      descomponer — ver mismo doc, "Qué queda sin templar y por qué".
 *
 * Se decodifica todo como latin1 (biyectiva byte↔char) en vez de utf-8
 * a propósito: 50 de las 51 fichas NO son UTF-8 real a pesar de declarar
 * <meta charset="UTF-8"> (bug de codificación preexistente, documentado
 * aparte — ver hallazgo en el mismo doc). Usar latin1 para extraer y
 * reescribir garantiza cero cambios de bytes en el contenido: este script
 * migra la ARQUITECTURA, no arregla contenido. El arreglo de codificación
 * es un cambio de contenido real y se hace aparte, con su propio diff
 * revisable ficha por ficha.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const LOCALES_DIR = path.join(__dirname, "..", "locales");

function leerLatin1(p) {
  return fs.readFileSync(p, "latin1");
}

function escribirLatin1(p, contenido) {
  fs.writeFileSync(p, Buffer.from(contenido, "latin1"));
}

function extraerUno(campo, regex, html, obligatorio) {
  const m = html.match(regex);
  if (!m) {
    if (obligatorio) throw new Error("No se encontró " + campo);
    return null;
  }
  return m[1];
}

function extraerFicha(slug) {
  const dir = path.join(LOCALES_DIR, slug);
  const htmlPath = path.join(dir, "index.html");
  const html = leerLatin1(htmlPath);

  const shell = {
    slug,
    title: extraerUno("title", /<title>([^<]*)<\/title>/, html, true),
    metaDescription: extraerUno(
      "meta description",
      /<meta name="description" content="([^"]*)">/,
      html,
      true
    ),
    themeColor: extraerUno(
      "theme-color",
      /<meta name="theme-color" content="([^"]*)">/,
      html,
      true
    ),
    ogTitle: extraerUno(
      "og:title",
      /<meta property="og:title" content="([^"]*)">/,
      html,
      true
    ),
    ogDescription: extraerUno(
      "og:description",
      /<meta property="og:description" content="([^"]*)">/,
      html,
      true
    ),
    // Opcional: donde-comer-cdu/locales/parrilla-la-gruta/index.html no
    // tiene <meta property="og:image"> (dejó una línea en blanco donde
    // antes estaba) — gap preexistente real, no un bug de este script.
    // Se captura el fragmento crudo completo (línea de og:image si existe,
    // o el whitespace que haya quedado si no) para regenerar byte a byte
    // sin adivinar formato.
    ogImageBlockRaw: extraerUno(
      "bloque og:image",
      /<meta property="og:description" content="[^"]*">\n([\s\S]*?)<meta property="og:type"/,
      html,
      true
    ),
    canonical: extraerUno(
      "canonical",
      /<link rel="canonical" href="([^"]*)">/,
      html,
      true
    ),
    navTag: extraerUno("nav-tag", /class="nav-tag">([^<]*)</, html, true),
    // Bloque verbatim entre el cierre de nav-tag y </nav>: cubre el
    // badge-verificado opcional (SVG + texto, condicionado en la fuente a
    // lugares-estado.json → estado_verificacion:"VALIDADO_FINAL", hoy solo
    // en Brode) y el nav-badge opcional ("🥐 Destacado", etc.). Dos fichas
    // (el-arca-resto-bar, papa-luigi) no tienen ningún badge pero sí dejan
    // una línea en blanco ahí — capturar el bloque tal cual, sin
    // reconstruirlo campo por campo, preserva ese detalle sin adivinar.
    navBadgesBlockRaw: extraerUno(
      "bloque de badges del nav",
      /<span class="nav-tag">[^<]*<\/span>\n([\s\S]*?)<\/nav>/,
      html,
      true
    ),
    footerLine2: extraerUno(
      "footer línea 2",
      /<footer class="footer">\s*<a href="\.\.\/\.\.\/"[^>]*>URU SPOT<\/a>\s*<span>([^<]*)<\/span>/,
      html,
      true
    ),
    footerLine3: extraerUno(
      "footer línea 3",
      /<footer class="footer">[\s\S]*?<span>[^<]*<\/span>\s*<span>([^<]*)<\/span>/,
      html,
      true
    ),
  };

  // Bloque JSON-LD completo (preservado literal, sin descomponer — ver
  // cabecera del archivo).
  const jsonLdMatch = html.match(
    /<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/
  );
  if (!jsonLdMatch) throw new Error(slug + ": no se encontró JSON-LD");
  shell.jsonLdRaw = jsonLdMatch[1];

  // Fragmento de cuerpo: desde <!-- HERO --> hasta justo antes de
  // <footer class="footer">.
  const heroIdx = html.indexOf("<!-- HERO -->");
  const footerIdx = html.indexOf('<footer class="footer">');
  if (heroIdx === -1 || footerIdx === -1) {
    throw new Error(slug + ": no se encontraron los marcadores hero/footer");
  }
  const cuerpo = html.slice(heroIdx, footerIdx).replace(/\s+$/, "") + "\n";

  // Cola final: desde <footer> hasta </html>, MENOS las dos líneas de
  // footer que ya son campos de shell — se preserva el resto (ficha-data,
  // scripts, cualquier parche inline) literal.
  const colaCompleta = html.slice(footerIdx);
  const footerCloseIdx = colaCompleta.indexOf("</footer>");
  // Se preserva el whitespace inicial TAL CUAL viene del original (algunas
  // fichas tienen una línea en blanco entre </footer> y el siguiente
  // <script>, Brode no) — no se normaliza, para regenerar byte a byte.
  shell.colaScriptsRaw = colaCompleta.slice(footerCloseIdx + "</footer>".length);

  return { shell, cuerpo };
}

function main() {
  const slugs = fs
    .readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  let ok = 0;
  const errores = [];

  for (const slug of slugs) {
    try {
      const { shell, cuerpo } = extraerFicha(slug);
      const dir = path.join(LOCALES_DIR, slug);
      // IMPORTANTE: el JSON se escribe con escribirLatin1, no fs.writeFileSync(...,"utf8").
      // Los strings JS de "shell" vienen de decodificar el HTML original como
      // latin1 (biyectivo byte↔char). Si acá se escribiera como "utf8", Node
      // reinterpretaría esos code points 128-255 como si fueran texto real y
      // los re-codificaría a secuencias UTF-8 multibyte — cambiando los bytes
      // del contenido (justo lo que este script NO debe hacer). Escribir con
      // latin1 revierte la decodificación 1:1 y dpreserva los bytes originales
      // exactos, buggeados o no.
      escribirLatin1(path.join(dir, "ficha.json"), JSON.stringify(shell, null, 2));
      escribirLatin1(path.join(dir, "cuerpo.html"), cuerpo);
      ok++;
    } catch (e) {
      errores.push(slug + ": " + e.message);
    }
  }

  console.log("Extraídas:", ok, "/", slugs.length);
  if (errores.length) {
    console.log("ERRORES:");
    errores.forEach((e) => console.log(" -", e));
    process.exit(1);
  }
}

main();
