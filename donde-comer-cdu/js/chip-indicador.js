/* js/chip-indicador.js
   Indicador deslizante bajo los chips de rubro: una pista visual
   direccional (desliza desde el chip anterior hacia el nuevo filtro)
   que COMPLEMENTA, sin reemplazar, el snap instantáneo de
   .chip--activo — esa sigue siendo la confirmación inmediata del
   click, esto es una señal secundaria de "hacia dónde te moviste".

   No depende de React ni de ninguna librería nueva. Inspirado en el
   patrón "direction aware tabs", reescrito en vanilla JS/CSS.

   REQUIERE en el HTML:
   - Un contenedor con position:relative que sea ANCESTRO de
     #listaRubros pero que NO sea reemplazado por pintarRubros()
     (esa función hace listaRubros.innerHTML = ...). Si el indicador
     viviera dentro de #listaRubros, se destruiría y recrearía en
     cada click, perdiendo el punto de partida de la animación.
   - Un <span class="chip-indicador" aria-hidden="true"></span> como
     hermano de #listaRubros (no hijo), dentro de ese ancestro
     posicionado. Ver chip-indicador.css para el wrapper sugerido.

   INTEGRACIÓN (una sola línea, al final de pintarRubros() en
   app.js, después de fijar el innerHTML):
     if (window.URU_ChipIndicador) {
       window.URU_ChipIndicador.sincronizar(DOM.listaRubros, '.chip--activo');
     }
*/
(function () {
  'use strict';

  function prefiereMovimientoReducido() {
    return !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /**
   * @param {HTMLElement} contenedorChips  El elemento cuyo innerHTML
   *   reemplaza pintarRubros() (ej. DOM.listaRubros). El indicador
   *   NO vive adentro de este elemento — se posiciona relativo a su
   *   elemento padre, que debe tener position:relative.
   * @param {string} selectorActivo  Selector del chip activo dentro
   *   de contenedorChips. Default: '.chip--activo'.
   */
  function sincronizar(contenedorChips, selectorActivo) {
    if (!contenedorChips || !contenedorChips.parentElement) return;

    var wrap = contenedorChips.parentElement;
    var indicador = wrap.querySelector(':scope > .chip-indicador');
    var activo = contenedorChips.querySelector(selectorActivo || '.chip--activo');

    // Ningún rubro seleccionado (deselección): ocultar sin animar
    // hacia una posición inválida.
    if (!activo) {
      if (indicador) indicador.style.opacity = '0';
      return;
    }

    if (!indicador) return; // El <span> debe existir de antemano en el HTML.

    var rectWrap = wrap.getBoundingClientRect();
    var rectActivo = activo.getBoundingClientRect();
    var left = rectActivo.left - rectWrap.left;
    var width = rectActivo.width;
    var color = getComputedStyle(activo).getPropertyValue('--chip-color') ||
      'var(--color-granate-clara)';

    var reducido = prefiereMovimientoReducido();
    indicador.classList.toggle('chip-indicador--sin-animar', reducido);
    indicador.style.setProperty('--chip-color', color.trim());
    indicador.style.opacity = '1';
    indicador.style.width = width + 'px';
    indicador.style.transform = 'translateX(' + left + 'px)';
  }

  window.URU_ChipIndicador = { sincronizar: sincronizar };
})();
