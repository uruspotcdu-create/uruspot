/* validar-precios-cuerpo.js
 * ─────────────────────────────────────────────────────────────────────
 * [IMPORTANTE 4] (auditoría contenido, 2026-08): los precios que
 * aparecen en el side-box "Precios verificados" y los que aparecen en
 * la sección FAQ ("¿Cuáles son los precios?") de cuerpo.html son texto
 * plano escrito a mano en 2 lugares distintos de la misma ficha, sin
 * una única fuente. Hoy dependen 100% de que quien edite se acuerde de
 * actualizar los 2 lugares — si mañana cambia un precio y solo se toca
 * uno de los dos, quedan desincronizados dentro de la misma página sin
 * que nada lo detecte.
 *
 * Por qué NO se resolvió moviendo los precios a ficha.json e
 * inyectándolos desde ficha-template.js (alternativa evaluada primero):
 * ficha-template.js documenta explícitamente que el contenido editorial
 * (Catálogo, FAQ, etc.) queda fuera del templating a propósito — es
 * "prosa única por lugar", y forzarla a JSON no da reutilización real,
 * solo la vuelve más frágil de editar (ver comentario de cabecera de
 * ese archivo). Esta validación respeta esa decisión: no toca cómo se
 * escribe el contenido, solo lo audita después de escrito.
 *
 * Se integra en build-fichas.js (fichas:build y fichas:verify) como
 * WARNING, no como error que corte el build — mismo criterio que
 * validar-meta-longitud.js: un desvío de precios es un problema de
 * contenido a corregir, no un bug que deba bloquear el deploy de las
 * otras 1499 fichas. El objetivo es que el desvío sea VISIBLE en cada
 * build en vez de depender de que alguien lo note a ojo.
 * ───────────────────────────────────────────────────────────────────── */
"use strict";

// Bloque del side-box "Precios verificados": desde el div con ese
// aria-label hasta su </div> de cierre (no-greedy, para no comerse el
// resto de la página si hubiera más de un side-box).
const RE_SIDEBOX_BLOQUE = /<div class="side-box"[^>]*aria-label="Precios verificados"[\s\S]*?<\/div>\s*<\/div>/;

// Montos dentro del side-box: <span class="side-box-val">$ 1.530</span>
const RE_SIDEBOX_MONTO = /<span class="side-box-val">\s*\$\s*([\d.,]+)\s*<\/span>/g;

// Bloque de la pregunta de precios dentro del FAQ: el <p class="about-body">
// que sigue inmediatamente al <h3> "¿Cuáles son los precios?". El ancla
// usa solo "son los precios?" (sin el "¿Cuáles" inicial) a propósito:
// build-fichas.js lee cuerpo.html como latin1 para preservar bytes
// exactos, lo que parte cada carácter acentuado UTF-8 (¿, á, é...) en
// 2 code points sueltos — un literal con tildes en esta regex nunca
// matchearía contra ese texto. "son los precios?" es ASCII puro y no
// tiene ese problema.
const RE_FAQ_BLOQUE = /son los precios\?<\/h3>\s*<p class="about-body">([\s\S]*?)<\/p>/;

// Montos dentro de ese párrafo: <strong class="stat">$1.530</strong>
const RE_FAQ_MONTO = /<strong class="stat">\s*\$\s*([\d.,]+)\s*<\/strong>/g;

/**
 * Normaliza un monto a solo dígitos para comparar "$ 1.530" con
 * "$1.530" o un eventual "$1,530" como el mismo valor.
 * @param {string} monto
 * @returns {string}
 */
function normalizarMonto(monto) {
  return monto.replace(/[^\d]/g, "");
}

function extraerMontos(texto, regex) {
  const montos = [];
  let m;
  regex.lastIndex = 0;
  while ((m = regex.exec(texto)) !== null) {
    montos.push(normalizarMonto(m[1]));
  }
  return montos;
}

/**
 * Compara los precios del side-box "Precios verificados" contra los de
 * la FAQ "¿Cuáles son los precios?" dentro del mismo cuerpo.html. No
 * lanza excepción: devuelve los warnings encontrados (array vacío si
 * están sincronizados, o si la ficha no tiene una de las dos secciones
 * — no todas las fichas tienen catálogo de precios, y eso no es un
 * error).
 *
 * @param {string} slug   - identificador de la ficha, para el log
 * @param {string} cuerpo - contenido crudo de cuerpo.html (latin1)
 * @returns {Array<string>} mensajes de warning (vacío si no hay problemas)
 */
function validarPreciosCuerpo(slug, cuerpo) {
  const warnings = [];
  if (typeof cuerpo !== "string") return warnings;

  const sideboxMatch = cuerpo.match(RE_SIDEBOX_BLOQUE);
  const faqMatch = cuerpo.match(RE_FAQ_BLOQUE);

  // Si la ficha no tiene una de las dos secciones (ej. rubros sin
  // catálogo de precios, o FAQ sin la pregunta de precios), no hay
  // nada que comparar — no es un error de esta ficha.
  if (!sideboxMatch || !faqMatch) return warnings;

  const montosSidebox = extraerMontos(sideboxMatch[0], RE_SIDEBOX_MONTO);
  const montosFaq = extraerMontos(faqMatch[1], RE_FAQ_MONTO);

  if (montosSidebox.length === 0 || montosFaq.length === 0) {
    // Las secciones existen pero no se pudieron parsear montos — el
    // marcado cambió respecto a lo que este validador espera. Avisar
    // en vez de fallar en silencio.
    warnings.push(
      `[PRECIOS] ${slug}: se encontró side-box y/o FAQ de precios pero no se pudieron extraer montos — revisar si el marcado cambió (regex desactualizada en validar-precios-cuerpo.js).`
    );
    return warnings;
  }

  const setSidebox = new Set(montosSidebox);
  const setFaq = new Set(montosFaq);

  const soloEnSidebox = montosSidebox.filter((m) => !setFaq.has(m));
  const soloEnFaq = montosFaq.filter((m) => !setSidebox.has(m));

  if (soloEnSidebox.length || soloEnFaq.length) {
    warnings.push(
      `[PRECIOS] ${slug}: side-box y FAQ no coinciden — side-box: [${montosSidebox.join(", ")}], FAQ: [${montosFaq.join(", ")}]. ` +
        (soloEnSidebox.length ? `Solo en side-box: [${soloEnSidebox.join(", ")}]. ` : "") +
        (soloEnFaq.length ? `Solo en FAQ: [${soloEnFaq.join(", ")}]. ` : "")
    );
  }

  return warnings;
}

module.exports = { validarPreciosCuerpo };
