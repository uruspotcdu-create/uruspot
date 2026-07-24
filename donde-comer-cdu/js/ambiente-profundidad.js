/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-profundidad.js
   Fase 2: Depth Manager (Arquitectura técnica, Cap. 3.9)

   Subsistema del Grupo de Contenido Visual — el único de ese grupo
   que "no renderiza contenido propio" (Cap. 3.9: "modula parámetros
   de las demás capas... sin poseer contenido visual propio"). Por eso
   no tiene iniciar() ni se suscribe a nada: es una función pura que
   el Motion Controller llama durante su propio cálculo (Cap. 3.9:
   "Salidas: factores de modulación que el Motion Controller
   redistribuye a las demás capas").

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 3.9 — "Dependencias: ninguna dependencia de Asset Registry
     — es un subsistema puramente de cálculo de parámetros, no de
     contenido". No importa nada, no se suscribe a nada, no crea
     ningún elemento del DOM.
   - Cap. 3.9 — "nunca debe aplicar un desplazamiento relativo entre
     capas mayor al límite definido en el documento de diseño (Cap.
     3.7 Fase 1)". Cap. 3.7 Fase 1: "desplazamientos relativos de no
     más del 8-12% entre la capa más cercana y la más lejana" — acá
     LIMITE_PARALLAX_MAX fija ese techo de forma dura, sin importar
     qué valor proponga una escena nueva.
   - Cap. 3.7 Fase 1 — profundidad se logra con velocidad relativa,
     desenfoque y opacidad/saturación, nunca con 3D real ni parallax
     agresivo. calcularFactores() solo devuelve esos tres números,
     nunca una transformación 3D.

   No necesita orden de carga particular dentro del Grupo de
   Contenido Visual — solo debe existir antes de que
   ambiente-movimiento.js calcule parámetros por primera vez.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // Cap. 3.7 Fase 1: techo duro, nunca superable por ninguna escena.
  var LIMITE_PARALLAX_MAX = 0.12;

  var api = {
    // profundidadEscena: { navegacion, atmosfera } — multiplicadores
    // 0-1 ya declarados por la escena activa (Cap. 6.1 Arquitectura).
    // multiplicadoresNivel: { navegacion, atmosfera } — los factores
    // de fidelidad vigentes para cada dimensión (Cap. 9.6: cada
    // dimensión tiene su propio multiplicador, no uno compartido —
    // por ejemplo nivel 'minima' apaga navegación pero conserva algo
    // de atmósfera). Devuelve los tres factores de modulación que el
    // Cap. 3.9 define como salida — nunca un objeto de transformación
    // visual, solo números que cada capa del Grupo de Contenido
    // Visual interpreta a su manera (Cap. 3.9: "sin poseer contenido
    // visual propio").
    calcularFactores: function (profundidadEscena, multiplicadoresNivel) {
      var p = profundidadEscena || { navegacion: 0, atmosfera: 0 };
      var m = multiplicadoresNivel || { navegacion: 1, atmosfera: 1 };

      var navegacion = Math.min(p.navegacion * m.navegacion, 1);
      var atmosfera = Math.min(p.atmosfera * m.atmosfera, 1);

      return Object.freeze({
        // Cap. 3.7 Fase 1: velocidad relativa entre capas — nunca
        // supera el techo de parallax, sin importar cuánto pida la
        // escena o cuán alto esté el nivel de fidelidad.
        velocidadRelativa: Math.min(navegacion * LIMITE_PARALLAX_MAX, LIMITE_PARALLAX_MAX),
        // Cap. 4.6 Fase 1: desenfoque de lo "lejano" — proporcional a
        // la atmósfera declarada, acotado a un máximo razonable de 6px
        // para no volverse un efecto pesado en dispositivos modestos.
        desenfoqueMaxPx: Math.round(atmosfera * 6),
        // Cap. 3.7 Fase 1: "lo lejano es levemente más pálido" — la
        // opacidad de los elementos más atrás nunca baja de 0.7, para
        // que "levemente" siga siendo literal y no un desvanecido.
        opacidadAtmosfera: 1 - (atmosfera * 0.3)
      });
    }
  };

  global.AmbienteProfundidad = api;

})(window);
