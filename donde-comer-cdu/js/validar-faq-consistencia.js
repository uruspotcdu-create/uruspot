/* validar-faq-consistencia.js
 * ─────────────────────────────────────────────────────────────────────
 * [IMPRESCINDIBLE-MIGRACION] (auditoría hostil pre-migración, 2026-08):
 * shell.faqItems (ficha.json) es la fuente del bloque JSON-LD "FAQPage"
 * (ver ficha-jsonld.js) — pero el FAQ que el usuario realmente VE está
 * escrito a mano, por separado, en la sección "Preguntas frecuentes" de
 * cuerpo.html. Son dos copias del mismo contenido sin una única fuente,
 * exactamente el mismo patrón de riesgo que ya se detectó y resolvió
 * para precios (ver validar-precios-cuerpo.js) — pero éste no estaba
 * cubierto todavía. Hoy (auditoría de Brode) las 2 copias coinciden
 * 8/8, pero nada lo garantiza hacia adelante: si mañana se actualiza
 * una respuesta en ficha.json y no en cuerpo.html (o al revés), el
 * FAQPage que Google indexa deja de coincidir con lo que el usuario ve.
 * Google penaliza explícitamente ese desvío (structured-data spam
 * policy: "contenido de FAQ/HowTo structured data que no es visible en
 * la página") — puede costar la rich result de las 1500 fichas nuevas
 * sin que nadie lo note hasta que ya pasó.
 *
 * Mismo criterio que validar-precios-cuerpo.js: WARNING no bloqueante,
 * no toca cómo se escribe el contenido (prosa a mano sigue siendo
 * prosa a mano), solo hace el desvío VISIBLE en cada build.
 *
 * Nota de encoding: cuerpo.html se lee como latin1 en todo el pipeline
 * (ver build-fichas.js) para preservar bytes exactos, lo que parte cada
 * carácter acentuado UTF-8 en 2 code points sueltos. ficha.json se
 * parsea normal (UTF-8 real). Por eso todo texto extraído de cuerpo.html
 * acá se reconvierte con Buffer.from(txt, "latin1").toString("utf8")
 * antes de comparar contra shell.faqItems — sin este paso, CUALQUIER
 * pregunta con tilde daría falso positivo de desincronización.
 * ───────────────────────────────────────────────────────────────────── */
"use strict";

// Sección visible de FAQ: desde el heading con id="faq-heading" hasta
// el </section> que la cierra (no-greedy, misma lógica de acotar el
// bloque que usa validar-precios-cuerpo.js con el side-box).
const RE_FAQ_SECCION = /id="faq-heading"[\s\S]*?<\/section>/;

// Cada pregunta/respuesta visible dentro de esa sección:
// <h3 class="about-title about-subtitle">PREGUNTA</h3>
// <p class="about-body">RESPUESTA (puede traer <strong>/<a> internos)</p>
const RE_PREGUNTA_RESPUESTA =
  /<h3 class="about-title about-subtitle">([\s\S]*?)<\/h3>\s*<p class="about-body">([\s\S]*?)<\/p>/g;

function latin1AUtf8(txt) {
  return Buffer.from(txt, "latin1").toString("utf8");
}

// Quita tags internos (<strong>, <a href=...>) y colapsa espacios, para
// comparar texto contra shell.faqItems[i].answer (que es texto plano
// sin marcado). No decodifica entities HTML: cuerpo.html de las fichas
// actuales no las usa dentro del FAQ (confirmado en Brode); si alguna
// ficha futura las usara, esta función las dejaría literales y el
// validador reportaría un falso positivo visible antes que uno
// silencioso — preferible a asumir un decoder que puede estar mal.
function limpiarTexto(txt) {
  return latin1AUtf8(txt)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extraerFaqVisible(cuerpo) {
  const seccionMatch = cuerpo.match(RE_FAQ_SECCION);
  if (!seccionMatch) return null;
  const items = [];
  let m;
  RE_PREGUNTA_RESPUESTA.lastIndex = 0;
  while ((m = RE_PREGUNTA_RESPUESTA.exec(seccionMatch[0])) !== null) {
    items.push({ question: limpiarTexto(m[1]), answer: limpiarTexto(m[2]) });
  }
  return items;
}

/**
 * Compara shell.faqItems (fuente del JSON-LD FAQPage) contra el FAQ
 * realmente visible en cuerpo.html. No lanza excepción: devuelve los
 * warnings encontrados (array vacío si están sincronizados, o si la
 * ficha no tiene faqItems / sección FAQ visible — no todas las fichas
 * tienen por qué tener FAQ, y eso no es un error de esta validación).
 *
 * @param {string} slug
 * @param {string} cuerpo - contenido crudo de cuerpo.html (latin1)
 * @param {object} shell  - ficha.json ya parseado (UTF-8)
 * @returns {Array<string>}
 */
function validarFaqConsistencia(slug, cuerpo, shell) {
  const warnings = [];
  if (typeof cuerpo !== "string") return warnings;
  const faqItems = Array.isArray(shell && shell.faqItems) ? shell.faqItems : [];

  const visibles = extraerFaqVisible(cuerpo);
  if (visibles === null) {
    // No hay sección FAQ visible. Si igual hay faqItems (JSON-LD sin
    // contraparte visible), eso SÍ es el problema exacto que castiga
    // Google — avisar.
    if (faqItems.length) {
      warnings.push(
        `[FAQ] ${slug}: ficha.json tiene ${faqItems.length} faqItems (genera JSON-LD FAQPage) pero cuerpo.html no tiene una sección FAQ visible (id="faq-heading") — el structured data no tendría contraparte visible en la página.`
      );
    }
    return warnings;
  }
  if (!faqItems.length) return warnings;

  if (visibles.length !== faqItems.length) {
    warnings.push(
      `[FAQ] ${slug}: ${faqItems.length} faqItems en ficha.json vs ${visibles.length} preguntas visibles en cuerpo.html — cantidad distinta.`
    );
  }

  const max = Math.max(visibles.length, faqItems.length);
  for (let i = 0; i < max; i++) {
    const v = visibles[i];
    const j = faqItems[i];
    if (!v || !j) continue; // ya reportado arriba (cantidad distinta)
    // shell viene de JSON.parse(leerLatin1(ficha.json)) en build-fichas.js
    // (mismo criterio "todo latin1" documentado en su cabecera) -- así
    // que j.question/j.answer están tan mangled como el texto crudo de
    // cuerpo.html, no como UTF-8 real. Se reconvierten acá para poder
    // comparar limpio contra `v` (ya reconvertido en limpiarTexto) y
    // para que el mensaje de warning sea legible en vez de mostrar
    // "Â¿QuÃ©..." si algún día hay un desvío real que reportar.
    const jQuestion = latin1AUtf8(j.question || "");
    const jAnswer = latin1AUtf8(j.answer || "");
    if (v.question !== jQuestion) {
      warnings.push(
        `[FAQ] ${slug}: pregunta #${i + 1} distinta — JSON: "${jQuestion}" | visible: "${v.question}"`
      );
    }
    if (v.answer !== jAnswer) {
      warnings.push(
        `[FAQ] ${slug}: respuesta #${i + 1} ("${jQuestion}") no coincide entre ficha.json y cuerpo.html.`
      );
    }
  }

  return warnings;
}

module.exports = { validarFaqConsistencia };
