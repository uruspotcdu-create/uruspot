/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — dom-painter.js

   FASE 4b del Plan Maestro de Modularización. Extraído de app.js §14
   (Renderizado Principal): la mitad de PINTADO — las funciones
   `pintar*`/`actualizar*` que escriben directamente en el DOM a
   partir de los datos que ya decidió RenderEngine.calcular() (ver
   render-engine.js, Fase 4a, ya cableado en app.js).

   Mismo criterio que render-engine.js/cache.js/favorites.js: sin
   feature flag, sin ejecución en paralelo. Extracción directa,
   función por función, reemplazando cada `pintarX()` de app.js por
   una llamada a `DomPainter.pintarX(...)` en el mismo call-site,
   pasando por parámetro lo que antes se leía de closures/globales.

   Progreso: 1 de 8 funciones migradas (pintarStatsRapidas). El resto
   (pintarDestacados, pintarRubros, pintarSugerenciasRapidas,
   pintarFiltrosActivos, pintarTarjetas, pintarLeyenda,
   pintarEstadoEscribiendo) sigue en app.js — se migran una a la vez,
   en ese orden (de menor a mayor riesgo), cada una con su propio
   commit y verificación manual antes de pasar a la siguiente.
   ═══════════════════════════════════════════════════════════════════ */

export function crearDomPainter(deps) {
  var DOM = deps.DOM;
  var obtenerRegistro = deps.obtenerRegistro;

  return {
    /**
     * Estadísticas rápidas del hero (conteo de lugares y rubros).
     * Sin cambios de comportamiento respecto de la versión en app.js:
     * misma guarda de "sin catálogo cargado", mismos nodos, mismo
     * formato de número (es-AR).
     */
    pintarStatsRapidas: function () {
      if (!obtenerRegistro().length) return;
      if (DOM.statLugares) {
        DOM.statLugares.textContent = obtenerRegistro().length.toLocaleString('es-AR');
      }
      if (DOM.statRubros) {
        var grupos = Object.create(null);
        obtenerRegistro().forEach(function (l) {
          grupos[l.grupo] = true;
        });
        DOM.statRubros.textContent = Object.keys(grupos).length;
      }
    }
  };
}
