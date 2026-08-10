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
 *
 * [IMPORTANTE 4] (auditoría contenido, 2026-08): mismo criterio para
 * validarPreciosCuerpo (./validar-precios-cuerpo.js) — detecta cuando
 * el side-box "Precios verificados" y la FAQ "¿Cuáles son los precios?"
 * de un mismo cuerpo.html quedaron con montos distintos (ambos son
 * texto plano escrito a mano, sin fuente única — ver ese archivo para
 * por qué no se resolvió templando el contenido en su lugar). También
 * WARNING, no error.
 *
 * [DESEABLE 5] (auditoría copy, 2026-08): footerLine3 dejó de ser un
 * literal fijo en cada ficha.json ("Información verificada y
 * actualizada — Agosto 2026", igual en las 1500 fichas). Con fichas
 * editándose en momentos distintos, ese string se vuelve falso para
 * las fichas viejas apenas pasa un mes. Ahora se CALCULA acá, en cada
 * build, a partir de la fecha real del último commit que tocó
 * cuerpo.html o ficha.json de ese local (mismo criterio que
 * badge-verificado: dato real, no decorativo — ver comentario
 * navBadgesBlockRaw en ficha.json). Si el repo no tiene historial git
 * disponible (ej. checkout shallow, o corriendo fuera de un repo),
 * cae a la fecha de modificación del archivo en disco. El campo
 * footerLine3 que pueda quedar en ficha.json ya no se usa para esto:
 * se sobreescribe siempre acá antes de renderFicha. No se borra del
 * JSON para no romper fichas viejas que todavía no pasaron por este
 * build, pero ya no es la fuente de verdad.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { renderFicha } = require("./ficha-template.js");
const { validarLongitudesMeta } = require("./validar-meta-longitud.js");
const { validarPreciosCuerpo } = require("./validar-precios-cuerpo.js");
const LOCALES_DIR = path.join(__dirname, "..", "locales");
const VERIFY = process.argv.includes("--verify");
const MESES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
function leerLatin1(p) {
  return fs.readFileSync(p, "latin1");
}
// Fecha del último commit que tocó `p` (ISO, solo fecha). Devuelve
// null si el archivo no tiene historial git (sin commitear todavía,
// o repo sin historial disponible) para poder caer al mtime del
// archivo sin fallar el build entero.
function fechaUltimoCommit(p) {
  try {
    const out = execSync(
      'git log -1 --format=%cI -- "' + p.replace(/"/g, '\\"') + '"',
      { cwd: path.dirname(p), stdio: ["ignore", "pipe", "ignore"] }
    )
      .toString()
      .trim();
    return out ? new Date(out) : null;
  } catch (e) {
    return null;
  }
}
// Fecha de "última verificación" de una ficha: la más reciente entre
// el commit de cuerpo.html y el de ficha.json (cualquiera de los dos
// pudo ser el que se actualizó), con fallback al mtime en disco si
// git no está disponible (ej. tarball sin .git, CI con checkout
// shallow). Devuelve el texto ya formado para footerLine3, en
// español y sin depender de la config regional del entorno de build.
function obtenerFooterLine3(cuerpoPath, fichaJsonPath) {
  const fechaCuerpo = fechaUltimoCommit(cuerpoPath);
  const fechaJson = fechaUltimoCommit(fichaJsonPath);
  let fecha = fechaCuerpo && fechaJson
    ? (fechaCuerpo > fechaJson ? fechaCuerpo : fechaJson)
    : fechaCuerpo || fechaJson;
  if (!fecha) {
    const mtimeCuerpo = fs.statSync(cuerpoPath).mtime;
    const mtimeJson = fs.statSync(fichaJsonPath).mtime;
    fecha = mtimeCuerpo > mtimeJson ? mtimeCuerpo : mtimeJson;
  }
  const mes = MESES_ES[fecha.getMonth()];
  const anio = fecha.getFullYear();
  return "Información verificada y actualizada &mdash; " + mes.charAt(0).toUpperCase() + mes.slice(1) + " " + anio;
}
function escribirLatin1(p, contenido) {
  // Guardia de seguridad (auditoría accesibilidad, 2026-08): portada del
  // script huérfano build-fichs.js en la raíz del repo, que la tenía pero
  // no está wireado a ningún script de package.json — este archivo
  // (donde-comer-cdu/js/build-fichas.js) es el que `npm run fichas:build`
  // ejecuta de verdad, y hasta ahora escribía Buffer.from(contenido,
  // "latin1") sin ningún chequeo previo. Buffer.from trunca en silencio
  // cualquier code point > 255 a su byte bajo (ej. "—" U+2014 se
  // convierte en el byte de control 0x14) — esto YA pasó una vez en un
  // comentario estático de ficha-template.js (encontrado recién ahora,
  // reproducido al regenerar), y sin esta guardia se sigue escribiendo
  // en silencio en cada build futuro. Falla fuerte ANTES de escribir
  // nada, en vez de depender de que alguien lo note a ojo en el HTML.
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
  const warningsPrecios = [];
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
      shell.footerLine3 = obtenerFooterLine3(cuerpoPath, fichaJsonPath);
      const generado = renderFicha(shell, cuerpo);
      warningsSeo.push(...validarLongitudesMeta(slug, shell));
      warningsPrecios.push(...validarPreciosCuerpo(slug, cuerpo));
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
  if (warningsPrecios.length) {
    console.log("PRECIOS — " + warningsPrecios.length + " advertencia(s) de desincronización side-box/FAQ:");
    warningsPrecios.forEach((w) => console.log(" - " + w));
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
