/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — js/app-tarjetas.js
   Tercer módulo real (auditoría de ingeniería, Oportunidad 3,
   2026-08-06) de la separación de app.js por responsabilidad: el
   grupo "render de tarjetas" del informe original. Arranca con
   `pintarEsqueleto` — la más chica y de menor riesgo de las dos
   funciones del grupo — antes de `pintarTarjetas` (~250 líneas, con
   lectura/escritura de `uiState`), que se suma en una pasada
   siguiente a este mismo archivo.

   A diferencia de `app-telemetria.js`, esta función no necesita
   `configurar()`: su única dependencia (`DOM.panelDescubrimiento`) se
   la pasa quien la llama, como parámetro — no hace falta un contrato
   de acceso más elaborado para una función que no lee `estado` ni
   `uiState`. Cuando `pintarTarjetas` se sume acá, sí va a necesitar
   más parámetros (favoritos, opts) pero el mismo principio: nada de
   estado privado de app.js capturado por closure, todo explícito en
   la firma.

   Carga: sin dependencias — debe estar disponible antes de que
   app.min.js llame a estas funciones (arranque de `inicializar()` y
   recuperación de errores), así que va junto a ciclo-vida.js,
   app-telemetria.js y app-formato.js en index.html, antes de
   motor.bundle.js — no dentro de ningún bundle.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /**
   * Esqueleto inicial mientras carga el catálogo.
   * @param {HTMLElement} panelEl — DOM.panelDescubrimiento de quien llama.
   */
  function pintarEsqueleto(panelEl) {
    if (!panelEl) return;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 6; i++) {
      var art = document.createElement('div');
      art.className = 'tarjeta tarjeta--esqueleto';
      art.innerHTML =
        '<div class="u-skeleton esqueleto-linea esqueleto-linea--rubro"></div>' +
        '<div class="u-skeleton esqueleto-linea esqueleto-linea--nombre"></div>' +
        '<div class="u-skeleton esqueleto-linea esqueleto-linea--direccion"></div>' +
        '<div class="u-skeleton esqueleto-linea esqueleto-linea--acciones"></div>';
      frag.appendChild(art);
    }
    panelEl.innerHTML = '';
    panelEl.appendChild(frag);
  }

  global.AppTarjetas = {
    pintarEsqueleto: pintarEsqueleto
  };

})(window);
