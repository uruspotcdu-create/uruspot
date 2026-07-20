/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Configuración del motor de descubrimiento
   ───────────────────────────────────────────────────────────────────
   Este archivo NO contiene lógica ni principios. Contiene únicamente
   los valores que el Blueprint de Producto v2 y el Vocabulario de
   Interacción dejan abiertos a propósito ("uso real: evidencia de
   comportamiento de usuarios reales que contradiga una suposición
   del modelo" — Freeze v1.0, sección 3).

   Regla de este archivo: cambiar un número acá nunca debería requerir
   tocar motor-plano.js, motor-exposicion.js ni motor-mapa.js. Si para
   calibrar algo hay que tocar esos archivos, es que el valor no
   debería haber estado hardcodeado ahí — hay que moverlo acá.

   Cada valor documenta: qué mueve, por qué ese punto de partida, y
   qué señal de uso real debería hacer que se recalibre.
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  global.URU_CONFIG = {

    /* ── 1. El plano continuo (Blueprint v2, sección 1) ──
       autonomia: 0 = guiado, 1 = autónomo
       friccion:  0 = resolver ya, 1 = margen para explorar        */
    plano: {
      autonomiaInicial: 0.15,
      friccionInicial: 0.55,
      // Por qué: sin evidencia, el sistema debe arrancar cerca de
      // "guiado" (curva de madurez, Blueprint sección 1) y con
      // margen moderado para sorprender, no en modo resolver-ya.
      // Recalibrar si: el dato real de uso 1 muestra que la mayoría
      // abandona el arranque en Guía antes de dar ninguna señal.
      limites: { min: 0, max: 1 }
    },

    /* ── 2. Regiones con nombre dentro del plano (Blueprint v2, sección 1 y 8) ──
       Son fronteras de lectura, no casilleros de implementación.   */
    regiones: {
      autonomiaUmbralGuia: 0.35,
      // Por debajo de este valor de autonomía: región Guía.
      friccionUmbralExploracion: 0.45,
      // Por encima (y ya con autonomía alta): región Exploración.
      // Por debajo (y con autonomía alta): región Acción Directa
      // (variante inferida). Recalibrar con datos de cuánto tiempo
      // pasa la gente en cada región antes de actuar.
    },

    /* ── 3. Las seis acciones mínimas (Vocabulario de Interacción) ── */
    acciones: {
      permanecer: {
        segundosPorEmpuje: 25,      // cada N segundos sin actuar...
        empujeFriccion: 0.04,       // ...empuja la fricción tolerable esto
        empujeFriccionMax: 0.30     // tope acumulado por sesión
      },
      aceptar: {
        empujeAutonomia: 0.06       // "esta oferta funcionó, soltá un poco más"
      },
      rechazar: {
        ventanaDecaimientoDias: 14,
        // Un rechazo aislado vive 14 días en la cuenta y después no
        // pesa más, salvo que se repita (Blueprint v2, sección 6).
        repeticionesParaEstable: 3,
        // 3 rechazos del mismo rubro dentro de la ventana = patrón
        // estable → ese rubro se evita en Guía/Exploración hasta que
        // deje de repetirse. Recalibrar si 3 resulta muy sensible
        // (la gente rechaza por motivos circunstanciales seguido) o
        // muy insensible (tarda demasiado en dejar de ofrecer algo
        // que a alguien claramente no le interesa).
        empujeFriccionSiEstable: -0.05
      },
      nombrar: {
        // "Nombrar" siempre salta a Acción Directa (variante nombrada)
        // de inmediato — no tiene parámetro de calibración, es un
        // salto categórico (Vocabulario, sección 1).
      },
      guardar: {
        ventanaCuradoriaSegundos: 90,
        // Guardar 2+ veces dentro de esta ventana activa Curaduría,
        // sin importar la región de origen (Blueprint v2, sección 4a).
        disparadorCantidad: 2
      },
      abandonar: {
        // No mueve el plano. Solo cierra sesión y persiste el punto
        // de partida (Vocabulario, sección 1) — sin parámetros.
      }
    },

    /* ── 4. Presupuesto de exposición y rotación (Blueprint v2, sección 4b) ──
       Aplica ÚNICAMENTE a contenido ofrecido por iniciativa propia
       del sistema (Guía, Exploración). Nunca a búsqueda explícita
       (Acción Directa) ni a Curaduría.                              */
    exposicion: {
      recorteGuia: 4,
      // Cuántos lugares like máximo se muestran por iniciativa
      // propia en Guía. Chico a propósito: baja autonomía = mínima
      // carga cognitiva.
      recorteExploracion: 10,
      descansoHoras: 72,
      // Un lugar ya mostrado por iniciativa propia "descansa" 72h
      // antes de poder volver a aparecer en Guía/Exploración para
      // ese mismo contexto (usuario × ciudad).
      aplicaSoloEnRegiones: ['guia', 'exploracion']
      // Recalibrar con datos de: ¿la gente se queja de ver lo mismo
      // (bajar descansoHoras) o de nunca ver lo mismo dos veces
      // aunque lo busque (revisar que no se esté aplicando fuera de
      // estas dos regiones por error)?
    },

    /* ── 5. Madurez por contexto (Blueprint v2, sección 3) ──
       La clave del contador es SIEMPRE (usuarioId, ciudadId), nunca
       un contador global.                                           */
    madurez: {
      umbralAperturas: {
        anfitrion: 0,
        conocido: 10,
        complice: 100,
        casa: 500
      },
      rolesConReposoForzado: ['anfitrion', 'conocido'],
      // Sección 4d: el cierre de sesión intencional se desactiva en
      // Cómplice y Casa — no aparece en esta lista a propósito.
    },

    /* ── 6. Mapa de doble rol (Blueprint v2, sección 4c) ── */
    mapa: {
      texturaSiempreVisible: true,
      texturaDensidadMax: 18,
      // Puntos ambientales simultáneos máximo. No interactivos, no
      // compiten por atención — solo dan la certeza subconsciente de
      // que esto es un lugar real. No necesita mostrar todo el
      // universo para cumplir esa función.
      herramientaSoloSiCriterioEspacial: true,
      herramientaRecorte: 10
      // El mapa-herramienta solo aparece en Acción Directa cuando el
      // criterio de desempate es distancia, y con el mismo tipo de
      // recorte acotado que el resto del sistema — nunca 1.468 pines.
    },

    /* ── 7. Frontera con la monetización (Blueprint v2, sección 2) ──
       No hay parámetros numéricos que calibrar acá — es una regla
       binaria, no una perilla. Se deja documentada en config para
       que cualquier futuro código de monetización la lea de un solo
       lugar y no la reinvente.                                      */
    monetizacion: {
      puedeFinanciar: ['calidad_de_ficha', 'verificacion_mas_profunda', 'mejor_material_visual'],
      nuncaPuedeComprar: ['posicion_en_presupuesto_de_exposicion', 'saltar_rotacion']
    }
  };

})(typeof window !== 'undefined' ? window : global);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window.URU_CONFIG : global.URU_CONFIG);
}
