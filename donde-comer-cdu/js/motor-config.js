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
        empujeAutonomia: 0.06,      // "esta oferta funcionó, soltá un poco más"
        ventanaDecaimientoDias: 21,
        // Afinidad positiva por rubro (espejo de rechazar, señal
        // contraria). Un poco más larga que la de rechazar (14 días):
        // una preferencia positiva sostenida es información más
        // barata de confirmar que un rechazo (aceptar es una acción
        // de un click; rechazar suele implicar más fricción real) y
        // vale la pena conservarla más tiempo antes de pedir nueva
        // evidencia.
        repeticionesParaEstable: 3
        // Mismo umbral que rechazar.repeticionesParaEstable, por
        // simetría y porque no hay evidencia de uso real todavía que
        // sugiera un número distinto — recalibrar cuando la haya.
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
      aplicaSoloEnRegiones: ['guia', 'exploracion'],
      // Recalibrar con datos de: ¿la gente se queja de ver lo mismo
      // (bajar descansoHoras) o de nunca ver lo mismo dos veces
      // aunque lo busque (revisar que no se esté aplicando fuera de
      // estas dos regiones por error)?

      /* ── 4b. Motor de scoring del recorte por iniciativa propia ──
       Solo aplica dentro de recortePorIniciativaPropia() — nunca a
       búsqueda explícita ni a Curaduría (motor-exposicion.js impone
       ese límite, esto solo calibra números). Cada señal es opcional
       en tiempo de ejecución: si el dato de entrada no está
       disponible para un lugar o para la sesión, esa señal
       simplemente no participa (se renormalizan los pesos restantes,
       ver motor-exposicion.js: calcularScore) — nunca se penaliza a
       un lugar por falta de dato. */
      scoring: {
        pesos: {
          afinidad: 0.35,
          // Rubros con patrón de aceptación estable (gruposAfines).
          // El más alto de los cuatro a propósito: es la señal con más
          // evidencia detrás (3+ aceptaciones reales, no una corazonada).
          proximidad: 0.25,
          // Distancia al usuario, cuando hay ubicación. Nunca decide
          // sola: ver diversidad/exploración más abajo para por qué no
          // termina en "todo lo más cercano".
          frescura: 0.15,
          // Preferencia leve por lugares nunca antes aceptados desde un
          // recorte. Complementa (no reemplaza) la exclusión dura por
          // descanso (exposicion.descansoHoras) que ya filtra candidatos
          // antes de llegar al scoring.
          contexto: 0.10
          // Clima/hora. Peso bajo a propósito: hoy `afinidadClimaPorGrupo`
          // está vacío (ver más abajo), así que en la práctica esta señal
          // no influye en nada todavía — el peso queda documentado y
          // listo para cuando el producto decida activarla con datos
          // reales, no con una suposición de este archivo.
        },
        proximidad: {
          distanciaReferenciaMetros: 3000
          // A esta distancia el aporte de proximidad decae a ~0; a 0
          // metros, aporte máximo. 3km cubre cómodamente el radio
          // urbano de Concepción del Uruguay sin volverse una señal de
          // todo-o-nada. Recalibrar si "cerca tuyo" en app.js muestra
          // que la gente usa el filtro con radios muy distintos.
        },
        frescura: {
          decaimientoPorVez: 0.5
          // score = 1 / (1 + vecesMostrado * este_valor). Nunca llega a
          // 0 (un lugar muy repetido sigue pudiendo aparecer, solo pesa
          // menos) — la exclusión dura ya la resuelve el descanso.
        },
        diversidad: {
          maxPorGrupoRatio: 0.5
          // Ningún rubro puede ocupar más de la mitad del cupo del
          // recorte, salvo que no haya suficientes rubros distintos
          // entre los candidatos disponibles (ahí se relaja, mismo
          // criterio de "nunca cae por debajo del cupo" que ya usa el
          // filtro de rubros evitados). Evita que la afinidad, llevada
          // al extremo, se convierta en una burbuja de un solo rubro.
        },
        exploracion: {
          ratio: 0.2,
          // Fracción del cupo reservada para candidatos fuera del
          // top-score, elegidos con el mismo mecanismo determinístico
          // por semilla que ya usaba el shuffle viejo — no es
          // aleatoriedad real, es "distinto pero reproducible dentro de
          // la sesión". Ver motor-exposicion.js: seleccionar().
          minCandidatosParaActivarse: 3
          // Con muy pocos candidatos no tiene sentido reservar cupo de
          // exploración — se prioriza mostrar lo que hay.
        },
        afinidadClimaPorGrupo: {}
        // Vacío A PROPÓSITO. Mapear qué rubro conviene más con qué
        // condición climática ("lluvia" favorece gastronomía con techo,
        // por ejemplo) es una decisión de producto que necesita datos
        // reales o al menos una revisión editorial — no algo que este
        // archivo deba inventar. Con la tabla vacía, la señal de clima
        // se calcula (para explicabilidad/tests) pero nunca cambia el
        // orden de nada: es matemáticamente neutra. Forma esperada si
        // se llena en el futuro:
        //   { heladerias: { calor: 0.4, frio: -0.3, lluvia: -0.2 },
        //     cafeterias: { lluvia: 0.3, frio: 0.2 } }
        // valores como deltas en [-0.5, 0.5] alrededor de un neutro 0.5.
      }
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
      herramientaRecorte: 2000
      // Antes en 10 (recorte viejo de tarjetas) y después en 300 —
      // ese 300 todavía truncaba el mapa a una fracción del catálogo
      // real (+1400 lugares): con "todos" sin filtrar, el mapa
      // clusterizaba solo esos 300 y mostraba números de cluster que
      // no representaban el total. 2000 cubre el catálogo actual
      // (1468) con margen de crecimiento y en la práctica funciona
      // como "sin techo": motor-render.js clusteriza por superposición
      // real en pantalla (agruparEnClusters, O(n²) por frame), así que
      // ir de 300 a 1468 puntos no cambia lo que se VE — sigue
      // agrupando en los mismos clusters visuales — pero si el
      // catálogo crece mucho más allá de unos pocos miles y se nota
      // lag al mover/zoomear el mapa, ahí es cuando conviene indexar
      // espacialmente (grid/quadtree) en vez de seguir subiendo este
      // número.
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
