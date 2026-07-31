/*
 * js/motor.bundle.js — GENERADO, NO EDITAR A MANO.
 * Fuente: 10 módulos + scripts/build-motor-bundle.js
 * Para modificar, editá el módulo correspondiente y volvé a correr:
 *   node scripts/build-motor-bundle.js
 * js/contract-tests.js lee los marcadores /* ==== archivo.js ==== *\/
 * de este archivo para seguir verificando el orden real.
 * Generado: 2026-07-31T20:07:15.287Z
 */

/* ==== motor-config.js ==== */
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

    /* ── 0. Logging de diagnóstico ──
       Gobierna los console.log de app.js que describen el flujo
       normal de uso (cambios de estado, operaciones async, etc.).
       Apagado por defecto: en producción, cualquier visitante que
       abra la consola no debería ver el detalle interno de la
       máquina de estados en cada búsqueda/filtro/favorito. Para
       depurar en local, poner `debug: true` acá o, sin tocar el
       archivo, ejecutar `window.URU_CONFIG.debug = true` en la
       consola antes de interactuar con la página.
       No afecta a console.error/console.warn (esos son señales de
       algo puntual que sí vale la pena ver siempre) ni al
       TestingSuite de DebugHelper (ese ya es on-demand, se invoca
       explícitamente vía window.URU_APP.healthCheck()). */
    debug: false,

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
        explicacion: {
          umbralProximidadRazon: 0.6
          // A partir de qué score de proximidad vale la pena mencionar
          // "está cerca tuyo" como razón en recortePorIniciativaPropiaExplicado().
          // Puro umbral de calibración editorial (no un techo matemático,
          // a diferencia de los ">= 1" de afinidad/frescura) — por eso
          // vive acá y no hardcodeado en motor-exposicion.js.
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

/* ==== rubros-meta.js ==== */
/* URU SPOT — metadatos de rubros. Sin lógica de arquitectura: es
   contenido (nombres, descripciones, color e ícono de identificación
   en el mapa), igual que antes vivía dentro de fase4-motor.js. Se
   separa para que app.js, el motor de mapa y las páginas de índice de
   rubros lo compartan sin duplicar el objeto.

   Formato de cada entrada: [nombre, descripción, colorMapa, icono]

   Migración a tokens (Blueprint V2, Cap. 2, punto 3 — ver
   blueprint-v2-carta-de-navegacion): `colorMapa` deja de portar el
   hex como dato propio. Antes vivía duplicado acá Y en
   css/tokens.css (mismo valor, dos fuentes de verdad — el hallazgo
   verificado en la auditoría Fase 1/1B). Ahora porta el NOMBRE del
   token semántico (ej. '--color-rubro-alojamiento'), y el valor real
   se resuelve en tiempo de ejecución contra css/tokens.css, que
   vuelve a ser la única fuente:
     - Consumo DOM (chips, tarjetas, leyenda): trivial, se envuelve
       en var() al armar el inline style — `--chip-color:var(' +
       meta[2] + ')'` — y el navegador lo resuelve solo.
     - Consumo Canvas (motor-render.js, vía colorSeguro()/hexARgba()):
       Canvas no entiende var(), necesita el hex real. Se resuelve
       con URU_RUBROS_COLOR_RESUELTO() más abajo, mismo mecanismo
       (getComputedStyle + cache) que motor-render.js ya usa en
       resolverVarCSS() para los tokens de Canvas — no se inventa un
       segundo mecanismo de lectura de CSS en el repo.

   `icono` es un único string de datos de trazo SVG (atributo `d`),
   dibujado sobre una grilla de 24×24 con viewBox 0 0 24 24, pensado
   para renderizarse SIN relleno (`fill:none`) y con trazo de grosor
   uniforme (ver ICONO_GROSOR más abajo) — la misma convención en
   todo el set: mismo peso de línea, mismos remates redondeados, mismo
   nivel de detalle. Es intencional que sea UN string por rubro (no un
   set de primitivas por separado): un solo `d` es consumible tal cual
   tanto por un <path> SVG en el DOM como por `new Path2D(d)` en un
   <canvas>, sin parseo propio ni librería de íconos — misma fuente,
   dos motores de render (ver URU_RUBROS_ICONO_SVG más abajo para el
   lado DOM, y motor-render.js/dibujarPictogramaRubro para el lado
   canvas).

   No se copiaron paths de ninguna librería de íconos existente: cada
   uno se dibujó desde cero para esta grilla y este peso de línea,
   como lenguaje visual propio de URU SPOT (ver nota de estilo al
   pie del archivo). */
(function (global) {
  'use strict';

  // Grilla y grosor de trazo compartidos por los 14 pictogramas — si
  // el peso visual del set necesita ajustarse, se toca UNA vez acá,
  // no rubro por rubro.
  var ICONO_VIEWBOX = 24;
  var ICONO_GROSOR = 1.75;

  global.URU_RUBROS_META = {
    alojamiento:        ['Alojamiento', 'hospedaje verificado puerta a puerta', '--color-rubro-alojamiento',
      'M4 19V6 M4 10h15a2 2 0 0 1 2 2v7 M4 17h17 M8 10V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v3'],
    belleza:            ['Belleza', 'peluquerías, barberías y centros de estética', '--color-rubro-belleza',
      'M7.5 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M16.5 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M9 14.5 19 5 M15 14.5 5 5'],
    compras:            ['Compras', 'comercios, desde kioscos hasta grandes superficies', '--color-rubro-compras',
      'M6 8h12l-1 12.5a1.5 1.5 0 0 1-1.5 1.5h-7a1.5 1.5 0 0 1-1.5-1.5L6 8Z M9 8V6.5a3 3 0 0 1 6 0V8'],
    deporte:            ['Deporte', 'clubes, gimnasios y espacios para moverse', '--color-rubro-deporte',
      'M3.5 12h17 M3.5 9v6 M20.5 9v6 M7 6.5v11 M17 6.5v11'],
    educacion:          ['Educación', 'escuelas, institutos y academias', '--color-rubro-educacion',
      'M3 9.5 12 5l9 4.5-9 4.5-9-4.5Z M7 11.7v3.8c0 1.4 2.5 2.5 5 2.5s5-1.1 5-2.5v-3.8 M21 9.5v6'],
    finanzas:           ['Finanzas', 'bancos, financieras y casas de cambio', '--color-rubro-finanzas',
      'M3 10 12 4l9 6 M4 10v9.5 M8 10v9.5 M12 10v9.5 M16 10v9.5 M20 10v9.5 M3.5 20.5h17'],
    gastronomia:        ['Gastronomía', 'restaurantes, bares y rotiserías', '--color-rubro-gastronomia',
      'M6 3v6 M7.5 3v6 M9 3v6 M6 9a1.5 1.5 0 0 0 1.5 1.5A1.5 1.5 0 0 0 9 9 M7.5 10.5V21 M17 3c-2 0-3.5 2-3.5 4.5S15 12 17 12 M17 3v18'],
    mascotas:           ['Mascotas', 'veterinarias y pet shops', '--color-rubro-mascotas',
      'M12 15.3c-2.6 0-4.6 1.8-4.6 4.1 0 1 .9 1.8 1.9 1.5.8-.2 1.7-.4 2.7-.4s1.9.2 2.7.4c1 .3 1.9-.5 1.9-1.5 0-2.3-2-4.1-4.6-4.1Z M7.3 12.2a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8Z M16.7 12.2a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8Z M9.6 8.1a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z M14.4 8.1a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z'],
    naturaleza:         ['Naturaleza', 'plazas, costaneras y espacios verdes', '--color-rubro-naturaleza',
      'M12 3 8 9.5h2.3L6.8 15h2.6L6 20.5h12l-3.4-5.5h2.6L13.7 9.5H16Z M12 20.5v1.5'],
    oficios_tecnicos:   ['Oficios técnicos', 'electricistas, plomeros, gasistas y afines', '--color-rubro-oficios-tecnicos',
      'M14.7 6.3a3.8 3.8 0 1 0-5.1 5.4L4 17.3l2.7 2.7 5.6-5.6a3.8 3.8 0 0 0 5.1-5.4l-2.6 2.6-2.7-2.7Z'],
    patrimonio:         ['Patrimonio', 'sitios históricos y culturales', '--color-rubro-patrimonio',
      'M5.5 20.5V11a6.5 6.5 0 0 1 13 0v9.5 M4 20.5h16 M9.5 20.5v-6h5v6'],
    salud:              ['Salud', 'consultorios, farmacias y centros médicos', '--color-rubro-salud',
      'M9 3.5h6v5.5h5.5v6H15v5.5H9V15H3.5V9H9Z'],
    servicios_publicos: ['Servicios públicos', 'trámites, correo y organismos', '--color-rubro-servicios-publicos',
      'M4 6.5h16v11H4Z M4 6.5 12 13l8-6.5'],
    transporte:         ['Transporte', 'remises, terminales y estaciones', '--color-rubro-transporte',
      'M4.5 16 5.7 10.5a1.5 1.5 0 0 1 1.5-1.2h9.6a1.5 1.5 0 0 1 1.5 1.2L19.5 16 M3.5 16h17v3.5H3.5Z M7.5 19.5a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z M16.5 19.5a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z']
  };

  // Se exponen viewBox/grosor porque cualquier consumidor (canvas o
  // DOM) necesita conocerlos para escalar el ícono correctamente —
  // hardcodearlos de nuevo en motor-render.js sería la misma fuente
  // de verdad duplicada en dos archivos.
  global.URU_RUBROS_ICONO_VIEWBOX = ICONO_VIEWBOX;
  global.URU_RUBROS_ICONO_GROSOR = ICONO_GROSOR;

  // Renderer DOM compartido: cualquier superficie HTML (chips, leyenda
  // del mapa, y a futuro tarjetas/fichas/filtros) pide el mismo
  // <svg> acá en vez de rearmar el markup por su cuenta. `stroke`
  // usa currentColor por defecto para poder gobernar el color 100%
  // desde CSS (mismo patrón que ya usa el sitio con --chip-color),
  // sin tener que regenerar el string si cambia el estado (hover,
  // activo, foco).
  global.URU_RUBROS_ICONO_SVG = function (rubroKey, opts) {
    var meta = global.URU_RUBROS_META && global.URU_RUBROS_META[rubroKey];
    if (!meta || !meta[3]) return '';
    opts = opts || {};
    var tam = opts.tam || 14;
    var color = opts.color || 'currentColor';
    var claseExtra = opts.clase ? ' ' + opts.clase : '';
    return '<svg class="rubro-icono' + claseExtra + '" width="' + tam + '" height="' + tam +
      '" viewBox="0 0 ' + ICONO_VIEWBOX + ' ' + ICONO_VIEWBOX + '" fill="none" stroke="' + color +
      '" stroke-width="' + ICONO_GROSOR + '" stroke-linecap="round" stroke-linejoin="round"' +
      ' aria-hidden="true" focusable="false"><path d="' + meta[3] + '"/></svg>';
  };

  // Resolver de color para Canvas: mismo mecanismo que resolverVarCSS
  // en motor-render.js (getComputedStyle + cache), pero vive acá
  // porque es rubros-meta.js quien conoce el mapeo rubroKey→nombre-
  // de-token, no motor-render.js. Éste solo pide "el color resuelto
  // de tal rubro", nunca el nombre del token directamente — así el
  // mapeo queda en un solo lugar si algún día cambia.
  //
  // Cache sin invalidación (igual que resolverVarCSS): tokens.css no
  // cambia en caliente en este sitio, así que una lectura por sesión
  // por rubro es correcto, no una limitación aceptada a medias.
  var cacheColorResuelto = Object.create(null);
  global.URU_RUBROS_COLOR_RESUELTO = function (rubroKey, fallback) {
    if (rubroKey in cacheColorResuelto) return cacheColorResuelto[rubroKey];
    var meta = global.URU_RUBROS_META && global.URU_RUBROS_META[rubroKey];
    var tokenNombre = meta && meta[2];
    var val = '';
    if (tokenNombre && typeof getComputedStyle === 'function') {
      val = getComputedStyle(document.documentElement).getPropertyValue(tokenNombre).trim();
    }
    return (cacheColorResuelto[rubroKey] = val || fallback || '#C97A83');
  };

  /* ── Nota de estilo (para quien agregue un rubro nuevo) ──────────
     - Grilla 24×24, contenido dentro de aprox. x:[3,21] y:[3,21]
       (el mismo margen óptico en los 14 existentes).
     - Solo trazo (stroke), nunca relleno de área — así el color de
       fondo (ventana del pin, chip, tarjeta) siempre se ve "a través"
       del ícono, igual que hoy se ve a través de la inicial de letra
       que este sistema reemplaza.
     - stroke-width 1.75 y stroke-linecap/linejoin "round" en TODOS,
       sin excepción — es lo que hace que el set se lea como una
       familia y no como 14 íconos sueltos.
     - Un símbolo simple y reconocible por rubro, sin sombreado ni
       detalle fino: tiene que leerse nítido incluso escalado a los
       ~13-15px que ocupa dentro de un pin de mapa. */
})(typeof window !== 'undefined' ? window : global);

/* ==== locales-slug.js ==== */
/* URU SPOT — mapeo id -> carpeta real de ficha
   ---------------------------------------------------------------------
   Bug real encontrado: slug(lugar) generaba "locales/uru-00187/"
   usando el ID, pero las carpetas en locales/ estan nombradas por el
   negocio ("locales/bartolo-bar/"), no por ID. Resultado: CADA boton
   "ver ficha" del sitio apuntaba a una URL que no existe (404) - no
   solo los lugares sin ficha, todos.

   Solo 45 de los 1.468 lugares del padron tienen hoy una ficha propia
   en locales/ (los 51 negocios de gastronomia/alojamiento/gimnasios
   curados a mano, menos 6 casos ambiguos: sucursales o coincidencias
   de nombre que no se pudieron resolver con certeza - mejor no
   mostrar el boton que enlazar a la sucursal equivocada: Cremolatti,
   BRODE, El Conventillo de Baco, Gimnasio 538 y Justo Jose Resto Bar).

   Generado comparando el nombre embebido en cada
   locales/<carpeta>/index.html contra lugares-core.json. Si se agregan
   mas fichas a futuro, hay que sumar su entrada aca (o automatizar
   esta generacion como parte del build). */
(function (global) {
  'use strict';
  global.URU_LOCALES_SLUGS = {
    "URU-00120": "muscle-gimnasio",
    "URU-00121": "lucianos-gimnasio",
    "URU-00122": "cross-gimnasio",
    "URU-00123": "power-gimnasio",
    "URU-00124": "casa-del-arbol",
    "URU-00125": "los-aguaribay",
    "URU-00126": "bungalows-mexico",
    "URU-00127": "antigua-fonda",
    "URU-00128": "hoteleria-mitre",
    "URU-00129": "posta-torreon",
    "URU-00157": "danys",
    "URU-00159": "italia",
    "URU-00160": "yelatti-artesanal",
    "URU-00162": "el-arca-resto-bar",
    "URU-00163": "papa-luigi",
    "URU-00164": "bella-vista",
    "URU-00165": "panza-verde",
    "URU-00166": "bonhomia",
    "URU-00167": "la-ris",
    "URU-00168": "parrilla-la-gruta",
    "URU-00169": "sanduba",
    "URU-00170": "pimienta-negra",
    "URU-00171": "parada-33",
    "URU-00172": "faro-3260",
    "URU-00173": "el-calderon",
    "URU-00174": "la-segunda",
    "URU-00175": "dolores-costa",
    "URU-00176": "la-delfina",
    "URU-00177": "mamma-mia",
    "URU-00178": "garifo",
    "URU-00180": "el-danubio-azul",
    "URU-00181": "nero-cafe",
    "URU-00182": "cultura-cafe",
    "URU-00183": "helena-cafe",
    "URU-00184": "london-cafe",
    "URU-00185": "drakkar",
    "URU-00186": "klug-gebrau",
    "URU-00187": "bartolo-bar",
    "URU-00188": "house-garage",
    "URU-00189": "7-colinas",
    "URU-00190": "panettone",
    "URU-00191": "lo-de-juan",
    "URU-00193": "san-carlos",
    "URU-00227": "la-cuadra",
    "URU-00237": "mi-viejo"
  };
})(typeof window !== 'undefined' ? window : global);

/* ==== motor-plano.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — motor-plano.js
   El núcleo del sistema. Reemplaza cualquier noción de "estado
   discreto" por un punto que se calcula en un plano de dos ejes
   (autonomía × fricción tolerable), tal como lo fija el Blueprint de
   Producto v2, sección 1.

   Todas las funciones que calculan algo son puras (reciben estado,
   devuelven estado nuevo) para poder testearlas sin DOM ni red —
   ver tests/motor-test.js. La única parte impura es la persistencia
   (leerEstado/guardarEstado/borrarEstado), aislada al final del
   archivo.

   No depende de motor-exposicion.js ni de motor-mapa.js: estos leen
   el estado que expone este módulo, nunca al revés. Este módulo no
   toca DOM, no hace fetch, no conoce HTML/CSS — cualquier señal
   externa (clima, hora, proximidad) entra por el `payload` de una
   acción o por un parámetro explícito, nunca por una llamada propia
   a una API externa (ver Principio Arquitectónico, sección 6b).

   ───────────────────────────────────────────────────────────────────
   NOTA HISTÓRICA — por qué este bloque no narra "pasadas" anteriores
   ───────────────────────────────────────────────────────────────────
   Versiones previas de este comentario documentaban, pasada por
   pasada, qué se agregaba o se retiraba y por qué — con la intención
   de que el diff fuera trazable. El efecto real, confirmado en esta
   auditoría (ejecutando `node tests/motor-test.js` y cruzando cada
   función pública contra sus call sites reales con `grep` en todo el
   repo, no asumiendo nada de lo ya escrito), fue el contrario: dos
   pasadas sucesivas terminaron narrando conclusiones opuestas sobre
   las mismas funciones (`gruposAEvitar()` se documentó como "código
   muerto, se elimina" en un bloque y, más abajo en el propio archivo,
   como "vuelve porque ahora sí tiene llamador" en otro) sin que
   nadie corrigiera el primer bloque. Un mantenedor que leyera solo
   el encabezado se llevaba información falsa.

   La política desde esta pasada es otra: este encabezado describe
   SOLO el estado actual, verificado. El historial de decisiones vive
   en el control de versiones (git blame/log), que es la herramienta
   que ya existe para eso y no puede desincronizarse del código como
   sí puede un comentario.

   ───────────────────────────────────────────────────────────────────
   6a. SECCIÓN 1 — CONTRATO PÚBLICO (verificado contra consumidores reales)
   ───────────────────────────────────────────────────────────────────
   Confirmado con `grep -rn "URU_PLANO\." js/ tests/` sobre el estado
   real del repo, no sobre lo que el código *dice* de sí mismo:

     leerEstado, registrarApertura, guardarEstado, aplicarAccion,
     region, rolPorAperturas
       → consumidas por js/app.js. Tocar su firma rompe la app.

     gruposAEvitar
       → consumida por js/motor-exposicion.js (recortePorIniciativaPropia),
         que a su vez SÍ es llamada por js/app.js (render(), línea
         ~692). Viva y en el camino de ejecución real, pese a lo que
         decía una versión anterior de este mismo comentario.

     SCHEMA_VERSION, borrarEstado, resumenEstado, obtenerUsuarioId
       → sin ningún consumidor en el repo hoy. No son código muerto en
         sentido estricto (utilidad de versionado, privacidad —
         "olvidame en esta ciudad" — y debug/telemetría,
         respectivamente) pero no tienen call site. Se conservan: son
         infraestructura barata y de bajo riesgo, lista para cuando
         haga falta, no relleno especulativo. `borrarEstado` en
         particular es la única forma programática de cumplir un
         futuro pedido de privacidad — removerla movería ese trabajo
         a "reinventarla desde cero" el día que haga falta.

     reposoForzadoActivo
       → NO EXISTÍA en el archivo al empezar esta pasada (se había
         retirado en una revisión anterior por "cero call sites"),
         pero `tests/motor-test.js` seguía invocándola y
         `motor-config.js` (madurez.rolesConReposoForzado) seguía
         calibrada para alimentarla. Resultado verificado: el test
         runner terminaba en `TypeError` y cortaba antes de correr
         los últimos 4 tests (exposición y mapa). Se reinstala en
         esta pasada: es pura, ya tiene su configuración lista, cierra
         un bug real de ejecución, y recupera compatibilidad con la
         API que el propio test suite del repo asume. Ver sección 3.

   ───────────────────────────────────────────────────────────────────
   6b. SECCIÓN 2 — QUÉ CAMBIA EN ESTA PASADA Y POR QUÉ CADA COSA
   ───────────────────────────────────────────────────────────────────
   NUEVO — Afinidad positiva por rubro (el cambio central)
   • Hasta esta pasada, `rechazos` (por grupo, con decaimiento
     temporal por ventana y umbral de "patrón estable") tenía una
     arquitectura completa para señal NEGATIVA. No existía el
     equivalente para señal POSITIVA: `Acciones.aceptar` subía un
     escalar global de autonomía pero nunca registraba QUÉ rubro se
     había aceptado. El motor sabía evitar, no sabía preferir — pese
     a que el propio meta-description del sitio promete "cuanto más
     lo usás, más se ajusta a vos". Se agrega `aceptados` (mismo shape
     que `rechazos`: `{ grupo: [timestamps] }`) y `gruposAfines()`,
     espejo exacto de `gruposAEvitar()` con el mismo mecanismo de
     decaimiento ya validado en producción — no es un mecanismo nuevo
     sin probar, es el mismo patrón aplicado al otro signo.
   • `Acciones.aceptar` acepta un `payload.grupo` OPCIONAL. Autorizado
     explícitamente: `app.js:424` ahora sí lo manda (mismo patrón que
     ya usaba `Acciones.rechazar` para resolver el rubro desde
     `porId[id]`), así que la afinidad positiva queda activa en
     producción desde esta pasada. El campo se sigue tratando como
     opcional en `motor-plano.js` — si algún día faltara o llegara
     `undefined`, el comportamiento degrada al de antes sin lanzar.
   • Constantes de calibración (ventana de decaimiento, umbral de
     patrón estable) migradas a `motor-config.js: acciones.aceptar`,
     junto a sus equivalentes de `acciones.rechazar` — autorizado
     explícitamente y aplicado en esta pasada. Ya no son constantes
     de módulo locales.

   NUEVO — nivelConfianza(estado)
   • Métrica derivada, pura, de cuánta evidencia real sostiene la
     posición actual del usuario en el plano (aperturas + señales
     acumuladas). No inventa ninguna fuente de datos nueva: es una
     lectura distinta de campos que ya existían. Sirve como base para
     que, el día de mañana, la interfaz pueda mostrar algo como "esto
     todavía te conoce poco" sin que ese texto sea una mentira de
     producto — hoy no hay ningún consumidor de esto en app.js, y no
     se agrega ninguno acá.

   CORREGIDO — bug real (reposoForzadoActivo)
   • Ver 6a arriba. Reinstalada, misma firma y semántica que el test
     suite ya esperaba: `true` si el rol de madurez actual está en
     `CFG.madurez.rolesConReposoForzado`.

   CORREGIDO — documentación contradictoria (gruposAEvitar)
   • Ver 6a arriba. Este encabezado ya no afirma que la función esté
     muerta; el comentario puntual junto a `gruposAEvitar()` es ahora
     la única fuente sobre su estado, y coincide con lo verificado.

   ESQUEMA — v3 → v4 (aditivo, nunca destructivo)
   • Se agrega el campo `aceptados` al shape persistido. La migración
     normaliza cualquier estado v1/v2/v3, o corrupto, o con forma
     inesperada, a la forma v4 — ver `migrarEstado()`. Ningún estado
     existente en el `localStorage` de un usuario real pierde datos
     con efecto vigente: los campos que ya importaban (`autonomia`,
     `friccion`, `aperturas`, `rechazos`, `guardadosRecientes`,
     `exposicion`) se preservan igual que en v3; `aceptados` arranca
     vacío para cualquier estado que no lo tuviera, que es el
     comportamiento correcto (no hay forma de reconstruir afinidad
     retroactiva a partir de un esquema que nunca la registró).

   QUÉ NO SE TOCÓ EN ESTA PASADA, Y POR QUÉ
   • `region()` sigue distinguiendo 'guia' / 'exploracion' /
     'accionDirecta' con el mismo comportamiento observable que antes
     (las tres ramas siguen alimentando el mismo camino de render en
     app.js). Colapsar esa distinción es una decisión de producto, no
     una corrección de esta auditoría — queda fuera a propósito.
   • `Acciones.permanecer` / `Acciones.rechazar` / el cálculo de
     `friccion` no cambian: siguen siendo consumidos por `region()`
     tal cual estaban.
   • `motor-exposicion.js`, `motor-render.js`: siguen fuera de
     alcance — es donde vivirá la decisión de producto de priorizar
     por afinidad, no de esta pasada. `app.js` y `motor-config.js` SÍ
     se tocaron en esta pasada (autorización explícita): un cambio de
     una línea en `app.js:424` (mandar `grupo`, igual que ya hacía
     `Acciones.rechazar`) y la migración de las 2 constantes de
     calibración de afinidad a `motor-config.js: acciones.aceptar`.
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var CFG = global.URU_CONFIG;

  if (!CFG) {
    // Dependencia dura declarada explícitamente: antes, si
    // motor-config.js no cargaba (orden de <script> equivocado, typo
    // en el nombre de archivo — el mismo tipo de problema que motivó
    // reordenar todo este repo), el primer acceso a `CFG.plano...`
    // rompía con un error críptico. Ahora se falla temprano y claro,
    // con el mismo criterio que ya usa motor-render.js para su propia
    // dependencia dura de proyeccion.js.
    if (global.console) {
      console.error('URU_PLANO: falta URU_CONFIG (motor-config.js). ' +
        'Revisá el orden de carga de los <script> — este módulo no puede iniciar sin esa dependencia.');
    }
  }

  /* ═════════════════════════════════════════════════════════════
     0. Versión de esquema del estado persistido
     ═════════════════════════════════════════════════════════════ */

  // Se sube cada vez que cambia la forma del objeto que viaja a
  // localStorage. Historial de FORMA (no de razones — el porqué de
  // cada cambio vive en git log, no acá, ver nota al inicio del
  // archivo):
  //   v1: forma original, sin `exposicion`.
  //   v2: sin `exposicion` (equivalente a v1 a estos efectos).
  //   v3: con `exposicion` (rotación de recorte por iniciativa propia).
  //   v4 (esta pasada): se agrega `aceptados` — señal positiva por
  //     rubro, espejo de `rechazos`. Ver sección 2 del encabezado.
  var SCHEMA_VERSION = 4;

  /* ─────────────────────────────────────────────────────────────
     1. Identidad anónima y contexto (usuario × ciudad)
     Constitución del Motor: nunca se pide autoclasificación. Este id
     es un anónimo generado localmente, nunca ligado a datos reales
     de identidad — solo permite que el mismo dispositivo reconozca
     su propio historial en este mismo navegador.
     ───────────────────────────────────────────────────────────── */

  // Cache de módulo para el id de sesión de emergencia. Solo se usa
  // cuando localStorage no está disponible — ver la corrección de
  // bug documentada arriba. Vive fuera de la función a propósito:
  // tiene que sobrevivir entre llamadas dentro de la misma sesión.
  var idSesionFallback = null;

  /**
   * Devuelve un identificador anónimo estable para este navegador.
   * Si localStorage no está disponible, devuelve un id de sesión que
   * se mantiene fijo mientras dure la pestaña (antes se regeneraba en
   * cada llamada — bug corregido en esta pasada).
   * @returns {string}
   */
  function obtenerUsuarioId() {
    var KEY = 'uru_uid';
    try {
      var id = localStorage.getItem(KEY);
      if (!id) {
        id = 'anon-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(KEY, id);
      }
      return id;
    } catch (e) {
      // Sin localStorage disponible: id de sesión, no persiste entre
      // visitas — pero SÍ es estable durante esta sesión, que es lo
      // que estaba roto antes.
      if (!idSesionFallback) {
        idSesionFallback = 'anon-sesion-' + Math.random().toString(36).slice(2, 10);
      }
      return idSesionFallback;
    }
  }

  /**
   * Clave de localStorage para el estado de un contexto (ciudad ×
   * usuario anónimo). Nunca una clave global — Blueprint v2, sección 3.
   * @param {string} ciudadId
   * @returns {string}
   */
  function claveContexto(ciudadId) {
    return 'uru_plano::' + ciudadId + '::' + obtenerUsuarioId();
  }

  /* ─────────────────────────────────────────────────────────────
     2. Estado por defecto y validación de forma
     Blueprint v2, sección 1 y 3: la madurez es un contador POR PAR
     (usuario, ciudad), nunca global.
     ───────────────────────────────────────────────────────────── */

  /**
   * Estado inicial de un contexto nuevo. Nótese que ya NO incluye
   * `exposicion` — ver "cambio de esquema" en la auditoría de arriba.
   * @param {string} ciudadId
   * @returns {object}
   */
  function estadoInicial(ciudadId) {
    return {
      version: SCHEMA_VERSION,
      ciudad: ciudadId,
      autonomia: CFG.plano.autonomiaInicial,
      friccion: CFG.plano.friccionInicial,
      aperturas: 0,              // madurez de ESTE contexto, no global
      ultimaApertura: null,
      rechazos: {},              // { grupo: [timestamps] } — señal negativa
      aceptados: {},             // { grupo: [timestamps] } — señal positiva (SCHEMA_VERSION v4)
      guardadosRecientes: [],    // timestamps para detectar Curaduría
      exposicion: {},            // { lugarId: { ultimaVez, vecesMostrado } } — rotación de recorte por iniciativa propia (ver SCHEMA_VERSION v3)
      sesion: {
        curaduriaActiva: false,      // navegación REAL a "Tu lista" — solo la enciende un click explícito
        curaduriaSugerida: false,    // guardar 2x sugiere curaduría vía banner, nunca redirige sola
        accionDirectaForzada: null, // null | 'nombrada' | 'inferida'
        inicioPermanenciaMs: null,
        empujeFriccionSesion: 0
      }
    };
  }

  /**
   * Valida que un objeto leído de localStorage tenga la forma mínima
   * que el resto del módulo asume sin volver a chequear. Un JSON
   * sintácticamente válido pero con forma equivocada pasaba antes el
   * `try/catch` de `JSON.parse` sin ningún problema y rompía más
   * adelante, en el primer acceso a una propiedad inexistente.
   *
   * BUG REAL corregido en esta pasada: `typeof [] === 'object'` en
   * JS, así que un estado con `version === SCHEMA_VERSION` pero con
   * `rechazos`/`aceptados`/`exposicion`/`sesion` corrompidos a un
   * ARRAY (en vez de objeto) pasaba esta validación igual — el chequeo
   * de acá solo miraba `typeof === 'object'`, sin excluir arrays.
   * Eso hacía que `migrarEstado()` tomara el camino rápido ("ya está
   * vigente, se devuelve tal cual") en vez del camino de
   * reconstrucción, que SÍ filtra arrays correctamente con
   * `!Array.isArray(...)` — la protección existía, pero solo en la
   * mitad de los caminos que un estado corrupto puede tomar. El
   * síntoma real: `gruposAEvitar()` (llamada en cada render() desde
   * motor-exposicion.js) terminaba haciendo `.filter` sobre un valor
   * que no es un array (un elemento indexado de otro array por
   * casualidad), lanzando `TypeError: lista.filter is not a
   * function` — un crash de producción, no solo un dato mal leído.
   * Reproducido y verificado antes del fix. Ahora ambos caminos usan
   * el mismo criterio: objeto real, no array.
   * @param {*} obj
   * @returns {boolean}
   */
  function esEstadoValido(obj) {
    return !!obj &&
      typeof obj === 'object' &&
      typeof obj.ciudad === 'string' &&
      typeof obj.autonomia === 'number' && isFinite(obj.autonomia) &&
      typeof obj.friccion === 'number' && isFinite(obj.friccion) &&
      typeof obj.aperturas === 'number' && isFinite(obj.aperturas) &&
      obj.rechazos !== null && typeof obj.rechazos === 'object' && !Array.isArray(obj.rechazos) &&
      obj.aceptados !== null && typeof obj.aceptados === 'object' && !Array.isArray(obj.aceptados) &&
      Array.isArray(obj.guardadosRecientes) &&
      obj.exposicion !== null && typeof obj.exposicion === 'object' && !Array.isArray(obj.exposicion) &&
      obj.sesion !== null && typeof obj.sesion === 'object' && !Array.isArray(obj.sesion);
  }

  /**
   * Normaliza cualquier objeto leído de localStorage a la forma
   * actual (SCHEMA_VERSION vigente), sin importar si viene de una
   * versión anterior, sin campo `version` (tratada como versión 1),
   * o directamente corrupto/con forma equivocada. Nunca lanza: en el
   * peor caso devuelve `estadoInicial(ciudadId)`.
   * @param {*} crudo — resultado de JSON.parse sobre lo leído de localStorage
   * @param {string} ciudadId
   * @returns {object}
   */
  function migrarEstado(crudo, ciudadId) {
    if (!crudo || typeof crudo !== 'object') return estadoInicial(ciudadId);

    // Ya está en la versión vigente y tiene la forma esperada: nada
    // que migrar, se devuelve tal cual llegó (camino más frecuente,
    // se resuelve sin reconstruir nada).
    if (crudo.version === SCHEMA_VERSION && esEstadoValido(crudo)) {
      return crudo;
    }

    // Versión anterior (o sin campo `version`, que es indistinguible
    // de la v1 original de este archivo) o forma inconsistente:
    // se reconstruye desde cero y se copian solo los campos
    // reconocidos, con su propio chequeo de tipo — así un valor
    // corrupto en un campo puntual no invalida el resto del estado.
    var base = estadoInicial(ciudadId);

    if (typeof crudo.aperturas === 'number' && isFinite(crudo.aperturas) && crudo.aperturas >= 0) {
      base.aperturas = crudo.aperturas;
    }
    if (typeof crudo.ultimaApertura === 'number' || crudo.ultimaApertura === null) {
      base.ultimaApertura = crudo.ultimaApertura;
    }
    if (typeof crudo.autonomia === 'number' && isFinite(crudo.autonomia)) {
      base.autonomia = clamp(crudo.autonomia);
    }
    if (typeof crudo.friccion === 'number' && isFinite(crudo.friccion)) {
      base.friccion = clamp(crudo.friccion);
    }
    if (crudo.rechazos && typeof crudo.rechazos === 'object' && !Array.isArray(crudo.rechazos)) {
      base.rechazos = crudo.rechazos;
    }
    // `crudo.aceptados`: nuevo en v4. Cualquier estado anterior (v1-v3)
    // simplemente no lo tiene — arranca vacío en `base`, que ya sale de
    // `estadoInicial()`. No hay forma de reconstruir afinidad retroactiva
    // a partir de un esquema que nunca la registró, y no hace falta:
    // arrancar en {} es exactamente "sin evidencia todavía", el estado
    // neutral correcto para esta señal.
    if (crudo.aceptados && typeof crudo.aceptados === 'object' && !Array.isArray(crudo.aceptados)) {
      base.aceptados = crudo.aceptados;
    }
    if (Array.isArray(crudo.guardadosRecientes)) {
      base.guardadosRecientes = crudo.guardadosRecientes;
    }
    // `crudo.exposicion`: se copia SOLO si ya viene con la forma nueva
    // (objeto de objetos, no el booleano/contador de versiones previas
    // a la v2 que este mismo archivo alguna vez tuvo). Si no es un
    // objeto reconocible, se arranca vacío — nunca rompe, en el peor
    // caso algún lugar rota una vez de más en su primera visita post-
    // migración, no es una pérdida de dato con efecto real.
    if (crudo.exposicion && typeof crudo.exposicion === 'object' && !Array.isArray(crudo.exposicion)) {
      base.exposicion = crudo.exposicion;
    }

    // `sesion` es intencionalmente POR SESIÓN (ver registrarApertura
    // más abajo) — nunca se migra desde el objeto persistido, se
    // arranca limpia siempre. Ya viene limpia en `base` porque sale
    // de `estadoInicial()`.

    base.version = SCHEMA_VERSION;
    return base;
  }

  /**
   * Restringe un valor del plano a los límites configurados
   * (motor-config.js: plano.limites).
   * @param {number} v
   * @returns {number}
   */
  function clamp(v) {
    return Math.max(CFG.plano.limites.min, Math.min(CFG.plano.limites.max, v));
  }

  /* ─────────────────────────────────────────────────────────────
     3. Madurez / rol — Blueprint v2, sección 3
     ───────────────────────────────────────────────────────────── */

  /**
   * Rol de madurez según la cantidad de aperturas en este contexto
   * (usuario × ciudad). Puramente informativo/cosmético en el estado
   * actual del producto — alimenta únicamente el rótulo de cabecera
   * en app.js (`DOM.rolActual`), no cambia qué se muestra.
   * @param {number} aperturas
   * @returns {'anfitrion'|'conocido'|'complice'|'casa'}
   */
  function rolPorAperturas(aperturas) {
    var u = CFG.madurez.umbralAperturas;
    if (aperturas >= u.casa) return 'casa';
    if (aperturas >= u.complice) return 'complice';
    if (aperturas >= u.conocido) return 'conocido';
    return 'anfitrion';
  }

  /**
   * Si el rol de madurez actual del usuario está entre los que el
   * Blueprint marca con "reposo forzado" (motor-config.js:
   * madurez.rolesConReposoForzado — hoy 'anfitrion' y 'conocido').
   * Función pura de lectura: no decide nada por sí sola ni muta el
   * plano, solo expone la señal para que quien orqueste sesión
   * (hoy: nadie la consume — ver nota de alcance en el encabezado)
   * decida qué hacer con ella, p. ej. no ofrecer el cierre de sesión
   * intencional a un usuario todavía nuevo en este contexto.
   * @param {object} estado
   * @returns {boolean}
   */
  function reposoForzadoActivo(estado) {
    var rol = rolPorAperturas(estado.aperturas);
    return CFG.madurez.rolesConReposoForzado.indexOf(rol) !== -1;
  }

  /* ─────────────────────────────────────────────────────────────
     4. Decaimiento de señales negativas — Blueprint v2, sección 6
     Un rechazo aislado no se guarda "para siempre": simplemente cae
     fuera de la ventana con el tiempo. Solo un patrón repetido
     DENTRO de la ventana se vuelve estable.

     Se conserva íntegro en esta pasada: además de alimentar a la ya
     eliminada gruposAEvitar(), también empuja `friccion` dentro de
     Acciones.rechazar — y `friccion` sigue siendo parte del contrato
     de `region()`, que esta pasada deliberadamente no toca (ver
     auditoría).
     ───────────────────────────────────────────────────────────── */

  /**
   * Timestamps de rechazo de un rubro que siguen dentro de la
   * ventana de decaimiento configurada.
   * @param {object} estado
   * @param {string} grupo
   * @param {number} ahoraMs
   * @returns {number[]}
   */
  function rechazosVigentes(estado, grupo, ahoraMs) {
    var ventanaMs = CFG.acciones.rechazar.ventanaDecaimientoDias * 24 * 3600 * 1000;
    var lista = estado.rechazos[grupo] || [];
    return lista.filter(function (ts) { return (ahoraMs - ts) <= ventanaMs; });
  }

  /**
   * Un rubro es "patrón estable" cuando se rechazó suficientes veces
   * dentro de la ventana vigente (motor-config.js:
   * acciones.rechazar.repeticionesParaEstable).
   * @param {object} estado
   * @param {string} grupo
   * @param {number} ahoraMs
   * @returns {boolean}
   */
  function grupoEsPatronEstable(estado, grupo, ahoraMs) {
    return rechazosVigentes(estado, grupo, ahoraMs).length >= CFG.acciones.rechazar.repeticionesParaEstable;
  }

  /**
   * Rubros a evitar en el recorte por iniciativa propia (Guía /
   * Exploración): los que hoy tienen patrón estable de rechazo.
   * Se había retirado por código muerto (su único llamador,
   * recortePorIniciativaPropia, no se invocaba desde app.js); vuelve
   * en esta pasada porque ese llamador ahora sí existe — ver
   * SCHEMA_VERSION v3 y render() en app.js.
   * @param {object} estado
   * @param {number} ahoraMs
   * @returns {string[]}
   */
  function gruposAEvitar(estado, ahoraMs) {
    return Object.keys(estado.rechazos || {}).filter(function (grupo) {
      return grupoEsPatronEstable(estado, grupo, ahoraMs);
    });
  }

  /* ─────────────────────────────────────────────────────────────
     4b. Afinidad positiva por rubro — espejo de la sección 4
     Mismo mecanismo de decaimiento que `rechazos` (una señal aislada
     no alcanza; solo un patrón repetido DENTRO de una ventana se
     considera "afinidad estable"), aplicado a la señal contraria.
     Antes de esta pasada no existía ningún registro de QUÉ rubro se
     aceptaba — solo de cuáles se evitaban. Ver sección 2 del
     encabezado del archivo para la justificación completa.

     Las constantes de calibración (ventana de decaimiento, umbral de
     patrón estable) viven en motor-config.js: acciones.aceptar, junto
     a sus equivalentes de acciones.rechazar — misma convención que el
     propio motor-config.js declara ("cambiar un número acá nunca
     debería requerir tocar motor-plano.js"). Ya no son constantes de
     módulo locales (lo eran en la pasada anterior, marcadas
     MIGRAR_A_CONFIG; esta pasada hace esa migración, autorizada).
     ───────────────────────────────────────────────────────────── */

  /**
   * Timestamps de aceptación de un rubro que siguen dentro de la
   * ventana de decaimiento de afinidad. Espejo exacto de
   * `rechazosVigentes()`.
   * @param {object} estado
   * @param {string} grupo
   * @param {number} ahoraMs
   * @returns {number[]}
   */
  function aceptacionesVigentes(estado, grupo, ahoraMs) {
    var ventanaMs = CFG.acciones.aceptar.ventanaDecaimientoDias * 24 * 3600 * 1000;
    var lista = (estado.aceptados && estado.aceptados[grupo]) || [];
    return lista.filter(function (ts) { return (ahoraMs - ts) <= ventanaMs; });
  }

  /**
   * Un rubro es "afinidad estable" cuando se aceptó suficientes veces
   * dentro de la ventana vigente. Espejo exacto de
   * `grupoEsPatronEstable()`.
   * @param {object} estado
   * @param {string} grupo
   * @param {number} ahoraMs
   * @returns {boolean}
   */
  function grupoEsAfinidadEstable(estado, grupo, ahoraMs) {
    return aceptacionesVigentes(estado, grupo, ahoraMs).length >= CFG.acciones.aceptar.repeticionesParaEstable;
  }

  /**
   * Rubros con afinidad positiva estable hoy — la señal simétrica de
   * `gruposAEvitar()`. Consumida hoy por motor-exposicion.js en
   * `recortePorIniciativaPropia()` y `recortePorIniciativaPropiaExplicado()`
   * (construyendo `afinesSet` para `scoreAfinidad`).
   * @param {object} estado
   * @param {number} ahoraMs
   * @returns {string[]}
   */
  function gruposAfines(estado, ahoraMs) {
    return Object.keys(estado.aceptados || {}).filter(function (grupo) {
      return grupoEsAfinidadEstable(estado, grupo, ahoraMs);
    });
  }

  /* ─────────────────────────────────────────────────────────────
     5. Cálculo de región — Blueprint v2, sección 1 y 8
     Acción Directa y Curaduría se activan por disparadores
     explícitos (sesión), NO por posición en el plano — igual que
     documenta el diagrama de la sección 8 del Blueprint.

     Sin cambios de comportamiento en esta pasada — ver "qué no se
     tocó, y por qué" en la auditoría del encabezado. La distinción
     entre 'guia' / 'exploracion' / 'accionDirecta' (variante
     'inferida') hoy no se traduce en ninguna diferencia visible en
     app.js: las tres ramas alimentan el mismo camino de render. Esto
     queda documentado acá, en el propio código, para que quien lea
     esta función entienda que sigue viva por contrato (se llama, se
     usa para decidir curaduría-o-no) pero no por el motivo original
     de tres regiones con comportamiento distinto.
     ───────────────────────────────────────────────────────────── */

  /**
   * Región activa para el estado dado.
   * @param {object} estado
   * @returns {{nombre: string, variante: (string|null)}}
   */
  function region(estado) {
    if (estado.sesion.accionDirectaForzada) {
      return { nombre: 'accionDirecta', variante: estado.sesion.accionDirectaForzada };
    }
    if (estado.sesion.curaduriaActiva) {
      return { nombre: 'curaduria', variante: null };
    }
    if (estado.autonomia < CFG.regiones.autonomiaUmbralGuia) {
      return { nombre: 'guia', variante: null };
    }
    if (estado.friccion >= CFG.regiones.friccionUmbralExploracion) {
      return { nombre: 'exploracion', variante: null };
    }
    return { nombre: 'accionDirecta', variante: 'inferida' };
    // Alta autonomía + baja fricción tolerable = usuario que ya sabe
    // lo que quiere y no tiene margen para que lo sorprendan: el
    // mismo comportamiento de entrega que la variante nombrada
    // (Blueprint v2, sección 7 — fusión Resolución/Verificación).
  }

  /* ─────────────────────────────────────────────────────────────
     6. Acciones del Vocabulario de Interacción
     Cada una recibe el estado actual y devuelve un estado NUEVO
     (no muta el original) — más fácil de testear y de razonar.

     Eran seis hasta esta pasada (permanecer, aceptar, rechazar,
     nombrar, guardar, abandonar — las del Blueprint original, que
     mueven autonomía/fricción/exposición). Auditoría de esta pasada,
     verificada con `grep -n "estado\.sesion\.\w* = " js/app.js`:
     `app.js` tenía 9 sitios que escribían directo sobre
     `estado.sesion` (abrir/cerrar Curaduría, descartar su banner,
     limpiar la búsqueda) sin pasar por `aplicarAccion` — cuatro
     transiciones de sesión reales que nunca tuvieron una función
     pura propia acá, y que por lo tanto no tenía forma de cubrir
     `motor-test.js`. Se agregan `entrarCuraduria`, `salirCuraduria`,
     `descartarSugerenciaCuraduria` y `despejarBusqueda` — mismo
     efecto observable que la mutación directa que reemplazan, ahora
     como funciones puras. Ver el hallazgo de auditoría completo
     (con los 9 call sites) en `app.js`.
     ───────────────────────────────────────────────────────────── */

  function copiarEstado(estado) {
    return JSON.parse(JSON.stringify(estado));
  }

  /**
   * Convierte un valor arbitrario en un número finito no negativo, o
   * en el valor por defecto si no se puede. Guarda mínima contra
   * payloads mal formados desde app.js (p. ej. un evento del DOM que
   * cambió de forma, o una integración futura que no respete el
   * contrato) — antes, `payload.segundos` inválido se colaba como
   * `NaN` hasta `Math.floor(NaN / N)`, que también da `NaN` y termina
   * silenciosamente en un `pasos <= 0` que no hace nada. Ese caso
   * puntual ya "fallaba seguro", pero no todos lo hacían igual de
   * silenciosamente — se unifica el criterio acá.
   * @param {*} v
   * @param {number} porDefecto
   * @returns {number}
   */
  function numeroFinitoOr(v, porDefecto) {
    return (typeof v === 'number' && isFinite(v) && v >= 0) ? v : porDefecto;
  }

  var Acciones = {

    /**
     * El usuario permanece en la vista sin actuar: empuja la
     * fricción tolerable hacia arriba, hasta un tope por sesión
     * (motor-config.js: acciones.permanecer).
     */
    permanecer: function (estado, payload) {
      var e = copiarEstado(estado);
      var seg = numeroFinitoOr(payload && payload.segundos, 0);
      var pasos = Math.floor(seg / CFG.acciones.permanecer.segundosPorEmpuje);
      if (pasos <= 0) return e;
      var empujeTotal = Math.min(
        pasos * CFG.acciones.permanecer.empujeFriccion,
        CFG.acciones.permanecer.empujeFriccionMax - e.sesion.empujeFriccionSesion
      );
      if (empujeTotal > 0) {
        e.friccion = clamp(e.friccion + empujeTotal);
        e.sesion.empujeFriccionSesion += empujeTotal;
      }
      return e;
    },

    /**
     * El usuario acepta una oferta: suelta autonomía. Si el lugar
     * venía de un recorte por iniciativa propia (Guía/Exploración,
     * no de una búsqueda ni de curaduría), registra `ultimaVez` en
     * `estado.exposicion` para que ese lugar "descanse" el tiempo
     * configurado (motor-config.js: exposicion.descansoHoras) antes
     * de poder volver a aparecer en un recorte de ese tipo — este
     * cruce lo consume motor-exposicion.js (descansando(), dentro de
     * recortePorIniciativaPropia).
     *
     * `payload.grupo` es OPCIONAL (nuevo en esta pasada): si viene,
     * registra el rubro aceptado en `estado.aceptados` con el mismo
     * mecanismo de decaimiento que `rechazos` — ver `gruposAfines()`.
     * Si no viene (como pasa hoy: app.js todavía no lo manda), el
     * comportamiento es idéntico al de antes de esta pasada. No es
     * una acción nueva del Vocabulario — sigue siendo "aceptar", solo
     * con un dato opcional más en su payload.
     */
    aceptar: function (estado, payload) {
      var e = copiarEstado(estado);
      e.autonomia = clamp(e.autonomia + CFG.acciones.aceptar.empujeAutonomia);
      var lugarId = payload && typeof payload.lugarId === 'string' && payload.lugarId;
      if (lugarId && payload.porIniciativaPropia) {
        var previo = e.exposicion[lugarId] || { vecesMostrado: 0 };
        e.exposicion[lugarId] = {
          ultimaVez: Date.now(),
          vecesMostrado: previo.vecesMostrado + 1
        };
      }
      var grupo = payload && typeof payload.grupo === 'string' && payload.grupo;
      if (grupo) {
        var ahora = Date.now();
        var vigentes = aceptacionesVigentes(e, grupo, ahora);
        vigentes.push(ahora);
        e.aceptados[grupo] = vigentes;
      }
      return e;
    },

    /**
     * El usuario rechaza un lugar: entra a la cola de rechazos de su
     * rubro. Un rechazo aislado no toca el plano — solo si se
     * convierte en patrón estable (repeticionesParaEstable dentro de
     * la ventana) empuja la fricción hacia abajo. El decaimiento es
     * automático: los timestamps viejos simplemente salen de la
     * ventana en la próxima lectura, no hace falta "perdonar" nada
     * de forma explícita.
     */
    rechazar: function (estado, payload) {
      var e = copiarEstado(estado);
      var grupo = (payload && typeof payload.grupo === 'string' && payload.grupo) || 'sin_rubro';
      var ahora = Date.now();
      var vigentes = rechazosVigentes(e, grupo, ahora);
      vigentes.push(ahora);
      e.rechazos[grupo] = vigentes;
      if (grupoEsPatronEstable(e, grupo, ahora)) {
        e.friccion = clamp(e.friccion + CFG.acciones.rechazar.empujeFriccionSiEstable);
      }
      return e;
    },

    /**
     * El usuario nombra lo que busca (típicamente: escribe en el
     * buscador). Salto categórico a Acción Directa, variante
     * 'nombrada' — independiente de la posición previa en el plano
     * (Vocabulario, sección 1). Efecto real hoy: si `curaduriaActiva`
     * estaba activo (viendo "tus guardados"), `region()` prioriza
     * `accionDirectaForzada` y la sesión sale del modo curaduría al
     * buscar — es el único resto observable del modelo de regiones
     * en el comportamiento actual de app.js.
     */
    nombrar: function (estado, payload) {
      var e = copiarEstado(estado);
      e.sesion.accionDirectaForzada = 'nombrada';
      return e;
    },

    /**
     * El usuario guarda un lugar. Guardar 2+ veces dentro de la
     * ventana configurada (acciones.guardar.ventanaCuradoriaSegundos)
     * SUGIERE Curaduría — sección 4a del Blueprint — pero ya no la
     * activa de forma directa: eso significaba redirigir de golpe
     * toda la vista a "Tu lista" sin que el usuario lo pidiera (p.
     * ej. guardando 2 restaurantes para comparar mientras se sigue
     * explorando). `curaduriaSugerida` enciende un banner descartable
     * en app.js; solo un click explícito (banner o botón "ver
     * guardados") pone `curaduriaActiva`, que es lo único que
     * `region()` consulta para navegar de verdad.
     */
    guardar: function (estado, payload) {
      var e = copiarEstado(estado);
      var ahora = Date.now();
      var ventanaMs = CFG.acciones.guardar.ventanaCuradoriaSegundos * 1000;
      var recientes = (e.guardadosRecientes || []).filter(function (ts) {
        return (ahora - ts) <= ventanaMs;
      });
      recientes.push(ahora);
      e.guardadosRecientes = recientes;
      if (recientes.length >= CFG.acciones.guardar.disparadorCantidad) {
        e.sesion.curaduriaSugerida = true;
      }
      return e;
    },

    /**
     * Cierre de sesión (intencional o por pérdida de foco/pestaña).
     * No mueve el plano — Vocabulario, sección 1. Solo se persiste
     * tal cual para que la próxima apertura arranque desde acá.
     */
    abandonar: function (estado) {
      return copiarEstado(estado);
    },

    /**
     * AUDITORÍA — agregada en esta pasada. Entra al modo Curaduría por
     * una acción explícita: click en "Ver tus guardados" o en el botón
     * "Ver tus guardados" del banner de sugerencia. Apaga la sugerencia
     * pendiente porque ya fue atendida (evita que el banner reaparezca
     * detrás de la vista de Curaduría).
     *
     * Antes de esta pasada, `app.js` ponía `curaduriaActiva = true` y
     * `curaduriaSugerida = false` escribiendo directo sobre
     * `estado.sesion` en 2 lugares distintos (manejarClickVerGuardados,
     * asegurarBannerCuraduria) — mutación fuera del Vocabulario, sin
     * cobertura de motor-test.js, ver hallazgo de auditoría.
     */
    entrarCuraduria: function (estado) {
      var e = copiarEstado(estado);
      e.sesion.curaduriaActiva = true;
      e.sesion.curaduriaSugerida = false;
      return e;
    },

    /**
     * AUDITORÍA — agregada en esta pasada. Sale del modo Curaduría:
     * click en "← Ver todos los lugares", selección de un rubro desde
     * fuera de Curaduría, o Escape. No toca `curaduriaSugerida`: si el
     * usuario vuelve a guardar más adelante, el banner puede sugerir
     * Curaduría otra vez con normalidad.
     *
     * Antes de esta pasada, 4 lugares distintos de `app.js`
     * (asegurarBotonVolverATodos, seleccionarRubro,
     * manejarTecladoGlobal/Escape) ponían
     * `estado.sesion.curaduriaActiva = false` por mutación directa.
     */
    salirCuraduria: function (estado) {
      var e = copiarEstado(estado);
      e.sesion.curaduriaActiva = false;
      return e;
    },

    /**
     * AUDITORÍA — agregada en esta pasada. Descarta el banner "armaste
     * una lista" sin navegar a Curaduría (botón ✕ del banner). No
     * mueve `curaduriaActiva`.
     */
    descartarSugerenciaCuraduria: function (estado) {
      var e = copiarEstado(estado);
      e.sesion.curaduriaSugerida = false;
      return e;
    },

    /**
     * AUDITORÍA — agregada en esta pasada. Vacía el campo de búsqueda:
     * sale de Acción Directa forzada por `nombrar` sin pasar a ninguna
     * otra región de forma explícita — espejo inverso exacto de
     * `nombrar`. Antes, `manejarInputBusqueda` y `limpiarBusqueda` en
     * `app.js` ponían `estado.sesion.accionDirectaForzada = null` por
     * mutación directa, incluyendo un camino (`manejarInputBusqueda`,
     * cada vez que el campo baja de 2 caracteres) que corría sin
     * ningún `if (!estado)` de guarda — si `estado` llegaba `null` por
     * un fallo previo de `inicializarEstado()` (que hoy tampoco corta
     * el arranque si falla — ver hallazgo de auditoría en `app.js`),
     * esto lanzaba `TypeError` de forma no controlada dentro de un
     * listener de `input`. `aplicarAccion` no elimina esa causa raíz
     * (un `estado` null sigue rompiendo dentro de `copiarEstado` vía
     * `JSON.parse(JSON.stringify(null)) → null`), pero al menos saca
     * esta transición del Vocabulario informal y la deja testeable.
     */
    despejarBusqueda: function (estado) {
      var e = copiarEstado(estado);
      e.sesion.accionDirectaForzada = null;
      return e;
    }
  };

  /**
   * Aplica una de las seis acciones mínimas del Vocabulario de
   * Interacción. Si el tipo no existe, devuelve el estado sin
   * modificar y avisa por consola — nunca lanza, para no romper el
   * flujo de la UI por un evento inesperado.
   * @param {object} estado
   * @param {string} tipo
   * @param {object} [payload]
   * @returns {object}
   */
  function aplicarAccion(estado, tipo, payload) {
    var fn = Acciones[tipo];
    if (!fn) {
      if (global.console) {
        console.warn('URU_PLANO: acción desconocida "' + tipo + '" — si esto pasa, la interacción no' +
          ' pertenece a este vocabulario (ver Vocabulario de Interacción, sección 1: ninguna séptima acción).');
      }
      return estado;
    }
    return fn(estado, payload);
  }

  /* ─────────────────────────────────────────────────────────────
     7. Apertura de contexto: recalcula madurez y limpia flags de
     sesión (Curaduría y Acción Directa forzada son POR SESIÓN, no
     persisten a la apertura siguiente).
     ───────────────────────────────────────────────────────────── */

  /**
   * Registra una nueva apertura del sitio en este contexto: sube el
   * contador de madurez y reinicia los flags de sesión.
   * @param {object} estado
   * @returns {object}
   */
  function registrarApertura(estado) {
    var e = copiarEstado(estado);
    e.aperturas += 1;
    e.ultimaApertura = Date.now();
    e.version = SCHEMA_VERSION;
    e.sesion = {
      curaduriaActiva: false,
      curaduriaSugerida: false,
      accionDirectaForzada: null,
      inicioPermanenciaMs: Date.now(),
      empujeFriccionSesion: 0
    };
    return e;
  }

  /* ─────────────────────────────────────────────────────────────
     8. Persistencia (única parte impura del módulo)
     ───────────────────────────────────────────────────────────── */

  /**
   * Lee el estado persistido de un contexto, migrándolo a la forma
   * vigente si hace falta. Nunca lanza: ante localStorage ausente,
   * JSON corrupto, o un objeto con forma inesperada, degrada a
   * `estadoInicial(ciudadId)`.
   * @param {string} ciudadId
   * @returns {object}
   */
  function leerEstado(ciudadId) {
    var clave = claveContexto(ciudadId);
    try {
      var crudo = localStorage.getItem(clave);
      if (crudo) {
        return migrarEstado(JSON.parse(crudo), ciudadId);
      }
    } catch (e) {
      // JSON corrupto o localStorage no disponible: arrancar de cero.
    }
    return estadoInicial(ciudadId);
  }

  /**
   * Persiste el estado de un contexto. No-op silencioso si
   * localStorage no está disponible — el resto del sistema sigue
   * funcionando en memoria durante esa sesión.
   * @param {object} estado
   */
  function guardarEstado(estado) {
    var clave = claveContexto(estado.ciudad);
    try {
      localStorage.setItem(clave, JSON.stringify(estado));
    } catch (e) { /* no-op: cuota agotada o storage no disponible */ }
  }

  /**
   * Borra el estado persistido de un contexto. No existía ninguna
   * forma programática de hacer esto — necesaria para cualquier
   * control de privacidad futuro ("olvidame en esta ciudad") y para
   * QA/debug sin tener que abrir devtools a mano.
   * @param {string} ciudadId
   */
  function borrarEstado(ciudadId) {
    var clave = claveContexto(ciudadId);
    try { localStorage.removeItem(clave); } catch (e) { /* no-op */ }
  }

  /* ─────────────────────────────────────────────────────────────
     9. Introspección para logging/telemetría/debug
     Nunca se debería loguear el objeto de estado crudo completo —
     incluye timestamps de rechazos y guardados que no aportan nada a
     un log y solo lo ensucian. Esta es la vista que sí tiene sentido
     mandar a un logger o mostrar en un panel de debug.
     ───────────────────────────────────────────────────────────── */

  /**
   * Cuánta evidencia real sostiene la posición actual del usuario en
   * el plano. No es una fuente de datos nueva: es una lectura
   * derivada de señales que ya existían (aperturas de este contexto +
   * cuántos grupos tienen hoy un patrón, positivo o negativo,
   * vigente). Pensada como base mínima para que, el día de mañana, la
   * interfaz pueda comunicar honestamente "todavía te conocemos poco"
   * sin inventar ningún dato — hoy no tiene consumidor en app.js, se
   * expone lista para cuando haga falta.
   * @param {object} estado
   * @param {number} [ahoraMs] — opcional, default Date.now(). Permite
   *   que un llamador que ya simula "ahora" (tests, depuración de "qué
   *   habría pasado el día X") mantenga coherencia interna en vez de
   *   mezclar un ahora simulado con el reloj real de la máquina.
   * @returns {'bajo'|'medio'|'alto'}
   */
  function nivelConfianza(estado, ahoraMs) {
    var ahora = (typeof ahoraMs === 'number' && isFinite(ahoraMs)) ? ahoraMs : Date.now();
    var gruposConSenal = gruposAEvitar(estado, ahora).length + gruposAfines(estado, ahora).length;
    if (estado.aperturas >= CFG.madurez.umbralAperturas.complice && gruposConSenal >= 2) return 'alto';
    if (estado.aperturas >= CFG.madurez.umbralAperturas.conocido || gruposConSenal >= 1) return 'medio';
    return 'bajo';
  }

  /**
   * Resumen plano y legible del estado, para logging/debug. No es
   * parte del contrato de negocio — es una utilidad de observación.
   * @param {object} estado
   * @returns {object|null}
   */
  function resumenEstado(estado) {
    if (!estado) return null;
    var reg = region(estado);
    var ahora = Date.now();
    return {
      ciudad: estado.ciudad,
      rol: rolPorAperturas(estado.aperturas),
      reposoForzado: reposoForzadoActivo(estado),
      aperturas: estado.aperturas,
      autonomia: Number(estado.autonomia.toFixed(3)),
      friccion: Number(estado.friccion.toFixed(3)),
      confianza: nivelConfianza(estado),
      region: reg.nombre,
      variante: reg.variante,
      curaduriaActiva: !!estado.sesion.curaduriaActiva,
      curaduriaSugerida: !!estado.sesion.curaduriaSugerida,
      guardadosRecientes: (estado.guardadosRecientes || []).length,
      rubrosConRechazosVigentes: gruposAEvitar(estado, ahora).length,
      rubrosConAfinidadVigente: gruposAfines(estado, ahora).length,
      lugaresEnRotacion: Object.keys(estado.exposicion || {}).length
    };
  }

  /* ─────────────────────────────────────────────────────────────
     API pública

     Todo lo que ya consumía app.js en producción (leerEstado,
     registrarApertura, guardarEstado, aplicarAccion, region,
     rolPorAperturas, gruposAEvitar) sigue exactamente igual — misma
     firma, mismo comportamiento por defecto. Esta pasada solo AGREGA
     superficie nueva, nunca retira ni cambia una firma existente:

       gruposAfines         → señal positiva, espejo de gruposAEvitar
       reposoForzadoActivo  → reinstalada (ver sección 1 del encabezado;
                               tests/motor-test.js ya la esperaba)
       nivelConfianza       → nueva, derivada, sin efecto en nada más

     `SCHEMA_VERSION`, `borrarEstado`, `resumenEstado` y
     `obtenerUsuarioId` se conservan sin consumidor hoy (ver sección 1
     del encabezado — no son código muerto, son infraestructura lista).
     ───────────────────────────────────────────────────────────── */
  global.URU_PLANO = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    estadoInicial: estadoInicial,
    region: region,
    aplicarAccion: aplicarAccion,
    registrarApertura: registrarApertura,
    rolPorAperturas: rolPorAperturas,
    reposoForzadoActivo: reposoForzadoActivo,
    gruposAEvitar: gruposAEvitar,
    gruposAfines: gruposAfines,
    nivelConfianza: nivelConfianza,
    leerEstado: leerEstado,
    guardarEstado: guardarEstado,
    borrarEstado: borrarEstado,
    resumenEstado: resumenEstado,
    obtenerUsuarioId: obtenerUsuarioId
  };

})(typeof window !== 'undefined' ? window : global);

// Export para el runner de tests en Node (no afecta el navegador).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window.URU_PLANO : global.URU_PLANO);
}

/* ==== motor-exposicion.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — motor-exposicion.js
   Decide QUÉ lugares mostrar dentro de cada región, respetando la
   regla que el Blueprint v2 (sección 4b) fija como no negociable:

     Los límites de exposición rigen ÚNICAMENTE el contenido que el
     sistema ofrece por iniciativa propia (Guía, Exploración).
     NUNCA rigen sobre una acción de búsqueda o construcción
     explícita del usuario (Acción Directa, Curaduría).

   ───────────────────────────────────────────────────────────────────
   AUDITORÍA Y REDISEÑO DE ESTA PASADA — de "filtro + shuffle" a motor
   de selección
   ───────────────────────────────────────────────────────────────────
   Verificado con `grep` en todo el repo antes de tocar nada (no se
   asumió ningún dato de los comentarios existentes):

   • `PLANO.gruposAfines()` existe en motor-plano.js desde SCHEMA_VERSION
     v4, con su propio mecanismo de decaimiento (idéntico al de
     `gruposAEvitar`), pero no tenía NINGÚN consumidor real — ni acá
     ni en app.js. El propio comentario de esa función lo decía:
     "No tiene consumidor todavía en motor-exposicion.js". El sistema
     sabía evitar; no sabía preferir.
   • `functions/weather.js` es una Cloudflare Function completa y
     funcional (clima real vía MET Norway) sin un solo `fetch` que la
     consuma en todo `js/`. Infraestructura lista, desconectada.
   • La proximidad ("cerca de mí") SÍ está conectada, pero vive en
     app.js como un re-ordenamiento posterior sobre la lista que este
     archivo ya recortó — nunca participaba en decidir QUÉ entra al
     recorte, solo en qué orden se ve lo que ya entró.
   • El propio recorte, hasta esta pasada, era: filtrar por rubros
     evitados + descanso, después un shuffle determinístico por
     semilla. Sin score, sin ranking, sin combinar señales.

   Esta pasada convierte ese filtro en un motor de scoring modular.
   Nada de esto es Machine Learning: son funciones puras, pesos
   configurables (motor-config.js: exposicion.scoring) y selección
   determinística — la misma filosofía que ya regía el resto del
   archivo, aplicada con más criterio.

   INVARIANTES QUE ESTA PASADA NO TOCA (verificados, no reescritos):
   • `resultadosPorAccionExplicita()` — sin cambios. Cero scoring,
     cero recorte por presupuesto. Una búsqueda nombra lo que quiere
     y lo recibe completo.
   • `coleccionCurada()` — sin cambios. IDs guardados adentro, el
     resto afuera. No pasa por scoring ni por rotación.
   • El contrato de `recortePorIniciativaPropia(registro, estado,
     nombreRegion)` sigue devolviendo un array plano de lugares — los
     mismos objetos del registro, en el mismo shape. Ningún consumidor
     existente (app.js, motor-mapa.js) necesita cambiar una línea.
   • La cascada de relajación del filtro (grupos evitados → sin
     rotación → catálogo completo si no alcanza) se conserva textual:
     el presupuesto nunca cae a "mostrar todo" salvo que ni así
     alcance el cupo.
   • El motor sigue sin tocar DOM, sin hacer fetch, sin depender de
     nada más que motor-plano.js (vía su API pública) y su propia
     configuración. `contexto.clima`, si se usa, entra como dato ya
     resuelto — nunca este archivo pide clima por su cuenta.

   QUÉ ES NUEVO
   • `calcularScore(lugar, ...)`: combina afinidad, proximidad,
     frescura y contexto (clima/hora) en un score [0,1]. Cada señal es
     OPCIONAL — si el dato no está (sin ubicación, sin clima, lugar
     sin coordenadas), esa señal simplemente no participa y los pesos
     restantes se renormalizan. Nunca se penaliza a un lugar por falta
     de dato (pedido explícito de esta pasada).
   • Diversidad: tope configurable de cuántos lugares del mismo rubro
     pueden ocupar el cupo, con relajación automática si no hay
     variedad suficiente entre los candidatos.
   • Exploración: una fracción del cupo se llena con candidatos fuera
     del top-score (elegidos con el mismo mecanismo de semilla
     determinística de siempre), para que la personalización no se
     cierre en burbuja.
   • `recortePorIniciativaPropiaExplicado()`: misma selección, pero
     devuelve score + señales + razones legibles por lugar, más el
     nivel de confianza de la sesión. Función NUEVA, aditiva — nadie
     que hoy consuma `recortePorIniciativaPropia()` se entera de que
     existe.
   • `calcularScoreLugar()`: wrapper de un solo lugar, pensado para
     tests unitarios de cada señal por separado sin pasar por toda la
     canalización de selección.

   QUÉ SIGUE FUERA DE ALCANCE DE ESTA PASADA (ver informe de cierre)
   • Conectar `contexto.ubicacion`/`contexto.clima` desde app.js real
     — hoy sólo se acepta como parámetro opcional, nadie lo manda
     todavía. Requiere tocar app.js (fuera de alcance autorizado).
   • Poblar `afinidadClimaPorGrupo` con criterio de producto real.
   • Unificar `distanciaMetros` (duplicada aquí y en app.js) en un
     módulo geográfico compartido — hoy motor-plano.js prohíbe que
     este archivo dependa de app.js, así que la duplicación puntual
     de una fórmula de 8 líneas es el costo correcto de esa frontera,
     pero si aparece un tercer consumidor, debería moverse a
     proyeccion.js.
   ═══════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var CFG = global.URU_CONFIG;
  var PLANO = global.URU_PLANO;

  /* ─────────────────────────────────────────────────────────────
     0. Utilidades puras compartidas
     ───────────────────────────────────────────────────────────── */

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  // Barajado determinístico por semilla (no aleatorio real): dado el
  // mismo array y la misma semilla, siempre el mismo orden. Se usa
  // tanto para desempatar scores iguales como para elegir el cupo de
  // exploración — cada uso con su propia semilla derivada, para que
  // un uso no condicione al otro.
  function barajarConSemilla(arr, semilla) {
    var copia = arr.slice();
    var s = semilla || 1;
    function rand() {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    }
    for (var i = copia.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = copia[i]; copia[i] = copia[j]; copia[j] = tmp;
    }
    return copia;
  }

  // Distancia entre dos puntos lat/lng en metros (fórmula de
  // Haversine). Duplicada intencionalmente de la equivalente en
  // app.js — ver nota de arquitectura al inicio del archivo sobre por
  // qué el núcleo no puede depender de la capa de UI.
  function distanciaMetros(lat1, lng1, lat2, lng2) {
    var R = 6371000;
    var toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad;
    var dLng = (lng2 - lng1) * toRad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function descansando(estado, lugarId, ahoraMs) {
    var reg = estado.exposicion[lugarId];
    if (!reg || typeof reg.ultimaVez !== 'number') return false;
    var descansoMs = CFG.exposicion.descansoHoras * 3600 * 1000;
    return (ahoraMs - reg.ultimaVez) < descansoMs;
  }

  /* ─────────────────────────────────────────────────────────────
     1. Señales individuales — cada una pura, cada una opcional
     ───────────────────────────────────────────────────────────── */

  // Afinidad: 1 si el rubro del lugar tiene patrón de aceptación
  // estable (PLANO.gruposAfines), 0 si no. Binaria a propósito: el
  // umbral de "estable" (3+ aceptaciones dentro de la ventana, ver
  // motor-plano.js) ya es la barrera anti-sobreajuste — una señal
  // graduada por encima de ese umbral no tiene más evidencia real
  // detrás, solo más ruido.
  function scoreAfinidad(lugar, gruposAfinesSet) {
    return gruposAfinesSet[lugar.grupo] ? 1 : 0;
  }

  // Proximidad: null (señal ausente) si no hay ubicación del usuario
  // o el lugar no tiene coordenadas — nunca 0 en ese caso, para no
  // penalizar por falta de dato. Con ambos datos presentes, decae
  // linealmente hasta 0 a partir de `distanciaReferenciaMetros`.
  function scoreProximidad(lugar, ubicacion, distanciaReferenciaMetros) {
    if (!ubicacion || typeof ubicacion.lat !== 'number' || typeof ubicacion.lng !== 'number') return null;
    if (typeof lugar.lat !== 'number' || typeof lugar.lng !== 'number') return null;
    if (typeof distanciaReferenciaMetros !== 'number' || distanciaReferenciaMetros <= 0) return null;
    var d = distanciaMetros(ubicacion.lat, ubicacion.lng, lugar.lat, lugar.lng);
    return clamp01(1 - d / distanciaReferenciaMetros);
  }

  // Frescura: 1 si el lugar nunca fue aceptado antes desde un recorte
  // por iniciativa propia; decae suavemente (nunca a 0) cuantas más
  // veces se aceptó. Complementa, no reemplaza, la exclusión dura por
  // descanso (esa ya sacó del pool a los "recién mostrados"; esto
  // solo empuja hacia arriba a los "nunca mostrados" entre los que
  // quedaron).
  function scoreFrescura(lugar, estado, decaimientoPorVez) {
    var reg = estado.exposicion && estado.exposicion[lugar.id];
    var vecesMostrado = (reg && typeof reg.vecesMostrado === 'number' && reg.vecesMostrado > 0)
      ? reg.vecesMostrado
      : 0;
    if (vecesMostrado <= 0) return 1;
    return clamp01(1 / (1 + vecesMostrado * decaimientoPorVez));
  }

  // Condición climática de lectura simple, a partir de la forma que
  // ya devuelve functions/weather.js (`.current`): weather_code (WMO,
  // ver symbolToWmo en ese archivo), temperature_2m, precipitation.
  // null si no hay datos usables — nunca inventa una condición.
  function condicionClimatica(clima) {
    if (!clima) return null;
    var codigo = typeof clima.weather_code === 'number' ? clima.weather_code : null;
    var temp = typeof clima.temperature_2m === 'number' ? clima.temperature_2m : null;
    var precip = typeof clima.precipitation === 'number' ? clima.precipitation : null;
    if (codigo === null && temp === null) return null;
    if ((codigo !== null && codigo >= 51) || (precip !== null && precip > 0.2)) return 'lluvia';
    if (temp !== null && temp <= 10) return 'frio';
    if (temp !== null && temp >= 30) return 'calor';
    if (codigo !== null && codigo <= 1) return 'despejado';
    return 'templado';
  }

  // Contexto (clima/hora): null si no hay clima en el contexto, o si
  // no hay ninguna afinidad configurada para (rubro, condición) —
  // ver motor-config.js: scoring.afinidadClimaPorGrupo (vacío por
  // defecto, ver nota de arquitectura arriba). Con la tabla vacía,
  // esta función siempre devuelve null: se calcula la condición (para
  // explicabilidad/tests) pero nunca afecta el score.
  function scoreContexto(lugar, condicion, afinidadClimaPorGrupo) {
    if (!condicion) return null;
    var tabla = afinidadClimaPorGrupo[lugar.grupo];
    if (!tabla || typeof tabla[condicion] !== 'number') return null;
    return clamp01(0.5 + tabla[condicion]);
  }

  /* ─────────────────────────────────────────────────────────────
     2. Score combinado — pesos configurables, renormalizados según
        qué señales están realmente presentes para ESTE lugar.
     ───────────────────────────────────────────────────────────── */

  /**
   * Calcula el score [0,1] de un lugar y las señales que lo componen.
   * Pura: mismos parámetros, mismo resultado siempre.
   * @param {object} lugar
   * @param {object} params — { gruposAfinesSet, estado, ubicacion,
   *   distanciaReferenciaMetros, condicionClima, pesos,
   *   afinidadClimaPorGrupo, decaimientoPorVez }
   * @returns {{score:number, señales:object}}
   */
  function calcularScore(lugar, params) {
    var señales = {};
    señales.afinidad = scoreAfinidad(lugar, params.gruposAfinesSet);
    señales.frescura = scoreFrescura(lugar, params.estado, params.decaimientoPorVez);

    var proximidad = scoreProximidad(lugar, params.ubicacion, params.distanciaReferenciaMetros);
    if (proximidad !== null) señales.proximidad = proximidad;

    var contexto = scoreContexto(lugar, params.condicionClima, params.afinidadClimaPorGrupo);
    if (contexto !== null) señales.contexto = contexto;

    var pesoTotal = 0, acumulado = 0;
    Object.keys(señales).forEach(function (clave) {
      var peso = params.pesos[clave] || 0;
      pesoTotal += peso;
      acumulado += peso * señales[clave];
    });

    return { score: pesoTotal > 0 ? acumulado / pesoTotal : 0, señales: señales };
  }

  /**
   * Conveniencia para testear/inspeccionar el score de UN lugar sin
   * pasar por toda la canalización de selección (filtro de rotación,
   * diversidad, exploración). Usa la configuración vigente de
   * motor-config.js salvo que se pase `contexto` con overrides.
   * @param {object} lugar
   * @param {object} estado
   * @param {object} [contexto] — { ubicacion, clima, ahoraMs }
   * @returns {{score:number, señales:object}}
   */
  function calcularScoreLugar(lugar, estado, contexto) {
    contexto = contexto || {};
    var ahora = numeroFinitoOr(contexto.ahoraMs, Date.now());
    var cfgScoring = CFG.exposicion.scoring;
    var afinesSet = {};
    (PLANO.gruposAfines(estado, ahora) || []).forEach(function (g) { afinesSet[g] = true; });
    return calcularScore(lugar, {
      gruposAfinesSet: afinesSet,
      estado: estado,
      ubicacion: contexto.ubicacion || null,
      distanciaReferenciaMetros: cfgScoring.proximidad.distanciaReferenciaMetros,
      condicionClima: condicionClimatica(contexto.clima),
      pesos: cfgScoring.pesos,
      afinidadClimaPorGrupo: cfgScoring.afinidadClimaPorGrupo || {},
      decaimientoPorVez: cfgScoring.frescura.decaimientoPorVez
    });
  }

  function numeroFinitoOr(v, porDefecto) {
    return (typeof v === 'number' && isFinite(v)) ? v : porDefecto;
  }

  /* ─────────────────────────────────────────────────────────────
     3. Ranking + diversidad + exploración
     ───────────────────────────────────────────────────────────── */

  // Ordena TODOS los candidatos por score descendente. Los empates se
  // desempatan barajando primero con semilla (determinístico por
  // sesión) y usando sort estable después — así el orden entre
  // iguales no depende del orden original del registro (que sesgaría
  // sistemáticamente a los primeros ids) sino de la sesión actual.
  function ordenarPorScore(candidatos, estado, afinesSet, condicion, contexto) {
    var cfgScoring = CFG.exposicion.scoring;
    var puntuados = candidatos.map(function (lugar) {
      var r = calcularScore(lugar, {
        gruposAfinesSet: afinesSet,
        estado: estado,
        ubicacion: (contexto && contexto.ubicacion) || null,
        distanciaReferenciaMetros: cfgScoring.proximidad.distanciaReferenciaMetros,
        condicionClima: condicion,
        pesos: cfgScoring.pesos,
        afinidadClimaPorGrupo: cfgScoring.afinidadClimaPorGrupo || {},
        decaimientoPorVez: cfgScoring.frescura.decaimientoPorVez
      });
      return { lugar: lugar, score: r.score, señales: r.señales };
    });
    var semilla = estado.ultimaApertura || 0;
    var mezclados = barajarConSemilla(puntuados, semilla);
    mezclados.sort(function (a, b) { return b.score - a.score; });
    return mezclados;
  }

  // Selección con tope de diversidad por rubro, con relajación
  // automática si no hay variedad suficiente entre los candidatos
  // disponibles (mismo principio que la cascada de relajación de
  // gruposAEvitar: el cupo nunca queda sin llenar por falta de
  // variedad si hay candidatos de sobra).
  function seleccionarConDiversidad(puntuados, cupo, maxPorGrupo) {
    var elegidos = [];
    var conteoPorGrupo = {};
    var descartadosPorTope = [];
    puntuados.forEach(function (item) {
      if (elegidos.length >= cupo) return;
      var grupo = item.lugar.grupo;
      var actual = conteoPorGrupo[grupo] || 0;
      if (actual < maxPorGrupo) {
        elegidos.push(item);
        conteoPorGrupo[grupo] = actual + 1;
      } else {
        descartadosPorTope.push(item);
      }
    });
    var i = 0;
    while (elegidos.length < cupo && i < descartadosPorTope.length) {
      elegidos.push(descartadosPorTope[i]);
      i++;
    }
    return elegidos;
  }

  // Pipeline completo: score → diversidad → exploración. Devuelve
  // objetos {lugar, score, señales} — quien solo necesita los lugares
  // (recortePorIniciativaPropia) los desenvuelve; quien necesita
  // explicabilidad (recortePorIniciativaPropiaExplicado) los usa tal
  // cual. Una sola implementación para ambos, para no duplicar la
  // lógica de selección entre los dos puntos de entrada públicos.
  function calcularRecorte(candidatos, estado, tamano, afinesSet, condicion, contexto) {
    var puntuados = ordenarPorScore(candidatos, estado, afinesSet, condicion, contexto);

    if (candidatos.length <= tamano) {
      return puntuados;
    }

    var cfgScoring = CFG.exposicion.scoring;
    var slotsExploracion = candidatos.length >= cfgScoring.exploracion.minCandidatosParaActivarse
      ? Math.min(Math.round(tamano * cfgScoring.exploracion.ratio), Math.max(tamano - 1, 0))
      : 0;
    var slotsRelevancia = tamano - slotsExploracion;

    var maxPorGrupo = Math.max(1, Math.ceil(tamano * cfgScoring.diversidad.maxPorGrupoRatio));
    var elegidosRelevancia = seleccionarConDiversidad(puntuados, slotsRelevancia, maxPorGrupo);

    var idsElegidos = {};
    elegidosRelevancia.forEach(function (p) { idsElegidos[p.lugar.id] = true; });
    var restantes = puntuados.filter(function (p) { return !idsElegidos[p.lugar.id]; });
    var restantesLugares = restantes.map(function (p) { return p.lugar; });

    // Semilla distinta (+1) a la del desempate de arriba: así el cupo
    // de exploración no queda correlacionado con el orden de empate
    // del ranking principal.
    var barajados = barajarConSemilla(restantesLugares, (estado.ultimaApertura || 0) + 1);
    var restantesPorId = {};
    restantes.forEach(function (p) { restantesPorId[p.lugar.id] = p; });
    var exploracionElegida = barajados.slice(0, slotsExploracion).map(function (lugar) {
      return restantesPorId[lugar.id];
    });

    return elegidosRelevancia.concat(exploracionElegida).slice(0, tamano);
  }

  /* ─────────────────────────────────────────────────────────────
     4. Candidatos: filtro de rubros evitados + descanso, con la
        misma cascada de relajación de siempre (sin cambios de
        comportamiento respecto de la versión anterior del archivo).
     ───────────────────────────────────────────────────────────── */

  function candidatosBase(registro, estado, ahora, evitar, tamano) {
    var candidatos = registro.filter(function (lugar) {
      if (evitar.indexOf(lugar.grupo) !== -1) return false;
      if (descansando(estado, lugar.id, ahora)) return false;
      return true;
    });

    if (candidatos.length < tamano) {
      candidatos = registro.filter(function (lugar) {
        return evitar.indexOf(lugar.grupo) === -1;
      });
    }
    if (candidatos.length < tamano) {
      candidatos = registro.slice();
    }
    return candidatos;
  }

  /* ─────────────────────────────────────────────────────────────
     5. API pública — Guía / Exploración: iniciativa propia
     ───────────────────────────────────────────────────────────── */

  /**
   * Recorte por iniciativa propia del sistema (Guía/Exploración),
   * ahora elegido por score en vez de solo shuffle. Contrato de
   * salida sin cambios: array plano de lugares.
   * @param {object[]} registro — catálogo completo (lugares-core.json)
   * @param {object} estado — estado de motor-plano para este contexto
   * @param {string} nombreRegion — 'guia' | 'exploracion'
   * @param {object} [contexto] — OPCIONAL, no rompe nada si se omite.
   *   { ubicacion:{lat,lng}, clima:{weather_code,temperature_2m,
   *   precipitation}, ahoraMs, diaSemana }. Este módulo nunca hace
   *   fetch ni lee geolocalización por su cuenta — todo entra ya
   *   resuelto, o no entra.
   * @returns {object[]}
   */
  function recortePorIniciativaPropia(registro, estado, nombreRegion, contexto) {
    contexto = contexto || {};
    var ahora = numeroFinitoOr(contexto.ahoraMs, Date.now());
    var evitar = PLANO.gruposAEvitar(estado, ahora);
    var afinesSet = {};
    (PLANO.gruposAfines(estado, ahora) || []).forEach(function (g) { afinesSet[g] = true; });
    var condicion = condicionClimatica(contexto.clima);

    var tamano = nombreRegion === 'guia'
      ? CFG.exposicion.recorteGuia
      : CFG.exposicion.recorteExploracion;

    var candidatos = candidatosBase(registro, estado, ahora, evitar, tamano);
    var seleccion = calcularRecorte(candidatos, estado, tamano, afinesSet, condicion, contexto);
    return seleccion.map(function (p) { return p.lugar; });
  }

  /**
   * Misma selección que `recortePorIniciativaPropia`, pero con score,
   * señales y razones legibles por lugar, más el nivel de confianza
   * de la sesión. Capa OPCIONAL y aditiva: ningún consumidor actual
   * la usa ni la necesita — pensada para cuando la UI quiera mostrar
   * "por qué te lo mostramos" sin que ese texto sea inventado.
   * @param {object[]} registro
   * @param {object} estado
   * @param {string} nombreRegion
   * @param {object} [contexto]
   * @returns {{lugares: Array<{lugar:object, score:number, señales:object, razones:string[]}>,
   *   confianza: string, tamanoObjetivo: number, candidatosEvaluados: number}}
   */
  function recortePorIniciativaPropiaExplicado(registro, estado, nombreRegion, contexto) {
    contexto = contexto || {};
    var ahora = numeroFinitoOr(contexto.ahoraMs, Date.now());
    var evitar = PLANO.gruposAEvitar(estado, ahora);
    var afinesSet = {};
    (PLANO.gruposAfines(estado, ahora) || []).forEach(function (g) { afinesSet[g] = true; });
    var condicion = condicionClimatica(contexto.clima);

    var tamano = nombreRegion === 'guia'
      ? CFG.exposicion.recorteGuia
      : CFG.exposicion.recorteExploracion;

    var candidatos = candidatosBase(registro, estado, ahora, evitar, tamano);
    var seleccion = calcularRecorte(candidatos, estado, tamano, afinesSet, condicion, contexto);

    return {
      lugares: seleccion.map(function (p) {
        return {
          lugar: p.lugar,
          score: Number(p.score.toFixed(3)),
          señales: p.señales,
          razones: razonesDesdeSeñales(p.señales)
        };
      }),
      confianza: PLANO.nivelConfianza(estado, ahora),
      tamanoObjetivo: tamano,
      candidatosEvaluados: candidatos.length
    };
  }

  // Traduce señales numéricas a razones legibles, sin inventar nada
  // que el score no respalde. Siempre devuelve al menos una razón.
  function razonesDesdeSeñales(señales) {
    var razones = [];
    if (señales.afinidad >= 1) razones.push('te interesaron lugares similares antes');
    var umbralProximidad = CFG.exposicion.scoring.explicacion.umbralProximidadRazon;
    if (typeof señales.proximidad === 'number' && señales.proximidad >= umbralProximidad) razones.push('está cerca tuyo');
    if (señales.frescura >= 1) razones.push('todavía no te lo mostramos');
    if (typeof señales.contexto === 'number') razones.push('encaja con el clima de hoy');
    if (!razones.length) razones.push('parte de la selección de hoy para vos');
    return razones;
  }

  /* ─────────────────────────────────────────────────────────────
     6. Acción Directa / Curaduría — acción explícita del usuario.
     SIN CAMBIOS respecto de la versión anterior de este archivo:
     nunca aplican presupuesto, scoring ni rotación (Blueprint v2,
     sección 4b). Ver invariantes en el encabezado.
     ───────────────────────────────────────────────────────────── */

  // Minúsculas + sin acentos. Antes solo se hacía toLowerCase(): una
  // tilde de más o de menos en "café"/"cafe" rompía el match en
  // silencio, justo el tipo de fricción que esta pasada busca sacar.
  function normalizarTexto(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  // PERF (auditoría performance, 2026-07-30): resultadosPorAccionExplicita()
  // se ejecuta una vez por cada debounce del buscador (cada 160ms mientras
  // se escribe, ver DEBOUNCE_BUSQUEDA_MS en app.js) y, sin este cache,
  // volvía a llamar normalizarTexto() — toLowerCase + normalize('NFD') +
  // regex, Unicode, no gratis — sobre nombre/categoría/dirección de los
  // ~1468 lugares del catálogo COMPLETO en cada una de esas llamadas,
  // aunque esos tres campos casi nunca cambian entre una tecla y la
  // siguiente. Medido sobre el dataset real (lugares-core.json): ~3.8ms
  // por tecla solo en normalización repetida — no es 60fps, pero si el
  // usuario escribe rápido en un dispositivo Android de gama baja
  // (varias veces más lento que el equipo de desarrollo) esto compite en
  // el mismo hilo con el render que sigue inmediatamente después.
  //
  // Se cachea por VALOR, no por identidad del objeto `lugar`: la clave es
  // el objeto (WeakMap, se libera solo si el lugar deja de referenciarse
  // en algún momento), pero cada entrada guarda también los tres strings
  // crudos que la originaron. `lugares-detalles.json` puede llenar
  // `direccion` (null → string real) después del primer render/búsqueda
  // (carga en segundo plano, ver cargarDetallesEnSegundoPlano en app.js)
  // — comparar el valor crudo en cada lookup evita servir una
  // normalización vieja de "null" una vez que la dirección real llega.
  // No se muta `lugar` en ningún momento: motor-test.js §67 ("Pureza:
  // recortePorIniciativaPropia no muta el registro de entrada") exige
  // exactamente esa propiedad para este archivo, y un cache por WeakMap
  // externo la respeta por construcción — `JSON.stringify(lugar)` da
  // igual antes y después de pasar por acá.
  var cacheNormalizacion = typeof WeakMap === 'function' ? new WeakMap() : null;
  function normalizadoDe(lugar) {
    if (!cacheNormalizacion) {
      return {
        nombre: normalizarTexto(lugar.nombre),
        categoria: normalizarTexto(lugar.categoria),
        direccion: normalizarTexto(lugar.direccion)
      };
    }
    var previo = cacheNormalizacion.get(lugar);
    if (previo &&
      previo.srcNombre === lugar.nombre &&
      previo.srcCategoria === lugar.categoria &&
      previo.srcDireccion === lugar.direccion) {
      return previo;
    }
    var entrada = {
      srcNombre: lugar.nombre,
      srcCategoria: lugar.categoria,
      srcDireccion: lugar.direccion,
      nombre: normalizarTexto(lugar.nombre),
      categoria: normalizarTexto(lugar.categoria),
      direccion: normalizarTexto(lugar.direccion)
    };
    cacheNormalizacion.set(lugar, entrada);
    return entrada;
  }

  // Rango de relevancia, de más a menos específico (0 = mejor). null
  // = no matchea nada. El orden de los checks —nombre exacto > nombre
  // empieza con > nombre contiene > categoría > dirección— es el
  // mismo criterio con el que una persona escanearía los resultados:
  // lo más parecido a lo que escribiste, primero. Rango 6 (tolerante a
  // errores tipográficos) se asigna aparte, más abajo — no es un check
  // de substring como estos, así que no vive acá.
  function rangoDeCoincidencia(nombre, categoria, direccion, q) {
    if (nombre === q) return 0;
    if (nombre.indexOf(q) === 0) return 1;
    if (nombre.indexOf(q) !== -1) return 2;
    if (categoria === q) return 3;
    if (categoria.indexOf(q) !== -1) return 4;
    if (direccion.indexOf(q) !== -1) return 5;
    return null;
  }

  // Distancia de edición (Levenshtein) acotada a `maxDistancia`: no hace
  // falta el valor exacto más allá del umbral de tolerancia, así que
  // corta apenas puede confirmar que ninguna celda de la fila actual
  // puede terminar por debajo de ese umbral — evita pagar el costo
  // O(n·m) completo en el caso común (negativo, dos palabras sin
  // relación), que es la mayoría de los candidatos difusos reales.
  function distanciaAcotada(a, b, maxDistancia) {
    if (Math.abs(a.length - b.length) > maxDistancia) return maxDistancia + 1;
    var prev = [];
    for (var j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) {
      var curr = [i];
      var minFila = curr[0];
      for (var k = 1; k <= b.length; k++) {
        var costo = a[i - 1] === b[k - 1] ? 0 : 1;
        curr[k] = Math.min(prev[k] + 1, curr[k - 1] + 1, prev[k - 1] + costo);
        if (curr[k] < minFila) minFila = curr[k];
      }
      if (minFila > maxDistancia) return maxDistancia + 1; // esta fila ya no puede mejorar
      prev = curr;
    }
    return prev[b.length];
  }

  // Cuántos errores tipográficos se toleran, en función del largo de la
  // consulta ya normalizada. Consultas de 1-3 caracteres NO toleran
  // nada: a esa longitud, "1 error" cambia el significado por completo
  // (heurística estándar tipo Elasticsearch fuzziness "AUTO").
  function toleranciaParaLongitud(len) {
    if (len < 4) return 0;
    if (len <= 6) return 1;
    return 2;
  }

  /**
   * SIGUE SIN RECORTAR NADA (Blueprint v2, sección 4b): esta función
   * devuelve el 100% de los lugares que matchean, sin presupuesto ni
   * exposición — eso no cambia. Lo que se agrega en esta pasada es
   * orden: antes el resultado salía en el orden crudo del registro
   * (esencialmente arbitrario desde la perspectiva de quien buscó);
   * ahora sale ordenado por qué tan específico es el match. Ordenar
   * quién aparece primero no es lo mismo que decidir quién no aparece
   * — el conteo total nunca cambia (ver tests §19 y §62).
   */
  function resultadosPorAccionExplicita(registro, consulta) {
    if (!consulta) return registro.slice();
    var q = normalizarTexto(consulta.trim());
    if (!q) return registro.slice();

    // PERF (2026-07-31): IndiceInvertido.candidatosPara() es un filtro
    // necesario-pero-no-suficiente por trigramas — puede traer falsos
    // positivos (se descartan abajo por rangoDeCoincidencia === null) pero
    // nunca deja afuera un match real. Si no puede ayudar (consulta de
    // 1-2 caracteres, índice sin construir todavía), devuelve `null` y acá
    // se cae al barrido completo de siempre: mismo resultado, mismo orden,
    // cero riesgo de regresión en ese camino.
    var universo = registro;
    if (global.IndiceInvertido && typeof global.IndiceInvertido.candidatosPara === 'function') {
      var reducido = global.IndiceInvertido.candidatosPara(q);
      if (reducido !== null) universo = reducido;
    }

    // Mapa lugar -> posición real en el catálogo, para que el desempate
    // por "indiceOriginal" de abajo sea idéntico exista o no reducción
    // por índice (universo puede venir en cualquier orden). Es un loop
    // trivial de asignación, no de comparación de strings — mucho más
    // barato que lo que reemplaza.
    var indiceOriginalPorLugar = new Map();
    for (var k = 0; k < registro.length; k++) indiceOriginalPorLugar.set(registro[k], k);

    var candidatos = [];
    var yaCoincide = new Set();
    for (var i = 0; i < universo.length; i++) {
      var lugar = universo[i];
      var norm = normalizadoDe(lugar);
      var rango = rangoDeCoincidencia(norm.nombre, norm.categoria, norm.direccion, q);
      if (rango === null) continue;
      candidatos.push({ lugar: lugar, rango: rango, distancia: 0, indiceOriginal: indiceOriginalPorLugar.get(lugar) });
      yaCoincide.add(lugar);
    }

    // TOLERANCIA A ERRORES TIPOGRÁFICOS (2026-07-31): tier de menor
    // prioridad (rango 6) para lugares que NO matchearon por substring
    // exacto pero cuyo nombre está a 1-2 ediciones de la consulta —
    // "pizeria" encuentra "pizzería", "eladeria" encuentra "heladería".
    // Nunca reemplaza ni reordena un match exacto (rangos 0-5): se
    // agrega al final, y solo corre si IndiceInvertido está disponible
    // — mismo criterio de "cero riesgo de regresión" que el resto de
    // este archivo (ver PERF más arriba). Sin índice, este tier
    // simplemente no se activa: la búsqueda exacta de siempre sigue
    // funcionando idéntica.
    var tolerancia = toleranciaParaLongitud(q.length);
    if (tolerancia > 0 && global.IndiceInvertido && typeof global.IndiceInvertido.candidatosDifusos === 'function') {
      var candidatosFuzzy = global.IndiceInvertido.candidatosDifusos(q, tolerancia);
      if (candidatosFuzzy) {
        for (var f = 0; f < candidatosFuzzy.length; f++) {
          var lugarF = candidatosFuzzy[f];
          if (yaCoincide.has(lugarF)) continue; // ya entró por match exacto, no se duplica ni se degrada

          var normF = normalizadoDe(lugarF);
          var tokens = normF.nombre.split(/\s+/).filter(Boolean);
          var mejorDistancia = tolerancia + 1;
          for (var t = 0; t < tokens.length; t++) {
            var token = tokens[t];
            if (Math.abs(token.length - q.length) > tolerancia) continue; // no puede estar a <= tolerancia ediciones
            var d = distanciaAcotada(q, token, tolerancia);
            if (d < mejorDistancia) mejorDistancia = d;
            if (mejorDistancia === 1) break; // no hay nada mejor que buscar (0 ya fue match exacto, descartado arriba)
          }

          if (mejorDistancia <= tolerancia) {
            candidatos.push({ lugar: lugarF, rango: 6, distancia: mejorDistancia, indiceOriginal: indiceOriginalPorLugar.get(lugarF) });
            yaCoincide.add(lugarF);
          }
        }
      }
    }

    // Desempate explícito por índice original en vez de confiar en que
    // Array.prototype.sort sea estable: mantiene el orden del catálogo
    // entre lugares con el mismo nivel de relevancia. Dentro del rango 6
    // (tolerante), además se ordena primero por distancia de edición —
    // 1 error antes que 2 — antes de caer al desempate por catálogo.
    candidatos.sort(function (a, b) {
      return (a.rango - b.rango) || (a.distancia - b.distancia) || (a.indiceOriginal - b.indiceOriginal);
    });

    return candidatos.map(function (c) { return c.lugar; });
  }

  function coleccionCurada(registro, idsGuardados) {
    var set = {};
    idsGuardados.forEach(function (id) { set[id] = true; });
    return registro.filter(function (lugar) { return !!set[lugar.id]; });
  }

  global.URU_EXPOSICION = {
    recortePorIniciativaPropia: recortePorIniciativaPropia,
    recortePorIniciativaPropiaExplicado: recortePorIniciativaPropiaExplicado,
    resultadosPorAccionExplicita: resultadosPorAccionExplicita,
    coleccionCurada: coleccionCurada,
    calcularScoreLugar: calcularScoreLugar
  };

})(typeof window !== 'undefined' ? window : global);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window.URU_EXPOSICION : global.URU_EXPOSICION);
}

/* ==== motor-mapa.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — motor-mapa.js
   El mapa-herramienta ya no es exclusivo de Acción Directa: participa
   de las cuatro regiones (Guía, Exploración, Acción Directa,
   Curaduría), mostrando siempre el mismo recorte que ya está en
   pantalla como tarjetas — nunca un conjunto aparte. La única
   condición real es que haya algo georreferenciado para mostrar.
   El mapa-textura (capa ambiental de motor-render/app.js) sigue
   siendo la única pieza no interactiva, de baja densidad.

   ───────────────────────────────────────────────────────────────────
   AUDITORÍA (motivo de cada cambio no trivial):

   BUGS REALES corregidos
   • Ninguna de las tres funciones públicas validaba coordenadas de
     verdad: `app.js` (único llamador real) filtra con
     `typeof l.lat === 'number'`, pero `typeof NaN === 'number'` es
     `true` — un lugar con lat/lng corrupto (dato mal cargado, parseo
     numérico fallido en otra capa) pasaba ese filtro y llegaba hasta
     `motor-render.js`/`proyeccion.js`, con riesgo de encuadrar o
     dibujar sobre `NaN`. Ahora las tres funciones definen y aplican
     su propia noción real de "coordenada válida" (finita y dentro de
     rango), en vez de confiar en que el llamador ya lo garantizó.
   • `puntosTextura` muestreaba el registro completo ANTES de
     descartar lugares sin coordenadas numéricas válidas — `app.js`
     recién filtra eso al pintar cada punto (`actualizarMapaTextura`).
     Con `texturaDensidadMax` en 18, un muestreo que cayera
     mayormente sobre lugares sin lat/lng (posible: el paso de
     muestreo es fijo, no aleatorio) podía dejar la textura ambiental
     con muchos menos puntos visibles que los 18 previstos, sin que
     nada lo señalara. Ahora se filtra primero, se muestrea después:
     el presupuesto de densidad siempre se gasta en puntos que
     realmente se van a poder dibujar.
   • Ninguna de las tres funciones toleraba entradas que no fueran
     arrays (`undefined`, `null`, un objeto suelto) — hoy no ocurre
     porque `app.js` siempre pasa arrays, pero un cambio futuro en el
     llamador rompería con un error críptico en vez de degradar. Se
     agregó una guarda explícita.
   • Sin chequeo de dependencia dura: si `motor-config.js` no cargaba
     antes que este archivo (típicamente un error de orden en los
     `<script>`, ver index.html sección 5 — el mismo tipo de falla que
     ya motivó agregar la guarda equivalente en motor-plano.js), el
     primer acceso a `CFG.mapa.texturaDensidadMax` rompía con un
     `TypeError` genérico ("Cannot read properties of undefined")
     lejos de la causa real. Ahora falla temprano y explícito, mismo
     criterio que ya usan motor-plano.js y motor-render.js para sus
     propias dependencias duras.

   CAPACIDADES NUEVAS (aditivas — el contrato de las tres funciones
   públicas originales no cambia para entradas ya válidas: mismo
   orden de entrada preservado, mismo tipo de retorno, mismos límites
   de motor-config.js respetados)
   • `esCoordenadaValida(lat, lng)`: la misma definición de
     "coordenada geográfica válida" que ahora también expone
     proyeccion.js — DUPLICADA a propósito, no por descuido: este
     archivo se carga ANTES que proyeccion.js (ver index.html, sección
     5, punto 6 vs punto 7), así que no puede depender de
     `URU_PROYECCION` sin invertir ese orden — un cambio de alcance
     mayor al autorizado en esta pasada, y el mismo tipo de frontera
     que ya justifica, con el mismo argumento, la duplicación puntual
     de `distanciaMetros` documentada en motor-exposicion.js. El costo
     real es una función de 4 líneas duplicada una vez; el costo de
     evitarla sería reordenar una cadena de `<script>` documentada
     como dependencia dura.
   • `tieneIdentidad(l)` / `deduplicarPorId(lista)`: elimina lugares
     con el mismo `id` repetido (dato de origen duplicado, no un
     "cluster" — eso es responsabilidad exclusiva de
     motor-render.js), preservando el orden y quedándose con la
     PRIMERA aparición. Deliberadamente NO deduplica por coordenada:
     dos lugares distintos en el mismo edificio son datos válidos, no
     un duplicado — solo la igualdad de `id` es una señal confiable
     de que es el mismo registro repetido.
   • `filtrarConCoordenadasValidas(lista)`: extraída como función
     propia (antes era lógica inline repetida con matices distintos
     en cada función) y reutilizada por las tres funciones públicas.
   • `diagnostico(lista)`: herramienta de solo lectura para QA/debug —
     cuenta total, válidos, inválidos (con hasta 5 ids de muestra para
     no volcar el registro completo a consola) y duplicados por id.
     No se conecta a ninguna UI: es información para quien depure el
     mapa, no una decisión de producto.

   Todo lo demás —el criterio de negocio de qué se muestra en cada
   región, los límites de motor-config.js, el hecho de que este
   archivo decide QUÉ pero nunca CÓMO— se mantiene exactamente igual.
   No se agregó ordenamiento por proximidad acá: la Sección 5 de la
   auditoría solicitada pregunta explícitamente dónde debe vivir esa
   lógica, y la respuesta, después de revisar motor-exposicion.js y
   app.js, es "en ninguna de las dos": app.js ya ordena por cercanía
   ANTES de llamar a `actualizarMapaHerramienta` (ver
   `ordenarPorCercania`), y la Sección 6 de la misma auditoría exige
   que el mapa "respete exactamente la selección recibida" y "nunca
   altere silenciosamente el orden cuando no corresponde". Reordenar
   acá por distancia duplicaría esa lógica Y rompería esa regla al
   mismo tiempo — se descarta con esta justificación, no por omisión.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var CFG = global.URU_CONFIG;

  if (!CFG || !CFG.mapa) {
    // Dependencia dura declarada explícitamente, mismo criterio que ya
    // usan motor-plano.js y motor-render.js para las suyas: fallar
    // temprano y con un mensaje que señale la causa real (orden de
    // <script>) en vez de un TypeError genérico más adelante, la
    // primera vez que una función de acá intente leer CFG.mapa.*.
    if (global.console) {
      console.error('URU_MAPA: falta URU_CONFIG (motor-config.js) o su sección "mapa". ' +
        'Revisá el orden de carga de los <script> — este módulo no puede calcular ' +
        'límites de densidad sin esa dependencia.');
    }
  }

  function esNumeroFinito(v) {
    return typeof v === 'number' && isFinite(v);
  }

  // Definición real de "coordenada geográfica válida": finita y
  // dentro de rango. `typeof NaN === 'number'` es `true`, así que un
  // chequeo de tipo ingenuo (el que ya hace app.js antes de llamar
  // a puntosHerramienta) deja pasar NaN — por eso este módulo no
  // confía en que el llamador ya lo filtró y aplica su propio
  // criterio, completo, en cada función pública.
  function esCoordenadaValida(lat, lng) {
    return esNumeroFinito(lat) && esNumeroFinito(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  function comoArray(lista) {
    return Array.isArray(lista) ? lista : [];
  }

  function filtrarConCoordenadasValidas(lista) {
    return comoArray(lista).filter(function (l) {
      return l && esCoordenadaValida(l.lat, l.lng);
    });
  }

  function tieneIdentidad(l) {
    return l && (typeof l.id === 'string' || typeof l.id === 'number') && l.id !== '';
  }

  // Elimina lugares con `id` repetido, preservando el orden de
  // entrada y quedándose con la primera aparición. Los lugares sin
  // `id` utilizable pasan sin tocar: sin una identidad confiable no
  // hay forma segura de decidir que dos entradas son "la misma".
  function deduplicarPorId(lista) {
    var arr = comoArray(lista);
    var vistos = Object.create(null);
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var l = arr[i];
      if (!tieneIdentidad(l)) { out.push(l); continue; }
      var clave = typeof l.id + ':' + l.id;
      if (vistos[clave]) continue;
      vistos[clave] = true;
      out.push(l);
    }
    return out;
  }

  // Puntos ambientales: muestreo estable y acotado del registro
  // completo, nunca 1.468 puntos — ver motor-config.js: mapa.texturaDensidadMax.
  // Filtra coordenadas válidas ANTES de muestrear (ver auditoría más
  // arriba): así el presupuesto de densidad nunca se gasta en un
  // lugar que después no se va a poder dibujar.
  function puntosTextura(registro) {
    var max = (CFG && CFG.mapa && CFG.mapa.texturaDensidadMax) || 0;
    var validos = filtrarConCoordenadasValidas(registro);
    if (max <= 0 || !validos.length) return [];
    if (validos.length <= max) return validos.slice();
    var paso = Math.floor(validos.length / max);
    var out = [];
    for (var i = 0; i < validos.length && out.length < max; i += paso) out.push(validos[i]);
    return out;
  }

  // Puntos herramienta: los del recorte activo de la región actual,
  // acotados por el mismo tipo de límite (mapa.herramientaRecorte) —
  // el mapa nunca muestra más lugares que los que ya están como
  // tarjetas en pantalla. Defensa en profundidad: vuelve a validar
  // coordenadas y descarta ids repetidos incluso si el llamador ya
  // filtró con un criterio más débil (ver auditoría), pero NUNCA
  // reordena — el orden de entrada (ya decidido por app.js, incluida
  // una eventual ordenación por cercanía) se preserva intacto.
  function puntosHerramienta(recorteActivo) {
    var limite = (CFG && CFG.mapa && CFG.mapa.herramientaRecorte);
    if (!esNumeroFinito(limite) || limite < 0) limite = 0;
    var validos = deduplicarPorId(filtrarConCoordenadasValidas(recorteActivo));
    return validos.slice(0, limite);
  }

  // Criterio único: que haya al menos un resultado con coordenadas
  // realmente utilizables (finitas y en rango — no solo "de tipo
  // number", ver auditoría). El presupuesto de exposición
  // (motor-exposicion.js) ya se encarga de que "resultados" nunca sea
  // el padrón entero, en ninguna región — así que este criterio no
  // necesita distinguir por región.
  function debeMostrarHerramienta(nombreRegion, resultados) {
    var arr = comoArray(resultados);
    if (!arr.length) return false;
    return arr.some(function (r) { return r && esCoordenadaValida(r.lat, r.lng); });
  }

  // Herramienta de diagnóstico de solo lectura, pensada para QA y
  // depuración manual (consola), no para ninguna decisión de negocio
  // ni ninguna UI. Da visibilidad de qué fracción de una lista
  // realmente puede llegar al mapa y por qué no llegaría el resto.
  function diagnostico(lista) {
    var arr = comoArray(lista);
    var validos = 0, invalidos = 0, muestraInvalidos = [];
    var vistos = Object.create(null), duplicados = 0;

    for (var i = 0; i < arr.length; i++) {
      var l = arr[i];
      if (l && esCoordenadaValida(l.lat, l.lng)) {
        validos++;
      } else {
        invalidos++;
        if (muestraInvalidos.length < 5) {
          muestraInvalidos.push({
            id: (l && l.id !== undefined) ? l.id : null,
            lat: l ? l.lat : undefined,
            lng: l ? l.lng : undefined
          });
        }
      }
      if (l && tieneIdentidad(l)) {
        var clave = typeof l.id + ':' + l.id;
        if (vistos[clave]) duplicados++;
        else vistos[clave] = true;
      }
    }

    return {
      total: arr.length,
      validos: validos,
      invalidos: invalidos,
      duplicadosPorId: duplicados,
      muestraInvalidos: muestraInvalidos
    };
  }

  global.URU_MAPA = {
    puntosTextura: puntosTextura,
    puntosHerramienta: puntosHerramienta,
    debeMostrarHerramienta: debeMostrarHerramienta,
    esCoordenadaValida: esCoordenadaValida,
    deduplicarPorId: deduplicarPorId,
    diagnostico: diagnostico
  };
})(typeof window !== 'undefined' ? window : global);
if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window.URU_MAPA : global.URU_MAPA);
}

/* ==== proyeccion.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — proyeccion.js
   Matemática pura de proyección Web Mercator. Sin DOM, sin efectos
   secundarios, sin dependencias. Es la única fuente de verdad para
   convertir lat/lng ⇄ pixeles de mundo en cualquier zoom (entero o
   fraccionario). Todo lo demás del motor del mapa se apoya en esto,
   nunca reimplementa la conversión por su cuenta.

   ───────────────────────────────────────────────────────────────────
   AUDITORÍA (motivo de cada cambio no trivial, para que el diff se
   entienda sin tener que reconstruirlo):

   BUGS REALES corregidos
   • `encuadrar()` no validaba los puntos de entrada: un solo lugar con
     lat/lng corrupto (NaN, string, fuera de rango) envenenaba
     silenciosamente el Math.min/Math.max de todo el lote — el mapa
     terminaba centrado en NaN,NaN sin ningún error visible. Ahora se
     filtran los puntos inválidos antes de calcular el encuadre, y si
     no queda ninguno válido se devuelve `null` (mismo contrato que ya
     existía para lista vacía — los llamadores, ver motor-render.js
     línea ~1906, ya hacen `if (!enc) return;`).
   • Puntos duplicados en la MISMA coordenada exacta (2+ lugares en el
     mismo edificio, caso real y frecuente) hacían que el bbox tuviera
     ancho/alto cero y el bucle de zoom terminara siempre en
     `zoomMax` — un zoom mucho más cercano del que tiene sentido para
     "encuadrar todo" cuando en la práctica es un único punto en
     pantalla. Ahora ese caso degenerado se trata igual que el de un
     solo punto (mismo tope de zoom "de acercamiento razonable", no
     zoomMax a ciegas).
   • El límite de latitud usado para evitar `log(0)` en la proyección
     era un valor arbitrario (`sin(lat)` clampeado a ±0.9999, ≈89.19°)
     sin relación con ningún estándar. Se reemplaza por el límite real
     de Web Mercator (±85.05112878°, el mismo que usan Google Maps,
     Bing Maps y Leaflet) aplicado sobre la LATITUD antes de proyectar
     — más principista, más fácil de razonar cerca de los polos, y
     consistente con cualquier tile provider estándar si el día de
     mañana se integra uno.
   • `encuadrar()` no validaba `ancho`/`alto`/`zoomMax`: un contenedor
     todavía sin medir (0×0, típico durante el primer frame tras un
     `hidden → visible`) o un `zoomMax` no numérico podían dejar el
     bucle de bajada de zoom en un estado indefinido. Ahora hay
     defaults y guardas explícitas.

   CAPACIDADES NUEVAS (aditivas — nadie que ya use `proyectar`,
   `desproyectar`, `puntoAPantalla`, `pantallaAPunto`, `encuadrar` o
   `clamp` ve cambiado su contrato para entradas válidas)
   • `esNumeroFinito` / `esCoordenadaValida`: validación geográfica
     centralizada (finito, rango real de lat/lng). Es la definición
     canónica de "coordenada válida" para todo lo que dependa de
     proyeccion.js.
   • `distanciaMetros`: distancia entre dos puntos lat/lng en metros
     (fórmula de Haversine). Vive acá porque es matemática geográfica
     pura, sin DOM ni estado — el mismo criterio que ya rige el resto
     del archivo. NO reemplaza la función equivalente ya existente en
     motor-exposicion.js/app.js: motor-exposicion.js se carga ANTES
     que proyeccion.js (ver index.html, sección 5, orden de <script>),
     así que no puede depender de este archivo sin invertir ese orden
     — un cambio de alcance mucho mayor que estos dos archivos y
     fuera de lo autorizado en esta pasada. Queda documentado acá para
     que un futuro consumidor que sí cargue después de proyeccion.js
     (o una futura reordenación deliberada de los <script>) no tenga
     que reimplementarla una tercera vez.

   Todo lo demás es exactamente la misma matemática que ya existía.
   No se agregó manejo de antimeridiano: URU SPOT es un catálogo de
   una sola ciudad (Concepción del Uruguay, todo el registro real
   dentro de un radio de pocos kilómetros) — construir esa lógica acá
   sería exactamente el tipo de complejidad sin sustento real que el
   resto de este repo (ver motor-config.js, sección mapa, y el
   historial de motor-render.js) deliberadamente evita. Si el catálogo
   alguna vez cruza esa frontera geográfica, es una decisión de
   producto que merece su propia pasada, no una rama defensiva muerta
   agregada "por las dudas".
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var TAM_TILE = 256;

  // Límite real de latitud de Web Mercator: más allá de esto la
  // proyección tiende a infinito. Es el mismo valor que usan Google
  // Maps, Bing Maps y Leaflet — no un número inventado para esta app.
  var LAT_MAXIMA_MERCATOR = 85.05112878;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function esNumeroFinito(v) {
    return typeof v === 'number' && isFinite(v);
  }

  // Definición canónica de "coordenada geográfica válida" para todo
  // el motor del mapa: números finitos dentro del rango real de
  // lat/lng. `NaN` pasa un chequeo ingenuo de `typeof === 'number'`
  // (typeof NaN es 'number'), por eso ese chequeo no alcanza en
  // ningún punto del sistema que decida qué se dibuja.
  function esCoordenadaValida(lat, lng) {
    return esNumeroFinito(lat) && esNumeroFinito(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  // lat/lng → pixeles de mundo en el zoom dado (puede ser fraccionario).
  // Contrato: lat/lng/zoom deben ser números finitos — este es el
  // kernel matemático de mayor frecuencia de llamada de todo el motor
  // (una vez por marcador, por frame, en motor-render.js), así que no
  // valida ni lanza en cada llamada; la validación de datos de origen
  // es responsabilidad de quien decide qué puntos llegan hasta acá
  // (motor-mapa.js). Sí protege el único caso que puede reventar la
  // matemática por sí solo: latitudes más allá del límite de Mercator.
  function proyectar(lat, lng, zoom) {
    var latSegura = clamp(lat, -LAT_MAXIMA_MERCATOR, LAT_MAXIMA_MERCATOR);
    var escala = TAM_TILE * Math.pow(2, zoom);
    var seno = Math.sin(latSegura * Math.PI / 180);
    var x = escala * (0.5 + lng / 360);
    var y = escala * (0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI));
    return { x: x, y: y };
  }

  // pixeles de mundo → lat/lng en el zoom dado
  function desproyectar(x, y, zoom) {
    var escala = TAM_TILE * Math.pow(2, zoom);
    var lng = (x / escala - 0.5) * 360;
    var n = Math.PI - 2 * Math.PI * (y / escala);
    var lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat: lat, lng: lng };
  }

  // Pixel de PANTALLA (relativo al contenedor) para un punto dado, según
  // el estado actual del viewport (centro + zoom + tamaño del contenedor)
  function puntoAPantalla(lat, lng, viewport) {
    var centro = proyectar(viewport.lat, viewport.lng, viewport.zoom);
    var p = proyectar(lat, lng, viewport.zoom);
    return {
      x: p.x - centro.x + viewport.ancho / 2,
      y: p.y - centro.y + viewport.alto / 2
    };
  }

  // Inversa: pixel de pantalla → lat/lng, dado el viewport actual
  function pantallaAPunto(x, y, viewport) {
    var centro = proyectar(viewport.lat, viewport.lng, viewport.zoom);
    return desproyectar(
      centro.x + (x - viewport.ancho / 2),
      centro.y + (y - viewport.alto / 2),
      viewport.zoom
    );
  }

  // Distancia entre dos puntos lat/lng en metros (fórmula de
  // Haversine, radio terrestre medio 6.371.000 m — misma constante que
  // ya usa el resto del sistema). Devuelve `null` ante coordenadas
  // inválidas en vez de `NaN` o lanzar: el mismo contrato de "señal
  // ausente, no señal en cero" que ya usa motor-exposicion.js para
  // proximidad, para que un futuro consumidor no tenga que reinventar
  // ese criterio.
  function distanciaMetros(lat1, lng1, lat2, lng2) {
    if (!esCoordenadaValida(lat1, lng1) || !esCoordenadaValida(lat2, lng2)) return null;
    var R = 6371000;
    var toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad;
    var dLng = (lng2 - lng1) * toRad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Tope de zoom "de acercamiento razonable" para un único punto (o un
  // grupo de puntos que ocupan el mismo lugar en el mundo): ir más allá
  // no aporta contexto real y en cambio deja al usuario sin ninguna
  // referencia de calle/entorno. Compartido entre el caso de un solo
  // punto y el caso degenerado de bbox con área cero.
  var ZOOM_ACERCAMIENTO_UN_PUNTO = 16;

  // Calcula centro + zoom entero que encuadran un conjunto de puntos
  // con un margen (padding) en pixeles, sin superar zoomMax.
  function encuadrar(puntos, ancho, alto, padding, zoomMax) {
    if (!puntos || !puntos.length) return null;

    var zMax = esNumeroFinito(zoomMax) ? zoomMax : 18;
    var pad = esNumeroFinito(padding) ? padding : 48;
    var anchoOk = esNumeroFinito(ancho) && ancho > 0 ? ancho : 0;
    var altoOk = esNumeroFinito(alto) && alto > 0 ? alto : 0;
    if (anchoOk === 0 || altoOk === 0) return null;

    // Filtra lugares con coordenadas corruptas ANTES de tocar
    // Math.min/max — un solo NaN en el lote alcanzaba, antes de esta
    // pasada, para envenenar el encuadre completo en silencio.
    var validos = puntos.filter(function (p) {
      return p && esCoordenadaValida(p.lat, p.lng);
    });
    if (!validos.length) return null;

    if (validos.length === 1) {
      return { lat: validos[0].lat, lng: validos[0].lng, zoom: Math.min(ZOOM_ACERCAMIENTO_UN_PUNTO, zMax) };
    }

    var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    validos.forEach(function (p) {
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
      minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng);
    });
    var centroLat = (minLat + maxLat) / 2, centroLng = (minLng + maxLng) / 2;

    // Bbox de área cero: todos los puntos válidos comparten exactamente
    // la misma coordenada (2+ lugares en el mismo edificio es un caso
    // real, no hipotético). Sin esto el bucle de abajo nunca encuentra
    // un `w`/`h` que exceda el contenedor y termina siempre en zMax —
    // un acercamiento mucho mayor del que tiene sentido para "esto es,
    // en la práctica, un solo punto en pantalla".
    if (minLat === maxLat && minLng === maxLng) {
      return { lat: centroLat, lng: centroLng, zoom: Math.min(ZOOM_ACERCAMIENTO_UN_PUNTO, zMax) };
    }

    var zoom;
    for (zoom = zMax; zoom > 2; zoom--) {
      var pMin = proyectar(maxLat, minLng, zoom);
      var pMax = proyectar(minLat, maxLng, zoom);
      var w = Math.abs(pMax.x - pMin.x), h = Math.abs(pMax.y - pMin.y);
      if (w <= anchoOk - pad * 2 && h <= altoOk - pad * 2) break;
    }
    return { lat: centroLat, lng: centroLng, zoom: zoom };
  }

  var API = {
    TAM_TILE: TAM_TILE,
    LAT_MAXIMA_MERCATOR: LAT_MAXIMA_MERCATOR,
    clamp: clamp,
    esNumeroFinito: esNumeroFinito,
    esCoordenadaValida: esCoordenadaValida,
    proyectar: proyectar,
    desproyectar: desproyectar,
    puntoAPantalla: puntoAPantalla,
    pantallaAPunto: pantallaAPunto,
    distanciaMetros: distanciaMetros,
    encuadrar: encuadrar
  };

  global.URU_PROYECCION = API;
})(typeof window !== 'undefined' ? window : global);
if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window.URU_PROYECCION : global.URU_PROYECCION);
}

/* ==== motor-render.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — motor-render.js
   Motor de mapa propio. No es una librería genérica envuelta: dibuja
   sus propios tiles y marcadores sobre <canvas>, con su propio
   vocabulario visual (mismos tokens de --granate / --fondo-2 que el
   resto de la interfaz), su propia interacción (pan, zoom, cluster,
   popup) y su propio puente de accesibilidad por teclado.

   No decide QUÉ mostrar — eso es responsabilidad de motor-mapa.js y
   del presupuesto de exposición. Este archivo solo sabe CÓMO
   mostrarlo. Separación deliberada: calibrar cuántos puntos van al
   mapa nunca debería requerir tocar el renderer, y cambiar cómo se
   ve un marcador nunca debería requerir tocar la regla de negocio.

   ───────────────────────────────────────────────────────────────────
   Auditoría y evolución de esta pasada (motivo de cada cambio no
   trivial, para que quien lea el diff entienda el "por qué" sin
   tener que reconstruirlo):

   BUGS REALES corregidos
   • Pan de un dedo y pellizco de dos dedos competían por el mismo
     estado de arrastre: al posar el segundo dedo, el mapa "saltaba".
     Ahora el pellizco toma el control explícitamente y el pan de un
     solo puntero queda atado a su pointerId.
   • Un tile que falla (red, 404, CORS) quedaba en blanco para
     siempre. Ahora hay un reintento con backoff y, si sigue
     fallando, el relleno base del mapa se ve en su lugar — nunca un
     hueco crudo.
   • Caché de tiles sin techo: en una sesión larga explorando mucho
     territorio, crecía sin límite. Ahora tiene un tope con desalojo
     simple (FIFO).
   • `role="application"` en el contenedor entero metía en "modo app"
     (fuera del modo de navegación normal de un lector de pantalla)
     a la lista accesible real que vive adentro. Se cambia a
     `role="region"` — el canvas sigue oculto a AT, la lista sigue
     siendo HTML normal navegable.
   • `aria-hidden="true"` + `tabIndex=0` en el canvas era una
     contradicción: el foco podía aterrizar por Tab en algo invisible
     para lectores de pantalla. Ahora `tabIndex=-1` (fuera del orden
     de tabulación, pero el mouse todavía puede enfocarlo para
     habilitar el pan por flechas a usuarios con mouse+teclado).
   • El botón de cerrar el popup era un `<div role="button">` sin
     manejo de Enter/Espacio — inaccesible por teclado. Ahora es un
     `<button>` real.
   • `requestAnimationFrame` de animación de vuelo y de ondas de clic
     no se cancelaban en `destruir()` — código zombi dibujando sobre
     un canvas ya desmontado.
   • El `devicePixelRatio` se leía una sola vez al crear el mapa; si
     cambiaba (mover la ventana a otro monitor, zoom del navegador
     sin resize del contenedor) el canvas quedaba borroso.
   • Un color mal formado en los datos (no un hex de 6 dígitos)
     rompía `parseInt` en silencio y podía dejar un marcador con un
     color previo pegado. Ahora se valida con fallback.

   RENDIMIENTO
   • Cada `pointermove` recalculaba proyección + clustering O(n²)
     completo solo para saber qué hay bajo el cursor — con miles de
     eventos de mouse por sesión, era el cuello de botella real (el
     propio motor-config.js ya advertía sobre el costo de este
     algoritmo). Ahora se cachea el resultado del último frame
     dibujado y solo se recalcula si el viewport realmente cambió.
   • La lista accesible en paralelo se reconstruía entera (con sus
     listeners) en cada llamada a `establecerPuntos`, aunque el
     conjunto de lugares no hubiera cambiado (p. ej. un re-render por
     cada tecla del buscador). Ahora se compara una huella barata y
     se salta la reconstrucción si no cambió.
   • `encuadrarTodos` volvía a animar hacia el mismo destino en cada
     llamada — visible como un "salto" del mapa en cada tecla
     tipeada en el buscador (motorMapa.encuadrarTodos se llama desde
     app.js en cada render()). Ahora se cachea el último encuadre y
     se omite la animación si el destino es esencialmente el mismo.

   ACCESIBILIDAD / UX PREMIUM
   • Anillo de foco visible en el canvas para quien navega con mouse
     y después usa flechas/teclado.
   • Escape cierra el popup y devuelve el foco a donde estaba.
   • Se respeta `prefers-reduced-motion`: sin vuelos animados ni
     ondas de clic para quien lo pidió a nivel sistema operativo.
   • Botones +/− quedan `disabled` (con `aria-disabled`) en los
     límites de zoom, en vez de no dar ninguna señal.
   • Cursor cambia a "grabbing" mientras se arrastra.
   • El pellizco de dos dedos ahora ancla el zoom al punto geográfico
     bajo el centro del pellizco (como Google/Apple Maps), no solo
     cambia el zoom con el centro del viewport fijo.
   • Relleno base sólido detrás de los tiles: nunca hay un flash de
     canvas completamente vacío mientras cargan las imágenes.
   • Mayor tolerancia de toque en pantallas táctiles (dedo ≠ cursor
     de precisión).
   • El popup se reposiciona con clamp para no salirse del
     contenedor cuando el marcador queda cerca de un borde.

   Todo lo anterior es interno a este archivo. No se tocó ningún
   otro módulo — motor-plano.js, motor-mapa.js, motor-exposicion.js,
   motor-config.js y proyeccion.js siguen siendo la misma superficie
   de integración (`URU_PROYECCION`, y la API pública
   `URU_MOTOR_MAPA_RENDER.crear(...)` con los mismos métodos:
   on / establecerPuntos / encuadrarTodos / enfocar / resaltar /
   quitarResaltado / destruir).

   ───────────────────────────────────────────────────────────────────
   SEGUNDA PASADA — sensación premium de la interacción de zoom/pan.

   Antes de tocar nada, se revisó el resto del repo (app.js,
   motor-plano.js, motor-exposicion.js, motor-mapa.js,
   motor-config.js) para calibrar esta pasada contra la escala real
   del proyecto, no una hipotética: motor-config.js documenta
   explícitamente ~1468 lugares en catálogo, un tope de 2000 puntos
   simultáneos en el mapa-herramienta, y deja escrito que indexar
   espacialmente (grid/quadtree) es intencional para "si el catálogo
   crece mucho más allá de unos pocos miles" — no ahora. Construir acá
   una arquitectura para decenas de miles de puntos sería la clase de
   volumen sin sustento real que este mismo archivo ya advierte en su
   propio historial de decisiones (ver motor-config.js, sección mapa).
   Por eso esta pasada NO toca el algoritmo de clustering ni agrega
   indexado espacial: a la escala real y proyectada del catálogo, con
   caché ya vigente entre frames, no es el cuello de botella.

   Lo que sí eran carencias reales de sensación premium, verificadas
   contra el comportamiento de referencia (Google/Apple Maps):
   • La rueda del mouse cambiaba el zoom manteniendo fijo el CENTRO
     del viewport en vez del punto bajo el cursor — explorar con la
     rueda se sentía como si el mapa se escapara. Ahora ancla al
     punto geográfico bajo el cursor (misma matemática que ya existía
     para el pellizco de dos dedos, reutilizada, no duplicada).
   • Esa misma rueda trataba un trackpad (decenas de eventos
     pequeños/segundo) igual que un mouse de scroll a clicks —
     resultado, un trackpad zoomeaba mucho más rápido y entrecortado.
     Ahora se acumula el delta y se aplica una vez por frame vía rAF.
   • El doble clic también zoomeaba con el centro del viewport fijo,
     no con el punto clickeado.
   • Soltar el mapa en medio de un arrastre lo frenaba en seco. Ahora
     tiene inercia: sigue deslizando y frena solo, con la velocidad
     real del gesto al soltar (ventana de 80ms, no el promedio de todo
     el arrastre). Se cancela automáticamente si empieza cualquier
     otra interacción que deba tomar control del viewport (pellizco,
     otro arrastre, flechas de teclado, botones +/−, vuelo animado) —
     para que inercia y esas interacciones nunca compitan por el
     mismo estado, mismo principio que ya regía pan-vs-pellizco.
   • Un pin que pasaba de no existir en pantalla a existir (un
     cluster se separa al hacer zoom, una búsqueda nueva trae
     resultados) aparecía de golpe a tamaño completo. Ahora entra con
     un scale+opacity corto (220ms, se salta con
     prefers-reduced-motion). Deliberadamente NO se aplica a clusters:
     su membership cambia en cada frame de una animación de vuelo, sin
     clave estable que no se re-dispare constantemente — aplicarlo
     ahí se hubiera visto roto (nunca terminando de asentar) en vez de
     premium, así que se dejó fuera con esa razón documentada acá en
     vez de forzarlo.

   Se evaluó y se descartó explícitamente (para que quede constancia
   de que se consideró, no que se pasó por alto):
   • Detección manual de doble-toque en touch, en paralelo al
     `dblclick` que el navegador ya sintetiza: los navegadores móviles
     actuales ya lo sintetizan de forma confiable con
     `touch-action: none` (que este mapa ya usa — ver css/mapa.css).
     Una detección propia hubiera disparado en paralelo con el manejo
     de click de marcador ya existente (abrir/cerrar popup) en el
     mismo toque, produciendo un conflicto real de estados en vez de
     una mejora — se prefirió no introducirlo antes que introducir un
     bug nuevo por sumar una función que ya cubre otro camino.
   • Indexado espacial (grid/quadtree) para el clustering — ver
     justificación de escala arriba.

   ───────────────────────────────────────────────────────────────────
   TERCERA PASADA — se releyó el repo completo (app.js, motor-mapa.js,
   proyeccion.js, motor-config.js, motor-exposicion.js, motor-plano.js,
   tests/motor-test.js) antes de tocar nada. Confirmado: motorMapa es
   un singleton lazy-inicializado una sola vez por sesión de app.js
   (nunca se destruye/recrea en producción), así que el trabajo de
   ciclo de vida de esta pasada es robustez real por si algún consumo
   futuro sí destruye/reinicializa, no una corrección de un bug ya
   observado en producción.

   GAPS REALES encontrados y resueltos:
   • Coordenadas coincidentes/casi coincidentes en un cluster: existía
     una salida funcional (lista de texto), pero sin forma espacial de
     distinguir "estos lugares están literalmente acá". Se agrega
     spiderfy — abanico de pines individuales alrededor del cluster,
     cada uno clickeable — para clusters de hasta SPIDER_MAX_MIEMBROS.
     Por encima de ese umbral, la lista sigue siendo el mejor recurso
     (un abanico de más piernas deja de ser legible).
   • Soltar un dedo de un pellizco de dos dedos dejaba el mapa quieto
     hasta que el usuario levantara el dedo restante y lo volviera a
     apoyar — el pan de un solo dedo no se reactivaba solo, a
     diferencia de Google/Apple Maps.
   • Pestaña en background: nada frenaba explícitamente las animaciones
     por tiempo (inercia, ondas, apariciones, vuelo); un rAF pausado o
     acelerado de forma impredecible por el navegador podía dejar un
     `dt` gigante en el primer frame al volver a foreground. Ahora se
     cancela todo al ocultarse y se resincroniza (o se completa
     directo al destino) al volver.
   • `entrada.onReady` (caché de tiles, a nivel de módulo) se pisaba
     solo si estaba vacío — una instancia destruida y recreada que
     pedía un tile ya en vuelo nunca se enteraba de que terminó de
     cargar. Ahora se reasigna siempre al callback más reciente.
   • Hit-testing de hover corría completo en cada `pointermove`, sin
     coalescer — con mouses/trackpads de alta frecuencia (100-1000Hz)
     eso es mucho trabajo descartado entre frame y frame. Se coalesce
     a una vez por frame vía rAF.
   • Sin indicio visual de "no hay resultados" (lista vacía) ni de
     "tiles fallando de forma sostenida" (red degradada/offline) — dos
     estados reales que antes se veían igual que un mapa cargando
     normal.

   EVALUADO Y DESCARTADO explícitamente en esta pasada:
   • Rotación del pellizco (dos dedos girando) — ningún elemento del
     mapa (pines, tiles) tiene orientación propia; rotar el mapa entero
     es una decisión de producto mayor (reescribir toda la matemática
     de proyección/dibujado para un norte no fijo) sin pedido ni
     necesidad real detrás, no una mejora incremental de este archivo.
   • Momentum configurable por el consumidor (parámetro de fricción
     expuesto en `crear(opciones)`): ningún consumidor real
     (`app.js`) necesita distinto momentum en distintos contextos —
     agregar una API que nadie va a llamar es exactamente el tipo de
     superficie sin sustento que esta pasada busca evitar.
   • Foco secuencial de marcadores dentro del propio `<canvas>` con
     flechas (independiente de la lista accesible ya existente):
     redundante con la lista accesible en paralelo, que ya expone cada
     punto sin depender del estado de clustering — agregarlo hubiera
     sido dos caminos de teclado para llegar a lo mismo.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var PROY = global.URU_PROYECCION;

  // Dependencia dura: sin proyeccion.js este módulo no puede hacer
  // nada útil. Antes de esta pasada, su ausencia rompía el script
  // entero en la primera línea con un error críptico ("Cannot read
  // properties of undefined"). Ahora se falla temprano y claro.
  if (!PROY) {
    if (global.console) {
      console.error('URU_MOTOR_MAPA_RENDER: falta URU_PROYECCION (proyeccion.js). ' +
        'Revisá el orden de carga de los <script> — este módulo no puede iniciar sin esa dependencia.');
    }
    global.URU_MOTOR_MAPA_RENDER = {
      crear: function () {
        throw new Error('URU_MOTOR_MAPA_RENDER: no se puede crear el mapa sin URU_PROYECCION cargado antes.');
      }
    };
    return;
  }

  // Voyager en vez de dark_all: mismo proveedor (CARTO/OSM), pero un
  // basemap claro con calles, nombres y puntos de referencia legibles
  // — dark_all a este tamaño quedaba casi negro y sin contraste.
  var TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  var SUBDOMINIOS = ['a', 'b', 'c', 'd'];
  var TAM_TILE = PROY.TAM_TILE;
  // Antes 10: la ventana central alcanzaba ~3.6px de radio, suficiente
  // para una inicial de letra pero no para un pictograma legible. Se
  // sube a 12 (pin ~20% más grande) y se agranda la proporción de la
  // ventana (RATIO_VENTANA) para darle al ícono el espacio que
  // necesita — ver dibujarPictogramaRubro() más abajo. La forma y el
  // resto de la identidad del pin (gota, halo, gradiente, estados) no
  // cambian, solo la escala.
  var RADIO_MARCADOR = 12;
  var RADIO_CLUSTER = 16;
  var RADIO_CLUSTER_PX = 36;
  var ZOOM_MIN = 4, ZOOM_MAX = 18;

  // ── Sistema de pictogramas por rubro (ver rubros-meta.js) ──
  // RATIO_VENTANA: qué fracción del radio del pin ocupa la ventana
  // central oscura (antes 0.36, fija inline; ahora agrandada y
  // nombrada porque el pictograma necesita más aire que una letra).
  var RATIO_VENTANA = 0.62;
  // Margen interno del ícono dentro de la ventana (0-1): 0.88 dibuja
  // el pictograma casi al borde de la ventana sin tocarlo.
  var ICONO_MARGEN = 0.88;
  var ICONO_VIEWBOX = (global.URU_RUBROS_ICONO_VIEWBOX || 24);
  var ICONO_GROSOR = (global.URU_RUBROS_ICONO_GROSOR || 1.75);
  // Cache de Path2D por string `d`: los mismos 14 paths de
  // rubros-meta.js se reutilizan en cada marcador y en cada frame —
  // no tiene sentido reconstruir el Path2D por punto ni por redibujo.
  var CACHE_PATH2D = Object.create(null);
  function obtenerPath2D(d) {
    if (!CACHE_PATH2D[d]) CACHE_PATH2D[d] = new Path2D(d);
    return CACHE_PATH2D[d];
  }

  // Constantes de calibración visual/temporal, agrupadas para que
  // ajustar un número no obligue a bucear en la lógica — mismo
  // criterio que motor-config.js aplica al resto del sistema.
  var COLOR_DEFECTO = '#C97A83';
  var COLOR_FONDO_MAPA = '#12151b';   // relleno base mientras cargan los tiles, o si fallan
  var DURACION_ONDA_MS = 550;
  var DURACION_VUELO_MS = 420;
  var MAX_TILES_EN_CACHE = 400;       // tope simple para no crecer sin límite en sesiones largas
  var REINTENTOS_TILE = 1;
  var DEMORA_REINTENTO_TILE_MS = 800;
  var RE_HEX = /^#[0-9a-fA-F]{6}$/;

  var esPunteroTosco = !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches);
  var TOLERANCIA_CLICK_PX = esPunteroTosco ? 28 : 20; // el dedo es menos preciso que un cursor

  function prefiereMovimientoReducido() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function colorSeguro(c) {
    return (typeof c === 'string' && RE_HEX.test(c)) ? c : COLOR_DEFECTO;
  }

  // RENDIMIENTO REAL (no especulativo): el catálogo usa un puñado de
  // colores por rubro (rubros-meta.js tiene ~14 entradas), pero
  // `hexARgba`/`aclarar` se llaman una vez POR MARCADOR VISIBLE EN
  // CADA FRAME — con cientos de pines en pantalla a 60fps durante un
  // pan o una animación de vuelo, eso es re-parsear el mismo puñado
  // de strings hex miles de veces por segundo. `parseInt` sobre un
  // string ya visto no cambia de resultado — es la definición de un
  // caso para memoizar. La caché es por hex crudo (sin alpha), así
  // que sirve tanto para `hexARgba` (que solo cambia la alpha, un
  // string liviano) como para `aclarar` (que si acaso solo compone el
  // rgb ya cacheado con un porcentaje).
  var CACHE_RGB = Object.create(null);
  function rgbDe(hex) {
    var c = CACHE_RGB[hex];
    if (c) return c;
    c = CACHE_RGB[hex] = {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
    return c;
  }

  // GARANTÍA ESTRUCTURAL: todo punto que llega hasta acá ya pasó por el
  // filtro de `establecerPuntos` (lat/lng numéricos y finitos — ver más
  // abajo), así que esta función SIEMPRE devuelve un link válido a la
  // ubicación real en Google Maps. A diferencia de `punto.href` (que
  // depende de que exista una ficha/slug, y puede ser null), este link
  // no depende de ningún dato opcional: es la representación directa de
  // la coordenada del pin. Por eso es la acción primaria de cada popup,
  // individual o dentro de un cluster — nunca puede faltar.
  function hrefMapsDe(p) {
    return 'https://www.google.com/maps/search/?api=1&query=' + p.lat + ',' + p.lng;
  }

  /* ── Caché de tiles con desalojo simple (FIFO) y reintento ante error ── */
  var cacheTiles = Object.create(null);
  var ordenTiles = [];

  function construirUrlTile(z, xw, y) {
    var sub = SUBDOMINIOS[(xw + y) % SUBDOMINIOS.length];
    return TILE_URL.replace('{s}', sub).replace('{z}', z).replace('{x}', xw).replace('{y}', y)
      .replace('{r}', (global.devicePixelRatio > 1 ? '@2x' : ''));
  }

  function cargarTile(z, x, y) {
    var n = Math.pow(2, z);
    var xw = ((x % n) + n) % n; // wrap horizontal
    if (y < 0 || y >= n) return null;
    var clave = z + '/' + xw + '/' + y;
    var existente = cacheTiles[clave];
    if (existente) return existente;

    var img = new Image();
    img.crossOrigin = 'anonymous';
    var entrada = { img: img, cargado: false, error: false, intentos: 0 };
    img.onload = function () { entrada.cargado = true; entrada.error = false; if (entrada.onReady) entrada.onReady(); };
    img.onerror = function () {
      entrada.cargado = false;
      entrada.error = true;
      if (entrada.intentos < REINTENTOS_TILE) {
        entrada.intentos++;
        setTimeout(function () {
          if (cacheTiles[clave] !== entrada) return; // ya fue desalojado del caché
          img.src = construirUrlTile(z, xw, y);
        }, DEMORA_REINTENTO_TILE_MS);
      }
      // Si se agotan los reintentos, no se hace nada más: dibujarTiles()
      // ya deja ver el relleno base (COLOR_FONDO_MAPA) en su lugar.
    };
    img.src = construirUrlTile(z, xw, y);

    cacheTiles[clave] = entrada;
    ordenTiles.push(clave);
    if (ordenTiles.length > MAX_TILES_EN_CACHE) {
      delete cacheTiles[ordenTiles.shift()];
    }
    return entrada;
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function crear(contenedor, opciones) {
    opciones = opciones || {};
    var emisor = {};
    (function initEmisor() {
      var listeners = Object.create(null);
      emisor.on = function (ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb); return emisor; };
      emisor.emitir = function (ev, payload) { (listeners[ev] || []).forEach(function (cb) { cb(payload); }); };
    })();

    contenedor.classList.add('uru-mapa');
    // "region", no "application": el canvas está aria-hidden (la
    // navegación real accesible es la lista paralela de abajo), así
    // que no hace falta ni conviene poner todo el contenedor en modo
    // aplicación — eso le quitaría a un lector de pantalla el modo
    // de navegación normal justo sobre la lista que sí es accesible.
    contenedor.setAttribute('role', 'region');
    contenedor.setAttribute('aria-label', opciones.ariaLabel || 'Mapa interactivo de lugares');

    var lienzo = document.createElement('canvas');
    lienzo.className = 'uru-mapa-lienzo';
    // tabIndex=-1 (no tabIndex=0): coherente con aria-hidden. Queda
    // fuera del recorrido por Tab (así un lector de pantalla nunca
    // aterriza en algo que declaramos invisible para él), pero sigue
    // siendo enfocable con clic de mouse, para que quien usa
    // mouse + teclado combinados pueda, después de hacer clic,
    // desplazarse con las flechas.
    lienzo.tabIndex = -1;
    lienzo.setAttribute('aria-hidden', 'true');
    contenedor.appendChild(lienzo);
    var ctx = lienzo.getContext('2d');

    var listaAccesible = document.createElement('ul');
    listaAccesible.className = 'uru-mapa-lista-accesible';
    listaAccesible.setAttribute('aria-label', 'Lista de lugares en el mapa');
    contenedor.appendChild(listaAccesible);

    var controles = document.createElement('div');
    controles.className = 'uru-mapa-controles';
    controles.innerHTML =
      '<button type="button" class="uru-mapa-btn" data-zoom="1" aria-label="Acercar">+</button>' +
      '<button type="button" class="uru-mapa-btn" data-zoom="-1" aria-label="Alejar">−</button>';
    contenedor.appendChild(controles);
    var btnZoomIn = controles.querySelector('[data-zoom="1"]');
    var btnZoomOut = controles.querySelector('[data-zoom="-1"]');

    var atribucion = document.createElement('div');
    atribucion.className = 'uru-mapa-atribucion';
    atribucion.innerHTML = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';
    contenedor.appendChild(atribucion);

    var popup = document.createElement('div');
    popup.className = 'uru-mapa-popup';
    popup.hidden = true;
    contenedor.appendChild(popup);

    var etiqueta = document.createElement('div');
    etiqueta.className = 'uru-mapa-etiqueta';
    etiqueta.hidden = true;
    contenedor.appendChild(etiqueta);

    // resolverVarCSS: puente de lectura hacia la capa "Tokens de
    // Canvas" de css/tokens.css (Blueprint V2 §2 — puente exclusivo
    // hacia este archivo, ningún literal hardcodeado). Generalizada
    // (Fase 4, paso 3): antes se usaba una única vez, con un nombre
    // de variable que nunca existió (--granate-clara, sin el prefijo
    // "color-" real), así que caía en silencio a su fallback
    // hardcodeado sin que nada lo señalara — el BUG REAL que motivó
    // este paso. Se agrega caché por nombre de variable dentro de
    // esta instancia de mapa: el valor de un custom property no
    // cambia durante la vida de un mismo mapa (no hay cambio de tema
    // en caliente hoy), así que releer getComputedStyle en cada
    // punto/redibujo sería trabajo repetido sin ninguna ganancia.
    // Firma sin cambios (nombre, fallback) — cualquier llamador nuevo
    // que se agregue en el paso 5 (color del mapa) puede reusarla tal
    // cual, sin duplicar esta lógica en otro punto del archivo.
    var cacheVarCSS = Object.create(null);
    function resolverVarCSS(nombre, fallback) {
      if (nombre in cacheVarCSS) return cacheVarCSS[nombre];
      var val;
      try {
        val = getComputedStyle(contenedor).getPropertyValue(nombre).trim();
      } catch (e) {
        val = '';
      }
      return (cacheVarCSS[nombre] = val || fallback);
    }
    var colorFoco = resolverVarCSS('--canvas-color-foco', '#E8A2AB');

    var viewport = { lat: opciones.lat || -32.4833, lng: opciones.lng || -58.2333, zoom: opciones.zoom || 14, ancho: 0, alto: 0 };
    var puntos = [];
    var idResaltado = null;
    var puntoResaltado = null;
    var idAbierto = null;
    var clusterAbierto = null; // { miembros: [...] } — lista de un cluster chico que no separa al hacer zoom
    var elementoFocoPrevio = null; // para devolver el foco al cerrar el popup
    var clusterResaltadoKey = null;
    var focoVisible = false;
    var ondas = []; // feedback de toque: cada clic dispara un anillo que se expande y se apaga

    // PREVENCIÓN DE MEMORY LEAKS EN REINICIALIZACIÓN REPETIDA: guard
    // central de ciclo de vida. Antes, destruir() cancelaba los
    // `requestAnimationFrame` en vuelo pero no impedía que un callback
    // asíncrono ya en camino (imagen de tile que termina de cargar
    // después de destruir, `document.fonts.ready` resuelto tarde,
    // `ResizeObserver` disparando durante el mismo tick del `disconnect`)
    // volviera a programar trabajo nuevo sobre una instancia ya muerta.
    // Cada punto de entrada asíncrono (no cada línea del archivo)
    // consulta `vivo` antes de actuar — un solo booleano en vez de
    // repetir `if (contenedorDestruido) return` disperso y fácil de
    // olvidar en el próximo callback que se agregue.
    var vivo = true;

    var establecioAlgunaVez = false; // primera vez que el consumidor llamó establecerPuntos(): distingue "todavía no se buscó nada" de "se buscó y no hay resultados"

    // ── Spiderfy: alternativa visual a la lista para clusters chicos ──
    // GAP REAL: dos o más lugares pueden compartir coordenadas exactas
    // o casi exactas (mismo edificio, galería, shopping — geocodificación
    // aproximada). Ya existía una salida funcional para ese caso
    // (abrirPopupCluster: lista con un link "Cómo llegar" por miembro),
    // pero es una lista de texto — no comunica "estos lugares están
    // literalmente acá" de forma espacial. Spiderfy expande el cluster
    // en un abanico de pines individuales alrededor de su centro, cada
    // uno clickeable como un marcador normal. No reemplaza la lista
    // (que sigue siendo el mejor recurso para clusters grandes que
    // nunca se separan, ver SPIDER_MAX_MIEMBROS más abajo) ni la lista
    // accesible en paralelo (que ya expone cada punto individual sin
    // depender del estado de clustering en absoluto).
    var spiderActivo = null; // { key, cx, cy, posiciones:[{punto,x,y,_xActual,_yActual}], inicio }
    var rafSpider = null;

    // ── Continuidad de pan al soltar un dedo de un pellizco ──
    // Ver justificación completa junto al listener de touchstart/
    // touchmove/touchend más abajo.
    var enPellizco = false;
    var panTactilUnico = null; // { id, x, y }

    // Seguido por animarA(): permite completar un vuelo instantáneamente
    // si la pestaña vuelve de segundo plano a mitad de la animación (ver
    // alCambiarVisibilidad más abajo) en vez de retomar una interpolación
    // cuyo origen temporal ya no significa nada.
    var vueloDestino = null;

    // Caché del último clustering calculado, para no repetir el
    // trabajo O(n²) de agrupar en cada movimiento de mouse — solo se
    // recalcula si el viewport (o el conjunto de puntos) cambió
    // desde el último frame dibujado.
    var ultimosClusters = [];
    var claveClusters = '';
    function clusteringVigente() {
      // PERF (auditoría performance, 2026-07-30): antes usaba `puntos.length`
      // como proxy del conjunto de puntos. Dos búsquedas/filtros distintos
      // que devuelven la MISMA CANTIDAD de resultados (común: 8 curados vs.
      // 8 filtrados) producían la misma clave sin viewport haber cambiado,
      // así que un consumidor que cacheara sobre esta clave (ver
      // clustersActuales() y dibujar() más abajo) podía reusar clusters de
      // un conjunto de lugares que ya no es el que está en pantalla.
      // `huellaListaPrevia` (ver establecerPuntos()/calcularHuella()) ya es
      // una huella real de contenido (ids en orden) que se recalcula una
      // sola vez por llamada a establecerPuntos(), no por frame — reusarla
      // acá no agrega costo por frame y cierra el hueco.
      return viewport.lat + ',' + viewport.lng + ',' + viewport.zoom + ',' +
        viewport.ancho + ',' + viewport.alto + ',' + huellaListaPrevia;
    }
    function clustersActuales() {
      var clave = clusteringVigente();
      if (clave === claveClusters) return ultimosClusters;
      var proyectados = proyectarPuntos();
      var clusters = agruparEnClusters(proyectados);
      ultimosClusters = clusters;
      claveClusters = clave;
      return clusters;
    }

    // ── Aparición de marcadores individuales ──
    // MICROINTERACCIÓN REAL (no cosmética porque sí): cuando un pin
    // pasa de no existir en pantalla a existir — un cluster se separa
    // al hacer zoom, una búsqueda nueva trae resultados que antes no
    // estaban — antes aparecía de golpe, en el mismo frame, a tamaño
    // completo. Un `scale`+`opacity` de entrada corto (220ms) comunica
    // "esto es nuevo" sin depender de leer texto, y es exactamente el
    // tipo de detalle que separa un mapa que "funciona" de uno que se
    // siente vivo.
    //
    // Deliberadamente NO se aplica esta animación a los clusters: la
    // identidad de un cluster (qué miembros lo componen) cambia en
    // cada frame de una animación de vuelo o de un pellizco continuo
    // — no hay una clave estable frame a frame sin recalcular
    // membership, y usar la posición en pantalla como clave la
    // re-dispara en cada pixel de pan. La clave de un punto individual
    // (`punto.id`) sí es 100% estable, así que solo los puntos
    // individuales entran animados; los clusters aparecen directo,
    // que es preferible a una animación que nunca llega a completarse
    // durante un vuelo.
    var DURACION_APARICION_MS = 220;
    var visiblesFramePrevio = Object.create(null); // set de ids vistos como punto individual en el último frame
    var apariciones = Object.create(null);          // id -> timestamp de cuándo empezó a aparecer
    var rafApariciones = null;
    function factorAparicion(id) {
      var inicio = apariciones[id];
      if (inicio === undefined) return 1;
      var t = (performance.now() - inicio) / DURACION_APARICION_MS;
      if (t >= 1) { delete apariciones[id]; return 1; }
      return Math.max(0, t);
    }
    function seguirApariciones() {
      if (rafApariciones !== null) return;
      rafApariciones = requestAnimationFrame(function () {
        rafApariciones = null;
        if (!vivo) return;
        var pendientes = false;
        for (var k in apariciones) { if (apariciones[k] !== undefined) { pendientes = true; break; } }
        redibujar();
        if (pendientes) seguirApariciones();
      });
    }

    var rafOndas = null;
    // PERF (auditoría performance, 2026-07-30): `dispararOnda()` llamaba
    // a `animarOndas()` de forma SÍNCRONA (no vía rAF), y `animarOndas()`
    // llamaba a `dibujar()` DIRECTO — el único de los ~8 ciclos de
    // animación de este archivo (aparición, spider, inercia, wheel,
    // hover, vuelo) que no pasa por `redibujar()`, el punto único de
    // deduplicación (rafRedibujo) que ya usan todos los demás.
    // `manejarClick()` (ver más abajo) llama `cerrarSpider()` →
    // `redibujar()`, LUEGO `dispararOnda()`, LUEGO `abrirPopup()` →
    // `redibujar()` de nuevo — es decir, CADA click sobre un marcador
    // (la interacción más frecuente de todo el mapa) disparaba:
    //   1) un `dibujar()` síncrono, en medio del handler de click,
    //      fuera de cualquier `requestAnimationFrame` — trabajo
    //      completo (clear + tiles + proyección + clustering +
    //      marcadores) potencialmente antes de que el propio
    //      `abrirPopup()` de la misma función terminara de mutar el
    //      DOM, y de cualquier forma descartado un frame después;
    //   2) en el frame siguiente, DOS dibujados más: uno por el
    //      `rafRedibujo` ya agendado por cerrarSpider/abrirPopup, y
    //      otro por el propio tick de `animarOndas()` (que sigue
    //      llamando a `dibujar()` directo) — dos redibujados
    //      idénticos del mismo frame visual, ninguno necesario más
    //      que el último.
    // Reproducción con conteo de llamadas (ver auditoría): 3 `dibujar()`
    // por click antes de este cambio, 1 después, en una réplica fiel
    // del mecanismo real (mismas guardas, mismo orden de llamadas).
    // Fix: `dispararOnda()` agenda el primer tick vía rAF en vez de
    // llamar directo, y `animarOndas()` pasa a usar `redibujar()` como
    // el resto del motor — la propia dedup de `rafRedibujo` absorbe
    // el caso (muy común) de que otra animación quiera dibujar en el
    // mismo frame. Costo: el primer frame de la onda se ve 1 frame
    // (~16ms) más tarde — mismo delay de arranque que ya tienen
    // aparición, spider y hover; imperceptible e inaudible frente a
    // los 400ms de duración total de la animación.
    function dispararOnda(x, y, color) {
      if (prefiereMovimientoReducido()) return; // el estado (popup, tarjeta resaltada) ya comunica la acción sin necesidad de animación
      ondas.push({ x: x, y: y, inicio: performance.now(), color: colorSeguro(color) });
      if (rafOndas === null) rafOndas = requestAnimationFrame(animarOndas);
    }
    function animarOndas() {
      if (!vivo || !ondas.length) { rafOndas = null; return; }
      var ahora = performance.now();
      ondas = ondas.filter(function (o) { return ahora - o.inicio < DURACION_ONDA_MS; });
      redibujar();
      rafOndas = ondas.length ? requestAnimationFrame(animarOndas) : null;
    }
    function dibujarOndas() {
      var ahora = performance.now();
      ondas.forEach(function (o) {
        var t = Math.min(1, (ahora - o.inicio) / DURACION_ONDA_MS);
        var e = 1 - Math.pow(1 - t, 2);
        ctx.beginPath();
        ctx.arc(o.x, o.y, 6 + e * 34, 0, Math.PI * 2);
        ctx.strokeStyle = hexARgba(o.color, (1 - t) * 0.65);
        ctx.lineWidth = 2.5;
        ctx.stroke();
      });
    }
    var dpr = 1; // se recalcula en cada medir(), no queda pegado al valor de creación
    var animacionZoom = null;

    function medir() {
      dpr = Math.max(1, global.devicePixelRatio || 1);
      var rect = contenedor.getBoundingClientRect();
      viewport.ancho = rect.width;
      viewport.alto = rect.height;
      lienzo.width = Math.round(rect.width * dpr);
      lienzo.height = Math.round(rect.height * dpr);
      lienzo.style.width = rect.width + 'px';
      lienzo.style.height = rect.height + 'px';
    }

    var rafRedibujo = null;
    function redibujar() {
      if (!vivo || rafRedibujo !== null) return;
      rafRedibujo = requestAnimationFrame(function () { rafRedibujo = null; if (vivo) dibujar(); });
    }

    function dibujar() {
      if (!vivo || !viewport.ancho || !viewport.alto) return;
      try {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, viewport.ancho, viewport.alto);
        dibujarTiles();
        if (puntos.length === 0) {
          dibujarEstadoVacio();
        } else {
          var proyectados = proyectarPuntos();
          // PERF (auditoría performance, 2026-07-30): agruparEnClusters() es
          // O(n²) (comentario original en su definición) y ya existía
          // clustersActuales()/claveClusters/ultimosClusters exactamente
          // para no repetir ese trabajo cuando el viewport y el conjunto de
          // puntos no cambiaron entre frames — pero dibujar(), que es el
          // ÚNICO llamador real del loop de rAF (pan, zoom, inercia, ondas
          // de clic, aparición de marcador, spider — ver los ~10 puntos de
          // requestAnimationFrame de este archivo, todos terminan acá),
          // nunca lo usaba: llamaba a agruparEnClusters() directo, siempre,
          // incondicionalmente. El cache existía pero protegía al
          // consumidor equivocado (solo lo leía el hit-testing de hover,
          // clustersActuales() en buscarMarcadorEn()). Con el viewport
          // estático durante cualquier animación (onda de clic ~400ms,
          // aparición de marcador 220ms, spider), esto repetía el O(n²)
          // completo en cada uno de esos frames sin que ni `viewport` ni
          // los puntos hubieran cambiado un solo bit.
          var claveActual = clusteringVigente();
          var clusters;
          if (claveActual === claveClusters) {
            clusters = ultimosClusters;
          } else {
            clusters = agruparEnClusters(proyectados);
            ultimosClusters = clusters;
            claveClusters = claveActual;
          }
          dibujarMarcadores(clusters);
          dibujarSpider();
          posicionarPopupAbierto(proyectados, clusters);
          posicionarEtiqueta(proyectados);
        }
        dibujarOndas();
        dibujarBadgeDegradado();
        if (focoVisible) dibujarAnilloFoco();
        actualizarEstadoControles();
      } catch (err) {
        // Un frame roto no debería dejar el mapa muerto para el resto
        // de la sesión: se registra y se sigue intentando en el
        // próximo redibujar().
        if (global.console) console.error('URU_MOTOR_MAPA_RENDER: error al dibujar un frame — se omite.', err);
      }
    }

    function dibujarAnilloFoco() {
      ctx.save();
      ctx.strokeStyle = colorFoco;
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, Math.max(0, viewport.ancho - 4), Math.max(0, viewport.alto - 4));
      ctx.restore();
    }

    function actualizarEstadoControles() {
      if (btnZoomIn) {
        var enMax = viewport.zoom >= ZOOM_MAX - 0.001;
        btnZoomIn.disabled = enMax;
        btnZoomIn.setAttribute('aria-disabled', String(enMax));
      }
      if (btnZoomOut) {
        var enMin = viewport.zoom <= ZOOM_MIN + 0.001;
        btnZoomOut.disabled = enMin;
        btnZoomOut.setAttribute('aria-disabled', String(enMin));
      }
    }

    // BUG REAL corregido (reinicialización repetida): `cacheTiles` es un
    // caché a nivel de MÓDULO, compartido entre cualquier instancia que
    // haya pedido ese tile — no se limpia al destruir una instancia,
    // deliberadamente (otra instancia futura reutiliza tiles ya
    // descargados). Pero `entrada.onReady` guardaba el callback de
    // redibujo de la PRIMERA instancia que lo pidió, y `if (!entrada.
    // onReady)` nunca lo actualizaba después: si esa instancia se
    // destruía y una instancia nueva pedía el mismo tile todavía en
    // vuelo, la nueva instancia nunca se enteraba de que terminó de
    // cargar (quedaba con el hueco de fondo hasta el próximo redibujo
    // por otro motivo). Ahora se pisa siempre con el callback más
    // reciente — el único que puede importarle a alguien vivo.
    var degradacionTiles = false;
    var degradacionTilesPrevia = false;
    function dibujarTiles() {
      // Relleno base primero: así un tile que todavía no cargó, o que
      // falló definitivamente, nunca deja un hueco crudo — se ve el
      // fondo del mapa en su lugar.
      ctx.fillStyle = resolverVarCSS('--canvas-color-fondo-mapa', COLOR_FONDO_MAPA);
      ctx.fillRect(0, 0, viewport.ancho, viewport.alto);

      var zTiles = PROY.clamp(Math.round(viewport.zoom), ZOOM_MIN, ZOOM_MAX);
      var escalaExtra = Math.pow(2, viewport.zoom - zTiles);
      var centroMundo = PROY.proyectar(viewport.lat, viewport.lng, zTiles);
      var origenX = centroMundo.x - (viewport.ancho / 2) / escalaExtra;
      var origenY = centroMundo.y - (viewport.alto / 2) / escalaExtra;

      var tileX0 = Math.floor(origenX / TAM_TILE) - 1;
      var tileY0 = Math.floor(origenY / TAM_TILE) - 1;
      var tileX1 = Math.ceil((origenX + viewport.ancho / escalaExtra) / TAM_TILE) + 1;
      var tileY1 = Math.ceil((origenY + viewport.alto / escalaExtra) / TAM_TILE) + 1;

      var totalTiles = 0, tilesFallidos = 0;
      for (var tx = tileX0; tx <= tileX1; tx++) {
        for (var ty = tileY0; ty <= tileY1; ty++) {
          var entrada = cargarTile(zTiles, tx, ty);
          if (!entrada) continue;
          totalTiles++;
          var sx = (tx * TAM_TILE - origenX) * escalaExtra;
          var sy = (ty * TAM_TILE - origenY) * escalaExtra;
          var s = TAM_TILE * escalaExtra;
          if (entrada.cargado) {
            ctx.drawImage(entrada.img, sx, sy, s, s);
          } else {
            entrada.onReady = redibujar;
            if (entrada.error && entrada.intentos >= REINTENTOS_TILE) tilesFallidos++;
          }
        }
      }
      // ESTADO DEGRADADO REAL: no un solo tile suelto (una request
      // puede fallar por ruido de red sin que signifique nada), sino
      // una fracción sostenida del viewport visible sin poder cargar
      // tras agotar reintentos. El umbral de 4 tiles totales evita
      // falsos positivos con muy poca superficie de mapa en pantalla
      // (por ejemplo, un contenedor chico en un zoom alto).
      degradacionTiles = totalTiles >= 4 && (tilesFallidos / totalTiles) > 0.6;
      if (degradacionTiles !== degradacionTilesPrevia) {
        degradacionTilesPrevia = degradacionTiles;
        emisor.emitir(degradacionTiles ? 'tilesDegradados' : 'tilesRecuperados');
      }
    }

    // Insignia discreta, no bloqueante: comunica degradación sin
    // interrumpir pan/zoom/click, que siguen funcionando sobre el
    // relleno base. Se recalcula cada frame contra `degradacionTiles`,
    // así que desaparece sola en cuanto la red se recupera — sin
    // ningún estado que haya que "limpiar" a mano.
    function dibujarBadgeDegradado() {
      if (!degradacionTiles || viewport.ancho < 140) return;
      var texto = 'Conexión limitada al mapa';
      ctx.save();
      ctx.font = '600 11px "IBM Plex Sans", sans-serif';
      var anchoTexto = ctx.measureText(texto).width;
      var w = Math.min(viewport.ancho - 16, anchoTexto + 24);
      var h = 24;
      var x = 8, y = viewport.alto - h - 8;
      ctx.fillStyle = resolverVarCSS('--canvas-color-superficie-flotante', 'rgba(10,13,19,.78)');
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, 6); else ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.fillStyle = resolverVarCSS('--canvas-color-texto-pin', '#ECEDEF');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(texto, x + 10, y + h / 2 + 1, w - 16);
      ctx.restore();
    }

    // RENDIMIENTO REAL: `proyectarPuntos()` corre en CADA frame
    // dibujado (no solo cuando cambia el clustering — `dibujar()` la
    // llama directo, y `clustersActuales()` la llama cuando el
    // clustering está desactualizado). La versión anterior hacía
    // `.map().filter()`: dos arrays nuevos más un objeto literal por
    // punto, EN CADA frame, incluyendo un pan simple a 60fps con el
    // catálogo completo en pantalla. Con miles de redibujados por
    // sesión eso es presión de GC real, no cosmética — el recolector
    // de basura pausando el hilo principal es exactamente el tipo de
    // "stutter" que rompe la sensación de fluidez que esta pasada
    // busca. Se reemplaza por un buffer reutilizado entre frames: se
    // sobreescriben los mismos objetos en vez de crear otros nuevos, y
    // el array se trunca con `.length = n` en vez de descartarse.
    // Es seguro porque ningún consumidor retiene una referencia al
    // array o a sus objetos más allá del mismo tick en que se pidió
    // (se lee y se descarta dentro de `dibujar()`/`clustersActuales()`
    // — nunca se guarda en una variable de instancia ni se pasa a un
    // callback diferido).
    // ESTADO VACÍO REAL: antes, una lista de resultados vacía dejaba el
    // mapa mostrando solo tiles y ningún indicio de por qué no hay
    // pines — indistinguible de "todavía no cargó nada". Se muestra
    // solo después de que `establecerPuntos` se llamó al menos una vez
    // (así el primer montado del mapa, antes de la primera búsqueda
    // real, no parpadea este mensaje).
    function dibujarEstadoVacio() {
      if (!establecioAlgunaVez) return;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = resolverVarCSS('--canvas-color-texto-pin', '#ECEDEF');
      ctx.font = '600 13px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Sin lugares para mostrar en esta vista', viewport.ancho / 2, viewport.alto / 2);
      ctx.restore();
    }

    var bufferProyectados = [];
    function proyectarPuntos() {
      var n = 0;
      for (var i = 0; i < puntos.length; i++) {
        var p = puntos[i];
        var xy = PROY.puntoAPantalla(p.lat, p.lng, viewport);
        if (xy.x > -40 && xy.x < viewport.ancho + 40 && xy.y > -40 && xy.y < viewport.alto + 40) {
          var slot = bufferProyectados[n];
          if (!slot) { slot = bufferProyectados[n] = {}; }
          slot.punto = p; slot.x = xy.x; slot.y = xy.y;
          n++;
        }
      }
      bufferProyectados.length = n;
      return bufferProyectados;
    }

    // Clustering por grilla en espacio de pantalla: solo agrupa cuando
    // hay verdadero solapamiento visual, no por regla arbitraria de zoom.
    function agruparEnClusters(proyectados) {
      var usados = new Array(proyectados.length);
      var resultado = [];
      for (var i = 0; i < proyectados.length; i++) {
        if (usados[i]) continue;
        var grupo = [proyectados[i]];
        usados[i] = true;
        for (var j = i + 1; j < proyectados.length; j++) {
          if (usados[j]) continue;
          var dx = proyectados[i].x - proyectados[j].x;
          var dy = proyectados[i].y - proyectados[j].y;
          if (Math.sqrt(dx * dx + dy * dy) < RADIO_CLUSTER_PX) { grupo.push(proyectados[j]); usados[j] = true; }
        }
        if (grupo.length === 1) {
          resultado.push({ tipo: 'punto', x: grupo[0].x, y: grupo[0].y, punto: grupo[0].punto });
        } else {
          var cx = grupo.reduce(function (s, g) { return s + g.x; }, 0) / grupo.length;
          var cy = grupo.reduce(function (s, g) { return s + g.y; }, 0) / grupo.length;
          resultado.push({ tipo: 'cluster', x: cx, y: cy, miembros: grupo.map(function (g) { return g.punto; }) });
        }
      }
      return resultado;
    }

    function dibujarMarcadores(clusters) {
      var visiblesEsteFrame = Object.create(null);
      var reducido = prefiereMovimientoReducido();
      var hayNuevos = false;
      clusters.forEach(function (c) {
        if (c.tipo === 'cluster') { dibujarCluster(c); return; }
        var id = c.punto.id;
        visiblesEsteFrame[id] = true;
        if (!reducido && visiblesFramePrevio[id] === undefined && apariciones[id] === undefined) {
          // No es el primer frame del mapa entero (huellaListaPrevia ya
          // se habría poblado) y el punto no estaba en el frame
          // anterior: es una aparición real, no el dibujado inicial en
          // frío, que se ve mejor a tamaño completo desde el primer
          // frame en vez de animar 220ms antes de mostrar el estado
          // inicial del mapa.
          if (huboFramePrevioConPuntos) { apariciones[id] = performance.now(); hayNuevos = true; }
        }
        var esResaltado = id === idResaltado;
        var esAbierto = id === idAbierto;
        dibujarMarcador(c.x, c.y, c.punto, esResaltado || esAbierto, reducido ? 1 : factorAparicion(id));
      });
      visiblesFramePrevio = visiblesEsteFrame;
      huboFramePrevioConPuntos = true;
      if (hayNuevos) seguirApariciones();
    }
    var huboFramePrevioConPuntos = false;

    // Pin con forma de gota — silueta reconocible de "lugar en un mapa",
    // no una bolita genérica. El color codifica el rubro (ver
    // rubros-meta.js) para que de un vistazo se distinga qué es qué,
    // igual que la franja de color de la etiqueta de rubro en las
    // tarjetas. Además de color, la ventana central lleva el
    // pictograma del rubro (antes una inicial de letra): el color
    // solo no alcanza (dos rubros pueden quedar parecidos en un mapa
    // oscuro, y no es accesible para daltonismo) — el ícono es un
    // segundo canal de distinción que no depende del color, y además
    // se reconoce más rápido que una letra sola.
    function dibujarMarcador(x, y, punto, activo, factorEntrada) {
      var color = colorSeguro(punto && punto.color);
      var r = activo ? RADIO_MARCADOR + 2.5 : RADIO_MARCADOR;
      var f = factorEntrada === undefined ? 1 : factorEntrada;
      ctx.save();
      if (f < 1) {
        // easeOutCubic manual (evitar la dependencia de la función de
        // animación de vuelo, que vive más abajo en el archivo y está
        // pensada para t de 0 a 1 sobre coordenadas geográficas, no
        // sobre una escala de dibujo): entra "creciendo un poco de
        // más" y asentando, en vez de una interpolación lineal que se
        // percibe mecánica.
        var e = 1 - Math.pow(1 - f, 3);
        ctx.globalAlpha = e;
        ctx.translate(x, y);
        ctx.scale(0.5 + e * 0.5, 0.5 + e * 0.5);
        ctx.translate(-x, -y);
      }
      if (activo) {
        ctx.beginPath();
        ctx.arc(x, y, r + 9, 0, Math.PI * 2);
        ctx.fillStyle = hexARgba(color, 0.22);
        ctx.fill();
      }
      ctx.translate(x, y);
      ctx.beginPath();
      // Cabeza circular del pin + punta triangular hacia abajo
      ctx.arc(0, -r * 0.35, r, Math.PI * 0.08, Math.PI * 0.92, true);
      ctx.lineTo(0, r * 1.55);
      ctx.closePath();
      var grad = ctx.createLinearGradient(0, -r * 1.3, 0, r * 1.55);
      grad.addColorStop(0, aclarar(color, 18));
      grad.addColorStop(1, color);
      ctx.fillStyle = grad;
      ctx.shadowColor = resolverVarCSS('--canvas-color-sombra-marcador', 'rgba(0,0,0,.45)');
      ctx.shadowBlur = activo ? 10 : 5;
      ctx.shadowOffsetY = 2;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = activo ? 2.5 : 2;
      ctx.strokeStyle = resolverVarCSS('--canvas-color-texto-pin', '#ECEDEF');
      ctx.stroke();
      // Centro claro: hace de "ventana" del pin, referencia visual de
      // mapas profesionales (Google/Apple Maps usan el mismo recurso)
      var rVentana = r * RATIO_VENTANA;
      ctx.beginPath();
      ctx.arc(0, -r * 0.35, rVentana, 0, Math.PI * 2);
      ctx.fillStyle = resolverVarCSS('--canvas-color-cluster-fondo', '#0A0D13');
      ctx.fill();
      // Pictograma del rubro dentro de la ventana — segundo canal de
      // distinción además del color (ver comentario arriba: dos
      // rubros pueden quedar parecidos en un mapa oscuro, y el color
      // solo no es accesible para daltonismo).
      dibujarPictogramaRubro(punto, r, rVentana, color);
      ctx.restore();
    }

    // Dibuja el pictograma vectorial de rubros-meta.js dentro de la
    // ventana del pin. Un solo `d` (mismo string que consume el <svg>
    // del lado DOM vía URU_RUBROS_ICONO_SVG) se reutiliza acá tal
    // cual con Path2D — sin duplicar la geometría del ícono en dos
    // formatos ni depender de una librería de íconos.
    // Si el punto no trae `rubroIcono` (rubro nuevo que todavía no
    // tiene pictograma cargado en rubros-meta.js), se cae de nuevo a
    // la inicial de letra: el pin nunca queda con la ventana vacía.
    function dibujarPictogramaRubro(punto, r, rVentana, color) {
      var pathD = punto && punto.rubroIcono;
      if (pathD) {
        var escala = (rVentana * 2 * ICONO_MARGEN) / ICONO_VIEWBOX;
        ctx.save();
        ctx.translate(0, -r * 0.35);
        ctx.scale(escala, escala);
        ctx.translate(-ICONO_VIEWBOX / 2, -ICONO_VIEWBOX / 2);
        ctx.lineWidth = ICONO_GROSOR;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = color;
        ctx.stroke(obtenerPath2D(pathD));
        ctx.restore();
        return;
      }
      if (punto && punto.rubroNombre) {
        var inicial = String(punto.rubroNombre).trim().charAt(0).toUpperCase();
        ctx.fillStyle = color;
        ctx.font = '700 ' + Math.round(rVentana * 1.05) + 'px "IBM Plex Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(inicial, 0, -r * 0.35 + 0.5);
      }
    }

    function hexARgba(hex, alpha) {
      var c = rgbDe(hex);
      return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
    }
    function aclarar(hex, pct) {
      var c = rgbDe(hex);
      var r = Math.min(255, c.r + pct * 2.55), g = Math.min(255, c.g + pct * 2.55), b = Math.min(255, c.b + pct * 2.55);
      return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
    }

    // Antes: todo cluster era el mismo círculo bordó, sin importar qué
    // rubros agrupaba — indistinguible de otro cluster, y del resto de
    // los pines. Ahora el cluster hereda el color de los rubros que
    // agrupa: si todos sus miembros son del mismo rubro, se rellena con
    // ese color (mismo código que un pin individual); si mezcla rubros,
    // se deja neutro pero con el borde en el color dominante, para que
    // "mixto" también se lea de un vistazo en vez de camuflarse.
    function dibujarCluster(c) {
      var conteo = Object.create(null);
      c.miembros.forEach(function (m) {
        var col = colorSeguro(m && m.color);
        conteo[col] = (conteo[col] || 0) + 1;
      });
      var colores = Object.keys(conteo).sort(function (a, b) { return conteo[b] - conteo[a]; });
      var colorDominante = colores[0];
      var esUnRubro = colores.length === 1;

      var r = RADIO_CLUSTER;
      var esResaltado = clusterResaltadoKey === (Math.round(c.x) + ':' + Math.round(c.y));
      var rGlow = r + (esResaltado ? 11 : 7);
      // Halo de luz detrás del cluster — sin esto el círculo quedaba
      // plano contra el tile pálido del basemap y se perdía. Con el
      // halo, el mismo cluster "flota" sobre el mapa.
      ctx.beginPath();
      ctx.arc(c.x, c.y, rGlow, 0, Math.PI * 2);
      ctx.fillStyle = hexARgba(colorDominante, esResaltado ? 0.35 : 0.22);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      var gradCluster = ctx.createRadialGradient(c.x - r * 0.3, c.y - r * 0.3, 1, c.x, c.y, r);
      if (esUnRubro) {
        gradCluster.addColorStop(0, aclarar(colorDominante, 22));
        gradCluster.addColorStop(1, colorDominante);
      } else {
        gradCluster.addColorStop(0, resolverVarCSS('--canvas-color-cluster-mixto-inicio', 'rgba(32,38,50,.96)'));
        gradCluster.addColorStop(1, resolverVarCSS('--canvas-color-cluster-mixto-fin', 'rgba(14,17,24,.96)'));
      }
      ctx.fillStyle = gradCluster;
      ctx.shadowColor = resolverVarCSS('--canvas-color-sombra-marcador', 'rgba(0,0,0,.4)');
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 1;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = esUnRubro ? resolverVarCSS('--canvas-color-texto-pin', '#ECEDEF') : colorDominante;
      ctx.stroke();
      ctx.fillStyle = esUnRubro ? resolverVarCSS('--canvas-color-cluster-fondo', '#0A0D13') : resolverVarCSS('--canvas-color-texto-pin', '#ECEDEF');
      ctx.font = '700 12px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(c.miembros.length), c.x, c.y + 1);
    }

    // Radio del primer anillo del abanico, separación entre anillos si
    // hace falta más de uno, y cuántas piernas caben cómodas en un
    // solo anillo sin que los pines se toquen entre sí (calibrado
    // contra RADIO_MARCADOR: con 8 piernas en el primer anillo, el
    // espacio entre pines vecinos es cómodamente mayor a su diámetro).
    var SPIDER_RADIO_BASE = 34;
    var SPIDER_RADIO_PASO = 26;
    var SPIDER_MAX_POR_ANILLO = 8;
    // Por encima de esta cantidad de miembros, un abanico deja de ser
    // más legible que la lista de texto (demasiadas piernas cortas y
    // pines superpuestos) — la lista (abrirPopupCluster) sigue siendo
    // el mejor recurso para esos casos, igual que antes de esta pasada.
    var SPIDER_MAX_MIEMBROS = 14;
    var DURACION_SPIDER_MS = 240;

    function claveCluster(c) { return Math.round(c.x) + ':' + Math.round(c.y); }

    function calcularPosicionesSpider(c) {
      var n = c.miembros.length;
      var posiciones = new Array(n);
      for (var i = 0; i < n; i++) {
        var anillo = Math.floor(i / SPIDER_MAX_POR_ANILLO);
        var idxEnAnillo = i % SPIDER_MAX_POR_ANILLO;
        var totalEnEsteAnillo = Math.min(SPIDER_MAX_POR_ANILLO, n - anillo * SPIDER_MAX_POR_ANILLO);
        var angulo = (idxEnAnillo / totalEnEsteAnillo) * Math.PI * 2 - Math.PI / 2;
        var radio = SPIDER_RADIO_BASE + anillo * SPIDER_RADIO_PASO;
        posiciones[i] = {
          punto: c.miembros[i],
          x: c.x + Math.cos(angulo) * radio,
          y: c.y + Math.sin(angulo) * radio
        };
      }
      return posiciones;
    }

    function abrirSpider(c) {
      cerrarPopup();
      spiderActivo = { key: claveCluster(c), cx: c.x, cy: c.y, posiciones: calcularPosicionesSpider(c), inicio: performance.now() };
      if (prefiereMovimientoReducido()) redibujar(); else animarSpider();
    }
    function cerrarSpider() {
      if (!spiderActivo) return;
      spiderActivo = null;
      redibujar();
    }
    function animarSpider() {
      if (rafSpider !== null) return;
      rafSpider = requestAnimationFrame(function () {
        rafSpider = null;
        if (!vivo || !spiderActivo) return;
        redibujar();
        var t = (performance.now() - spiderActivo.inicio) / DURACION_SPIDER_MS;
        if (t < 1) animarSpider();
      });
    }
    // Piernas del abanico (líneas finas centro→pin) + los pines
    // individuales, dibujados encima del cluster que sigue actuando de
    // "eje" visual del abanico — mismo recurso que usan Leaflet/Google
    // Maps: el cluster no desaparece, se queda como centro de anclaje.
    function dibujarSpider() {
      if (!spiderActivo) return;
      var t = prefiereMovimientoReducido() ? 1 : Math.min(1, (performance.now() - spiderActivo.inicio) / DURACION_SPIDER_MS);
      var e = easeOutCubic(t);
      ctx.save();
      ctx.strokeStyle = resolverVarCSS('--canvas-color-trazo-conexion', 'rgba(236,237,239,.55)');
      ctx.lineWidth = 1.5;
      spiderActivo.posiciones.forEach(function (pos) {
        var px = spiderActivo.cx + (pos.x - spiderActivo.cx) * e;
        var py = spiderActivo.cy + (pos.y - spiderActivo.cy) * e;
        pos._xActual = px; pos._yActual = py;
        ctx.beginPath();
        ctx.moveTo(spiderActivo.cx, spiderActivo.cy);
        ctx.lineTo(px, py);
        ctx.stroke();
      });
      ctx.restore();
      spiderActivo.posiciones.forEach(function (pos) {
        var esResaltado = pos.punto.id === idResaltado || pos.punto.id === idAbierto;
        dibujarMarcador(pos._xActual, pos._yActual, pos.punto, esResaltado, e);
      });
    }

    /* ── Interacción: pan + zoom (mouse, touch, rueda, teclado) ── */
    var arrastrando = false, ultimoX = 0, ultimoY = 0, sePanneo = false;
    var pointerActivoId = null; // solo un puntero controla el pan a la vez

    // ── Inercia de arrastre (momentum) ──
    // GAP REAL DE PRODUCTO: al soltar el dedo/mouse en pleno arrastre,
    // el mapa se detenía en seco — funcional, pero se siente "pesado"
    // comparado con cualquier mapa o lista con scroll nativo, donde el
    // contenido sigue deslizando y frena solo. Se guarda una ventana
    // corta de las últimas muestras de movimiento (tiempo + delta) y,
    // al soltar, se estima la velocidad instantánea real (no el
    // promedio de todo el gesto, que diluiría un frenado intencional
    // justo antes de soltar) para decidir si vale la pena seguir
    // deslizando y con cuánta fuerza.
    var MUESTRAS_INERCIA_MAX = 6;
    var muestrasMovimiento = [];
    var inerciaRAF = null;
    function registrarMuestra(x, y) {
      var ahora = performance.now();
      muestrasMovimiento.push({ t: ahora, x: x, y: y });
      if (muestrasMovimiento.length > MUESTRAS_INERCIA_MAX) muestrasMovimiento.shift();
    }
    function cancelarInercia() {
      if (inerciaRAF !== null) { cancelAnimationFrame(inerciaRAF); inerciaRAF = null; }
    }
    function iniciarInercia() {
      if (prefiereMovimientoReducido() || muestrasMovimiento.length < 2) return;
      var reciente = muestrasMovimiento[muestrasMovimiento.length - 1];
      // Se busca la muestra más vieja dentro de los últimos 80ms: una
      // ventana corta refleja el gesto real al soltar, no el arrastre
      // completo (que puede haber sido lento al principio y rápido al
      // final, o viceversa).
      var base = reciente;
      for (var i = muestrasMovimiento.length - 2; i >= 0; i--) {
        base = muestrasMovimiento[i];
        if (reciente.t - base.t >= 80) break;
      }
      var dt = reciente.t - base.t;
      if (dt <= 0) return;
      var vx = (reciente.x - base.x) / dt; // px/ms
      var vy = (reciente.y - base.y) / dt;
      var velocidad = Math.sqrt(vx * vx + vy * vy);
      if (velocidad < 0.04) return; // gesto casi estático al soltar: no vale la pena animar
      // Techo de velocidad: un pellizco/arrastre muy brusco no debería
      // catapultar el mapa a un pan absurdamente largo.
      var TECHO_V = 2.2;
      if (velocidad > TECHO_V) { vx = vx / velocidad * TECHO_V; vy = vy / velocidad * TECHO_V; }
      var FRICCION = 0.0022; // px/ms perdidos por ms — calibra distancia y duración del deslizamiento
      function paso(ahora, previo) {
        if (!vivo) { inerciaRAF = null; return; }
        var dtPaso = previo ? ahora - previo : 16;
        var factor = Math.max(0, 1 - FRICCION * dtPaso * 12);
        vx *= factor; vy *= factor;
        var v = Math.sqrt(vx * vx + vy * vy);
        if (v < 0.02) { inerciaRAF = null; return; }
        var c0 = PROY.proyectar(viewport.lat, viewport.lng, viewport.zoom);
        var nuevo = PROY.desproyectar(c0.x - vx * dtPaso, c0.y - vy * dtPaso, viewport.zoom);
        viewport.lat = nuevo.lat; viewport.lng = nuevo.lng;
        redibujar();
        inerciaRAF = requestAnimationFrame(function (t) { paso(t, ahora); });
      }
      inerciaRAF = requestAnimationFrame(function (t) { paso(t, null); });
    }

    lienzo.addEventListener('pointerdown', function (e) {
      if (pointerActivoId !== null) return; // ya hay otro dedo/puntero arrastrando — el pellizco se maneja aparte
      cancelarInercia();
      pointerActivoId = e.pointerId;
      arrastrando = true; sePanneo = false;
      ultimoX = e.clientX; ultimoY = e.clientY;
      muestrasMovimiento = [];
      registrarMuestra(e.clientX, e.clientY);
      lienzo.setPointerCapture(e.pointerId);
      lienzo.style.cursor = 'grabbing';
    });
    lienzo.addEventListener('pointermove', function (e) {
      // Durante la continuación táctil de un pan con un solo dedo tras
      // soltar uno de los dos de un pellizco (ver touchend más abajo),
      // el movimiento real ya lo aplica ese código con Touch Events
      // puros — procesar acá el mismo gesto como "hover" produciría un
      // resaltado que titila mientras el mapa se mueve por otro lado.
      if (panTactilUnico) return;
      // BUG REAL corregido: un pellizco de 2 dedos se maneja con Touch
      // Events (ver alTouchstartContenedor/alTouchmoveContenedor), pero
      // el navegador SIGUE disparando Pointer Events por cada dedo
      // individual mientras el pellizco está en curso — el dedo que
      // queda apoyado genera `pointermove` reales sobre este `lienzo`.
      // `alTouchstartContenedor` ya pone `arrastrando = false` y
      // `pointerActivoId = null` al empezar el pellizco (para cederle
      // el control), pero sin este chequeo de `enPellizco` esos
      // `pointermove` del dedo apoyado caían derecho en la rama de
      // hover de abajo: hit-testing contra marcadores usando la
      // posición del dedo como si fuera un cursor de mouse, con
      // `emisor.emitir('hover'/'hoverOut', ...)` real hacia app.js
      // (resalta una tarjeta del panel, dispara el Ambient Engine)
      // en medio de un gesto que no tiene nada que ver con hover —
      // más un recálculo de clustering redundante (procesarHoverPendiente
      // → clustersActuales() invalida su caché en cada frame porque el
      // propio pellizco ya cambió viewport.zoom/lat/lng ese mismo tick),
      // justo el gesto más sensible a rendimiento en un dispositivo
      // táctil. Se suspende también acá, mismo criterio que ya se
      // aplica a `arrastrando`/`panTactilUnico`.
      if (enPellizco) return;
      if (arrastrando) {
        if (e.pointerId !== pointerActivoId) return; // ignorar punteros secundarios mientras se arrastra
        var dx = e.clientX - ultimoX, dy = e.clientY - ultimoY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) { sePanneo = true; cerrarSpider(); }
        ultimoX = e.clientX; ultimoY = e.clientY;
        registrarMuestra(e.clientX, e.clientY);
        var c0 = PROY.proyectar(viewport.lat, viewport.lng, viewport.zoom);
        var nuevo = PROY.desproyectar(c0.x - dx, c0.y - dy, viewport.zoom);
        viewport.lat = nuevo.lat; viewport.lng = nuevo.lng;
        cerrarPopup();
        redibujar();
        return;
      }
      // RENDIMIENTO REAL (mouse/trackpad de alta frecuencia): un mouse
      // gaming a 125-1000Hz o un trackpad de precisión pueden disparar
      // varios cientos de `pointermove` por segundo — muchos más que
      // los ~60 frames por segundo que de verdad se dibujan. Hacer el
      // hit-testing completo (recorrer todos los clusters/puntos
      // visibles) en cada uno de esos eventos es trabajo descartado:
      // solo el resultado del último evento antes de cada frame
      // termina importando. Se guarda apenas la posición del puntero
      // (un objeto liviano, no el Event completo) y se resuelve una
      // sola vez por frame vía rAF.
      hoverPendiente = { clientX: e.clientX, clientY: e.clientY };
      if (hoverRAF === null) hoverRAF = requestAnimationFrame(procesarHoverPendiente);
    });
    var hoverPendiente = null;
    var hoverRAF = null;
    function procesarHoverPendiente() {
      hoverRAF = null;
      // Mismo chequeo de `enPellizco` que en el listener de arriba:
      // este rAF puede haber quedado encolado desde un `pointermove`
      // que llegó ANTES de que empezara el pellizco (el segundo dedo
      // puede bajar entre el evento y el frame que lo procesa), así
      // que se revalida acá también, no solo en el listener.
      if (!vivo || !hoverPendiente || arrastrando || panTactilUnico || enPellizco) { hoverPendiente = null; return; }
      var evt = hoverPendiente; hoverPendiente = null;
      var clusters = clustersActuales();
      var cerca = buscarMarcadorEn(evt, clusters);
      if (cerca && cerca.tipo === 'punto') {
        lienzo.style.cursor = 'pointer';
        if (cerca.punto.id !== idResaltado) { idResaltado = cerca.punto.id; puntoResaltado = cerca.punto; emisor.emitir('hover', cerca.punto); redibujar(); }
        if (clusterResaltadoKey !== null) { clusterResaltadoKey = null; redibujar(); }
      } else if (cerca && cerca.tipo === 'cluster') {
        lienzo.style.cursor = 'pointer';
        var key = Math.round(cerca.x) + ':' + Math.round(cerca.y);
        if (clusterResaltadoKey !== key) { clusterResaltadoKey = key; redibujar(); }
        if (idResaltado !== null) { idResaltado = null; puntoResaltado = null; emisor.emitir('hoverOut'); redibujar(); }
      } else if (idResaltado !== null || clusterResaltadoKey !== null) {
        idResaltado = null; puntoResaltado = null; clusterResaltadoKey = null; lienzo.style.cursor = 'grab'; emisor.emitir('hoverOut'); redibujar();
      }
    }
    lienzo.addEventListener('pointerup', function (e) {
      if (e.pointerId !== pointerActivoId) return;
      pointerActivoId = null;
      arrastrando = false;
      lienzo.style.cursor = 'grab';
      if (!sePanneo) {
        var clusters = clustersActuales();
        var cerca = buscarMarcadorEn(e, clusters);
        if (cerca) manejarClick(cerca); else cerrarSpider();
      } else {
        iniciarInercia();
      }
    });
    lienzo.addEventListener('pointercancel', function (e) {
      // El sistema operativo/navegador puede interrumpir un gesto (por
      // ejemplo, un gesto de sistema) sin disparar pointerup: sin esto,
      // arrastrando quedaba pegado en true y el mapa dejaba de responder
      // hasta recargar la página.
      if (e.pointerId === pointerActivoId) {
        pointerActivoId = null;
        arrastrando = false;
        lienzo.style.cursor = 'grab';
      }
    });
    lienzo.style.cursor = 'grab';

    lienzo.addEventListener('focus', function () { focoVisible = true; redibujar(); });
    lienzo.addEventListener('blur', function () { focoVisible = false; redibujar(); });

    function buscarMarcadorEn(evtPointer, clusters) {
      var rect = lienzo.getBoundingClientRect();
      var mx = evtPointer.clientX - rect.left, my = evtPointer.clientY - rect.top;
      if (spiderActivo) {
        var mejorSpider = null, mejorDistSpider = TOLERANCIA_CLICK_PX;
        spiderActivo.posiciones.forEach(function (pos) {
          var px = pos._xActual !== undefined ? pos._xActual : pos.x;
          var py = pos._yActual !== undefined ? pos._yActual : pos.y;
          var d = Math.sqrt(Math.pow(px - mx, 2) + Math.pow(py - my, 2));
          if (d < mejorDistSpider) { mejorDistSpider = d; mejorSpider = { tipo: 'punto', x: px, y: py, punto: pos.punto }; }
        });
        if (mejorSpider) return mejorSpider;
      }
      var mejor = null, mejorDist = TOLERANCIA_CLICK_PX;
      clusters.forEach(function (c) {
        var d = Math.sqrt(Math.pow(c.x - mx, 2) + Math.pow(c.y - my, 2));
        if (d < mejorDist) { mejorDist = d; mejor = c; }
      });
      return mejor;
    }

    // Antes: un cluster SIEMPRE hacía zoom al clickearlo, asumiendo que
    // acercar la vista termina separando los pines. Eso rompe en seco
    // cuando 2+ lugares comparten exactamente la misma coordenada (pasa
    // seguido: geocodificación aproximada, mismo edificio/galería) — por
    // más zoom que se haga, nunca se separan y el cluster queda
    // "muerto": el click no visiblemente hace nada. Para clusters chicos
    // (hasta 8 lugares) mostramos directamente la lista con links a cada
    // ficha, así siempre hay una forma de llegar a cada lugar sin
    // depender de que el zoom los separe. Para clusters grandes, el zoom
    // sigue siendo lo más útil (son casos de área real con mucha oferta).
    //
    // BUG REAL corregido: el corte de "hasta 8 lugares" solo cubría
    // clusters chicos por conteo, pero el problema real no es el
    // conteo — es si los miembros pueden llegar a separarse en pantalla
    // en ALGÚN zoom alcanzable. Un cluster de 9+ lugares casi
    // superpuestos (o cualquier cluster ya cerca de ZOOM_MAX, sin
    // margen real para acercar más) seguía cayendo en la rama de zoom,
    // que no separaba nada. Resultado reportado: "pines con un número
    // que no se abren, no se expanden" al hacer mucho zoom.
    //
    // `dispersionMaxima(miembros, ZOOM_MAX)` calcula, en pixeles de
    // pantalla, cuánto se separarían esos mismos miembros si lleváramos
    // el mapa al zoom más alto posible — el mejor caso posible de
    // separación. Si incluso ahí siguen dentro de RADIO_CLUSTER_PX (el
    // mismo radio que agruparEnClusters usa para decidir que son "el
    // mismo punto" en pantalla), matemáticamente NINGÚN zoom los va a
    // separar: no tiene sentido animar hacia allá. Esto reemplaza la
    // heurística anterior (comparar el zoom destino contra el zoom
    // actual) por una verificación directa de la causa raíz que el
    // comentario de arriba ya describía en prosa pero nunca comprobaba
    // en código.
    function dispersionMaxima(miembros, zoom) {
      var xs = new Array(miembros.length), ys = new Array(miembros.length);
      for (var i = 0; i < miembros.length; i++) {
        var p = PROY.proyectar(miembros[i].lat, miembros[i].lng, zoom);
        xs[i] = p.x; ys[i] = p.y;
      }
      var anchoDisp = Math.max.apply(null, xs) - Math.min.apply(null, xs);
      var altoDisp = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      return Math.max(anchoDisp, altoDisp);
    }

    function manejarClick(c) {
      if (c.tipo === 'cluster') {
        var key = claveCluster(c);
        // Reclickear el mismo cluster que ya está desplegado en abanico
        // lo cierra — mismo principio de "toggle" que un acordeón, sin
        // necesitar un botón de cerrar aparte.
        if (spiderActivo && spiderActivo.key === key) { cerrarSpider(); return; }

        dispararOnda(c.x, c.y, c.miembros[0] && c.miembros[0].color);

        // Spiderfy: para clusters chicos/medianos, expandir en abanico
        // es más directo y más espacial que una lista de texto — ver
        // justificación completa junto a la definición de abrirSpider.
        if (c.miembros.length <= SPIDER_MAX_MIEMBROS) { abrirSpider(c); return; }

        // Caso general: ¿de verdad hay a dónde acercar? Si en el mejor
        // zoom posible los miembros van a seguir dentro del radio de
        // fusión de clusters, ningún acercamiento los va a separar —
        // y un abanico de más de SPIDER_MAX_MIEMBROS piernas ya no es
        // legible, así que acá sí conviene la lista en vez del fan.
        var nuncaSeSepara = dispersionMaxima(c.miembros, ZOOM_MAX) < RADIO_CLUSTER_PX;
        if (nuncaSeSepara) { abrirPopupCluster(c); return; }

        var enc = PROY.encuadrar(c.miembros, viewport.ancho, viewport.alto, 50, ZOOM_MAX);
        var zoomDestino = PROY.clamp(Math.max(viewport.zoom + 1.2, Math.min(viewport.zoom + 2.4, enc.zoom)), ZOOM_MIN, ZOOM_MAX);
        animarA(enc.lat, enc.lng, zoomDestino);
        return;
      }
      cerrarSpider();
      dispararOnda(c.x, c.y, c.punto && c.punto.color);
      abrirPopup(c.punto, { x: c.x, y: c.y });
      emisor.emitir('click', c.punto);
    }

    // GAP REAL DE PRODUCTO (no un bug, una carencia): antes la rueda
    // cambiaba el zoom manteniendo fijo el CENTRO del viewport, sin
    // importar dónde estuviera el cursor. En cualquier mapa de
    // referencia (Google/Apple/Mapbox) la rueda ancla el punto
    // geográfico que está bajo el cursor — así explorar "hacia" un
    // lugar con la rueda se siente intencional, no como si el mapa se
    // escapara por debajo del mouse. Reutiliza la misma matemática de
    // anclaje que ya existía para el pellizco (pantallaAPunto +
    // proyectar/desproyectar), esta vez con el zoom cambiando en un
    // solo paso en vez de continuamente.
    function zoomAnclado(nuevoZoom, xRel, yRel) {
      nuevoZoom = PROY.clamp(nuevoZoom, ZOOM_MIN, ZOOM_MAX);
      if (Math.abs(nuevoZoom - viewport.zoom) < 0.0001) return;
      var geoFoco = PROY.pantallaAPunto(xRel, yRel, viewport);
      viewport.zoom = nuevoZoom;
      var pFoco = PROY.proyectar(geoFoco.lat, geoFoco.lng, viewport.zoom);
      var centroMundoX = pFoco.x + viewport.ancho / 2 - xRel;
      var centroMundoY = pFoco.y + viewport.alto / 2 - yRel;
      var nuevoCentro = PROY.desproyectar(centroMundoX, centroMundoY, viewport.zoom);
      viewport.lat = nuevoCentro.lat;
      viewport.lng = nuevoCentro.lng;
    }

    // Acumulador de rueda: trackpads e input devices "de precisión"
    // (Windows PointerEvents, trackpads de Mac con gesto de pellizco
    // mapeado a wheel+ctrlKey) disparan decenas de eventos wheel muy
    // pequeños por segundo en vez de unos pocos "clicks" de mouse
    // tradicional. Tratarlos igual (±0.5 por evento) hacía que un
    // trackpad zoomeara muchísimo más rápido y de forma entrecortada
    // que un mouse. Ahora se acumula deltaY normalizado y se aplica en
    // el próximo frame vía rAF — un solo redibujo por frame sin
    // importar cuántos eventos wheel llegaron, y una sensación de
    // "rueda" pareja entre mouse y trackpad.
    var wheelAcumulado = 0;
    var wheelRAF = null;
    var wheelXRel = 0, wheelYRel = 0;
    function aplicarWheelAcumulado() {
      wheelRAF = null;
      if (!wheelAcumulado) return;
      var delta = PROY.clamp(wheelAcumulado, -1.6, 1.6);
      wheelAcumulado = 0;
      zoomAnclado(viewport.zoom + delta, wheelXRel, wheelYRel);
      cerrarPopup();
      redibujar();
    }
    lienzo.addEventListener('wheel', function (e) {
      e.preventDefault();
      cancelarInercia();
      cerrarSpider();
      var rect = lienzo.getBoundingClientRect();
      wheelXRel = e.clientX - rect.left;
      wheelYRel = e.clientY - rect.top;
      // deltaMode 0 = píxeles (trackpad, mouse de alta resolución): se
      // escala hacia abajo. deltaMode 1 = líneas (mouse tradicional):
      // un "click" de rueda entero equivale al paso de 0.5 de antes.
      var unidad = e.deltaMode === 1 ? 0.5 : Math.min(0.12, Math.abs(e.deltaY) * 0.0035);
      wheelAcumulado += (e.deltaY > 0 ? -1 : 1) * unidad;
      if (wheelRAF === null) wheelRAF = requestAnimationFrame(aplicarWheelAcumulado);
    }, { passive: false });

    lienzo.addEventListener('dblclick', function (e) {
      var rect = lienzo.getBoundingClientRect();
      var xRel = e.clientX - rect.left, yRel = e.clientY - rect.top;
      var geoFoco = PROY.pantallaAPunto(xRel, yRel, viewport);
      var zoomDestino = Math.min(viewport.zoom + 1, ZOOM_MAX);
      // BUG REAL evitado (no llegó a publicarse, detectado en revisión
      // propia): mutar `viewport.zoom` acá ANTES de llamar a `animarA`
      // haría que `origen.zoom` (leído dentro de animarA al arrancar)
      // ya fuera igual a `zoomDestino` — el resultado visible sería un
      // pan que sí se anima suave, pero un zoom que "salta" de golpe
      // en vez de acompañar la animación. animarA no puede animar el
      // anclaje frame a frame sin duplicar toda la matemática de
      // zoomAnclado dentro de la propia animación de vuelo — para un
      // doble clic (un solo nivel de zoom, ~420ms) la diferencia entre
      // animar hacia el destino final anclado vs. animar el anclaje
      // continuo es imperceptible. Por eso el punto de anclaje se
      // resuelve acá con el zoom destino, PERO sin tocar el viewport
      // real — solo animarA(), más abajo, es quien efectivamente
      // mueve lat/lng/zoom, interpolando desde el estado actual real.
      var pFoco = PROY.proyectar(geoFoco.lat, geoFoco.lng, zoomDestino);
      var destino = PROY.desproyectar(
        pFoco.x + viewport.ancho / 2 - xRel,
        pFoco.y + viewport.alto / 2 - yRel,
        zoomDestino
      );
      animarA(destino.lat, destino.lng, zoomDestino);
    });


    lienzo.addEventListener('keydown', function (e) {
      var paso = 40;
      if (e.key === 'ArrowUp') { desplazarPx(0, paso); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { desplazarPx(0, -paso); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { desplazarPx(paso, 0); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { desplazarPx(-paso, 0); e.preventDefault(); }
      else if (e.key === '+' || e.key === '=') { animarA(viewport.lat, viewport.lng, Math.min(viewport.zoom + 1, ZOOM_MAX)); }
      else if (e.key === '-') { animarA(viewport.lat, viewport.lng, Math.max(viewport.zoom - 1, ZOOM_MIN)); }
    });

    // Escape cierra la ficha abierta y devuelve el foco a donde estaba
    // antes de abrirla — sin esto, un usuario de teclado que abre un
    // popup y quiere descartarlo no tenía forma de hacerlo sin el mouse.
    // BUG REAL corregido: este listener, y los 4 de touch de más abajo,
    // se atan a `contenedor` — el elemento que entrega quien llama a
    // crear(), no un nodo interno que `destruir()` desmonta con
    // `contenedor.innerHTML = ''`. Ese innerHTML='' limpia hijos
    // (lienzo, controles, popup...) pero un listener puesto
    // directamente sobre `contenedor` sigue vivo después de destruir()
    // si nadie lo remueve explícitamente — a diferencia de los
    // listeners en `global`/`document`, que sí se removían. Si algún
    // consumidor futuro reutiliza el mismo contenedor para crear() una
    // instancia nueva (el escenario que esta misma pasada dice cubrir,
    // ver comentario de PREVENCIÓN DE MEMORY LEAKS más arriba), la
    // instancia vieja quedaba pegada para siempre: memoria retenida y
    // trabajo desperdiciado en cada evento, sin ningún efecto visible
    // porque `redibujar()` sí corta por `vivo`, pero la mutación de
    // estado y el propio handler no. Se nombran las 5 funciones para
    // poder removerlas en destruir().
    function alKeydownContenedor(e) {
      if (e.key === 'Escape' && (!popup.hidden || spiderActivo)) {
        e.stopPropagation();
        if (!popup.hidden) cerrarPopup(true);
        cerrarSpider();
      }
    }
    contenedor.addEventListener('keydown', alKeydownContenedor);

    function desplazarPx(dx, dy) {
      cancelarInercia();
      cerrarSpider();
      var c0 = PROY.proyectar(viewport.lat, viewport.lng, viewport.zoom);
      var n = PROY.desproyectar(c0.x - dx, c0.y - dy, viewport.zoom);
      viewport.lat = n.lat; viewport.lng = n.lng;
      redibujar();
    }

    controles.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-zoom]');
      if (!btn || btn.disabled) return;
      cancelarInercia();
      var dz = parseFloat(btn.dataset.zoom);
      animarA(viewport.lat, viewport.lng, PROY.clamp(viewport.zoom + dz, ZOOM_MIN, ZOOM_MAX));
    });

    // Soporte táctil de pellizco (pinch), anclado al centro del gesto:
    // el punto geográfico que estaba bajo los dos dedos al empezar el
    // pellizco se mantiene bajo el centro de los dedos mientras se
    // mueven — igual que Google/Apple Maps. Antes, el pellizco solo
    // cambiaba el zoom con el centro del viewport fijo, así que
    // pellizcar lejos del centro "arrastraba" el mapa de forma rara.
    var pinchDist0 = null, pinchZoom0 = null, pinchCentro0 = null;
    function alTouchstartContenedor(e) {
      if (e.touches.length === 2) {
        enPellizco = true;
        panTactilUnico = null;
        pinchDist0 = distanciaToques(e.touches);
        pinchZoom0 = viewport.zoom;
        pinchCentro0 = centroToques(e.touches);
        // El pellizco toma el control: cede cualquier arrastre de un
        // solo puntero (o inercia post-arrastre) que estuviera en
        // curso, para que no compitan.
        arrastrando = false;
        pointerActivoId = null;
        cancelarInercia();
        cerrarPopup();
        cerrarSpider();
        // COROLARIO del mismo hallazgo (pointermove sin chequeo de
        // enPellizco): en un dispositivo híbrido mouse+touch puede
        // haber un hover de mouse activo (idResaltado/puntoResaltado)
        // justo antes de que empiecen los 2 dedos del pellizco. Sin
        // esto, esa tarjeta quedaba resaltada en el panel de app.js
        // durante todo el gesto — nada bajo el cursor real la
        // justifica ya, y el `pointermove` que la limpiaría normal-
        // mente ahora se ignora a propósito mientras `enPellizco` es
        // true.
        if (idResaltado !== null || clusterResaltadoKey !== null) {
          idResaltado = null; puntoResaltado = null; clusterResaltadoKey = null;
          emisor.emitir('hoverOut');
        }
      }
    }
    contenedor.addEventListener('touchstart', alTouchstartContenedor, { passive: true });
    function alTouchmoveContenedor(e) {
      if (e.touches.length === 2 && pinchDist0) {
        var d = distanciaToques(e.touches);
        var centroActual = centroToques(e.touches);
        var nuevoZoom = PROY.clamp(pinchZoom0 + Math.log2(d / pinchDist0), ZOOM_MIN, ZOOM_MAX);

        var rect = lienzo.getBoundingClientRect();
        var focoXInicialRel = pinchCentro0.x - rect.left;
        var focoYInicialRel = pinchCentro0.y - rect.top;
        var geoFoco = PROY.pantallaAPunto(focoXInicialRel, focoYInicialRel, viewport);

        viewport.zoom = nuevoZoom;
        var pFoco = PROY.proyectar(geoFoco.lat, geoFoco.lng, viewport.zoom);
        var centroActualRelX = centroActual.x - rect.left;
        var centroActualRelY = centroActual.y - rect.top;
        var centroMundoX = pFoco.x + viewport.ancho / 2 - centroActualRelX;
        var centroMundoY = pFoco.y + viewport.alto / 2 - centroActualRelY;
        var nuevoCentro = PROY.desproyectar(centroMundoX, centroMundoY, viewport.zoom);
        viewport.lat = nuevoCentro.lat;
        viewport.lng = nuevoCentro.lng;
        redibujar();
        return;
      }
      // GAP REAL corregido: al soltar uno de los dos dedos de un
      // pellizco, el dedo que queda abajo no generaba ningún
      // `pointerdown` nuevo (ya estaba apoyado desde antes), así que
      // el pan de un solo dedo no se reactivaba solo — el mapa se
      // quedaba quieto hasta que el usuario levantara ese dedo también
      // y volviera a apoyarlo. Google/Apple Maps sí continúan el pan
      // sin cortes. Se seguí acá con Touch Events puros (no con
      // Pointer Events: ese dedo nunca se activó como puntero de
      // arrastre, ver touchend) hasta que se suelte del todo.
      if (e.touches.length === 1 && panTactilUnico) {
        var t = e.touches[0];
        var dx = t.clientX - panTactilUnico.x, dy = t.clientY - panTactilUnico.y;
        panTactilUnico.x = t.clientX; panTactilUnico.y = t.clientY;
        registrarMuestra(t.clientX, t.clientY);
        var c0 = PROY.proyectar(viewport.lat, viewport.lng, viewport.zoom);
        var n = PROY.desproyectar(c0.x - dx, c0.y - dy, viewport.zoom);
        viewport.lat = n.lat; viewport.lng = n.lng;
        cerrarPopup();
        redibujar();
      }
    }
    contenedor.addEventListener('touchmove', alTouchmoveContenedor, { passive: true });
    function alTouchendContenedor(e) {
      if (e.touches.length === 1 && enPellizco) {
        var t = e.touches[0];
        muestrasMovimiento = [];
        panTactilUnico = { id: t.identifier, x: t.clientX, y: t.clientY };
        registrarMuestra(t.clientX, t.clientY);
      }
      if (e.touches.length < 2) { pinchDist0 = null; pinchCentro0 = null; }
      if (e.touches.length === 0) {
        enPellizco = false;
        if (panTactilUnico) { panTactilUnico = null; iniciarInercia(); }
      }
    }
    contenedor.addEventListener('touchend', alTouchendContenedor);
    function alTouchcancelContenedor() {
      // El sistema puede interrumpir el gesto (llamada entrante,
      // gesto de sistema del propio OS) sin `touchend` — sin este
      // manejo, `panTactilUnico`/`enPellizco` quedaban pegados y el
      // próximo toque heredaba un estado de pellizco que ya no existe.
      pinchDist0 = null; pinchCentro0 = null; panTactilUnico = null; enPellizco = false;
    }
    contenedor.addEventListener('touchcancel', alTouchcancelContenedor);
    function distanciaToques(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }
    function centroToques(t) { return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 }; }

    /* ── Animación suave de zoom/pan (usada por focar/encuadrar) ── */
    function animarA(lat, lng, zoom, duracion) {
      if (animacionZoom) cancelAnimationFrame(animacionZoom);
      cancelarInercia();
      cerrarSpider();
      if (prefiereMovimientoReducido()) {
        viewport.lat = lat; viewport.lng = lng; viewport.zoom = zoom;
        vueloDestino = null;
        redibujar();
        return;
      }
      var origen = { lat: viewport.lat, lng: viewport.lng, zoom: viewport.zoom };
      var destino = { lat: lat, lng: lng, zoom: zoom };
      vueloDestino = destino;
      var inicio = performance.now();
      duracion = duracion || DURACION_VUELO_MS;
      function paso(ahora) {
        if (!vivo) return;
        var t = Math.min(1, (ahora - inicio) / duracion);
        var e = easeOutCubic(t);
        viewport.lat = origen.lat + (destino.lat - origen.lat) * e;
        viewport.lng = origen.lng + (destino.lng - origen.lng) * e;
        viewport.zoom = origen.zoom + (destino.zoom - origen.zoom) * e;
        redibujar();
        if (t < 1) { animacionZoom = requestAnimationFrame(paso); } else { animacionZoom = null; vueloDestino = null; }
      }
      animacionZoom = requestAnimationFrame(paso);
    }

    /* ── Popup ──
       BUG REAL corregido: `abrirPopup`/`abrirPopupCluster` sacaban el
       popup de `hidden` de forma SÍNCRONA, pero su posición (left/top)
       recién se calculaba en `posicionarPopupAbierto`, que solo corre
       dentro de `dibujar()` — y `dibujar()` se dispara vía
       `redibujar()`, que a su vez lo difiere a un `requestAnimationFrame`.
       Como el popup es un único <div> reutilizado (nunca se recrea),
       arrastraba el `left`/`top` de la vez anterior (o ningún valor,
       la primera vez). Resultado: durante un frame — visible a simple
       vista, sobre todo en dispositivos más lentos — el popup aparecía
       en la posición vieja (o en la esquina, sin posición), y recién
       después "saltaba" al lugar correcto. Eso es exactamente lo que
       se ve en el reporte: el mapa "se ve mal directamente" al
       clickear un lugar. Ahora se posiciona de forma síncrona, en el
       mismo tick que se hace visible, usando las coordenadas de
       pantalla que el propio click ya calculó (o, si no las hay —
       apertura por teclado/lista accesible—, proyectando el punto con
       el viewport actual). `redibujar()` se sigue llamando después
       para que el popup siga acompañando al punto si el mapa está en
       medio de una animación de vuelo (ver `enfocar`). */
    function posicionarPopupEn(x, y) {
      var anchoPopup = popup.offsetWidth || 220;
      var altoPopup = popup.offsetHeight || 90;
      // Los márgenes se acotan al propio tamaño del viewport antes de
      // usarlos como límites del clamp. Sin esto, un popup más ancho
      // que el contenedor (pantallas muy angostas, nombre de lugar muy
      // largo) producía min > max en PROY.clamp; como esa función hace
      // Math.max(min, Math.min(max, v)), un min>max no lanza, pero
      // "gana" siempre el mínimo — el popup quedaba fijo pegado a un
      // borde sin que valiera la pena depurar por qué. Acotando el
      // margen a la mitad del viewport se garantiza min <= max siempre,
      // así el popup se achica contra el borde en vez de comportarse
      // de forma no determinística en el caso límite.
      var margenX = Math.min(anchoPopup / 2 + 8, viewport.ancho / 2);
      var margenYMin = Math.min(altoPopup + 16, viewport.alto);
      var px = PROY.clamp(x, margenX, Math.max(margenX, viewport.ancho - margenX));
      var py = PROY.clamp(y, margenYMin, Math.max(margenYMin, viewport.alto - 8));
      popup.style.left = px + 'px';
      popup.style.top = py + 'px';
    }
    function abrirPopup(punto, xy) {
      idAbierto = punto.id;
      elementoFocoPrevio = document.activeElement;
      // BUG REAL corregido: antes el único link del popup era "Ver
      // ficha completa", condicionado a `punto.href` (depende de que
      // el lugar tenga slug/ficha propia). Si no la tenía, el popup se
      // abría sin ningún link — un pin que representa un lugar real
      // pero no llevaba a ningún lado. Ahora "Cómo llegar" (hrefMapsDe)
      // es incondicional: usa lat/lng del punto, que `establecerPuntos`
      // ya garantiza válidos para todo punto dibujado. "Ver ficha
      // completa" sigue como link aparte, solo cuando hay ficha.
      popup.innerHTML =
        '<button type="button" class="uru-mapa-popup-cerrar" aria-label="Cerrar">×</button>' +
        '<strong class="uru-mapa-popup-nombre"></strong>' +
        '<div class="uru-mapa-popup-direccion"></div>' +
        '<div class="uru-mapa-popup-acciones">' +
          '<a class="uru-mapa-popup-link uru-mapa-popup-link--maps" target="_blank" rel="noopener">📍 Cómo llegar →</a>' +
          (punto.href ? '<a class="uru-mapa-popup-link">Ver ficha completa →</a>' : '') +
        '</div>';
      popup.querySelector('.uru-mapa-popup-nombre').textContent = punto.nombre;
      popup.querySelector('.uru-mapa-popup-direccion').textContent = punto.direccion || '';
      popup.querySelector('.uru-mapa-popup-link--maps').href = hrefMapsDe(punto);
      var link = popup.querySelector('.uru-mapa-popup-link:not(.uru-mapa-popup-link--maps)');
      if (link) link.href = punto.href;
      popup.setAttribute('role', 'group');
      popup.setAttribute('aria-label', punto.nombre || 'Detalle del lugar');
      popup.hidden = false;
      var colorBorde = (punto.color && RE_HEX.test(punto.color)) ? punto.color : 'var(--color-granate-clara)';
      popup.style.borderLeft = '3px solid ' + colorBorde;
      var btnCerrar = popup.querySelector('.uru-mapa-popup-cerrar');
      btnCerrar.addEventListener('click', function () { cerrarPopup(true); });
      // Posición síncrona (ver nota arriba): si el click ya nos dio
      // las coordenadas de pantalla, se usan directo; si no (apertura
      // por teclado/lista accesible), se proyectan lat/lng con el
      // viewport actual.
      var punteroXY = xy || PROY.puntoAPantalla(punto.lat, punto.lng, viewport);
      posicionarPopupEn(punteroXY.x, punteroXY.y);
      // <button> real: Enter/Espacio ya funcionan sin código adicional.
      if (typeof btnCerrar.focus === 'function') btnCerrar.focus({ preventScroll: true });
      redibujar();
    }
    function cerrarPopup(devolverFoco) {
      idAbierto = null;
      clusterAbierto = null;
      popup.hidden = true;
      if (devolverFoco && elementoFocoPrevio && typeof elementoFocoPrevio.focus === 'function') {
        elementoFocoPrevio.focus({ preventScroll: true });
      }
      elementoFocoPrevio = null;
    }

    // Lista de lugares de un cluster chico — mismo popup visual que el
    // de un lugar individual, pero con un <a> por miembro en vez de un
    // solo nombre/dirección. Usa textContent (nunca innerHTML con datos
    // del negocio) para no depender de escapar nada a mano.
    function abrirPopupCluster(c) {
      idAbierto = null;
      clusterAbierto = c;
      elementoFocoPrevio = document.activeElement;

      popup.innerHTML =
        '<button type="button" class="uru-mapa-popup-cerrar" aria-label="Cerrar">×</button>' +
        '<strong class="uru-mapa-popup-nombre"></strong>' +
        '<ul class="uru-mapa-popup-cluster-lista"></ul>';
      popup.querySelector('.uru-mapa-popup-nombre').textContent =
        c.miembros.length + ' lugares acá';

      var lista = popup.querySelector('.uru-mapa-popup-cluster-lista');
      // BUG REAL corregido (raíz del reporte): un miembro sin ficha
      // propia (`m.href` null) se renderizaba como <span> — ni link,
      // ni foco, ni acción. El pin representaba un lugar real pero no
      // llevaba a ningún lado. La ficha (`m.href`) es un dato OPCIONAL
      // del negocio; la ubicación (`m.lat`/`m.lng`) es un dato
      // GARANTIZADO por `establecerPuntos` para todo miembro que llegó
      // a agruparse en este cluster. Por eso cada fila ahora tiene
      // siempre, como mínimo, un <a> real a "Cómo llegar" — y además
      // el link a la ficha cuando existe. Ningún miembro de ningún
      // cluster, chico o grande, con coordenadas repetidas o no, queda
      // sin una acción real que lo lleve a SU ubicación específica.
      c.miembros.forEach(function (m) {
        var li = document.createElement('li');
        li.className = 'uru-mapa-popup-cluster-fila';
        if (m.href) {
          var aFicha = document.createElement('a');
          aFicha.className = 'uru-mapa-popup-cluster-item';
          aFicha.textContent = m.nombre;
          aFicha.href = m.href;
          li.appendChild(aFicha);
        } else {
          var span = document.createElement('span');
          span.className = 'uru-mapa-popup-cluster-item uru-mapa-popup-cluster-item--sin-ficha';
          span.textContent = m.nombre;
          li.appendChild(span);
        }
        var aMapa = document.createElement('a');
        aMapa.className = 'uru-mapa-popup-cluster-mapa';
        aMapa.href = hrefMapsDe(m);
        aMapa.target = '_blank';
        aMapa.rel = 'noopener';
        aMapa.setAttribute('aria-label', 'Cómo llegar a ' + m.nombre);
        aMapa.textContent = '📍';
        li.appendChild(aMapa);
        lista.appendChild(li);
      });

      popup.setAttribute('role', 'group');
      popup.setAttribute('aria-label', c.miembros.length + ' lugares en este punto del mapa');
      popup.hidden = false;
      popup.style.borderLeft = '3px solid var(--color-granate-clara)';
      var btnCerrar = popup.querySelector('.uru-mapa-popup-cerrar');
      btnCerrar.addEventListener('click', function () { cerrarPopup(true); });
      // Posición síncrona (ver nota en abrirPopup): c.x/c.y son las
      // coordenadas de pantalla que el propio click ya calculó.
      posicionarPopupEn(c.x, c.y);
      if (typeof btnCerrar.focus === 'function') btnCerrar.focus({ preventScroll: true });
      redibujar();
    }
    // Identifica un cluster de forma estable entre frames por el
    // conjunto de ids de sus miembros (orden-independiente) — la clave
    // de pantalla (`Math.round(c.x)+':'+Math.round(c.y)`, usada para
    // el resaltado por hover) no sirve acá porque cambia en cada pan/
    // zoom, que es justo cuando necesitamos reencontrar el mismo
    // cluster.
    function firmaMiembrosCluster(miembros) {
      return miembros.map(function (p) { return p.id; }).sort().join(',');
    }

    function posicionarPopupAbierto(proyectados, clusters) {
      if (popup.hidden) return;
      if (idAbierto !== null) {
        if (spiderActivo) {
          var posSpider = spiderActivo.posiciones.filter(function (ps) { return ps.punto.id === idAbierto; })[0];
          if (posSpider) { posicionarPopupEn(posSpider._xActual || posSpider.x, posSpider._yActual || posSpider.y); return; }
        }
        var p = proyectados.filter(function (pr) { return pr.punto.id === idAbierto; })[0];
        if (!p) { cerrarPopup(); return; }
        // Clamp para que el popup nunca quede parcialmente fuera del
        // contenedor cuando el marcador está cerca de un borde.
        posicionarPopupEn(p.x, p.y);
        return;
      }
      // GAP REAL corregido (auditoría producción, 2026-07-30):
      // clusterAbierto se escribía en abrirPopupCluster()/cerrarPopup()
      // pero nunca se leía en ningún lado — el popup de un cluster no
      // seguía al mapa en pan/zoom, a diferencia del de un lugar
      // individual (arriba). Mismo criterio que esa rama: si el
      // cluster ya no existe con la misma composición de miembros en
      // este frame (se separó al hacer zoom, o la búsqueda cambió la
      // lista), se cierra el popup en vez de dejarlo huérfano.
      if (clusterAbierto !== null) {
        var firma = firmaMiembrosCluster(clusterAbierto.miembros);
        var actual = (clusters || []).filter(function (c) {
          return c.tipo === 'cluster' && firmaMiembrosCluster(c.miembros) === firma;
        })[0];
        if (!actual) { cerrarPopup(); return; }
        clusterAbierto = actual;
        posicionarPopupEn(actual.x, actual.y);
      }
    }

    function posicionarEtiqueta(proyectados) {
      // No mostrar la etiqueta liviana sobre el mismo punto que ya
      // tiene el popup completo abierto — sería redundante.
      if (!puntoResaltado || puntoResaltado.id === idAbierto) { etiqueta.hidden = true; return; }
      var p = proyectados.filter(function (pr) { return pr.punto.id === puntoResaltado.id; })[0];
      if (!p) { etiqueta.hidden = true; return; }
      etiqueta.textContent = puntoResaltado.nombre;
      etiqueta.style.left = p.x + 'px';
      etiqueta.style.top = p.y + 'px';
      etiqueta.hidden = false;
    }

    // Auditoría producción, 2026-07-30: se elimina el andamiaje de
    // "prioridad visual" (halo + z-order para los primeros N puntos
    // del array de entrada) — quedó documentado en un comentario largo
    // pero nunca se completó en ninguno de sus dos extremos:
    // rangoPorId nunca se poblaba desde establecerPuntos() y
    // esPrioridadVisual() nunca se consultaba desde dibujarMarcador().
    // Cero comportamiento visible dependía de esto. Si se retoma la
    // idea a futuro, es una funcionalidad nueva a diseñar de cero, no
    // una corrección de bug.

    /* ── Lista accesible en paralelo (teclado / lectores de pantalla) ── */
    function reconstruirListaAccesible() {
      listaAccesible.innerHTML = '';
      var frag = document.createDocumentFragment();
      puntos.forEach(function (p) {
        var li = document.createElement('li');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'uru-mapa-item-accesible';
        btn.textContent = p.nombre + (p.direccion ? ' — ' + p.direccion : '');
        btn.addEventListener('focus', function () { idResaltado = p.id; puntoResaltado = p; emisor.emitir('hover', p); redibujar(); });
        btn.addEventListener('blur', function () { idResaltado = null; puntoResaltado = null; emisor.emitir('hoverOut'); redibujar(); });
        btn.addEventListener('click', function () { enfocar(p.id); abrirPopup(p); emisor.emitir('click', p); });
        li.appendChild(btn);
        frag.appendChild(li);
      });
      listaAccesible.appendChild(frag);
    }

    /* ── API pública de la instancia ── */
    var huellaListaPrevia = '';
    function calcularHuella(lista) {
      var partes = new Array(lista.length);
      for (var i = 0; i < lista.length; i++) partes[i] = lista[i].id;
      return lista.length + '|' + partes.join(',');
    }

    function establecerPuntos(nuevosPuntos) {
      establecioAlgunaVez = true;
      // La identidad de un cluster (`spiderActivo.key`) depende de su
      // posición en pantalla y de qué miembros agrupa — ambas cosas
      // pueden cambiar con una lista nueva de resultados. Mantener el
      // abanico abierto apuntando a datos viejos mostraría piernas
      // hacia lugares que ya no están en el conjunto actual.
      cerrarSpider();
      var entrada = nuevosPuntos || [];
      var descartados = 0;
      // Un punto sin lat/lng numérico y finito no puede proyectarse —
      // antes esto colaba NaN hasta el propio dibujado del canvas.
      puntos = entrada.filter(function (p) {
        var valido = !!p && typeof p.lat === 'number' && typeof p.lng === 'number' &&
          isFinite(p.lat) && isFinite(p.lng);
        if (!valido) descartados++;
        return valido;
      });
      if (descartados > 0 && global.console) {
        console.warn('URU_MOTOR_MAPA_RENDER: se descartaron ' + descartados + ' punto(s) sin coordenadas válidas.');
      }
      // ROBUSTEZ REAL, no defensiva por las dudas: `enfocar(id)` y
      // `resaltar(id)` resuelven por `.filter(...)[0]` — con IDs
      // repetidos (bug de datos aguas arriba, no algo que este archivo
      // pueda o deba corregir por su cuenta) siempre apuntan al
      // primero, silenciosamente. No se filtra nada (el resto del
      // motor sigue funcionando: dos puntos con el mismo ID igual se
      // dibujan, clusterizan y aparecen en la lista accesible, cada
      // uno con sus propias coordenadas), pero se avisa una vez por
      // llamada para que el problema de datos se note en desarrollo en
      // vez de manifestarse como "el mapa enfoca el lugar equivocado".
      if (global.console) {
        var vistos = Object.create(null), repetidos = 0;
        for (var iDup = 0; iDup < puntos.length; iDup++) {
          var idDup = puntos[iDup].id;
          if (vistos[idDup]) repetidos++; else vistos[idDup] = true;
        }
        if (repetidos > 0) {
          console.warn('URU_MOTOR_MAPA_RENDER: ' + repetidos + ' punto(s) con id repetido — enfocar()/resaltar() solo pueden apuntar al primero de cada grupo.');
        }
      }
      var huella = calcularHuella(puntos);
      if (huella !== huellaListaPrevia) {
        huellaListaPrevia = huella;
        reconstruirListaAccesible();
      }
      redibujar();
    }

    // Evita re-animar hacia el mismo encuadre en llamadas repetidas
    // (p. ej. una por cada tecla del buscador en app.js), que se veía
    // como un "salto" constante del mapa sin que el conjunto de
    // resultados hubiera cambiado de verdad.
    var ultimoEncuadre = null;
    function encuadrarTodos(padding) {
      if (!puntos.length) return;
      medir(); // el contenedor puede acabar de pasar de hidden a visible
      var enc = PROY.encuadrar(puntos, viewport.ancho, viewport.alto, padding || 48, ZOOM_MAX);
      if (!enc) return;
      if (ultimoEncuadre &&
        Math.abs(ultimoEncuadre.lat - enc.lat) < 0.0002 &&
        Math.abs(ultimoEncuadre.lng - enc.lng) < 0.0002 &&
        Math.abs(ultimoEncuadre.zoom - enc.zoom) < 0.05) {
        return;
      }
      ultimoEncuadre = enc;
      animarA(enc.lat, enc.lng, enc.zoom);
    }

    function enfocar(id) {
      var p = puntos.filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      animarA(p.lat, p.lng, Math.max(viewport.zoom, 15));
    }

    function resaltar(id) {
      idResaltado = id;
      puntoResaltado = puntos.filter(function (p) { return p.id === id; })[0] || null;
      redibujar();
    }
    function quitarResaltado() { idResaltado = null; puntoResaltado = null; redibujar(); }

    var resizeObs = null;
    var resizeFallback = null;
    if ('ResizeObserver' in global) {
      resizeObs = new ResizeObserver(function () { if (vivo) { medir(); redibujar(); } });
      resizeObs.observe(contenedor);
    } else {
      // Navegador sin ResizeObserver: al menos reaccionar al resize de
      // la ventana, en vez de quedar con un tamaño de canvas obsoleto.
      resizeFallback = function () { if (vivo) { medir(); redibujar(); } };
      global.addEventListener('resize', resizeFallback);
    }
    medir();

    // Si la tipografía todavía no había cargado cuando se dibujó el
    // primer frame, la inicial de rubro dentro del pin salía con la
    // fuente de respaldo del sistema. Un único redibujo cuando las
    // fuentes terminan de cargar corrige ese frame inicial sin costo
    // permanente.
    if (global.document && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { if (vivo) redibujar(); }).catch(function () {});
    }

    // ── Suspensión/reanudación en background (pestaña oculta) ──
    // GAP REAL: los navegadores throttlean (no garantizan cancelar)
    // `requestAnimationFrame` en una pestaña en background — una
    // animación en curso puede seguir "corriendo" a una cadencia
    // arbitraria e impredecible, o acumular un `dt` gigante en el
    // primer frame tras volver a foreground si algo asumía ~16ms entre
    // pasos. En vez de confiar en ese comportamiento no garantizado,
    // se corta explícitamente todo lo que anima por tiempo al ocultarse
    // y se resincroniza al volver — degradación elegante en vez de
    // dejarlo a la suerte del navegador.
    function alCambiarVisibilidad() {
      if (!vivo) return;
      if (document.hidden) {
        if (animacionZoom) { cancelAnimationFrame(animacionZoom); animacionZoom = null; }
        cancelarInercia();
        if (rafOndas !== null) { cancelAnimationFrame(rafOndas); rafOndas = null; }
        if (rafApariciones !== null) { cancelAnimationFrame(rafApariciones); rafApariciones = null; }
        if (rafSpider !== null) { cancelAnimationFrame(rafSpider); rafSpider = null; }
        if (wheelRAF !== null) { cancelAnimationFrame(wheelRAF); wheelRAF = null; wheelAcumulado = 0; }
        if (hoverRAF !== null) { cancelAnimationFrame(hoverRAF); hoverRAF = null; hoverPendiente = null; }
      } else {
        // Un vuelo interrumpido a mitad de camino no tiene un origen
        // temporal razonable para retomar tras un tiempo indeterminado
        // en background — se completa directo al destino en vez de que
        // el usuario vuelva a ver una animación arrancando de la nada.
        if (vueloDestino) {
          viewport.lat = vueloDestino.lat; viewport.lng = vueloDestino.lng; viewport.zoom = vueloDestino.zoom;
          vueloDestino = null;
        }
        // Mismo razonamiento para microinteracciones de duración fija
        // (ondas de clic, apariciones de pines): "completarlas" de
        // golpe en un lugar que el usuario ya no está mirando se vería
        // peor que simplemente descartarlas.
        ondas = [];
        for (var kApar in apariciones) delete apariciones[kApar];
        // La pestaña pudo volver en otro monitor (distinto
        // devicePixelRatio) o con el contenedor en otro tamaño —
        // remedir agarra ambos casos, no solo el resize.
        medir();
        redibujar();
      }
    }
    if (global.document) document.addEventListener('visibilitychange', alCambiarVisibilidad);

    // Red de seguridad para `orientationchange`: ResizeObserver ya
    // debería reaccionar al nuevo tamaño del contenedor tras rotar,
    // pero algunas combinaciones de WebView/Safari iOS viejo disparan
    // el resize real del layout con demora respecto al evento de
    // orientación. Un remedido extra, un instante después, no cuesta
    // nada si ya estaba todo actualizado y corrige el caso raro en que
    // sí hacía falta.
    var orientationFallback = null;
    var orientationTimeout = null;
    if ('onorientationchange' in global) {
      orientationFallback = function () {
        if (orientationTimeout !== null) clearTimeout(orientationTimeout);
        orientationTimeout = setTimeout(function () {
          orientationTimeout = null;
          if (vivo) { medir(); redibujar(); }
        }, 60);
      };
      global.addEventListener('orientationchange', orientationFallback);
    }

    return {
      on: emisor.on,
      establecerPuntos: establecerPuntos,
      encuadrarTodos: encuadrarTodos,
      enfocar: enfocar,
      resaltar: resaltar,
      quitarResaltado: quitarResaltado,
      destruir: function () {
        // Primero el guard: cualquier callback asíncrono que llegue
        // DESPUÉS de esta línea (imagen de tile, promesa de fuentes,
        // un RAF que ya estaba encolado antes de cancelarlo) se
        // encuentra `vivo === false` y no reprograma nada nuevo.
        vivo = false;
        if (resizeObs) resizeObs.disconnect();
        if (resizeFallback) global.removeEventListener('resize', resizeFallback);
        if (global.document) document.removeEventListener('visibilitychange', alCambiarVisibilidad);
        if (orientationFallback) global.removeEventListener('orientationchange', orientationFallback);
        // BUG REAL corregido en esta pasada: estos 5 listeners viven en
        // `contenedor`, el elemento que entrega quien llama a crear(),
        // no en `lienzo`/`controles` (que sí desaparecen con el
        // `contenedor.innerHTML = ''` de más abajo). Sin este remove
        // explícito, quedaban pegados para siempre si algún consumidor
        // futuro reinicializaba el mapa sobre el mismo contenedor.
        contenedor.removeEventListener('keydown', alKeydownContenedor);
        contenedor.removeEventListener('touchstart', alTouchstartContenedor);
        contenedor.removeEventListener('touchmove', alTouchmoveContenedor);
        contenedor.removeEventListener('touchend', alTouchendContenedor);
        contenedor.removeEventListener('touchcancel', alTouchcancelContenedor);
        if (orientationTimeout !== null) clearTimeout(orientationTimeout);
        if (animacionZoom) cancelAnimationFrame(animacionZoom);
        if (rafRedibujo !== null) cancelAnimationFrame(rafRedibujo);
        if (rafOndas !== null) cancelAnimationFrame(rafOndas);
        if (rafApariciones !== null) cancelAnimationFrame(rafApariciones);
        if (rafSpider !== null) cancelAnimationFrame(rafSpider);
        if (hoverRAF !== null) cancelAnimationFrame(hoverRAF);
        cancelarInercia();
        if (wheelRAF !== null) cancelAnimationFrame(wheelRAF);
        contenedor.innerHTML = '';
      }
    };
  }

  global.URU_MOTOR_MAPA_RENDER = { crear: crear };
})(typeof window !== 'undefined' ? window : global);

/* ==== motor-indice-busqueda.js ==== */
/**
 * ÍNDICE INVERTIDO POR TRIGRAMAS — reduce cuántos lugares hay que
 * revisar en cada búsqueda de texto, antes de que motor-exposicion.js
 * aplique el ranking exacto (nombre exacto > empieza-con > contiene >
 * categoría > dirección).
 *
 * Por qué trigramas y no palabra exacta: la búsqueda real de la app
 * matchea por SUBSTRING ("piz" encuentra "pizzería", no solo "piz" como
 * palabra completa). Un índice de palabra exacta no puede servir eso —
 * por eso la versión anterior de este archivo quedaba construida pero
 * nunca conectada a resultadosPorAccionExplicita(). Un índice de
 * trigramas sí: si "pizzeria" contiene la consulta "piz" como substring,
 * entonces "piz" en sí (si la consulta tiene 3+ caracteres) o todos sus
 * trigramas están garantizados a aparecer en el texto indexado de ese
 * lugar. Es la misma técnica que usa pg_trgm en Postgres.
 *
 * GARANTÍA DE CORRECCIÓN: candidatosPara() es un filtro NECESARIO pero
 * NO SUFICIENTE — puede devolver falsos positivos (un lugar que
 * contiene todos los trigramas de la consulta pero no la consulta como
 * substring contiguo), nunca falsos negativos. motor-exposicion.js
 * siempre re-verifica con indexOf() exacto sobre cada candidato, así
 * que un falso positivo de acá simplemente se descarta después sin
 * afectar el resultado. Si candidatosPara() no puede ayudar (consulta
 * de 1-2 caracteres, o índice todavía no construido), devuelve `null` y
 * el llamador cae al barrido completo de siempre — cero riesgo de
 * regresión.
 */
(function (global) {
  'use strict';

  // Debe coincidir EXACTAMENTE con normalizarTexto() de
  // motor-exposicion.js. Si estas dos normalizaciones alguna vez
  // divergen, el índice puede generar falsos negativos (peor que los
  // falsos positivos, que el re-chequeo exacto absorbe sin problema).
  function normalizarTexto(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function trigramas(s) {
    if (s.length < 3) return s ? [s] : [];
    var out = [];
    for (var i = 0; i <= s.length - 3; i++) out.push(s.substr(i, 3));
    return out;
  }

  var postings = Object.create(null); // trigrama -> [lugares...]
  var indexado = false;

  /**
   * Construye (o reconstruye) el índice completo. Se llama una vez al
   * cargar el catálogo y otra vez cuando lugares-detalles.json termina
   * de rellenar `direccion` en segundo plano (ver app.js) — direccion
   * empieza en null y varios lugares solo matchean por dirección, así
   * que sin ese segundo llamado esos matches quedarían indexados como
   * si la dirección nunca hubiese llegado.
   */
  function construir(registro) {
    var nuevoPostings = Object.create(null);
    if (!Array.isArray(registro) || !registro.length) {
      postings = nuevoPostings;
      indexado = false;
      return;
    }

    registro.forEach(function (lugar) {
      var texto = normalizarTexto(
        (lugar.nombre || '') + ' ' + (lugar.categoria || '') + ' ' + (lugar.direccion || '')
      );
      var vistos = Object.create(null); // no repetir el mismo lugar en el mismo trigrama
      trigramas(texto).forEach(function (tri) {
        if (vistos[tri]) return;
        vistos[tri] = true;
        if (!nuevoPostings[tri]) nuevoPostings[tri] = [];
        nuevoPostings[tri].push(lugar);
      });
    });

    postings = nuevoPostings;
    indexado = true;
  }

  /**
   * Devuelve un superconjunto candidato de lugares (referencias, no
   * copias) que PODRÍAN matchear `query`, o `null` si el índice no
   * puede reducir nada de forma confiable. Nunca decide qué es un
   * match real — eso lo sigue haciendo motor-exposicion.js.
   */
  function candidatosPara(query) {
    if (!indexado) return null;
    var q = normalizarTexto(String(query || '').trim());
    if (q.length < 3) return null; // trigramas no aplican a consultas de 1-2 chars

    var tris = trigramas(q);
    var listas = [];
    for (var i = 0; i < tris.length; i++) {
      var lista = postings[tris[i]];
      if (!lista || !lista.length) return []; // ningún lugar tiene este trigrama -> cero candidatos
      listas.push(lista);
    }

    // Intersección empezando por la lista más chica, para tocar el
    // menor número de lugares posible en cada paso.
    listas.sort(function (a, b) { return a.length - b.length; });

    var acumulado = listas[0];
    for (var j = 1; j < listas.length && acumulado.length; j++) {
      var siguiente = new Set(listas[j]);
      acumulado = acumulado.filter(function (lugar) { return siguiente.has(lugar); });
    }
    return acumulado;
  }

  /**
   * Variante tolerante a errores tipográficos de candidatosPara(): en vez
   * de exigir TODOS los trigramas de la consulta (intersección estricta),
   * cuenta cuántos trigramas de la consulta tiene cada lugar y exige un
   * mínimo — la misma idea de "similarity threshold" de pg_trgm, calculada
   * acá en vez de depender de una extensión de base de datos. Sigue
   * siendo NECESARIO-PERO-NO-SUFICIENTE: motor-exposicion.js decide con
   * distancia de edición real si el lugar entra y con qué prioridad —
   * esto solo evita recorrer el catálogo completo para calcularla.
   *
   * `maxDistancia` es la cantidad de errores tipográficos tolerados (1 o
   * 2 en la práctica). Cada carácter distinto entre la consulta y el
   * texto real puede destruir hasta 3 trigramas (los que lo contienen),
   * así que el mínimo de trigramas en común exigido es (total de
   * trigramas de la consulta) - 3 * maxDistancia, con un piso de 1 para
   * no exigir cero coincidencias.
   */
  function candidatosDifusos(query, maxDistancia) {
    if (!indexado) return null;
    var q = normalizarTexto(String(query || '').trim());
    if (q.length < 4) return null; // con 1-3 chars, un typo es indistinguible de otra palabra

    var tris = trigramas(q);
    if (!tris.length) return null;

    var conteo = new Map();
    for (var i = 0; i < tris.length; i++) {
      var lista = postings[tris[i]];
      if (!lista) continue;
      for (var j = 0; j < lista.length; j++) {
        var lugar = lista[j];
        conteo.set(lugar, (conteo.get(lugar) || 0) + 1);
      }
    }

    var umbral = Math.max(1, tris.length - 3 * maxDistancia);
    var resultado = [];
    conteo.forEach(function (veces, lugar) {
      if (veces >= umbral) resultado.push(lugar);
    });
    return resultado;
  }

  global.IndiceInvertido = {
    construir: construir,
    candidatosPara: candidatosPara,
    candidatosDifusos: candidatosDifusos
  };
})(typeof window !== 'undefined' ? window : global);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window.IndiceInvertido : global.IndiceInvertido);
}

/* ==== datos-virtualizador.js ==== */
(function() {
  'use strict';
  var TILE_SIZE = 0.05;
  var CACHE_TILES = new Map();
  var lugaresEnCache = new Map();
  var FETCH_BUFFER = 2;

  function getTileKey(lat, lng) {
    var tileX = Math.floor(lng / TILE_SIZE);
    var tileY = Math.floor(lat / TILE_SIZE);
    return tileX + ',' + tileY;
  }

  function getTilesForViewport(bounds) {
    var tiles = new Set();
    var minX = Math.floor(bounds.west / TILE_SIZE);
    var maxX = Math.floor(bounds.east / TILE_SIZE);
    var minY = Math.floor(bounds.south / TILE_SIZE);
    var maxY = Math.floor(bounds.north / TILE_SIZE);

    for (var x = minX - FETCH_BUFFER; x <= maxX + FETCH_BUFFER; x++) {
      for (var y = minY - FETCH_BUFFER; y <= maxY + FETCH_BUFFER; y++) {
        tiles.add(x + ',' + y);
      }
    }
    return tiles;
  }

  function fetchTile(tileKey) {
    if (CACHE_TILES.has(tileKey)) {
      return Promise.resolve(CACHE_TILES.get(tileKey));
    }
    return fetch('datos/lugares-mapa-tiles/' + tileKey + '.json')
      .then(r => r.ok ? r.json() : [])
      .then(lugares => {
        CACHE_TILES.set(tileKey, lugares);
        lugares.forEach(l => lugaresEnCache.set(l.id, l));
        return lugares;
      })
      .catch(e => { console.warn('Tile error:', e); return []; });
  }

  window.Virtualizador = {
    cargarParaViewport(bounds) {
      var tiles = getTilesForViewport(bounds);
      var promesas = Array.from(tiles).map(fetchTile);
      return Promise.all(promesas).then(resultados => {
        var todos = [];
        resultados.forEach(tile => { todos = todos.concat(tile || []); });
        return todos;
      });
    },
    obtenerCacheado(id) { return lugaresEnCache.get(id); },
    limpiarCache() { CACHE_TILES.clear(); lugaresEnCache.clear(); }
  };
})();
