/* agregar-noscript-estado.js
 * ─────────────────────────────────────────────────────────────────────
 * [DESEABLE 1] (auditoría accesibilidad, 2026-08): el "Estado actual"
 * (#statusValue) arranca como un placeholder y depende 100% de
 * ficha.js para poblarse con "Abierto ahora" / "Cerrado" — si JS falla
 * o está deshabilitado, el usuario ve el placeholder en vez de un
 * horario. Esto agrega un <noscript> justo después de #statusSub en
 * cada cuerpo.html: cuando JS está deshabilitado, oculta el placeholder
 * roto (vía un <style> inline, técnica estándar — nunca se aplica si JS
 * SÍ corre, porque el navegador ignora el contenido de <noscript>) y
 * muestra un mensaje real con un link a la sección de horarios que ya
 * existe más abajo en la misma página.
 *
 * Corre UNA vez sobre el estado actual del repo (no es parte del build
 * recurrente como validar-precios-cuerpo.js o validar-meta-longitud.js
 * — esto edita cuerpo.html directamente, es contenido, no metadata
 * derivada). Es idempotente: si ya insertó el noscript en una ficha, no
 * la vuelve a tocar en una segunda corrida.
 *
 * Uso: node agregar-noscript-estado.js [--dry-run]
 * ───────────────────────────────────────────────────────────────────── */
"use strict";
const fs = require("fs");
const path = require("path");

const LOCALES_DIR = path.join(__dirname, "..", "locales");
const DRY_RUN = process.argv.includes("--dry-run");

// Localiza el bloque #statusValue + #statusSub sin depender del
// contenido del placeholder (evita el mismo problema de encoding
// latin1/UTF-8 documentado en validar-precios-cuerpo.js: un carácter
// como "—" literal en esta regex no matchearía contra el texto leído
// como latin1).
const RE_STATUS_BLOQUE =
  /<span class="info-cell-value" id="statusValue">[^<]*<\/span>(\s*)<span class="info-cell-sub" id="statusSub" aria-live="polite"><\/span>/;

const NOSCRIPT_CON_ANCLA =
  '<noscript><style>#statusValue,#statusSub{display:none}</style>' +
  '<span class="info-cell-value">Ver horario</span>' +
  '<span class="info-cell-sub"><a href="#schedule-heading">Horarios de atención más abajo</a></span>' +
  "</noscript>";

const NOSCRIPT_SIN_ANCLA =
  '<noscript><style>#statusValue,#statusSub{display:none}</style>' +
  '<span class="info-cell-value">Consultar</span>' +
  '<span class="info-cell-sub">Horario disponible por WhatsApp o teléfono</span>' +
  "</noscript>";

function leerLatin1(p) {
  return fs.readFileSync(p, "latin1");
}
function escribirLatin1(p, contenido) {
  for (let i = 0; i < contenido.length; i++) {
    if (contenido.codePointAt(i) > 255) {
      throw new Error(
        "Carácter fuera de rango latin1 en " + p + ", posición " + i
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

  let insertadas = 0;
  let yaTenian = 0;
  const sinMatch = [];

  for (const slug of slugs) {
    const cuerpoPath = path.join(LOCALES_DIR, slug, "cuerpo.html");
    if (!fs.existsSync(cuerpoPath)) continue;

    const cuerpo = leerLatin1(cuerpoPath);

    if (cuerpo.includes('id="statusValue"') && cuerpo.includes("noscript><style>#statusValue")) {
      yaTenian++;
      continue;
    }

    const m = cuerpo.match(RE_STATUS_BLOQUE);
    if (!m) {
      sinMatch.push(slug);
      continue;
    }

    const tieneAncla = cuerpo.includes('id="schedule-heading"');
    const noscript = tieneAncla ? NOSCRIPT_CON_ANCLA : NOSCRIPT_SIN_ANCLA;
    const reemplazo = m[0] + m[1] + noscript;
    const nuevoContenido = cuerpo.slice(0, m.index) + reemplazo + cuerpo.slice(m.index + m[0].length);

    if (!DRY_RUN) {
      escribirLatin1(cuerpoPath, nuevoContenido);
    }
    insertadas++;
    console.log(
      (DRY_RUN ? "[dry-run] " : "") + slug + ": noscript insertado (" +
        (tieneAncla ? "con ancla a #schedule-heading" : "SIN ancla — fallback genérico") + ")"
    );
  }

  console.log("\nInsertadas:", insertadas, "| Ya tenían:", yaTenian, "| Sin match:", sinMatch.length);
  if (sinMatch.length) {
    console.log("Fichas sin el bloque #statusValue/#statusSub esperado (revisar a mano):");
    sinMatch.forEach((s) => console.log(" - " + s));
  }
}

main();
