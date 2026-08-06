/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — ui/render-engine.js
   Slice 4a de la modularización de app.js (ver ARQUITECTURA_MAESTRO_APP.md
   §9, línea 1370: "Se extrae de sección 13: render()").

   Contiene la mitad DECISORIA de render(): qué rama visual corresponde,
   qué lista y qué opts arma cada rama, y la detección de cambios contra
   el render anterior (antes vivía en `lastRenderCache`, ahora es estado
   privado de este módulo). No toca DOM ni pinta nada — eso sigue en
   app.js (pintarTarjetas, actualizarCabecera, etc.) y está fuera de
   este slice, ver Slice 4b (ui/dom-painter.js, pendiente).

   Dependencias: se inyectan explícitamente en crearRenderEngine(deps),
   no se leen de window ni de closures ajenos (Principio Arquitectónico,
   ARQUITECTURA_MAESTRO_APP.md línea 2533: "✅ BUENO: Inyectadas").
   Esto es deliberado para poder testear calcular() sin DOM ni
   localStorage — ver tests/render-engine-test.js.

   ───────────────────────────────────────────────────────────────────
   CONTRATO PÚBLICO
   ───────────────────────────────────────────────────────────────────
   crearRenderEngine(deps) → instancia con:

     calcular(ctx) → objeto { reg, rama, lista, opts, favoritos }
       si hubo cambio real respecto al render anterior, o `null` si no
       hay nada nuevo que pintar (mismo criterio que el render() viejo:
       ni cambió de rama ni cambió el contenido de la lista).

     obtenerCache() → snapshot actual { lista, favoritos, region, rama, html }
       (usado por DebugHelper.inspectarEstado() en app.js)

     reiniciarCache() → vuelve la cache al estado inicial
       (usado por limpiar() en app.js al hacer cleanup de la app)

   deps requeridas:
     RAMA_CURADURIA, RAMA_BUSCADOR   (constantes string, ver app.js §1)
     ramaActual(reg)                  → string
     listaPorAccionExplicita()        → array
     ordenarPorCercania(lista)        → array
     leerFavoritos()                  → object

   ctx requerido en cada calcular():
     estado, PLANO, EXPO, REGISTRO, uiState
   ─────────────────────────────────────────────────────────────────── */

(function (global) {
  'use strict';

  function crearRenderEngine(deps) {
    var REQUERIDAS = [
      'RAMA_CURADURIA', 'RAMA_BUSCADOR', 'ramaActual',
      'listaPorAccionExplicita', 'ordenarPorCercania', 'leerFavoritos'
    ];
    REQUERIDAS.forEach(function (nombre) {
      if (deps[nombre] === undefined) {
        throw new Error('RenderEngine: falta dependencia "' + nombre + '"');
      }
    });

    // Cache de renderizado anterior — reemplaza al `lastRenderCache`
    // que vivía en app.js. Misma forma exacta, mismos 5 campos.
    var cache = {
      lista: null,
      favoritos: null,
      region: null,
      rama: null,
      html: null
    };

    /**
     * Determina si el contenido de la lista cambió significativamente.
     * Movida literal desde app.js (era función standalone, único call
     * site era el propio render()).
     */
    function hayCambioEnLista(listaAnterior, listaActual) {
      if (!listaAnterior || !listaActual) return true;
      if (listaAnterior.length !== listaActual.length) return true;

      var hashAnterior = listaAnterior.map(function (l) { return l.id; }).join(',');
      var hashActual = listaActual.map(function (l) { return l.id; }).join(',');
      return hashAnterior !== hashActual;
    }

    /**
     * Calcula qué corresponde renderizar para el estado actual.
     * Misma lógica y mismo orden de operaciones que el render() viejo
     * (líneas 1076-1118 de app.js en fase-4), solo que acá termina en
     * "devolver qué pintar" en lugar de pintarlo.
     */
    function calcular(ctx) {
      var favoritos = deps.leerFavoritos();
      var reg = ctx.PLANO.region(ctx.estado);
      var rama = deps.ramaActual(reg);
      var lista;
      var opts;

      if (rama === deps.RAMA_CURADURIA) {
        var idsGuardados = Object.keys(favoritos).filter(function (id) {
          return favoritos[id];
        });
        lista = ctx.EXPO.coleccionCurada(ctx.REGISTRO, idsGuardados);
        lista = deps.ordenarPorCercania(lista);
        opts = {
          origen: 'accion_explicita',
          narrativa: false,
          vacioTexto: 'Todavía no guardaste nada. Guardá un lugar y aparece acá.'
        };
      } else if (rama === deps.RAMA_BUSCADOR) {
        lista = deps.listaPorAccionExplicita();
        lista = deps.ordenarPorCercania(lista);
        opts = { origen: 'accion_explicita', narrativa: false };
      } else {
        lista = ctx.EXPO.recortePorIniciativaPropia(ctx.REGISTRO, ctx.estado, reg.nombre);
        lista = deps.ordenarPorCercania(lista);
        opts = { origen: 'iniciativa_propia', narrativa: false };
      }

      var ramaDistinta = ctx.uiState.ultimaRamaRenderizada !== rama;
      var hayoCambio = ramaDistinta || hayCambioEnLista(cache.lista, lista);

      if (!hayoCambio && ctx.uiState.ultimaRamaRenderizada === rama) {
        return null;
      }

      cache.lista = lista;
      cache.rama = rama;
      cache.favoritos = favoritos;
      cache.region = reg.nombre;

      return {
        reg: reg,
        rama: rama,
        lista: lista,
        opts: opts,
        favoritos: favoritos
      };
    }

    function obtenerCache() {
      return cache;
    }

    function reiniciarCache() {
      cache = {
        lista: null,
        favoritos: null,
        region: null,
        rama: null,
        html: null
      };
    }

    return {
      calcular: calcular,
      obtenerCache: obtenerCache,
      reiniciarCache: reiniciarCache
    };
  }

  global.URU_RENDER_ENGINE = {
    crear: crearRenderEngine
  };

})(typeof window !== 'undefined' ? window : global);

// Export para el runner de tests en Node (no afecta el navegador).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window.URU_RENDER_ENGINE : global.URU_RENDER_ENGINE);
}
