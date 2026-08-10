'use strict';

/**
 * Utilidades compartidas del sistema "Ficha Maestra".
 *
 * Nada de esto es un bundler ni un framework: son funciones puras de
 * Node que arman strings de HTML. El resultado sigue siendo HTML plano
 * commiteado al repo — no cambia en nada el "sin build step" del
 * package.json (eso rige para lo que Cloudflare Pages sirve; esto es
 * una herramienta de autor, igual que scripts/generar-sitemap.js).
 */

// Escapa texto para uso seguro dentro de atributos/texto HTML.
// Los campos de datos que ya vienen con HTML intencional (about_html,
// historia_html, etc.) se insertan tal cual — son contenido editorial
// de confianza del propio repo, no input de usuario.
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Une un array de nodos (o strings) filtrando los vacíos/null,
// para poder hacer `join(list(a, b, c))` sin ensuciar el HTML con
// bloques condicionales vacíos.
function joinBlocks(blocks, sep = '\n\n') {
  return blocks.filter(Boolean).join(sep);
}

// Repite un renderer por cada item de un array, devolviendo '' si el
// array no existe o está vacío (así una ficha simple simplemente no
// emite la sección, en vez de un <div> hueco).
function mapOrEmpty(arr, renderFn) {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  return arr.map(renderFn).join('\n');
}

// Igual que esc(), pero sin escapar comillas — para texto que va DENTRO
// de un nodo (<p>, <span>, <li>...), no dentro de un atributo. Las
// comillas tipográficas de las citas ("Paciencia, precisión...") no
// necesitan &quot; ahí; escaparlas solo ensucia el HTML fuente sin
// cambiar el render.
function escText(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = { esc, escText, joinBlocks, mapOrEmpty };
