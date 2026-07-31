/*
 * js/ambiente.bundle.js — GENERADO, NO EDITAR A MANO.
 * Fuente: js/ambiente-*.js (27 módulos) + scripts/build-ambiente-bundle.js
 * Para modificar el Ambient Engine, editá el módulo ambiente-*.js
 * correspondiente y volvé a correr:
 *   node scripts/build-ambiente-bundle.js
 * Generado: 2026-07-31T19:05:43.836Z
 */

/* ==== ambiente-config.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-config.js
   Fase 2: Configuration System (Arquitectura técnica, Cap. 3.14 / 6.1 / 9.6)

   Subsistema del Grupo de Infraestructura. Responsabilidad única:
   centralizar las definiciones declarativas de escenas, niveles de
   fidelidad y umbrales de rendimiento por defecto (Cap. 3.14) — es
   una fuente de datos, no un motor de reglas.

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 2.3 / 3.14 — el Grupo de Infraestructura nunca inicia
     comunicación ni conoce el estado, la escena activa ni ningún
     otro dato de contexto: solo responde solicitudes de lectura,
     de forma idéntica sin importar quién pregunta.
   - Cap. 3.14 — "nunca debe contener lógica condicional compleja".
     Las funciones expuestas son lecturas directas de un catálogo
     congelado, nada más.
   - Cap. 6.1 — una escena se define acá como una entrada puramente
     declarativa (seis dimensiones: fondo, partículas, clima, luz,
     profundidad —navegación + atmósfera—, y transición), nunca como
     comportamiento programado. Ningún subsistema del Grupo de
     Contenido Visual necesita conocer el nombre de una escena para
     funcionar, solo los valores numéricos que esta escena declara.
   - Cap. 7.2 — ORDEN_DEGRADACION refleja exactamente el orden fijado
     ahí: Clima, luego Partículas, luego Navegación, luego Atmósfera,
     y solo en condiciones extremas Relieve. Fondo y Luz nunca se
     desactivan.
   - Cap. 9.6 / 9.7 — los niveles de fidelidad son configuraciones
     completas y deliberadas, no un recorte automático de parámetros.

   Contenido cargado directamente desde el documento de diseño
   Fase 1 (Cap. 5 — Escenas; Cap. 5.12 — tabla resumen de actividad
   ambiental; Cap. 3.1 — bandas de velocidad; Cap. 3.4 — respiración).
   Lluvia, Noche y Atardecer NO son escenas de este catálogo: el
   documento de diseño (Cap. 5.7-5.9) las define explícitamente como
   variaciones que se superponen a cualquiera de las ocho escenas de
   abajo, no como entradas excluyentes del catálogo. Noche/Atardecer
   ya viven como ciclo horario continuo en ambiente-capa-fondo.js;
   Lluvia es un toggle que resolverá el futuro Weather Engine.

   Debe cargarse ANTES que cualquier otro módulo del Ambient Engine
   que lo consulte (con scripts `defer`, eso significa: primero de
   todos, junto al resto del Grupo de Infraestructura).
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // Congela un objeto y todos sus valores-objeto anidados. El
  // catálogo entero debe ser inmutable: ningún subsistema debe poder
  // alterar en tiempo de ejecución la configuración que otro ya leyó
  // (Cap. 3.14 — fuente de datos, no estado mutable compartido).
  function congelarProfundo(valor) {
    if (valor && typeof valor === 'object' && !Object.isFrozen(valor)) {
      Object.values(valor).forEach(congelarProfundo);
      Object.freeze(valor);
    }
    return valor;
  }

  // ── Escenas (Documento de diseño, Cap. 5) ───────────────────────
  // Cada escena declara sus seis dimensiones (Cap. 6.1): fondo
  // (aporte propio a la Capa de Fondo: intensidad de Relieve y
  // saturación), partículas, clima (si puede activarse en esta
  // escena), luz, profundidad (navegación + atmósfera) y transición.
  // Los valores son multiplicadores 0-1 sobre el parámetro estándar
  // de cada capa, nunca unidades absolutas — así ninguna escena
  // necesita conocer el techo real de partículas o el rango de
  // brillo, eso lo resuelve cada subsistema de Contenido Visual
  // contra su propio rango (Cap. 2.3: el catálogo no conoce
  // implementación de capas, solo describe intención).
  //
  // actividadAmbiental y focoPrincipal son metadata informativa
  // (Cap. 5.12), usada por Diagnostics & Telemetry y por los
  // comentarios de otros módulos — ningún subsistema de Contenido
  // Visual debe ramificar lógica según su valor de texto.
  var ESCENAS = {
    home: {
      nombre: 'Home',
      actividadAmbiental: 'media-alta',
      focoPrincipal: 'Bienvenida abierta',
      fondo: { intensidadRelieve: 0.35, saturacion: 1 },
      particulas: { densidad: 1, libertadRecorrido: 0.5 },
      clima: { habilitado: true },
      luz: { intensidad: 0.7 },
      profundidad: { navegacion: 0.2, atmosfera: 0.3 },
      transicion: { banda: 'contexto' },
      presupuestoContraste: 0.6
    },
    hero: {
      nombre: 'Hero',
      actividadAmbiental: 'alta',
      focoPrincipal: 'Primera impresión',
      fondo: { intensidadRelieve: 0.4, saturacion: 1 },
      particulas: { densidad: 1, libertadRecorrido: 0.6 },
      clima: { habilitado: true },
      luz: { intensidad: 0.95 },
      profundidad: { navegacion: 0.2, atmosfera: 0.3 },
      transicion: { banda: 'contexto' },
      presupuestoContraste: 0.75,
      // Cap. 5.2 Fase 1: "por un instante breve (no más de 1.5 a 2
      // segundos)" — única escena con techo temporal propio para su
      // pico de expresividad. Ningún otro subsistema debe leer este
      // campo salvo el Motion Controller.
      picoMaximoMs: 2000
    },
    explorando: {
      nombre: 'Explorando',
      actividadAmbiental: 'media-alta',
      focoPrincipal: 'Paseo, curiosidad',
      fondo: { intensidadRelieve: 0.35, saturacion: 1 },
      particulas: { densidad: 1, libertadRecorrido: 0.85 },
      clima: { habilitado: true },
      luz: { intensidad: 0.65 },
      profundidad: { navegacion: 0.6, atmosfera: 0.3 },
      transicion: { banda: 'contexto' },
      presupuestoContraste: 0.65
    },
    buscando: {
      nombre: 'Buscando',
      actividadAmbiental: 'media',
      focoPrincipal: 'Concentración asistida',
      fondo: { intensidadRelieve: 0.25, saturacion: 1 },
      particulas: { densidad: 0.5, libertadRecorrido: 0.3 },
      // Cap. 5.4 Fase 1: "la Capa de Clima se desactiva
      // temporalmente" — única escena que apaga clima por completo
      // como parte de su propia definición, no por degradación de
      // rendimiento.
      clima: { habilitado: false },
      luz: { intensidad: 0.55 },
      profundidad: { navegacion: 0.15, atmosfera: 0.55 },
      transicion: { banda: 'contexto' },
      presupuestoContraste: 0.45
    },
    ficha: {
      nombre: 'Leyendo una ficha',
      actividadAmbiental: 'minima',
      focoPrincipal: 'Legibilidad total',
      fondo: { intensidadRelieve: 0.1, saturacion: 1 },
      particulas: { densidad: 0.15, libertadRecorrido: 0.1 },
      clima: { habilitado: true },
      luz: { intensidad: 0.3 },
      profundidad: { navegacion: 0.05, atmosfera: 0.2 },
      transicion: { banda: 'contexto' },
      presupuestoContraste: 0.2
    },
    mapa: {
      nombre: 'Mapa',
      actividadAmbiental: 'media',
      focoPrincipal: 'Orientación precisa',
      fondo: { intensidadRelieve: 0.2, saturacion: 1 },
      particulas: { densidad: 0.3, libertadRecorrido: 0.2 },
      clima: { habilitado: true },
      luz: { intensidad: 0.5 },
      // Cap. 5.6 Fase 1: "la Capa de Navegación alcanza su máxima
      // presencia funcional".
      profundidad: { navegacion: 1, atmosfera: 0.3 },
      transicion: { banda: 'contexto' },
      presupuestoContraste: 0.5
    },
    error: {
      nombre: 'Error',
      actividadAmbiental: 'minima',
      focoPrincipal: 'Contención, calma',
      // Cap. 5.10 Fase 1: "la paleta se desatura levemente (nunca a
      // blanco y negro)" — 0.85 es una reducción leve, nunca 0.
      fondo: { intensidadRelieve: 0.15, saturacion: 0.85 },
      particulas: { densidad: 0.1, libertadRecorrido: 0.05 },
      // Cap. 5.10 Fase 1: "niebla muy tenue" propia de esta escena —
      // metáfora distinta de la variación Lluvia (Cap. 5.7), no un
      // segundo tipo de clima en el catálogo. El futuro Weather
      // Engine decide cómo representarla; acá solo se declara la
      // intención.
      clima: { habilitado: true, nieblaSutil: true },
      luz: { intensidad: 0.25 },
      profundidad: { navegacion: 0, atmosfera: 0.15 },
      transicion: { banda: 'contexto' },
      presupuestoContraste: 0.15
    },
    sinResultados: {
      nombre: 'Sin resultados',
      actividadAmbiental: 'media',
      focoPrincipal: 'Invitación a seguir explorando',
      // Cap. 5.11 Fase 1: "la Capa de Relieve se abre levemente" —
      // por eso es mayor que el valor estándar de Home (0.35).
      fondo: { intensidadRelieve: 0.45, saturacion: 1 },
      particulas: { densidad: 0.5, libertadRecorrido: 0.4 },
      clima: { habilitado: true },
      luz: { intensidad: 0.6 },
      profundidad: { navegacion: 0.1, atmosfera: 0.25 },
      transicion: { banda: 'contexto' },
      presupuestoContraste: 0.45
    }
  };

  // Escena de arranque (Cap. 6.1 Fase 0 del roadmap Fase 1: "abrir la
  // app ya cuenta como el primer momento de atención del usuario").
  var ESCENA_INICIAL = 'home';

  // ── Niveles de fidelidad (Cap. 9.6 / 9.7) ───────────────────────
  // Multiplicadores adicionales que el Performance Manager aplica
  // POR ENCIMA de los valores de la escena activa, nunca al revés.
  // Fondo y Luz permanecen siempre en 1: "sin ellas el sistema
  // dejaría de tener cualquier identidad visual reconocible" (Cap.
  // 7.2). El orden en que cada nivel apaga capas replica exactamente
  // ORDEN_DEGRADACION, definido una sola vez más abajo.
  var NIVELES_FIDELIDAD = {
    completa: {
      fondo: 1, luz: 1, relieve: 1, atmosfera: 1, navegacion: 1,
      particulas: 1, clima: 1
    },
    reducida: {
      fondo: 1, luz: 1, relieve: 1, atmosfera: 1, navegacion: 1,
      particulas: 0.5, clima: 0
    },
    minima: {
      fondo: 1, luz: 1, relieve: 0.5, atmosfera: 0.1, navegacion: 0,
      particulas: 0.15, clima: 0
    }
  };

  var NIVEL_FIDELIDAD_INICIAL = 'completa';

  // Cap. 7.2: orden exacto de desactivación ante restricción de
  // recursos. 'fondo' y 'luz' quedan fuera a propósito — nunca se
  // desactivan, por eso no forman parte de esta secuencia.
  var ORDEN_DEGRADACION = ['clima', 'particulas', 'navegacion', 'atmosfera', 'relieve'];

  // ── Bandas de velocidad (Documento de diseño, Cap. 3.1) ─────────
  // Fase 4 (Motion Direction Bible, Cap. 5): estas tres bandas ya
  // mapean a tres de los cuatro Registros de Ritmo (respuesta →
  // inmediato, contexto → conversacional, ambiental → fondo, este
  // último como período de ciclo, no como duración de transición
  // puntual). Faltaba una banda propia para el registro
  // contemplativo — el más lento después de fondo, reservado a
  // ingreso al sitio, cambios de escena y momentos sin resultados
  // (Cap. 5). La Biblia declina fijar milisegundos ("no se definen
  // milisegundos, se definen criterios", Cap. 10); este rango es una
  // elección pragmática consistente con el resto de esta tabla, no
  // una especificación de Fase 5 — debe revisarse cuando exista ese
  // documento.
  var BANDAS_VELOCIDAD = {
    ambiental: { minMs: 20000, maxMs: 90000 },
    contemplativo: { minMs: 900, maxMs: 2000 },
    contexto: { minMs: 400, maxMs: 900 },
    respuesta: { minMs: 80, maxMs: 250 }
  };

  // ── Respiración ambiental (Documento de diseño, Cap. 3.4) ───────
  var RESPIRACION = {
    amplitudMaxima: 0.04, // "variación de brillo de menos del 4%"
    periodoMinMs: 8000,
    periodoMaxMs: 15000
  };

  // ── Umbrales de tiempo del State Manager (Documento de diseño,
  // Cap. 6.1 / 6.5) ────────────────────────────────────────────────
  var UMBRALES = {
    // "más de 20-30 segundos sin gesto alguno" — punto medio del rango.
    inactividadMs: 25000,
    // "todo estado de Carga debe tener un límite temporal máximo" —
    // más allá de esto, Carga pasa a Error por timeout aunque la
    // solicitud original siga pendiente (Cap. 6.5 Fase 1).
    //
    // Fase 4 (Motion Direction Bible v2.0, K.11/B.2.3): antes era 8000,
    // un número puramente ambiental sin ningún consumidor real en el
    // código — mientras que js/failsafe-reintentar.js (la red de
    // seguridad real de datos) usaba 12000 de forma independiente. Se
    // sube este valor a 12000 y failsafe-reintentar.js pasa a leerlo,
    // para que ambos timeouts sean uno solo: el dato real es lo que no
    // puede fallar primero, así que gana el número que ya funciona en
    // producción, no el ambiental teórico.
    timeoutCargaMs: 12000,
    // "un breve instante de quietud total (200-300 ms) antes de una
    // transición importante" (Cap. 3.5 Fase 1).
    pausaPreTransicionMs: { minMs: 200, maxMs: 300 },
    // Debajo de este tiempo de espera en Carga no se muestra ningún
    // indicador funcional adicional, solo la propia ambientación
    // (Cap. 6.1 Fase 1: "si la espera supera los tres segundos").
    umbralIndicadorCargaMs: 3000
  };

  // ── Heurística de capacidad de dispositivo (reemplaza los
  // literales que hoy vive sueltos en ambiente-senales.js; el
  // Performance Manager de Fase 2 debe leer estos umbrales desde
  // acá, nunca definir los suyos propios — Cap. 9.6: "definidos de
  // antemano en el Configuration System") ─────────────────────────
  var DISPOSITIVO = {
    nucleosBajo: 2,
    nucleosMedio: 4,
    memoriaBajoGb: 2,
    memoriaMedioGb: 4
  };

  // ── Umbrales de FPS real para degradar/recuperar fidelidad
  // (Cap. 9.6 Arquitectura: "gestionados por el Performance Manager
  // como un valor único que el Motion Controller consulta"). La
  // recuperación exige más ciclos consecutivos que la degradación —
  // histéresis deliberada para no oscilar entre niveles en cada
  // frame límite. ────────────────────────────────────────────────
  var RENDIMIENTO = {
    fpsObjetivo: 60,
    fpsUmbralReducida: 45,
    fpsUmbralMinima: 30,
    ventanaMuestreoMs: 4000,
    ciclosConsecutivosParaDegradar: 3,
    ciclosConsecutivosParaRecuperar: 6
  };

  // ── Assets conceptuales (Documento de diseño, Cap. 7) ───────────
  // El Asset Registry (Cap. 3.13 Arquitectura) es solo el mecanismo
  // de acceso y caché; el catálogo y la decisión de carga anticipada
  // vs. diferida son datos, y por eso viven acá (Cap. 8.1
  // Arquitectura: "responsabilidad del Configuration System,
  // expresada como un atributo de cada asset"). 'capa' identifica a
  // qué capa visual pertenece cada asset (Cap. 7.10 Fase 1: "todo
  // elemento gráfico... debe poder responder a qué capa pertenece").
  // 'carga' es 'anticipada' (necesario desde Home, Cap. 8.1) o
  // 'diferida' (asociado a escenas que pueden no activarse nunca).
  var ASSETS = {
    'forma-particula-punto': {
      tipo: 'forma-particula', capa: 'particulas', carga: 'anticipada'
    },
    'forma-particula-mota': {
      tipo: 'forma-particula', capa: 'particulas', carga: 'diferida'
    },
    'paleta-ciclo-diario': {
      tipo: 'paleta', capa: 'fondo', carga: 'anticipada'
    },
    'curvas-topograficas': {
      tipo: 'textura', capa: 'fondo', carga: 'anticipada',
      // Fase 3 (Lenguaje de Assets, Paso 3): asset SVG real,
      // consumido por js/ambiente-topografia.js vía
      // AmbienteAssets.obtenerBinario() e insertado en el plano P0.
      archivo: 'assets/ambient/topograficas/topograficas--default--hairline.svg'
    },
    'patron-carta-marina': {
      tipo: 'patron', capa: 'fondo', carga: 'diferida'
    },
    'textura-luz-resplandor': {
      tipo: 'textura-luz', capa: 'luz', carga: 'anticipada'
    },
    'elemento-agua-reflejo': {
      tipo: 'elemento-agua', capa: 'luz', carga: 'diferida'
    },
    'rosa-vientos': {
      tipo: 'referencia-direccional', capa: 'profundidad', carga: 'diferida'
    },
    'lineas-cartograficas': {
      tipo: 'linea-cartografica', capa: 'profundidad', carga: 'anticipada',
      // Fase 3 (Paso 4, integración): 'carga' pasa de 'diferida' a
      // 'anticipada' — discrepancia que el propio changelog.md dejó
      // anotada pendiente desde Paso 2. Como sustrato P0 (Cap. 4.1),
      // la Retícula debe estar presente desde el primer instante de
      // cualquier escena, igual que 'curvas-topograficas'; 'diferida'
      // solo tiene sentido para assets atados a una escena que puede
      // no activarse nunca (Cap. 8.1), y ese no es el caso acá.
      // Fase 3 (Lenguaje de Assets, Paso 2): asset SVG real,
      // consumido por js/ambiente-reticula.js vía
      // AmbienteAssets.obtenerBinario() e insertado en el plano P0.
      // Nota: 'capa: profundidad' es la taxonomía conceptual previa
      // a la Fase 3 (Cap. 7.10 Fase 1); el plano real que usa este
      // asset hoy es P0 del Plane Manager (Cap. 4.1) — no se
      // renombra este campo para no romper otros lectores existentes
      // del catálogo, pero queda documentado acá la diferencia.
      archivo: 'assets/ambient/reticula/reticula--default--hairline.svg'
    },
    'corrientes': {
      tipo: 'linea-flujo', capa: 'profundidad', carga: 'anticipada',
      // Fase 3 (Lenguaje de Assets, familia Corrientes): asset SVG
      // real, consumido por js/ambiente-corrientes.js vía
      // AmbienteAssets.obtenerBinario() e insertado en el plano P1
      // (Cap. 4.1: "Corriente" — corrientes + coordenadas). 'carga:
      // anticipada' por el mismo criterio que 'lineas-cartograficas'
      // y 'curvas-topograficas': es sustrato ambiental permanente de
      // cualquier escena, no un asset atado a una escena que puede
      // no activarse nunca (Cap. 8.1) — 'diferida' no aplicaría acá.
      // 'capa: profundidad' es la taxonomía conceptual previa a la
      // Fase 3 (Cap. 7.10 Fase 1), igual que en 'lineas-cartograficas'
      // (ver esa nota): el plano real que usa este asset es P1 del
      // Plane Manager (Cap. 4.1), no se renombra el campo para no
      // romper otros lectores existentes del catálogo.
      archivo: 'assets/ambient/corrientes/corrientes--diagonal-lenta--hairline.svg'
    },
    'coordenadas': {
      tipo: 'coordenadas', capa: 'profundidad', carga: 'diferida',
      // Fase 3 (Lenguaje de Assets, familia Coordenadas): asset SVG
      // real, consumido por js/ambiente-coordenadas.js. A diferencia
      // de 'lineas-cartograficas'/'curvas-topograficas'/'corrientes',
      // acá 'diferida' es correcto tal cual estaba (no una
      // discrepancia a resolver): Coordenadas no es sustrato
      // permanente, es un marcador que se activa solo cuando hay un
      // punto seleccionado (Cap. 6.1) — carga anticipada no aplica.
      archivo: 'assets/ambient/coordenadas/coordenadas--default--hairline.svg'
    },
    'brujula': {
      tipo: 'brujula', capa: 'orientacion', carga: 'anticipada',
      // Fase 3 (Lenguaje de Assets, familia Brújula): asset SVG real,
      // consumido por js/ambiente-brujula.js vía
      // AmbienteAssets.obtenerBinario() e insertado en el plano P2
      // (Cap. 4.1: "Orientación" — brújula + partículas de deriva).
      // 'carga: anticipada' por el mismo criterio que
      // 'lineas-cartograficas'/'curvas-topograficas'/'corrientes':
      // es el "ancla simbólica única del producto" (Cap. 2.1),
      // presente desde el arranque de cualquier escena, no un asset
      // atado a una selección que puede no ocurrir nunca (Cap. 8.1)
      // — a diferencia de 'coordenadas', que sí es condicional.
      // 'capa: orientacion' es una taxonomía conceptual nueva (no
      // existía en el catálogo de Fase 1/2, a diferencia de
      // 'profundidad' que ya reutilizaban Retícula/Corrientes): no
      // había ningún asset previo de este tipo antes de la Fase 3.
      archivo: 'assets/ambient/brujula/brujula--default--regular.svg'
    },
    'particulas-deriva': {
      tipo: 'particula-deriva', capa: 'particulas', carga: 'anticipada',
      // Fase 3 (Lenguaje de Assets, familia Partículas de deriva,
      // Paso 8, roadmap Cap. 12 orden 7): asset SVG real, consumido
      // por js/ambiente-particulas-deriva.js e insertado en el plano
      // P2 (Cap. 4.1: "Orientación" — brújula + partículas de
      // deriva). 'carga: anticipada' por el mismo criterio que
      // 'brujula': es sustrato ambiental de identidad ("vida
      // orgánica", Cap. 2.1), presente desde el arranque, no un
      // asset atado a una selección que puede no ocurrir (Cap. 8.1).
      // Distinto de 'forma-particula-punto'/'forma-particula-mota'
      // (arriba, Fase 2, Particle Engine): ese catálogo describe el
      // sistema anterior basado en <div>, no la familia SVG real de
      // este documento — no se reutilizan esas entradas para no
      // mezclar dos generaciones de assets bajo el mismo id.
      archivo: 'assets/ambient/particulas/particulas--deriva-libre--hairline.svg'
    },
    'halo': {
      tipo: 'halo-foco', capa: 'foco', carga: 'diferida',
      // Fase 3 (Lenguaje de Assets, familia Halos de posición, Paso
      // 9, roadmap Cap. 12 orden 8): asset SVG real, consumido por
      // js/ambiente-halos.js e insertado en el plano P3 (Cap. 4.1:
      // "Foco"). 'carga: diferida', mismo criterio que 'coordenadas':
      // no es sustrato permanente, es un asset reactivo que solo
      // tiene sentido cuando hay un punto activo (Cap. 2.1: "el
      // único asset reactivo al usuario"). 'capa: foco' es
      // taxonomía nueva (no existía antes de esta familia), mismo
      // criterio que ya se usó para 'capa: orientacion' con Brújula.
      archivo: 'assets/ambient/halos/halos--foco-activo--feature.svg'
    },
    'clima-lluvia-lineas': {
      tipo: 'elemento-climatico', capa: 'clima', carga: 'diferida'
    },
    'clima-bruma': {
      tipo: 'elemento-climatico', capa: 'clima', carga: 'diferida'
    },
    'clima-viento-deriva': {
      tipo: 'elemento-climatico', capa: 'clima', carga: 'diferida'
    }
  };

  congelarProfundo(ASSETS);
  congelarProfundo(ESCENAS);
  congelarProfundo(NIVELES_FIDELIDAD);
  congelarProfundo(ORDEN_DEGRADACION);
  congelarProfundo(BANDAS_VELOCIDAD);
  congelarProfundo(RESPIRACION);
  congelarProfundo(UMBRALES);
  congelarProfundo(DISPOSITIVO);
  congelarProfundo(RENDIMIENTO);

  global.AmbienteConfig = {
    // Catálogos completos, para quien necesite iterarlos enteros
    // (por ejemplo, Diagnostics & Telemetry).
    ESCENAS: ESCENAS,
    ASSETS: ASSETS,
    NIVELES_FIDELIDAD: NIVELES_FIDELIDAD,
    ORDEN_DEGRADACION: ORDEN_DEGRADACION,
    BANDAS_VELOCIDAD: BANDAS_VELOCIDAD,
    RESPIRACION: RESPIRACION,
    UMBRALES: UMBRALES,
    DISPOSITIVO: DISPOSITIVO,
    RENDIMIENTO: RENDIMIENTO,
    ESCENA_INICIAL: ESCENA_INICIAL,
    NIVEL_FIDELIDAD_INICIAL: NIVEL_FIDELIDAD_INICIAL,

    // Lecturas puntuales — nunca lanzan, nunca conocen quién pregunta
    // (Cap. 3.14: "responde de forma idéntica a cualquier
    // solicitante"). Devuelven null ante un identificador desconocido
    // en lugar de fallar, para que el solicitante decida cómo
    // degradar (Cap. 6.2: el Scene Manager es quien decide qué hacer
    // si una resolución falla, no el Configuration System).
    obtenerEscena: function (id) {
      return Object.prototype.hasOwnProperty.call(ESCENAS, id) ? ESCENAS[id] : null;
    },
    listarEscenas: function () {
      return Object.keys(ESCENAS);
    },
    obtenerNivelFidelidad: function (id) {
      return Object.prototype.hasOwnProperty.call(NIVELES_FIDELIDAD, id) ? NIVELES_FIDELIDAD[id] : null;
    },
    listarNivelesFidelidad: function () {
      return Object.keys(NIVELES_FIDELIDAD);
    },
    obtenerAsset: function (id) {
      return Object.prototype.hasOwnProperty.call(ASSETS, id) ? ASSETS[id] : null;
    },
    listarAssets: function () {
      return Object.keys(ASSETS);
    },
    // Cap. 8.1: los assets de carga anticipada son, por definición,
    // los que la escena de arranque (Home) necesita desde el primer
    // instante — el Asset Registry usa esto para su prefetch inicial
    // sin tener que iterar el catálogo entero cada vez.
    listarAssetsAnticipados: function () {
      return Object.keys(ASSETS).filter(function (id) { return ASSETS[id].carga === 'anticipada'; });
    }
  };

})(window);

/* ==== ambiente-contrato.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-contrato.js
   Etapa 2 (Roadmap A+B — Contrato común)

   Subsistema del Grupo de Infraestructura. Responsabilidad única:
   describir y validar la FORMA que todo módulo ambiente-*.js deberá
   cumplir cuando se migre al orquestador con fidelidad real +
   desacople de frecuencias (Etapas 3-5 de este roadmap), y que ya
   queda pre-adaptada, sin costo extra hoy, a un futuro scheduler por
   tareas (fase C).

   Esta etapa SOLO define el contrato. Ningún módulo visual se migra
   todavía (eso es la Etapa 3, empezando por ambiente-clima.js) — este
   archivo no tiene ningún efecto sobre el comportamiento actual del
   motor: nadie lo consume todavía.

   La forma exacta que un módulo debe exponer para ser válido:

     {
       id: 'clima',                 // string único, para logging/diagnóstico
       tier: 'visual',               // 'core' | 'visual'
       frequency: 'full',            // 'full' | 'reduced' | 'static'
       isActive: function (fidelidad) { ... },  // boolean
       step:     function (dt, sharedState) { ... },  // cómputo puro
       read:     function () { ... }            // último estado calculado
     }

   Decisiones de diseño (por qué esta forma y no otra):

   - tier existe separado de frequency a propósito: tier describe SI
     un módulo puede apagarse (nunca 'core'), frequency describe CADA
     CUÁNTO corre mientras esté activo. Son dos preguntas distintas —
     colapsarlas en un solo campo obligaría a inventar combinaciones
     como 'core-full'/'core-reduced' que en la práctica no existen hoy
     (Fondo y Luz son siempre 'core'+'full', ver Cap. 7.2 de
     ambiente-config.js), pero separar los ejes deja la puerta abierta
     sin tener que romper el contrato el día que sí exista un módulo
     'core'+'reduced'.
   - step(dt, sharedState) nunca debe escribir a DOM/CSS — solo
     calcular. read() es lo único que el futuro orquestador usa para
     obtener el resultado y escribirlo en un único batch (Etapa 5:
     writer único). Separar "calcular" de "leer" es lo que permite que
     un módulo con frequency:'reduced' calcule cada 50ms pero el
     writer igual pueda preguntarle su último resultado en cualquier
     frame, sin recalcular de más.
   - isActive(fidelidad) recibe el nivel de fidelidad como parámetro
     explícito (no lee AmbienteRendimiento por su cuenta) para que un
     módulo sea testeable de forma aislada, sin necesidad de mockear
     el Performance Manager completo — mismo criterio de "fácil de
     testear" pedido para este contrato.

   Refinamiento respecto del boceto original (documentado acá para
   que quede explícito, no aplicado en silencio): agrego valores por
   defecto (tier:'visual', frequency:'full') en crear() para que un
   módulo mínimo sin necesidades especiales no tenga que declarar los
   cinco campos completos — options si un dev migra un módulo nuevo y
   se olvida de `tier`, por ejemplo, el default más conservador
   ('visual', puede apagarse) es también el más seguro: preferible que
   se pueda apagar de más a que un olvido cree accidentalmente un
   módulo 'core' que nunca se apaga.

   No depende de ningún otro subsistema — es, a propósito, la primera
   pieza de infraestructura sin ningún estado ni lectura externa
   (más simple aún que ambiente-config.js, que si depende de sí mismo
   para congelar sus catálogos). Puede cargarse en cualquier punto del
   Grupo de Infraestructura; se ubica después de ambiente-config.js
   por afinidad temática (ambos son "forma de los datos", no
   comportamiento), no por una dependencia real.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var TIERS = ['core', 'visual'];
  var FRECUENCIAS = ['full', 'reduced', 'static'];

  var TIER_DEFECTO = 'visual';
  var FRECUENCIA_DEFECTO = 'full';

  function esFuncion(valor) { return typeof valor === 'function'; }
  function esStringNoVacio(valor) { return typeof valor === 'string' && valor.length > 0; }

  // Cap. 3.14 (mismo espíritu que ambiente-diagnostico.js): validar
  // no es lo mismo que decidir — esta función nunca lanza, nunca
  // apaga nada, solo informa. Quien construye el módulo (crear(), más
  // abajo, o un test) decide qué hacer con el resultado.
  function validar(definicion) {
    var errores = [];

    if (!definicion || typeof definicion !== 'object') {
      return { valido: false, errores: ['la definición debe ser un objeto'] };
    }
    if (!esStringNoVacio(definicion.id)) {
      errores.push('id debe ser un string no vacío');
    }
    if (definicion.tier !== undefined && TIERS.indexOf(definicion.tier) === -1) {
      errores.push('tier debe ser uno de: ' + TIERS.join(', '));
    }
    if (definicion.frequency !== undefined && FRECUENCIAS.indexOf(definicion.frequency) === -1) {
      errores.push('frequency debe ser uno de: ' + FRECUENCIAS.join(', '));
    }
    if (!esFuncion(definicion.isActive)) errores.push('isActive debe ser una función');
    if (!esFuncion(definicion.step)) errores.push('step debe ser una función');
    if (!esFuncion(definicion.read)) errores.push('read debe ser una función');

    return { valido: errores.length === 0, errores: errores };
  }

  // Aplica los valores por defecto documentados arriba sin mutar la
  // definición original — devuelve un objeto nuevo, mismo criterio de
  // inmutabilidad que el catálogo de ambiente-config.js.
  function conDefectos(definicion) {
    var copia = {};
    Object.keys(definicion || {}).forEach(function (clave) { copia[clave] = definicion[clave]; });
    if (copia.tier === undefined) copia.tier = TIER_DEFECTO;
    if (copia.frequency === undefined) copia.frequency = FRECUENCIA_DEFECTO;
    return copia;
  }

  // Punto de entrada pensado para que cada ambiente-*.js migrado (a
  // partir de la Etapa 3) lo use así:
  //
  //   global.AmbienteClima = AmbienteContrato.crear({
  //     id: 'clima', frequency: 'reduced',
  //     isActive: function (fidelidad) { ... },
  //     step: function (dt, sharedState) { ... },
  //     read: function () { ... }
  //   });
  //
  // Una definición inválida NUNCA rompe el arranque (Cap. 1.4: mejor
  // no tener el módulo que tenerlo roto compitiendo con contenido
  // real) — se loggea a consola en vez de lanzar, y se devuelve tal
  // cual (con los defaults aplicados) para que el resto del sistema
  // decida cómo degradar, igual que ya hace ambiente-config.js con
  // obtenerEscena() ante un id desconocido.
  function crear(definicion) {
    var completa = conDefectos(definicion);
    var resultado = validar(completa);
    if (!resultado.valido && typeof console !== 'undefined' && console.warn) {
      console.warn(
        '[AmbienteContrato] módulo "' + (completa.id || '(sin id)') + '" no cumple el contrato: ' +
        resultado.errores.join('; ')
      );
    }
    return completa;
  }

  global.AmbienteContrato = {
    TIERS: TIERS,
    FRECUENCIAS: FRECUENCIAS,
    validar: validar,
    crear: crear
  };

})(window);

/* ==== ambiente-assets.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-assets.js
   Fase 2: Asset Registry (Arquitectura técnica, Cap. 3.13 / 8.1-8.3 / 8.6)

   Subsistema del Grupo de Infraestructura. Responsabilidad única:
   centralizar el acceso a los assets conceptuales del sistema (Cap.
   3.13) detrás de una caché de dos niveles (Cap. 8.3). No contiene
   lógica de comportamiento ni de decisión visual — es un catálogo
   consultable, no un motor de decisión.

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 3.13 — "nunca debe conocer qué escena, estado o subsistema
     está solicitando un asset". obtener() no recibe ni examina
     contexto alguno, responde igual sin importar el llamador.
   - Cap. 8.1 — la propia definición de cada asset (a qué capa
     pertenece, si es de carga anticipada o diferida) vive en
     AmbienteConfig, no acá; este módulo solo la consulta.
   - Cap. 8.3 — caché de dos niveles: una caché "caliente" de acceso
     inmediato, y un nivel de origen (acá, el propio catálogo de
     AmbienteConfig) al que se recurre solo ante una falla de caché.
   - Cap. 8.6 — expulsión por antigüedad (LRU) en la caché caliente,
     con límite de tamaño ajustable por el Performance Manager, para
     evitar crecimiento indefinido en sesiones largas.
   - Cap. 11.3 — no importa ningún subsistema de Contenido Visual, de
     Gobierno ni de Orquestación; su única dependencia permitida es
     AmbienteConfig (otro subsistema del propio Grupo de
     Infraestructura, Cap. 2.3).

   Debe cargarse después de ambiente-config.js y antes de cualquier
   subsistema que solicite assets (todo el Grupo de Contenido Visual
   y el Scene Manager).
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // Tamaño por defecto de la caché caliente. Ajustable en tiempo de
  // ejecución exclusivamente por el Performance Manager (Cap. 8.3:
  // "un parámetro gestionado por el Performance Manager, que puede
  // reducirlo bajo restricciones de memoria") — ningún otro
  // subsistema debería llamar a establecerTamanoCache().
  var TAMANO_CACHE_POR_DEFECTO = 24;
  var tamanoMaximoCache = TAMANO_CACHE_POR_DEFECTO;

  // Caché caliente: Map preserva orden de inserción, que reutilizamos
  // como orden de "uso más reciente" reinsertando la clave en cada
  // acceso — la primera clave del Map es siempre la candidata más
  // antigua a expulsar (Cap. 8.6: "los assets menos usados
  // recientemente se liberan primero").
  var cacheCaliente = new Map();

  function marcarComoUsadoRecientemente(id, valor) {
    if (cacheCaliente.has(id)) cacheCaliente.delete(id);
    cacheCaliente.set(id, valor);
    expulsarSiExcede();
  }

  function expulsarSiExcede() {
    while (cacheCaliente.size > tamanoMaximoCache) {
      var masAntigua = cacheCaliente.keys().next().value;
      cacheCaliente.delete(masAntigua);
    }
  }

  // Nivel de origen: el propio catálogo de AmbienteConfig. Una falla
  // de caché consulta acá; un identificador inexistente en el
  // catálogo es una falla real, no de caché, y se resuelve como no
  // disponible (Cap. 3.13: "el asset solicitado, o una señal de no
  // disponibilidad").
  function resolverDesdeOrigen(id) {
    if (!global.AmbienteConfig) return null;
    return global.AmbienteConfig.obtenerAsset(id);
  }

  // ── Caché de binarios (Cap. 8.1, "fases posteriores") ───────────
  // La caché de arriba guarda metadata conceptual (obtener()); esta
  // es la caché de segundo nivel para los assets que sí son binarios
  // reales a descargar por red (SVG). Misma política LRU que la
  // caché caliente, pero separada: mezclar objetos de metadata con
  // strings de markup en la misma caché complicaría el cálculo de
  // "tamaño" sin ganar nada.
  var TAMANO_CACHE_BINARIOS_POR_DEFECTO = 12;
  var tamanoMaximoCacheBinarios = TAMANO_CACHE_BINARIOS_POR_DEFECTO;
  var cacheBinarios = new Map();

  function marcarBinarioUsado(id, valor) {
    if (cacheBinarios.has(id)) cacheBinarios.delete(id);
    cacheBinarios.set(id, valor);
    while (cacheBinarios.size > tamanoMaximoCacheBinarios) {
      cacheBinarios.delete(cacheBinarios.keys().next().value);
    }
  }

  // Los SVG de familia referencian assets/ambient/_primitivas/... con
  // rutas relativas a su propia carpeta (Cap. 3.3: "ensamblan las
  // mismas 5 primitivas" vía <use href>). Eso es correcto cuando el
  // archivo se sirve solo, pero se rompe si el markup se inyecta
  // inline dentro de index.html (la ruta relativa pasaría a
  // resolverse contra la URL de la página, no la del SVG de origen).
  // Se resuelve acá, una sola vez, al cachear — así ninguna familia
  // tiene que preocuparse por esto al consumir obtenerBinario().
  function resolverRutasRelativas(markupSvg, urlOrigenSvg) {
    return markupSvg.replace(/(href)="([^"]+)"/g, function (coincidencia, atributo, valor) {
      if (valor.charAt(0) === '#') return coincidencia; // referencia interna, no tocar
      try {
        return atributo + '="' + new URL(valor, urlOrigenSvg).href + '"';
      } catch (e) {
        return coincidencia;
      }
    });
  }


  var api = {
    // Solicitud de asset por identificador (Cap. 3.13). Sincrónico:
    // resuelve la definición conceptual del asset (a qué capa
    // pertenece, si es de carga anticipada, etc.), nunca el binario.
    // Para el binario real (SVG a insertar en el DOM) ver
    // obtenerBinario() más abajo — método aparte y asincrónico, para
    // no romper a nadie que ya dependa de que obtener() sea síncrono.
    obtener: function (id) {
      if (cacheCaliente.has(id)) {
        var enCache = cacheCaliente.get(id);
        marcarComoUsadoRecientemente(id, enCache); // refresca antigüedad
        return enCache;
      }
      var desdeOrigen = resolverDesdeOrigen(id);
      if (desdeOrigen === null) return null; // señal de no disponibilidad
      marcarComoUsadoRecientemente(id, desdeOrigen);
      return desdeOrigen;
    },

    // Cap. 8.1: carga anticipada de los assets que la escena Home
    // necesita desde el primer instante de la sesión. El propio
    // Configuration System decide cuáles son (carga: 'anticipada');
    // este método solo los precalienta en caché.
    precalentar: function () {
      if (!global.AmbienteConfig) return;
      global.AmbienteConfig.listarAssetsAnticipados().forEach(function (id) {
        api.obtener(id);
      });
    },

    // Cap. 8.1 "fases posteriores": resuelve el binario real (markup
    // SVG) de un asset, si su definición en AmbienteConfig declara
    // 'archivo'. Asincrónico siempre (aunque venga de la caché
    // caliente de binarios) para que ninguna familia tenga que
    // manejar dos formas distintas de llamarlo según haya pegado en
    // caché o no. Un id sin 'archivo' definido, o que falle al
    // descargarse, resuelve a null — nunca rechaza la promesa: una
    // familia sin su asset debe poder no dibujarse, nunca romper el
    // arranque del Ambient Engine (mismo principio de "señal de no
    // disponibilidad" que ya usa obtener()).
    obtenerBinario: function (id) {
      if (cacheBinarios.has(id)) {
        var enCache = cacheBinarios.get(id);
        marcarBinarioUsado(id, enCache);
        return Promise.resolve(enCache);
      }
      var meta = resolverDesdeOrigen(id);
      if (!meta || !meta.archivo) return Promise.resolve(null);
      var urlOrigen = new URL(meta.archivo, document.baseURI).href;
      return fetch(meta.archivo).then(function (respuesta) {
        return respuesta.ok ? respuesta.text() : null;
      }).then(function (texto) {
        if (texto == null) return null;
        var resuelto = resolverRutasRelativas(texto, urlOrigen);
        marcarBinarioUsado(id, resuelto);
        return resuelto;
      }).catch(function () {
        return null; // Cap. 3.13: falla se resuelve como no disponibilidad, nunca como excepción hacia el llamador
      });
    },

    // Superficie exclusiva del Performance Manager (Cap. 8.3 / 8.6).
    establecerTamanoCache: function (tamano) {
      if (typeof tamano !== 'number' || tamano < 1) return;
      tamanoMaximoCache = Math.floor(tamano);
      expulsarSiExcede();
    },

    // Solo para Diagnostics & Telemetry / depuración — nunca debe
    // usarse para tomar decisiones de comportamiento visual.
    estadoCache: function () {
      return {
        tamanoActual: cacheCaliente.size,
        tamanoMaximo: tamanoMaximoCache,
        claves: Array.from(cacheCaliente.keys())
      };
    }
  };

  global.AmbienteAssets = api;

})(window);

/* ==== ambiente-diagnostico.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-diagnostico.js
   Fase 2: Diagnostics & Telemetry (Arquitectura técnica, Cap. 3.14 / 8.6)

   Subsistema del Grupo de Infraestructura. Responsabilidad única:
   registrar métricas de funcionamiento interno del Ambient Engine
   (cuadros por segundo efectivos, frecuencia de activación del
   Estado de Reducción, tiempos de transición reales — Cap. 3.14)
   para informar decisiones futuras de ajuste, sin exponerlas como
   parte del comportamiento visual del sistema.

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 3.14 — "nunca debe influir en tiempo real sobre el
     comportamiento del sistema". Este archivo no importa, no llama y
     no conoce a ningún otro subsistema salvo para ser consultado por
     ellos — es un sumidero de eventos de un solo sentido (entradas
     de registro, salidas de lectura), nunca emite señales propias
     que otro subsistema deba escuchar.
   - Cap. 2.3 — Grupo de Infraestructura: "no inicia comunicación
     hacia ningún otro subsistema, únicamente responde a
     solicitudes". No conoce escena, estado ni contexto de quien
     registra un evento; solo el tipo de métrica y su valor.
   - Cap. 8.6 — "debe aplicar sus propios límites de retención": es
     la única excepción del sistema autorizada a acumular una
     serie de eventos en el tiempo, y por eso es también la única
     obligada a acotarla explícitamente (buffer circular de tamaño
     fijo por tipo de métrica, nunca una lista sin límite).

   Debe cargarse junto al resto del Grupo de Infraestructura, antes
   de cualquier subsistema que vaya a registrar eventos en él
   (Performance Manager, State Manager, Scene Manager).
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // Cap. 8.6: buffer circular de tamaño fijo por tipo de métrica —
  // el límite de retención explícito que este subsistema debe
  // imponerse a sí mismo, distinto para cada tipo porque cada uno se
  // produce a una frecuencia distinta (fps se muestrea mucho más
  // seguido que una activación de Reducción).
  var LIMITES_RETENCION = {
    fps: 120,          // ~2 minutos de muestreo a un valor cada segundo
    reduccion: 50,      // activaciones del Estado de Reducción
    transicion: 100,    // duraciones reales de transición
    cargaFallida: 50,   // timeouts / errores de Estado de Carga
    fidelidad: 50,        // cambios de nivel de fidelidad
    // Etapa 1 (Roadmap A+B, Instrumentación): dos tipos nuevos, mismo
    // patrón que los anteriores. frameTime a 300 (~5s de muestreo
    // continuo a 60fps) porque es la métrica más frecuente del
    // sistema; tareaLarga a 50 porque una tarea larga (Long Tasks
    // API, >50ms) es, por definición, un evento poco frecuente.
    frameTime: 300,
    tareaLarga: 50
  };

  var registros = {
    fps: [],
    reduccion: [],
    transicion: [],
    cargaFallida: [],
    fidelidad: [],
    frameTime: [],
    tareaLarga: []
  };

  function ahora() {
    return (global.performance && typeof global.performance.now === 'function')
      ? global.performance.now() : Date.now();
  }

  // Inserta con marca de tiempo y recorta al límite de retención del
  // tipo correspondiente (Cap. 8.6). Un tipo desconocido se ignora
  // silenciosamente: un registro malformado no debe nunca convertirse
  // en un error visible para el usuario (mismo espíritu del rechazo
  // silencioso del State Manager, Cap. 5.3).
  function registrar(tipo, valor) {
    if (!Object.prototype.hasOwnProperty.call(registros, tipo)) return;
    var lista = registros[tipo];
    lista.push({ valor: valor, marca: ahora() });
    var limite = LIMITES_RETENCION[tipo];
    if (lista.length > limite) lista.splice(0, lista.length - limite);
  }

  function maximo(lista) {
    if (!lista.length) return null;
    var max = lista[0].valor;
    for (var i = 1; i < lista.length; i++) if (lista[i].valor > max) max = lista[i].valor;
    return max;
  }

  function suma(lista) {
    var total = 0;
    for (var i = 0; i < lista.length; i++) total += lista[i].valor;
    return total;
  }

  function promedio(lista) {
    if (!lista.length) return null;
    var suma = 0;
    for (var i = 0; i < lista.length; i++) suma += lista[i].valor;
    return suma / lista.length;
  }

  var api = {
    // ── Entradas de registro, una por tipo de métrica del Cap. 3.14 ──
    registrarFPS: function (fps) {
      if (typeof fps === 'number' && isFinite(fps)) registrar('fps', fps);
    },
    registrarActivacionReduccion: function () {
      registrar('reduccion', 1);
    },
    registrarTransicion: function (duracionMs) {
      if (typeof duracionMs === 'number' && isFinite(duracionMs)) registrar('transicion', duracionMs);
    },
    registrarCargaFallida: function () {
      registrar('cargaFallida', 1);
    },
    registrarCambioFidelidad: function (nivel) {
      // Se registra el nombre del nivel, no un número — la lectura
      // (obtenerResumen) lo trata como conteo de ocurrencias, no
      // como promedio, ver más abajo.
      registros.fidelidad.push({ valor: nivel, marca: ahora() });
      if (registros.fidelidad.length > LIMITES_RETENCION.fidelidad) {
        registros.fidelidad.splice(0, registros.fidelidad.length - LIMITES_RETENCION.fidelidad);
      }
    },
    // Etapa 1 (Roadmap A+B, Instrumentación): consumidores previstos
    // son ambiente-metrics.js (frame-a-frame) — mismo patrón de
    // entrada que registrarFPS, un valor numérico por evento.
    registrarFrameTime: function (ms) {
      if (typeof ms === 'number' && isFinite(ms)) registrar('frameTime', ms);
    },
    registrarTareaLarga: function (ms) {
      if (typeof ms === 'number' && isFinite(ms)) registrar('tareaLarga', ms);
    },

    // ── Salidas de lectura, exclusivamente para consulta pasiva
    // (equipo de producto / debugging) — nunca deben usarse como
    // entrada de una decisión visual en tiempo real (Cap. 3.14).
    obtenerResumen: function () {
      return {
        fpsPromedio: promedio(registros.fps),
        fpsMuestras: registros.fps.length,
        activacionesReduccion: registros.reduccion.length,
        transicionPromedioMs: promedio(registros.transicion),
        transicionesRegistradas: registros.transicion.length,
        cargasFallidas: registros.cargaFallida.length,
        ultimoNivelFidelidad: registros.fidelidad.length
          ? registros.fidelidad[registros.fidelidad.length - 1].valor
          : null,
        // Etapa 1 (Roadmap A+B, Instrumentación): mismo nivel de
        // detalle que fps arriba, más el peor caso (maximo) porque
        // para frame time y long tasks un solo pico ya es la señal
        // relevante (un jank puntual), no solo el promedio.
        frameTimePromedioMs: promedio(registros.frameTime),
        frameTimeMaxMs: maximo(registros.frameTime),
        frameTimeMuestras: registros.frameTime.length,
        tareaLargaCantidad: registros.tareaLarga.length,
        tareaLargaTotalMs: suma(registros.tareaLarga),
        tareaLargaMaxMs: maximo(registros.tareaLarga)
      };
    },

    // Acceso al detalle crudo de un tipo, para herramientas de
    // depuración puntuales. Devuelve una copia, nunca la lista
    // interna, para que nadie pueda mutar el registro desde afuera.
    obtenerSerie: function (tipo) {
      if (!Object.prototype.hasOwnProperty.call(registros, tipo)) return [];
      return registros[tipo].slice();
    },

    // Solo para pruebas / reinicio explícito de sesión de
    // diagnóstico — no forma parte del flujo normal del sistema.
    reiniciar: function () {
      Object.keys(registros).forEach(function (tipo) { registros[tipo].length = 0; });
    }
  };

  global.AmbienteDiagnostico = api;

})(window);

/* ==== ambiente-metrics.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-metrics.js
   Etapa 1 (Roadmap A+B — Instrumentación)

   Subsistema del Grupo de Infraestructura. Responsabilidad única:
   tomar la misma medición que ya se usó a mano en
   js/diagnostico-rendimiento-temporal.js (performance.now() frame a
   frame + Long Tasks API) y convertirla en una utilidad reusable,
   continua y silenciosa, para que cada etapa siguiente de este
   roadmap pueda compararse contra la misma vara sin tener que
   reescribir el harness de medición cada vez.

   Dos modos, mismo método de medición debajo de los dos:

   - Modo continuo (iniciar()): alimenta a AmbienteDiagnostico frame a
     frame (registrarFrameTime) y por cada Long Task (registrarTareaLarga),
     igual que ambiente-rendimiento.js alimenta registrarFPS — un
     sumidero más de datos hacia el mismo registro central, nunca una
     fuente de verdad propia.

   - Modo puntual (medirVentana(ms, cb)): repite exactamente lo que
     hacía diagnostico-rendimiento-temporal.js (una ventana de N ms,
     FPS promedio + long tasks de esa ventana), pero sin tocar el DOM
     ni auto-redirigir la URL — devuelve el resultado crudo por
     callback para que quien la invoque decida qué hacer (loggear,
     comparar contra una baseline, etc). Este es el modo pensado para
     el punto 6 del roadmap ("repetir la captura de 10s... y comparar").

   Este módulo nunca decide nivel de fidelidad ni apaga ningún otro
   subsistema — mismo límite que ambiente-diagnostico.js ("nunca debe
   influir en tiempo real sobre el comportamiento del sistema"): es
   un observador puro, de un solo sentido (mide → registra), nunca al
   revés.

   Debe cargarse después de ambiente-diagnostico.js (es su único
   destino de escritura) y puede cargarse antes del resto del Grupo
   de Gobierno — no depende de ningún otro subsistema.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function diagnostico() { return global.AmbienteDiagnostico || null; }

  function ahora() {
    return (global.performance && typeof global.performance.now === 'function')
      ? global.performance.now() : Date.now();
  }

  function longTasksSoportadas() {
    try {
      return typeof PerformanceObserver !== 'undefined' &&
        !!PerformanceObserver.supportedEntryTypes &&
        PerformanceObserver.supportedEntryTypes.indexOf('longtask') !== -1;
    } catch (e) {
      return false;
    }
  }

  function pestanaVisible() {
    return (typeof document !== 'undefined') ? !document.hidden : true;
  }

  // ── Modo continuo ─────────────────────────────────────────────────
  var rafId = null;
  var ultimoFrame = null;
  var iniciado = false;
  var pausadoPorVisibilidad = false;
  var longTaskObserver = null;
  var listenerVisibilidadRegistrado = false;

  // Mismo criterio de pausa que ambiente-rendimiento.js (Cap. 9.2 en
  // ese módulo): sin esto, un frame gap enorme al volver de segundo
  // plano se registraría como un frameTime falso, ensuciando la
  // métrica sin que haya pasado ningún jank real.
  function pasoFrame(marcaTiempo) {
    if (!pestanaVisible()) {
      ultimoFrame = null;
      pausadoPorVisibilidad = true;
      rafId = null;
      return;
    }
    if (ultimoFrame !== null) {
      var d = diagnostico();
      if (d) d.registrarFrameTime(marcaTiempo - ultimoFrame);
    }
    ultimoFrame = marcaTiempo;
    rafId = global.requestAnimationFrame(pasoFrame);
  }

  function alCambiarVisibilidad() {
    if (pestanaVisible() && pausadoPorVisibilidad && rafId === null) {
      pausadoPorVisibilidad = false;
      rafId = global.requestAnimationFrame(pasoFrame);
    }
  }

  function iniciarLongTasksContinuo() {
    if (!longTasksSoportadas()) return;
    try {
      longTaskObserver = new PerformanceObserver(function (list) {
        var d = diagnostico();
        if (!d) return;
        list.getEntries().forEach(function (entry) {
          d.registrarTareaLarga(entry.duration);
        });
      });
      longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch (e) {
      // Long Tasks API no disponible en este navegador: no crítico,
      // frameTime solo ya aporta señal (mismo criterio fail-open que
      // el resto del motor).
      longTaskObserver = null;
    }
  }

  // ── Modo puntual (una ventana de N ms, sin tocar AmbienteDiagnostico) ──
  function medirVentana(duracionMs, callback) {
    if (typeof callback !== 'function') return;
    var inicio = ahora();
    var frames = 0;
    var maxFrameGap = 0;
    var ultimo = null;
    var longTasksVentana = [];
    var obs = null;

    if (longTasksSoportadas()) {
      try {
        obs = new PerformanceObserver(function (list) {
          list.getEntries().forEach(function (entry) {
            longTasksVentana.push(entry.duration);
          });
        });
        obs.observe({ entryTypes: ['longtask'] });
      } catch (e) {
        obs = null;
      }
    }

    function medirFrame(t) {
      frames++;
      if (ultimo !== null) {
        var gap = t - ultimo;
        if (gap > maxFrameGap) maxFrameGap = gap;
      }
      ultimo = t;
      if (ahora() - inicio < duracionMs) {
        global.requestAnimationFrame(medirFrame);
      }
    }
    global.requestAnimationFrame(medirFrame);

    global.setTimeout(function () {
      if (obs) { try { obs.disconnect(); } catch (e) { /* ya desconectado */ } }
      var duracionReal = ahora() - inicio;
      var totalLongTaskMs = longTasksVentana.reduce(function (acc, d) { return acc + d; }, 0);
      callback({
        fpsPromedio: frames / (duracionReal / 1000),
        framesCapturados: frames,
        gapMaxEntreFrames_ms: Math.round(maxFrameGap),
        longTasksCantidad: longTasksVentana.length,
        longTasksTotalMs: Math.round(totalLongTaskMs),
        duracionRealMs: Math.round(duracionReal)
      });
    }, duracionMs + 50);
  }

  var api = {
    iniciar: function () {
      if (iniciado) return; // idempotente, mismo criterio que ambiente-rendimiento.js
      if (typeof global.requestAnimationFrame !== 'function') return;
      iniciado = true;
      rafId = global.requestAnimationFrame(pasoFrame);
      iniciarLongTasksContinuo();
      if (!listenerVisibilidadRegistrado && typeof document !== 'undefined' &&
          typeof document.addEventListener === 'function') {
        listenerVisibilidadRegistrado = true;
        document.addEventListener('visibilitychange', alCambiarVisibilidad);
      }
    },

    // Solo para pruebas / apagado explícito — igual que
    // ambiente-rendimiento.js.detener().
    detener: function () {
      if (rafId !== null && typeof global.cancelAnimationFrame === 'function') {
        global.cancelAnimationFrame(rafId);
      }
      rafId = null;
      ultimoFrame = null;
      iniciado = false;
      if (longTaskObserver) {
        try { longTaskObserver.disconnect(); } catch (e) { /* ya desconectado */ }
        longTaskObserver = null;
      }
    },

    medirVentana: medirVentana
  };

  global.AmbienteMetrics = api;

  // Se autoinicia al cargarse, mismo criterio que ambiente-rendimiento.js:
  // es Gobierno/Infraestructura pasivo, no espera a que el orquestador
  // dispare nada — y no tiene efecto visible alguno hasta que algo
  // lea AmbienteDiagnostico.obtenerResumen().
  api.iniciar();

})(window);

/* ==== ambiente-accesibilidad.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-accesibilidad.js
   Fase 2: Accessibility Manager (Arquitectura técnica, Cap. 3.11 / 10.1 / 10.4)

   Subsistema del Grupo de Gobierno. Responsabilidad única: detectar
   preferencias de accesibilidad del usuario (`prefers-reduced-motion`
   y equivalentes) y emitir una señal de máxima prioridad absoluta,
   superpuesta a cualquier otro estado o escena (Cap. 3.11).

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 3.11 — "nunca debe tener su señal ignorada, sobrescrita o
     postergada por ningún otro subsistema, bajo ninguna
     circunstancia". Este módulo no espera confirmación de nadie: la
     lectura de reducirMovimiento es siempre síncrona y actual, nunca
     cacheada por quien la consume.
   - Cap. 10.1 — "esta señal se propaga por dos caminos simultáneos:
     hacia el State Manager... y directamente hacia el Motion
     Controller... sin esperar confirmación del State Manager". Por
     eso este módulo no tiene un único consumidor privilegiado: emite
     a todos sus suscriptores por igual y de forma inmediata — el
     futuro State Manager y el futuro Motion Controller se suscriben
     ambos, sin jerarquía entre ellos.
   - Cap. 10.4 — el diseño contempla una fuente adicional futura
     (preferencia configurable dentro de la propia aplicación,
     independiente de la del sistema operativo) "sin modificar el
     contrato central del sistema". Por eso reducirMovimiento no es
     un único booleano detectado una vez, sino la combinación de
     todas las fuentes activas — hoy solo la de sistema operativo,
     mañana también la de producto, con la misma API.
   - Cap. 3.11 — "Dependencias: ninguna". No importa AmbienteConfig
     ni ningún otro subsistema; la detección de accesibilidad no
     depende de ningún valor configurable.
   - Este módulo supersede la parte de `prefers-reduced-motion` de
     ambiente-senales.js (Fase 0/1) — ese archivo se retira cuando se
     reescriba el orquestador (Ambient Engine raíz) para usar este
     módulo en su lugar.

   Puede cargarse en cualquier momento del Grupo de Gobierno (no
   depende de Performance Manager ni de Interaction Observer), pero
   debe estar disponible antes que el futuro State Manager y Motion
   Controller.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var listeners = [];

  // ── Fuente 1: preferencia del sistema operativo / navegador ─────
  // Verificada al inicio de la sesión y monitoreada ante cambios en
  // tiempo real (Cap. 6.2 Fase 1: "verificada al inicio de la sesión
  // y monitoreada ante cambios en tiempo real").
  var mqMovimiento = (typeof global.matchMedia === 'function')
    ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var fuenteSistema = !!(mqMovimiento && mqMovimiento.matches);

  // ── Fuente 2: preferencia manual de producto (Cap. 10.4) ────────
  // No existe todavía en la interfaz de URU SPOT, pero la superficie
  // queda lista desde ahora para no tener que tocar el contrato de
  // este módulo cuando se agregue. null = "sin preferencia manual
  // explícita"; en ese caso no participa de la combinación. true
  // siempre fuerza reducción; false NUNCA anula una preferencia real
  // de sistema operativo (Cap. 3.11: la señal de sistema jamás debe
  // poder ser sobrescrita).
  var fuenteManual = null;

  function combinar() {
    return fuenteSistema || fuenteManual === true;
  }

  var reducirMovimiento = combinar();

  function emitir() {
    listeners.forEach(function (cb) {
      try { cb(reducirMovimiento); }
      catch (e) { /* un listener roto no debe tumbar al resto ni, mucho
                     menos, impedir que la señal llegue a los demás */ }
    });
  }

  function reevaluar() {
    var anterior = reducirMovimiento;
    reducirMovimiento = combinar();
    if (reducirMovimiento !== anterior) emitir();
  }

  if (mqMovimiento) {
    var onCambioSistema = function (evento) {
      fuenteSistema = evento.matches;
      reevaluar();
    };
    if (mqMovimiento.addEventListener) mqMovimiento.addEventListener('change', onCambioSistema);
    else if (mqMovimiento.addListener) mqMovimiento.addListener(onCambioSistema); // Safari viejo
  }

  var api = {
    // Lectura directa, siempre sincrónica y actual (Cap. 3.11) —
    // nunca debe cachearse por quien la consume.
    get reducirMovimiento() { return reducirMovimiento; },

    // Suscripción: cb(reducirMovimientoActual). Se invoca de
    // inmediato ante cualquier cambio, sin intermediarios (Cap.
    // 10.1: "sin esperar confirmación del State Manager"). Devuelve
    // una función para desuscribirse.
    suscribir: function (cb) {
      if (typeof cb !== 'function') return function () {};
      listeners.push(cb);
      return function desuscribir() {
        var idx = listeners.indexOf(cb);
        if (idx > -1) listeners.splice(idx, 1);
      };
    },

    // Superficie prevista para el futuro toggle de producto (Cap.
    // 10.4). Acepta true, false o null (para volver a depender
    // exclusivamente de la señal de sistema operativo).
    establecerPreferenciaManual: function (valor) {
      if (valor !== true && valor !== false && valor !== null) return;
      fuenteManual = valor;
      reevaluar();
    }
  };

  global.AmbienteAccesibilidad = api;

})(window);

/* ==== ambiente-rendimiento.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-rendimiento.js
   Fase 2: Performance Manager (Arquitectura técnica, Cap. 3.10 / 9.6 / 9.7)

   Subsistema del Grupo de Gobierno. Responsabilidad única: monitorear
   la capacidad del dispositivo y el rendimiento real en tiempo de
   ejecución, y determinar el nivel de fidelidad activo (Cap. 9.6) —
   un valor único y discreto que el futuro Motion Controller consulta
   antes de generar cualquier parámetro visual.

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 3.10 — "no decide contenido visual, solo impone límites
     cuantitativos". Este archivo nunca importa ni menciona ninguna
     capa del Grupo de Contenido Visual; solo expone un nivel de
     fidelidad y deja que el (futuro) Motion Controller lo traduzca.
   - Cap. 3.10 — "nunca debe comunicarse directamente con ningún
     subsistema del Grupo de Contenido Visual". Su única
     comunicación de escritura hacia otro subsistema es hacia
     AmbienteAssets.establecerTamanoCache(), explícitamente prevista
     para el Performance Manager en el Cap. 8.3.
     Su única dependencia de lectura es AmbienteConfig (Cap. 9.6:
     "niveles de fidelidad... definidos de antemano en el
     Configuration System") y su única dependencia de escritura de
     registro es AmbienteDiagnostico (Cap. 3.10: "Dependencias:
     Diagnostics & Telemetry").
   - Cap. 9.2 — el muestreo de FPS se detiene por completo cuando la
     pestaña no está visible; no debe existir ciclo de animación
     ejecutándose en segundo plano.
   - Cap. 9.6 / 9.7 — los cambios de nivel son siempre saltos a un
     nivel discreto completo (nunca un ajuste continuo de un solo
     parámetro), y con histéresis: degradar exige menos ciclos
     consecutivos que recuperar (Cap. 9.6 Arquitectura vía
     AmbienteConfig.RENDIMIENTO), para no oscilar en el límite.

   Debe cargarse después del Grupo de Infraestructura completo
   (ambiente-config.js, ambiente-assets.js, ambiente-diagnostico.js).
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // Orden ascendente de expresividad — se usa para mover el índice
  // ±1 al degradar o recuperar, nunca para saltar más de un nivel a
  // la vez (Cap. 9.7: "configuración completa y deliberada", nunca
  // un salto brusco de dos niveles de una sola vez).
  var ORDEN_NIVELES = ['minima', 'reducida', 'completa'];

  function config() { return global.AmbienteConfig || null; }
  function diagnostico() { return global.AmbienteDiagnostico || null; }
  function assets() { return global.AmbienteAssets || null; }

  // ── Heurística de capacidad de dispositivo ──────────────────────
  // Umbrales leídos de AmbienteConfig.DISPOSITIVO (Cap. 9.6: nunca
  // literales sueltos en el propio subsistema). Es deliberadamente
  // una señal de partida barata, no una medición real — el muestreo
  // de FPS real es lo que gobierna después de los primeros segundos.
  function estimarCapacidadDispositivo() {
    var c = config();
    var umbral = c ? c.DISPOSITIVO : { nucleosBajo: 2, nucleosMedio: 4, memoriaBajoGb: 2, memoriaMedioGb: 4 };
    var nucleos = (global.navigator && global.navigator.hardwareConcurrency) || 4;
    var memoria = (global.navigator && global.navigator.deviceMemory) || 4;
    if (nucleos <= umbral.nucleosBajo || memoria <= umbral.memoriaBajoGb) return 'bajo';
    if (nucleos <= umbral.nucleosMedio || memoria <= umbral.memoriaMedioGb) return 'medio';
    return 'alto';
  }

  // Punto de partida conservador antes de tener muestras reales de
  // FPS: un dispositivo de gama baja arranca ya en 'reducida' en
  // lugar de esperar a que el sistema tropiece varios frames para
  // recién entonces degradar.
  function nivelInicialSegunDispositivo() {
    return estimarCapacidadDispositivo() === 'bajo' ? 'reducida' : 'completa';
  }

  var capacidadDispositivo = estimarCapacidadDispositivo();
  var nivelActual = nivelInicialSegunDispositivo();
  var listeners = [];

  function pestanaVisible() {
    return (typeof document !== 'undefined') ? !document.hidden : true;
  }

  function indiceNivel(nombre) { return ORDEN_NIVELES.indexOf(nombre); }

  function emitirCambioNivel(anterior, actual) {
    listeners.forEach(function (cb) {
      try { cb({ anterior: anterior, actual: actual }); }
      catch (e) { /* un listener roto no debe tumbar al resto */ }
    });
  }

  function aplicarTamanoCache(nivel) {
    var a = assets();
    if (!a) return;
    // Proporcional al tamaño por defecto de la caché caliente
    // (Cap. 8.3: "un parámetro gestionado por el Performance
    // Manager, que puede reducirlo bajo restricciones de memoria").
    var proporcion = { completa: 1, reducida: 0.65, minima: 0.35 }[nivel] || 1;
    a.establecerTamanoCache(Math.max(4, Math.round(24 * proporcion)));
  }

  function cambiarNivel(nuevoNivel) {
    if (nuevoNivel === nivelActual) return;
    var anterior = nivelActual;
    nivelActual = nuevoNivel;
    aplicarTamanoCache(nivelActual);
    var d = diagnostico();
    if (d) d.registrarCambioFidelidad(nivelActual);
    emitirCambioNivel(anterior, nivelActual);
  }

  // ── Muestreo real de FPS (Cap. 9.6: "un valor único... consultado
  // antes de generar cualquier parámetro") ────────────────────────
  var rafId = null;
  var ultimoFrame = null;
  var inicioVentana = null;
  var framesEnVentana = 0;
  var contadorDegradar = 0;
  var contadorRecuperar = 0;

  function umbralesRendimiento() {
    var c = config();
    return c ? c.RENDIMIENTO : {
      fpsUmbralReducida: 45, fpsUmbralMinima: 30, ventanaMuestreoMs: 4000,
      ciclosConsecutivosParaDegradar: 3, ciclosConsecutivosParaRecuperar: 6
    };
  }

  function evaluarVentana(fpsPromedio) {
    var u = umbralesRendimiento();
    var d = diagnostico();
    if (d) d.registrarFPS(fpsPromedio);

    var bajo = false;
    var alto = false;

    if (nivelActual === 'completa') {
      bajo = fpsPromedio < u.fpsUmbralReducida;
    } else if (nivelActual === 'reducida') {
      bajo = fpsPromedio < u.fpsUmbralMinima;
      alto = fpsPromedio >= u.fpsUmbralReducida;
    } else { // minima
      alto = fpsPromedio >= u.fpsUmbralMinima;
    }

    contadorDegradar = bajo ? contadorDegradar + 1 : 0;
    contadorRecuperar = alto ? contadorRecuperar + 1 : 0;

    if (contadorDegradar >= u.ciclosConsecutivosParaDegradar) {
      var idxAbajo = indiceNivel(nivelActual) - 1;
      if (idxAbajo >= 0) cambiarNivel(ORDEN_NIVELES[idxAbajo]);
      contadorDegradar = 0;
      contadorRecuperar = 0;
    } else if (contadorRecuperar >= u.ciclosConsecutivosParaRecuperar) {
      var idxArriba = indiceNivel(nivelActual) + 1;
      if (idxArriba < ORDEN_NIVELES.length) cambiarNivel(ORDEN_NIVELES[idxArriba]);
      contadorDegradar = 0;
      contadorRecuperar = 0;
    }
  }

  // Fase 6 (auditoría §1): antes, esta función se reprogramaba a sí
  // misma aun con la pestaña oculta (descartaba la ventana pero
  // seguía pidiendo frames). Ahora el rAF se cancela por completo
  // mientras está oculta y se reanuda desde un listener de
  // visibilidad — cumple de forma literal el propio Cap. 9.2 citado
  // en la cabecera del archivo ("no debe existir ciclo de animación
  // ejecutándose en segundo plano"), sin cambiar el criterio ya
  // existente de descartar la ventana en curso al ocultarse.
  var pausadoPorVisibilidad = false;

  function pasoFrame(marcaTiempo) {
    if (!pestanaVisible()) {
      ultimoFrame = null;
      inicioVentana = null;
      framesEnVentana = 0;
      pausadoPorVisibilidad = true;
      rafId = null; // detenido, no reprogramado
      return;
    }

    if (ultimoFrame === null) {
      ultimoFrame = marcaTiempo;
      inicioVentana = marcaTiempo;
      framesEnVentana = 0;
      rafId = global.requestAnimationFrame(pasoFrame);
      return;
    }

    framesEnVentana += 1;
    ultimoFrame = marcaTiempo;

    var u = umbralesRendimiento();
    var transcurrido = marcaTiempo - inicioVentana;
    if (transcurrido >= u.ventanaMuestreoMs) {
      var fpsPromedio = (framesEnVentana / transcurrido) * 1000;
      evaluarVentana(fpsPromedio);
      inicioVentana = marcaTiempo;
      framesEnVentana = 0;
    }

    rafId = global.requestAnimationFrame(pasoFrame);
  }

  function alCambiarVisibilidad() {
    if (pestanaVisible() && pausadoPorVisibilidad && rafId === null) {
      pausadoPorVisibilidad = false;
      rafId = global.requestAnimationFrame(pasoFrame);
    }
  }

  var listenerRegistrado = false;

  var api = {
    get nivelFidelidad() { return nivelActual; },
    get capacidadDispositivo() { return capacidadDispositivo; },
    get pestanaVisible() { return pestanaVisible(); },

    // Cap. 9.6: el conjunto completo de multiplicadores del nivel
    // activo, resuelto contra AmbienteConfig — lo que el futuro
    // Motion Controller efectivamente consulta.
    restricciones: function () {
      var c = config();
      return c ? c.obtenerNivelFidelidad(nivelActual) : null;
    },

    // Suscripción a cambios de nivel. cb({anterior, actual}).
    suscribir: function (cb) {
      if (typeof cb !== 'function') return function () {};
      listeners.push(cb);
      return function desuscribir() {
        var idx = listeners.indexOf(cb);
        if (idx > -1) listeners.splice(idx, 1);
      };
    },

    iniciar: function () {
      if (rafId !== null) return; // idempotente
      if (typeof global.requestAnimationFrame !== 'function') return;
      var a = assets();
      if (a) aplicarTamanoCache(nivelActual); // aplica el punto de partida ya al arrancar
      rafId = global.requestAnimationFrame(pasoFrame);

      // Reanudación tras pausa por 2º plano (registrado una sola vez;
      // una segunda llamada a iniciar() ya vuelve por el guard de
      // arriba antes de llegar acá).
      if (!listenerRegistrado && typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        listenerRegistrado = true;
        document.addEventListener('visibilitychange', alCambiarVisibilidad);
      }
    },

    // Solo para pruebas / apagado explícito (por ejemplo, la app
    // pasa a segundo plano de forma prolongada y decide liberar el
    // ciclo de muestreo por completo, no solo pausarlo un frame).
    detener: function () {
      if (rafId !== null && typeof global.cancelAnimationFrame === 'function') {
        global.cancelAnimationFrame(rafId);
      }
      rafId = null;
      ultimoFrame = null;
      inicioVentana = null;
      framesEnVentana = 0;
    }
  };

  global.AmbienteRendimiento = api;

  api.iniciar();

})(window);

/* ==== ambiente-estados.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-estados.js
   Fase 0: Máquina de estados (Documento de diseño, Capítulo 6)

   Responsabilidad única: decidir en qué estado está el sistema y
   hacia cuál puede ir. Este módulo NUNCA manipula propiedades
   visuales directamente (Cap. 11.3: "la máquina de estados nunca
   debe manipular directamente propiedades visuales — solo debe
   comunicar en qué estado se encuentra"). Tampoco conoce escenas ni
   capas — solo conoce el grafo de transiciones del Cap. 6.4.

   Grafo de transiciones válidas (Cap. 6.4):
     Idle ↔ Activo
     Activo → Transición → Activo (con la nueva escena ya vigente)
     Activo → Carga → Activo | Error
     Activo ↔ Foco
     Error → Activo (solo vía reintento explícito)

   El Estado de Reducción (accesibilidad) NO participa de este grafo
   (Cap. 6.4): es una restricción global gestionada por
   ambiente-accesibilidad.js y leída por quien la necesite, no un nodo
   más de esta máquina.

   Fase 2 (Cap. 3.4 Arquitectura): la duración real de la Transición ya
   no se calcula acá — es un parámetro de movimiento, y por eso lo
   resuelve el Motion Controller (ambiente-movimiento.js). Este módulo
   solo le pregunta cuánto debe durar; nunca decide el número él mismo.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ESTADOS = {
    IDLE: 'idle',
    ACTIVO: 'activo',
    TRANSICION: 'transicion',
    CARGA: 'carga',
    FOCO: 'foco',
    ERROR: 'error'
  };

  // Cap. 6.5: "jamás el Estado de Carga debe extenderse
  // indefinidamente sin una salida". Si la solicitud original sigue
  // pendiente pasado este límite, el sistema pasa a Error igual.
  var TIMEOUT_CARGA_MS = 8000;

  // Arranca en Activo: abrir la aplicación ya cuenta como el primer
  // momento de atención del usuario (Cap. 6.1 solo define Idle como
  // "sin interacción del usuario en un lapso definido").
  var estadoActual = ESTADOS.ACTIVO;
  var listeners = [];
  var timeoutCarga = null;
  var transicionEnCurso = false;
  var transicionPendiente = null; // cola de una sola posición (Cap. 6.5)

  function emitir(anterior, actual) {
    listeners.forEach(function (cb) {
      try { cb({ anterior: anterior, actual: actual }); }
      catch (e) { /* un listener roto no debe tumbar al resto */ }
    });
  }

  function cambiarA(nuevoEstado) {
    var anterior = estadoActual;
    if (anterior === nuevoEstado) return;
    estadoActual = nuevoEstado;
    emitir(anterior, nuevoEstado);
  }

  // Banda de contexto: 400-900ms (Cap. 3.1). El cálculo real vive en
  // el Motion Controller (Cap. 3.4 Arquitectura) porque combina
  // rendimiento y accesibilidad — dos subsistemas de Gobierno que este
  // módulo no debería tener que conocer directamente. Si el Motion
  // Controller todavía no cargó (por ejemplo, en tests que instancian
  // este archivo solo), se usa el valor medio de la banda como
  // respaldo, nunca cero (Cap. 6.5: "eso rompería el principio de
  // continuidad").
  function duracionTransicion() {
    var m = global.AmbienteMovimiento;
    if (m && typeof m.duracionTransicion === 'function') return m.duracionTransicion();
    return 600;
  }

  var api = {
    ESTADOS: ESTADOS,

    actual: function () { return estadoActual; },

    // Suscripción a cambios de estado. cb({anterior, actual}).
    on: function (evento, cb) {
      if (evento !== 'cambio' || typeof cb !== 'function') return function () {};
      listeners.push(cb);
      return function () {
        var i = listeners.indexOf(cb);
        if (i > -1) listeners.splice(i, 1);
      };
    },

    // ── Idle ↔ Activo (Cap. 6.1 / 6.2 / 6.3) ───────────────────────
    // El temporizador de inactividad vive en el orquestador (conoce
    // el DOM y los eventos de gesto); este módulo solo reacciona.
    registrarGesto: function () {
      if (estadoActual === ESTADOS.IDLE) cambiarA(ESTADOS.ACTIVO);
    },
    pasarAInactivo: function () {
      if (estadoActual === ESTADOS.ACTIVO) cambiarA(ESTADOS.IDLE);
    },

    // ── Activo → Transición → Activo (Cap. 6.1 / 6.4 / 6.5) ─────────
    // alCompletar se ejecuta cuando termina la Transición, antes de
    // volver a Activo — es el momento en que la nueva escena "ya
    // vigente" se hace efectiva (por ejemplo, escribir el atributo
    // de escena en el DOM).
    iniciarTransicion: function (alCompletar) {
      if (transicionEnCurso) {
        // Cap. 6.5: jamás dos transiciones simultáneas. Se encola el
        // destino más reciente; los intermedios no importan, solo el
        // punto final al que el usuario efectivamente quiere llegar.
        transicionPendiente = alCompletar;
        return;
      }
      if (estadoActual !== ESTADOS.ACTIVO) return; // solo se transiciona desde Activo

      transicionEnCurso = true;
      cambiarA(ESTADOS.TRANSICION);
      global.setTimeout(function () {
        if (typeof alCompletar === 'function') alCompletar();
        cambiarA(ESTADOS.ACTIVO);
        transicionEnCurso = false;
        if (transicionPendiente) {
          var siguiente = transicionPendiente;
          transicionPendiente = null;
          api.iniciarTransicion(siguiente);
        }
      }, duracionTransicion());
    },

    // ── Activo → Carga → Activo | Error (Cap. 6.1 / 6.5) ────────────
    iniciarCarga: function () {
      if (estadoActual !== ESTADOS.ACTIVO) return;
      cambiarA(ESTADOS.CARGA);
      timeoutCarga = global.setTimeout(function () {
        api.finalizarCarga(false); // timeout ⇒ Error, nunca Carga indefinida
      }, TIMEOUT_CARGA_MS);
    },
    finalizarCarga: function (exito) {
      if (estadoActual !== ESTADOS.CARGA) return;
      if (timeoutCarga) { global.clearTimeout(timeoutCarga); timeoutCarga = null; }
      cambiarA(exito ? ESTADOS.ACTIVO : ESTADOS.ERROR);
    },

    // ── Activo ↔ Foco (Cap. 6.1 / 6.2 / 6.3) ────────────────────────
    entrarFoco: function () {
      if (estadoActual === ESTADOS.ACTIVO) cambiarA(ESTADOS.FOCO);
    },
    salirFoco: function () {
      if (estadoActual === ESTADOS.FOCO) cambiarA(ESTADOS.ACTIVO);
    },

    // ── Error → Activo (Cap. 6.3: "únicamente ante un reintento
    // exitoso explícito") ───────────────────────────────────────────
    reintentar: function () {
      if (estadoActual === ESTADOS.ERROR) cambiarA(ESTADOS.ACTIVO);
    }
  };

  global.AmbienteEstados = api;

})(window);

/* ==== ambiente-profundidad.js ==== */
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

/* ==== ambiente-gramatica.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-gramatica.js
   Fase 4: Movement Grammar Registry (Motion Direction Bible, Cap. 4)

   Segundo módulo del Ambient Engine que aplica la Biblia del
   Movimiento. Responsabilidad única: ser la fuente canónica de los
   nueve verbos de movimiento (Cap. 4) y de las dos reglas que
   gobiernan su uso — no ejecuta ningún movimiento, no toca el DOM, no
   decide qué elemento usa qué verbo. Es un diccionario con reglas de
   validación, igual en espíritu a ambiente-profundidad.js: un cálculo
   puro que otros módulos consultan.

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 4 "Regla de no sinonimia" — ningún verbo puede reasignarse
     como sinónimo de otro. Esta regla no se "valida" en tiempo de
     ejecución (es una decisión de quien escribe cada módulo), pero
     este archivo la sostiene siendo el ÚNICO lugar donde existen los
     nueve significados — si un módulo necesita describir un
     movimiento, debe pedirle el significado a este registro en vez de
     inventar su propia descripción, para que no puedan divergir dos
     definiciones del mismo verbo en el código.
   - Cap. 4 "Regla de combinación" — como máximo dos verbos
     simultáneos sobre un mismo elemento, y solo si uno de los dos es
     "desvanecerse", o "acercarse"/"alejarse" combinado con un cambio
     de opacidad. validarCombinacion() aplica esta regla exactamente
     así, sin excepciones no documentadas.
   - Cap. 4, tabla — "Rotar": "uso extremadamente restringido". No es
     algo que el código pueda inferir por sí solo, así que en vez de
     dejarlo pasar como cualquier otro verbo, validarRotar() exige que
     quien lo pida declare explícitamente cuál de los dos usos
     legítimos de la tabla del Cap. 4 está aplicando.
   - Cap. 7, tabla de planos — "Oscilar" es, textualmente, el único
     verbo que ejecuta el plano de Fondo ambiental ("el único que
     ejecuta el verbo 'oscilar'"), nunca un componente de interfaz
     funcional. planoPermite() hace cumplir esa restricción.

   No depende de ningún otro módulo del Ambient Engine y ninguno
   depende de la existencia previa de este — puede cargarse en
   cualquier punto anterior a quien lo consulte por primera vez, igual
   que ambiente-profundidad.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // Cap. 4: los nueve verbos. Vocabulario cerrado — este objeto es a
  // propósito la única lista que debería existir en todo el código.
  var VERBOS = {
    acercarse: {
      significado: 'Un elemento gana relevancia, foco o urgencia informativa creciente. Reduce la distancia percibida entre el usuario y el contenido.',
      uso: 'Foco de búsqueda, apertura de ficha, confirmación de una acción deseada.'
    },
    alejarse: {
      significado: 'Un elemento cede relevancia o se retira del centro de atención sin desaparecer del todo; sigue existiendo en un plano secundario.',
      uso: 'Cierre de una ficha hacia la vista general, retorno a un listado.'
    },
    expandirse: {
      significado: 'Se revela información adicional que ya pertenecía al elemento, no información nueva ajena a él.',
      uso: 'Apertura de un detalle, un filtro que despliega sus opciones.'
    },
    comprimirse: {
      significado: 'Se oculta información secundaria conservando la identidad y la posición del elemento.',
      uso: 'Colapsar un filtro, resumir una tarjeta ya leída.'
    },
    desvanecerse: {
      significado: 'Un elemento deja de ser relevante para la tarea actual sin que su desaparición implique una pérdida de datos o un error.',
      uso: 'Elementos ambientales al cambiar de escena, overlays que ya cumplieron su función.'
    },
    rotar: {
      significado: 'Cambio de estado binario o cíclico de un control (no decorativo). Uso extremadamente restringido.',
      uso: 'Indicadores de expansión/colapso, íconos de estado de carga puntuales.',
      restringido: true
    },
    respirar: {
      significado: 'Ciclo suave y de baja amplitud que comunica que un elemento está "en espera" o "vivo" sin requerir acción.',
      uso: 'Estados ambientales de fondo, indicadores de disponibilidad.'
    },
    oscilar: {
      significado: 'Variación leve y acotada alrededor de un punto de reposo, usada para elementos climáticos o naturales del Ambient Engine.',
      uso: 'Elementos atmosféricos (luz, nubosidad sutil, reflejos), nunca componentes de interfaz funcional.',
      planoExclusivo: 'fondo' // Cap. 7: único verbo reservado al plano de Fondo ambiental.
    },
    'permanecer-quieto': {
      significado: 'Ausencia deliberada de movimiento en un elemento mientras todo lo demás se mueve, para dirigir la atención por contraste.',
      uso: 'Un precio, un botón principal o un dato crítico durante una secuencia de carga ambiental.'
    }
  };

  var IDS = Object.keys(VERBOS);

  function esValido(id) {
    return Object.prototype.hasOwnProperty.call(VERBOS, id);
  }

  // Devuelve una copia congelada con el id incluido, o null si no
  // existe — nunca un objeto vacío que pueda confundirse con un
  // verbo real (Cap. 1.4: degradarse en silencio, no a medias).
  function verbo(id) {
    if (!esValido(id)) return null;
    var v = VERBOS[id];
    return Object.freeze({
      id: id,
      significado: v.significado,
      uso: v.uso,
      restringido: !!v.restringido,
      planoExclusivo: v.planoExclusivo || null
    });
  }

  // Cap. 7: si el verbo declara un plano exclusivo (hoy, solo
  // 'oscilar' → 'fondo'), solo puede ejecutarse en ese plano. Un
  // verbo sin plano exclusivo declarado no tiene esta restricción.
  function planoPermite(id, plano) {
    if (!esValido(id)) return false;
    var exclusivo = VERBOS[id].planoExclusivo;
    return !exclusivo || exclusivo === plano;
  }

  // Cap. 4 "Regla de combinación": máximo dos verbos simultáneos
  // sobre el mismo elemento, y solo si uno de los dos es
  // 'desvanecerse', o 'acercarse'/'alejarse' combinado con un cambio
  // de opacidad. incluyeOpacidad: true si la combinación ya incluye
  // un cambio de opacidad como parte del movimiento.
  function validarCombinacion(verbos, incluyeOpacidad) {
    var lista = (verbos || []).filter(esValido);

    if (lista.length === 0) {
      return Object.freeze({ valido: false, motivo: 'ningún verbo válido en la lista' });
    }
    if (lista.length === 1) {
      return Object.freeze({ valido: true, motivo: null });
    }
    if (lista.length > 2) {
      // Cap. 14: combinar tres o más verbos sobre el mismo elemento
      // es, por definición, un anti-patrón.
      return Object.freeze({ valido: false, motivo: 'más de dos verbos simultáneos — anti-patrón del Cap. 14' });
    }

    var tieneDesvanecerse = lista.indexOf('desvanecerse') > -1;
    var tieneAcercarseOAlejarse = lista.indexOf('acercarse') > -1 || lista.indexOf('alejarse') > -1;

    if (tieneDesvanecerse) {
      return Object.freeze({ valido: true, motivo: null });
    }
    if (tieneAcercarseOAlejarse && incluyeOpacidad) {
      return Object.freeze({ valido: true, motivo: null });
    }
    return Object.freeze({
      valido: false,
      motivo: 'dos verbos simultáneos solo se permiten con desvanecerse, o acercarse/alejarse combinado con un cambio de opacidad'
    });
  }

  // Cap. 4: 'rotar' es de "uso extremadamente restringido" — a
  // diferencia de los otros ocho verbos, no basta con que el id sea
  // válido; quien lo pida debe declarar cuál de los dos usos
  // legítimos de la tabla del Cap. 4 está aplicando.
  var USOS_ROTAR_PERMITIDOS = ['indicador-expansion-colapso', 'icono-carga-puntual'];

  function validarRotar(usoDeclarado) {
    return USOS_ROTAR_PERMITIDOS.indexOf(usoDeclarado) > -1;
  }

  var api = {
    VERBOS: IDS.slice(),
    verbo: verbo,
    esValido: esValido,
    planoPermite: planoPermite,
    validarCombinacion: validarCombinacion,
    validarRotar: validarRotar,
    USOS_ROTAR_PERMITIDOS: USOS_ROTAR_PERMITIDOS.slice()
  };

  global.AmbienteGramatica = api;

})(window);

/* ==== ambiente-ritmo.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-ritmo.js
   Fase 4: Rhythm Register Manager (Motion Direction Bible, Cap. 5)

   Primer módulo del Ambient Engine que aplica la Biblia del
   Movimiento (Fase 4) en vez de solo el Documento de Arquitectura
   Técnica (Fase 2). Responsabilidad única: resolver, para cada
   solicitud de movimiento, cuál de los cuatro Registros de Ritmo
   corresponde usar (Cap. 5: contemplativo, conversacional, inmediato,
   fondo) y qué duración le corresponde — nunca decide QUÉ se mueve ni
   CÓMO se ve, solo A QUÉ VELOCIDAD Y CADENCIA, igual que Depth Manager
   (Cap. 3.9 arquitectura) decide solo factores de profundidad.

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 5 "Cómo alternarlos" — regla de contraste posterior: un
     registro contemplativo nunca es seguido inmediatamente por otro
     contemplativo. resolver() degrada el segundo a conversacional si
     no hubo un registro intermedio de menor cadencia.
   - Cap. 5 "Cómo evitar la fatiga" — a partir de la segunda repetición
     de una misma acción en la sesión, la respuesta se simplifica al
     registro inmediato en lugar de repetir la coreografía completa.
   - Cap. 8 "Cómo envejece durante la sesión" — atenuacionFondo()
     devuelve un factor que decrece con el tiempo de interacción
     sostenida, con un piso que "nunca llega a apagar el sistema por
     completo".
   - Cap. 5 "Cómo mantener interés en sesiones largas" — varianteSesion()
     da una variación estable por sesión (no por frame: variar cuadro a
     cuadro sería ruido, no identidad) para que la sesión 40 no sea
     idéntica a la sesión 1.
   - Cap. 13 — bajo reducirMovimiento, las duraciones de los registros
     de transición perceptible se acortan a un valor corto pero "nunca
     cero" (mismo criterio que ya aplicaba ambiente-movimiento.js a su
     propia banda de contexto).
   - Cap. 10 — este módulo no inventa milisegundos nuevos por su
     cuenta: lee las bandas de AmbienteConfig.BANDAS_VELOCIDAD, la
     misma tabla que ya usaba el Motion Controller.

   Este documento (Cap. 10) es explícito en que no fija milisegundos,
   solo criterios. La banda 'contemplativo' añadida a
   ambiente-config.js y las duraciones que devuelve este módulo son
   una elección pragmática consistente con las bandas ya existentes
   del Documento de Arquitectura Técnica, no una especificación
   formal de Fase 5 — deben revisarse cuando ese documento exista.

   Es, junto con ambiente-profundidad.js, un cálculo mayormente puro:
   no renderiza nada, no crea nodos del DOM. A diferencia de
   profundidad, sí necesita memoria de sesión (último registro emitido,
   contador de repeticiones por acción), por eso expone reiniciarSesion().

   Debe cargarse después de ambiente-config.js y ambiente-accesibilidad.js
   (de los que depende para bandas y para la señal de movimiento
   reducido), y antes de ambiente-movimiento.js, que es quien lo
   consumirá para dejar de tener una única cadencia implícita.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function config() { return global.AmbienteConfig || null; }
  function accesibilidad() { return global.AmbienteAccesibilidad || null; }

  // Cap. 5: los cuatro registros, sin orden de prioridad entre sí
  // (a diferencia de los Catorce Principios del Cap. 3, donde
  // Legibilidad sí tiene veto absoluto).
  var REGISTROS = ['contemplativo', 'conversacional', 'inmediato', 'fondo'];

  // ── Memoria de sesión ────────────────────────────────────────────
  // Cap. 5: necesaria para la regla de contraste posterior y la regla
  // de fatiga. Se reinicia solo si algo llama reiniciarSesion()
  // explícitamente (por ejemplo, tras una navegación completa a una
  // sección nueva) — nunca por su cuenta, para que la fatiga siga
  // siendo válida durante toda la sesión real del usuario.
  var ultimoRegistroNoInmediato = null;
  var contadorAcciones = {};
  var inicioSesion = Date.now();

  // Cap. 5: mapeo explícito registro → banda de AmbienteConfig. El
  // registro de fondo usa la banda 'ambiental', que en
  // BANDAS_VELOCIDAD representa un período de ciclo de respiración
  // (Cap. 8), no la duración de una transición puntual — quien
  // consuma duracion('fondo') debe interpretarlo como tal.
  function bandaBase(registroId) {
    var c = config();
    var bandas = c && c.BANDAS_VELOCIDAD;
    var porDefecto = {
      inmediato: { minMs: 80, maxMs: 250 },
      conversacional: { minMs: 400, maxMs: 900 },
      contemplativo: { minMs: 900, maxMs: 2000 },
      fondo: { minMs: 20000, maxMs: 90000 }
    };
    if (!bandas) return porDefecto[registroId] || porDefecto.conversacional;

    switch (registroId) {
      case 'inmediato': return bandas.respuesta || porDefecto.inmediato;
      case 'conversacional': return bandas.contexto || porDefecto.conversacional;
      case 'contemplativo': return bandas.contemplativo || porDefecto.contemplativo;
      case 'fondo': return bandas.ambiental || porDefecto.fondo;
      default: return porDefecto.conversacional;
    }
  }

  // Cap. 13: bajo reducirMovimiento, la duración se acorta pero nunca
  // llega a cero — "traduce", no apaga. No se acorta el registro
  // inmediato (ya es la banda más corta) ni el de fondo (es un
  // período de ciclo, no una transición puntual que el usuario deba
  // esperar).
  function duracion(registroId) {
    var banda = bandaBase(registroId);
    var a = accesibilidad();
    if (a && a.reducirMovimiento && (registroId === 'contemplativo' || registroId === 'conversacional')) {
      return 150;
    }
    return Math.round((banda.minMs + banda.maxMs) / 2);
  }

  // ── Resolución central (Cap. 5) ──────────────────────────────────
  // registroSolicitado: el registro que, en principio, corresponde a
  // este movimiento según su función (Cap. 5, Cap. 6 coreografías).
  // claveAccion (opcional): identificador estable de la acción del
  // usuario que dispara el movimiento (por ejemplo 'filtro:categoria')
  // — se usa exclusivamente para la regla de fatiga; si se omite, esa
  // regla no aplica a esta llamada.
  function resolver(registroSolicitado, claveAccion) {
    var id = REGISTROS.indexOf(registroSolicitado) > -1 ? registroSolicitado : 'conversacional';

    // Cap. 5 "Cómo evitar la fatiga": desde la segunda repetición de
    // la misma acción en la sesión, se simplifica a registro inmediato.
    if (claveAccion) {
      var n = (contadorAcciones[claveAccion] || 0) + 1;
      contadorAcciones[claveAccion] = n;
      if (n >= 2) id = 'inmediato';
    }

    // Cap. 5 "Cómo alternarlos": regla de contraste posterior — un
    // contemplativo nunca sigue inmediatamente a otro contemplativo.
    if (id === 'contemplativo' && ultimoRegistroNoInmediato === 'contemplativo') {
      id = 'conversacional';
    }

    // El registro inmediato es, a propósito, el único que no cuenta
    // para el contraste posterior (Cap. 5: "reservado a microfeedback
    // directo" — no es una "bajada de ritmo" real, es una categoría
    // aparte).
    if (id !== 'inmediato') ultimoRegistroNoInmediato = id;

    return Object.freeze({ registro: id, duracionMs: duracion(id) });
  }

  // Cap. 8 "Cómo envejece durante la sesión": el registro de fondo se
  // atenúa progresivamente cuanto más tiempo lleva el usuario
  // interactuando de forma sostenida, sin apagarse nunca del todo.
  // msInteraccionSostenida: milisegundos continuos de interacción
  // activa (lo calcula quien mida eso — hoy, candidato natural es el
  // Interaction Observer, Cap. 3.12 arquitectura).
  function atenuacionFondo(msInteraccionSostenida) {
    var PISO = 0.4; // "nunca llega a apagar el sistema por completo"
    var VENTANA_MS = 5 * 60 * 1000; // 5 min de interacción sostenida → piso
    var ms = Math.max(0, msInteraccionSostenida || 0);
    return 1 - Math.min(ms / VENTANA_MS, 1) * (1 - PISO);
  }

  // Cap. 5 "Cómo mantener interés en sesiones largas": variación
  // estable por sesión (nunca por frame, para no volverse ruido) que
  // quien module el registro de fondo puede aplicar como multiplicador
  // adicional de amplitud, para que la sesión 40 no sea idéntica
  // cuadro por cuadro a la sesión 1.
  function varianteSesion() {
    var CLAVE = 'uruspot_ritmo_variante';
    try {
      if (!global.sessionStorage) return 1;
      var guardado = global.sessionStorage.getItem(CLAVE);
      if (guardado) return parseFloat(guardado);
      var v = (0.85 + Math.random() * 0.3).toFixed(3);
      global.sessionStorage.setItem(CLAVE, v);
      return parseFloat(v);
    } catch (e) {
      // Cap. 1.4 (vía Fase 2): degradarse en silencio, nunca romper
      // al que consulta. Sin variación no rompe nada, solo iguala
      // sesiones — el peor caso posible acá es inocuo.
      return 1;
    }
  }

  var api = {
    REGISTROS: REGISTROS.slice(),

    // Superficie de solo lectura de bandas y duraciones — nadie fuera
    // de este módulo debería calcular una duración de movimiento por
    // su cuenta si ya existe un registro que la representa.
    banda: bandaBase,
    duracion: duracion,

    resolver: resolver,
    atenuacionFondo: atenuacionFondo,
    varianteSesion: varianteSesion,

    // Solo debería llamarse ante una navegación que la propia
    // aplicación considere un "reinicio de contexto" real (Cap. 5 no
    // define cuándo exactamente; delega ese criterio a quien conozca
    // la estructura de navegación real de la app).
    reiniciarSesion: function () {
      ultimoRegistroNoInmediato = null;
      contadorAcciones = {};
      inicioSesion = Date.now();
    },

    get tiempoSesionMs() { return Date.now() - inicioSesion; }
  };

  global.AmbienteRitmo = api;

})(window);

/* ==== ambiente-respiracion.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-respiracion.js
   Fase 4: Ambient Breathing Cycle (Motion Direction Bible, Cap. 8)

   Tercer módulo del Ambient Engine que aplica la Biblia del Movimiento
   (Fase 4), y el primero de "Comportamiento base del Ambient Engine"
   (roadmap Cap. 16, etapa 5). Responsabilidad única: sostener el ciclo
   continuo de variación de muy baja amplitud sobre luz/atmósfera/
   densidad de fondo que el Cap. 8 describe como "respiración" — nunca
   decide QUÉ elemento respira ni CÓMO se ve (eso sigue siendo trabajo
   de cada capa de Contenido Visual, hoy solo ambiente-luz.js), solo
   A QUÉ AMPLITUD, con el mismo principio de separación que ya usan
   ambiente-ritmo.js (velocidad) y ambiente-profundidad.js (factores).

   No renderiza nada por sí mismo: escribe una única variable CSS,
   --amb-respiracion, sobre <html> (hereda a todo el árbol) — mismo
   patrón que ya usa ambiente-horario-tinte.js para el shift de
   horario, precisamente para no violar el Cap. 2.3 Arquitectura
   ("el Grupo de Contenido Visual nunca se comunica lateralmente entre
   sí"): este módulo no conoce a ambiente-luz.js ni a ningún otro
   consumidor, solo publica un valor que cualquier CSS puede leer.

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 8 "Cómo respira" — ciclo continuo que nunca se detiene por
     completo mientras el sitio está abierto, pero se atenúa según la
     atención activa que esté demandando la tarea en primer plano. La
     atenuación por atención activa se resuelve leyendo el Estado
     vigente (Cap. 6) vía el atributo data-ambiente-estado en <html> —
     el único contrato público que el Cap. 11.1 permite consultar sin
     acoplarse al State Manager directamente.
   - Cap. 8 "Cómo acompaña" — durante Carga, la respiración se vuelve
     momentáneamente más presente (BOOST_CARGA); durante Foco (alta
     concentración), se reduce al mínimo posible sin desaparecer del
     todo (PISO_FOCO).
   - Cap. 8 "Cómo envejece durante la sesión" — la amplitud base se
     multiplica por AmbienteRitmo.atenuacionFondo(tiempoSesionMs), que
     ya existía desde el Paso 4 sin consumidor real; este es su primer
     consumidor.
   - Cap. 8 "Cómo desaparece y reaparece" — nunca instantáneo ni total:
     el multiplicador objetivo (por estado/accesibilidad) se alcanza
     por suavizado exponencial cuadro a cuadro, nunca por asignación
     directa, para que entrar o salir de Foco/Carga se sienta como una
     atenuación gradual (Cap. 3 Continuidad/Inercia) y no como un salto.
   - Cap. 8 "Cómo nunca distrae" — amplitud base tomada de
     AmbienteConfig.RESPIRACION.amplitudMaxima (4%, Documento de diseño
     Cap. 3.4), con un techo duro (TECHO_MULTIPLICADOR) que ni el boost
     de Carga puede superar.
   - Cap. 5 "Cómo mantener interés en sesiones largas" — el período del
     ciclo se fija una sola vez por sesión combinando el punto medio de
     RESPIRACION.periodoMinMs/MaxMs con AmbienteRitmo.varianteSesion(),
     para que la sesión 40 no respire exactamente igual que la sesión 1.
   - Cap. 13 — bajo reducirMovimiento, la amplitud se reduce a un
     mínimo apenas perceptible (PISO_REDUCIDO) en lugar de apagarse
     ("nunca... una versión apagada sin más").
   - Cap. 9.2 (Arquitectura) — no se acumula fase mientras la pestaña
     no es visible, para no "recuperar" de golpe un salto de tiempo
     acumulado al volver a primer plano.

   Debe cargarse después de ambiente-config.js, ambiente-ritmo.js y
   ambiente-accesibilidad.js (de los que lee bandas, período y señal de
   reducción), y puede cargarse en cualquier punto antes de
   ambiente-orquestador.js, que es quien lo inicia. No depende de
   ambiente-movimiento.js: si no está cargado, usa document.hidden
   directamente como respaldo de visibilidad.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function config() { return global.AmbienteConfig || null; }
  function ritmo() { return global.AmbienteRitmo || null; }
  function accesibilidad() { return global.AmbienteAccesibilidad || null; }
  function movimiento() { return global.AmbienteMovimiento || null; }

  // Cap. 8 "Cómo acompaña" / "Cómo nunca distrae": constantes de este
  // módulo, no del documento fuente (que a propósito no fija números,
  // Cap. 16 nota introductoria) — elección pragmática consistente con
  // el resto de Fase 4, a revisar cuando exista una Fase 5 formal.
  var BOOST_CARGA = 1.6;        // "momentáneamente más presente"
  var PISO_FOCO = 0.3;          // "reduce su variación al mínimo posible sin desaparecer del todo"
  var PISO_REDUCIDO = 0.15;     // Cap. 13: "mínimo apenas perceptible", nunca 0
  var PISO_ABSOLUTO = 0.05;     // Cap. 8: "nunca se detiene por completo" — ni siquiera envejecido + reducido a la vez
  var TECHO_MULTIPLICADOR = 1.6; // ni el boost de Carga empuja la amplitud más allá de esto
  var TASA_SUAVIZADO = 0.02;    // convergencia gradual del multiplicador objetivo (Cap. 8 "nunca instantáneo")

  var rafId = null;
  var periodoMs = 11500; // respaldo razonable si AmbienteConfig no cargó (punto medio 8000-15000)
  var faseAcumuladaMs = 0;
  var ultimoTimestamp = null;
  var multiplicadorActual = 1;

  function amplitudConfig() {
    var c = config();
    return (c && c.RESPIRACION) || { amplitudMaxima: 0.04, periodoMinMs: 8000, periodoMaxMs: 15000 };
  }

  // Cap. 5 / Cap. 8: período estable por sesión, no por frame — variar
  // cuadro a cuadro sería ruido, no identidad (mismo criterio que ya
  // documenta AmbienteRitmo.varianteSesion()).
  function calcularPeriodoMs() {
    var r = amplitudConfig();
    var mid = (r.periodoMinMs + r.periodoMaxMs) / 2;
    var rit = ritmo();
    var variante = rit ? rit.varianteSesion() : 1;
    return Math.round(mid * variante);
  }

  function estadoActual() {
    if (typeof document === 'undefined' || !document.documentElement) return 'activo';
    return document.documentElement.getAttribute('data-ambiente-estado') || 'activo';
  }

  // Cap. 8: combina envejecimiento de sesión + acompañamiento por
  // estado + piso de accesibilidad, en ese orden — accesibilidad
  // siempre tiene la última palabra (mismo orden de precedencia que ya
  // usa ambiente-movimiento.js: fidelidad primero, accesibilidad al
  // final, nunca al revés).
  function objetivoMultiplicador() {
    var rit = ritmo();
    var a = accesibilidad();

    var envejecimiento = rit ? rit.atenuacionFondo(rit.tiempoSesionMs) : 1;
    var base = envejecimiento;

    var estado = estadoActual();
    if (estado === 'carga') base *= BOOST_CARGA;
    else if (estado === 'foco') base = Math.min(base, PISO_FOCO);

    if (a && a.reducirMovimiento) base = Math.min(base, PISO_REDUCIDO);

    base = Math.min(base, TECHO_MULTIPLICADOR);
    return Math.max(base, PISO_ABSOLUTO);
  }

  function pestanaVisible() {
    var m = movimiento();
    if (m) return m.pestanaVisible;
    return (typeof document !== 'undefined') ? !document.hidden : true;
  }

  // PERF (auditoría performance, 2026-07-30): `aplicar()` hacía DOS
  // cosas distintas en una sola llamada por rAF — (1) el cómputo (seno
  // + suavizado exponencial de `multiplicadorActual`), que es barato
  // (un puñado de operaciones aritméticas), y (2) la escritura al DOM
  // vía `style.setProperty` sobre `<html>`, que NO es barata: cambiar
  // una custom property en la raíz del árbol obliga al motor de
  // estilos a recorrer/invalidar el árbol para saber qué elementos
  // dependen de ella (Blink no puede aplicar el atajo de "propiedad
  // independiente" que sí usa para una animación directa de opacity
  // en un elemento — ver css/ambiente-estilos.css:69, `--amb-respiracion`
  // participa de un `calc()`, no es ella misma la propiedad animada).
  // Este ciclo corre para siempre mientras la pestaña está visible —
  // incluida toda la sesión de "Foco" (lectura de una ficha, donde el
  // usuario más necesita que el hilo principal esté libre) — así que
  // el costo de (2) se paga 60 veces por segundo, todo el tiempo que
  // la app esté abierta, por un efecto de ±4% de opacidad.
  //
  // La amplitud máxima del ciclo es 4% (RESPIRACION.amplitudMaxima,
  // Cap. 3.4) y el período nunca baja de 8000ms — con esos números,
  // el salto de opacidad entre dos escrituras consecutivas a 60fps es
  // ≈0.00036 (paso angular × amplitud). Bajar la frecuencia de
  // ESCRITURA (no de cómputo) a 1 de cada 3 frames (~20fps en una
  // pantalla de 60Hz) sube ese salto a ≈0.0011 — seguís muy por debajo
  // del umbral de percepción de cambios de opacidad (∼0.01, "just
  // noticeable difference") — y corta 2 de cada 3 escrituras al DOM:
  // de 216.000 a 72.000 por hora de sesión en foreground. El cómputo
  // (seno + suavizado exponencial de `multiplicadorActual`) se
  // mantiene sin cambios en CADA frame — separarlo de la escritura es
  // justamente lo que evita alterar la tasa de convergencia de
  // `TASA_SUAVIZADO` (calibrada "por frame", no en tiempo real): si se
  // saltearan también esas llamadas, entrar/salir de Foco o Carga
  // convergería 3x más lento en reloj real que lo documentado en el
  // Cap. 8. No se toca esa semántica; solo se difiere CUÁNDO el valor
  // ya calculado llega al DOM.
  var INTERVALO_ESCRITURA = 3; // 1 de cada 3 frames ⇒ ~20fps de escritura real en pantallas 60Hz
  var contadorFrames = 0;
  // Etapa 3 (Roadmap A+B — Contrato común): último valor efectivamente
  // escrito al DOM, para que read() pueda exponerlo sin tener que
  // volver a leer la propia custom property de <html> (evitar un
  // getComputedStyle innecesario) ni recalcular nada.
  var ultimoValorEscrito = 0;

  function aplicar() {
    if (typeof document === 'undefined' || !document.documentElement) return;

    var r = amplitudConfig();
    var faseAngular = (faseAcumuladaMs % periodoMs) / periodoMs * Math.PI * 2;
    // Cap. 3.2 (Arquitectura): curva no lineal — seno, no diente de
    // sierra ni mezcla lineal. Rango -1..1: la respiración oscila por
    // igual por encima y por debajo de la base, nunca solo hacia arriba.
    var onda = Math.sin(faseAngular);

    var objetivo = objetivoMultiplicador();
    // Cap. 8 "nunca instantáneo": convergencia gradual hacia el
    // objetivo en vez de asignación directa, para que Foco/Carga
    // entren y salgan como atenuación, no como salto. Se recalcula en
    // TODOS los frames (ver comentario arriba) — solo la escritura al
    // DOM, más abajo, se difiere.
    multiplicadorActual += (objetivo - multiplicadorActual) * TASA_SUAVIZADO;

    var amplitud = r.amplitudMaxima * multiplicadorActual;
    var valor = onda * amplitud;

    contadorFrames++;
    if ((contadorFrames % INTERVALO_ESCRITURA) !== 0) return;

    ultimoValorEscrito = valor;
    document.documentElement.style.setProperty('--amb-respiracion', valor.toFixed(4));
  }

  // Fase 6 (auditoría §1): antes, este tick se reprogramaba a sí mismo
  // incluso con la pestaña oculta (solo saltaba el cálculo) — el rAF
  // seguía "vivo", apoyado únicamente en que los navegadores lo
  // regulan a ~1/s en 2º plano. Cap. 9.2 en la cabecera de este
  // archivo dice explícitamente "no debe existir ciclo de animación
  // ejecutándose en segundo plano": ahora se cumple de forma literal
  // — cuando se oculta, este tick NO vuelve a pedir el próximo frame;
  // el ciclo queda cancelado por completo hasta que un listener de
  // visibilitychange lo reanuda. No se acumula fase mientras está
  // pausado (mismo criterio que ya tenía este archivo antes de este
  // cambio), así que al volver no hay salto visual.
  var pausadoPorVisibilidad = false;

  function tick(timestamp) {
    if (!pestanaVisible()) {
      ultimoTimestamp = null;
      pausadoPorVisibilidad = true;
      rafId = null; // el ciclo queda detenido, no reprogramado
      return;
    }

    rafId = global.requestAnimationFrame(tick);

    if (ultimoTimestamp === null) ultimoTimestamp = timestamp;
    faseAcumuladaMs += (timestamp - ultimoTimestamp);
    ultimoTimestamp = timestamp;

    aplicar();
  }

  function alCambiarVisibilidad() {
    if (pestanaVisible() && pausadoPorVisibilidad && rafId === null) {
      pausadoPorVisibilidad = false;
      rafId = global.requestAnimationFrame(tick);
    }
  }

  var listenerRegistrado = false;

  var api = {
    // Etapa 3 (Roadmap A+B — Contrato común, ver ambiente-contrato.js).
    id: 'respiracion',
    // tier:'core' (nunca 'visual'): Cap. 8 "Cómo nunca desaparece" es
    // explícito — el ciclo "nunca se detiene por completo mientras el
    // sitio está abierto", solo se atenúa (PISO_REDUCIDO/PISO_ABSOLUTO
    // arriba). Ningún nivel de fidelidad lo apaga, a diferencia de
    // clima — coherente con isActive() de abajo.
    tier: 'core',
    // frequency:'full': el cómputo (seno + suavizado exponencial de
    // multiplicadorActual) debe correr en TODOS los frames — es lo que
    // ya documenta el bloque PERF más arriba: la fase se acumula con
    // el timestamp real del rAF y TASA_SUAVIZADO está calibrada "por
    // frame", saltear cómputos correría la convergencia de Foco/Carga
    // en tiempo real. Lo que YA está throttleado (INTERVALO_ESCRITURA)
    // es la escritura al DOM, un eje aparte que el contrato no cubre
    // todavía — ver nota en step() abajo.
    frequency: 'full',
    // Siempre true: coherente con tier:'core' y con el propio Cap. 8
    // citado arriba. Se declara explícitamente como función (no una
    // constante) para cumplir la forma del contrato y para que, si el
    // día de mañana Cap. 8 cambiara de criterio, el cambio quede en
    // un solo lugar.
    isActive: function (fidelidad) { return true; },

    // step(dt, sharedState): no-op, igual que en ambiente-clima.js —
    // misma razón de fondo, distinto motivo puntual. Acá el ciclo real
    // ya vive en tick()/aplicar() de arriba, corriendo por su propio
    // rAF con su propio timestamp de alta precisión — no por dt
    // inyectado por un orquestador que todavía no existe (Etapa 5).
    // Migrar el cómputo a step(dt,...) hoy exigiría además separar la
    // escritura ya throttleada (INTERVALO_ESCRITURA) de un mecanismo
    // que no sabe todavía a qué cadencia lo va a llamar el futuro
    // writer único — mezclar ambos throttles sin ese writer sería
    // adivinar. Se documenta como desviación explícita, misma
    // filosofía que ambiente-contrato.js pide para no aplicar nada en
    // silencio.
    step: function (dt, sharedState) {},

    // read(): último estado ya calculado y ya escrito, sin recalcular
    // ni leer el DOM de vuelta.
    read: function () {
      return {
        multiplicador: multiplicadorActual,
        valor: ultimoValorEscrito
      };
    },

    // Diagnóstico de solo lectura — ningún otro módulo debería
    // necesitar esto en operación normal, ya que el contrato real es
    // la variable CSS.
    get amplitudActual() { return multiplicadorActual; },

    iniciar: function () {
      if (rafId !== null) return; // idempotente
      periodoMs = calcularPeriodoMs();
      rafId = global.requestAnimationFrame(tick);

      // Reanudación: preferimos el evento propio de AmbienteMovimiento
      // (Cap. 2.3 — "ningún módulo de Contenido Visual necesita su
      // propio listener de visibilidad"), y solo si no está cargado
      // caemos a un listener directo de document (mismo respaldo que
      // ya usa pestanaVisible() arriba). En ambos casos, registrado
      // una sola vez — una segunda llamada a iniciar() ya vuelve por
      // el guard de arriba.
      if (!listenerRegistrado) {
        listenerRegistrado = true;
        var m = movimiento();
        if (m && typeof m.suscribir === 'function') {
          m.suscribir(function (evento) {
            if (evento.motivo === 'visibilidad') alCambiarVisibilidad();
          });
        } else if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
          document.addEventListener('visibilitychange', alCambiarVisibilidad);
        }
      }
    }
  };

  // Etapa 3: mismo criterio que ambiente-clima.js — envuelto con
  // AmbienteContrato.crear() cuando existe, con fallback defensivo al
  // api crudo si por algún desorden de carga no estuviera disponible
  // todavía (preferible un módulo sin validar a un módulo ausente).
  global.AmbienteRespiracion = global.AmbienteContrato
    ? global.AmbienteContrato.crear(api)
    : api;

})(window);

/* ==== ambiente-movimiento.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-movimiento.js
   Fase 2: Motion Controller (Arquitectura técnica, Cap. 3.4)

   Subsistema del Grupo de Contenido Visual — el único de ese grupo que
   tiene permitido hablar con el Grupo de Orquestación y con el Grupo de
   Gobierno (Cap. 2.2, Nivel 3: "STATE MANAGER + SCENE MANAGER →
   MOTION CONTROLLER"). Responsabilidad única: tomar el estado activo,
   la escena activa y las restricciones vigentes de rendimiento y
   accesibilidad, y traducir todo eso en un único objeto de parámetros
   de movimiento — nunca renderiza nada, nunca decide qué escena o
   estado está activo (Cap. 3.4: "solo traduce esa información ya
   decidida en parámetros concretos").

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 3.4 — "nunca debe entregar parámetros a un subsistema del
     Grupo de Contenido Visual sin haber aplicado primero las
     restricciones vigentes del Grupo de Gobierno". calcularParametros()
     es el único punto donde escena y restricciones se combinan; nadie
     que consuma parametros() puede ver un valor sin degradar.
   - Cap. 2.3 — el Grupo de Contenido Visual "nunca [se comunica]
     lateralmente entre sí": Background Renderer (y los futuros
     Particle/Weather/Lighting/Depth) deben depender solo de este
     módulo, nunca de AmbienteRendimiento o AmbienteAccesibilidad
     directamente. Por eso este archivo también centraliza la lectura
     de `document.visibilitychange` — una señal ambiental cruda, no un
     subsistema ajeno — y la redistribuye como parte de su propio
     evento de cambio, para que ningún módulo de Contenido Visual
     necesite su propio listener de visibilidad (mismo principio que ya
     regía en el retirado ambiente-senales.js de Fase 0).
   - Cap. 9.5 — bajo reducirMovimiento la Capa de Partículas y la Capa
     de Clima se anulan y la Transición se acorta a un valor corto pero
     "nunca cero".
   - Cap. 7.2 — Fondo y Luz nunca se desactivan del todo, sin importar
     el nivel de fidelidad activo.

   T4 completo: el Scene Manager (Cap. 3.3, js/ambiente-escenas.js) ya
   existe. Tal como preveía la nota original de este archivo, la única
   redirección necesaria fue del lado de quien LLAMA a setEscena(): el
   orquestador ya no le informa la escena directamente a este módulo,
   sino que delega en AmbienteEscenas.activar(), que resuelve la
   escena en dos fases (Cap. 6.2) y recién entonces invoca este mismo
   setEscena() de siempre. Ninguna otra parte de este archivo cambió —
   setEscena() sigue siendo, a propósito, un método "tonto" que confía
   en que quien lo llama ya validó la escena.

   Debe cargarse después de ambiente-estados.js, ambiente-rendimiento.js,
   ambiente-accesibilidad.js y ambiente-profundidad.js (Depth Manager,
   Cap. 3.9 — un cálculo puro sin dependencias propias, así que puede
   cargarse en cualquier punto anterior a este archivo), y antes de
   ambiente-escenas.js (que lo invoca en su fase de activación),
   ambiente-capa-fondo.js y ambiente-orquestador.js (que es quien lo
   inicia).

   Fase 4 (Motion Direction Bible): este módulo ahora consulta a
   AmbienteRitmo (Cap. 5) para resolver el registro de ritmo y la
   duración de cada transición, en vez de calcular su propia banda de
   forma aislada. AmbienteGramatica (Cap. 4) todavía no tiene un
   consumidor en este archivo — el Motion Controller traduce escena +
   restricciones a parámetros numéricos, no decide qué verbo describe
   cada movimiento; ese es trabajo de las coreografías (Cap. 6), que
   son las que efectivamente invocan un verbo sobre un elemento
   concreto.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function config() { return global.AmbienteConfig || null; }
  function rendimiento() { return global.AmbienteRendimiento || null; }
  function accesibilidad() { return global.AmbienteAccesibilidad || null; }
  function profundidad() { return global.AmbienteProfundidad || null; }
  // Fase 4 (Motion Direction Bible, Cap. 5): fuente de verdad de los
  // Registros de Ritmo. Opcional a propósito — si no está cargado
  // (por ejemplo un test aislado de este archivo), todo este módulo
  // se degrada al cálculo local que ya tenía antes de la Fase 4,
  // nunca rompe.
  function ritmo() { return global.AmbienteRitmo || null; }

  // Cap. 3.9: el Motion Controller es quien llama al Depth Manager —
  // este último "no renderiza contenido propio", solo calcula. Si el
  // módulo no está cargado (por ejemplo, en un test aislado de este
  // archivo), se degrada a la misma multiplicación simple que hacía
  // este propio Motion Controller antes del T6, nunca a un profundidad
  // vacío que rompería a los suscriptores.
  function calcularProfundidad(profundidadEscena, nivel) {
    var d = profundidad();
    var multiplicadores = { navegacion: nivel.navegacion, atmosfera: nivel.atmosfera };
    if (d) return d.calcularFactores(profundidadEscena, multiplicadores);
    return {
      velocidadRelativa: profundidadEscena.navegacion * multiplicadores.navegacion * 0.12,
      desenfoqueMaxPx: Math.round(profundidadEscena.atmosfera * multiplicadores.atmosfera * 6),
      opacidadAtmosfera: 1 - (profundidadEscena.atmosfera * multiplicadores.atmosfera * 0.3)
    };
  }

  var listeners = [];
  var escenaActualId = null;
  var parametrosActuales = null;
  // Fase 4 (Cap. 5): registro de ritmo vigente para la transición
  // actual. 'conversacional' es el valor por defecto razonable — es
  // el "registro por defecto de la navegación cotidiana" (Cap. 5) —
  // hasta que setEscena() lo eleve a contemplativo (Cap. 6: "Cambio
  // de escena"). Los recálculos por rendimiento/accesibilidad/
  // visibilidad no son eventos narrativos (Cap. 9: son degradaciones
  // de gobierno, no cambios de escena), así que no lo modifican.
  var registroActual = 'conversacional';

  function emitir(motivo) {
    listeners.forEach(function (cb) {
      try { cb({ parametros: parametrosActuales, motivo: motivo }); }
      catch (e) { /* un listener roto no debe tumbar al resto */ }
    });
  }

  // ── Traducción central (Cap. 3.4) ────────────────────────────────
  // Combina la declaración de la escena activa (seis dimensiones,
  // Cap. 6.1 Arquitectura) con el nivel de fidelidad vigente (Cap. 9.6)
  // y la señal de accesibilidad (Cap. 3.11), en ese orden: primero se
  // multiplica por fidelidad, y solo al final reducirMovimiento puede
  // forzar a cero lo que la fidelidad todavía dejaba pasar — nunca al
  // revés, para que una preferencia de accesibilidad jamás pueda ser
  // "recuperada" por un nivel de fidelidad alto.
  //
  // Cap. 7.4: Presupuesto de Contraste Compartido. La suma de
  // intensidad visual entre Partículas + Clima + Navegación (profundidad)
  // nunca puede superar el presupuesto declarado por la escena. Si el
  // presupuesto se agota, se reduce proporcional a cada capa.
  function calcularPresupuestoContraste(presupuesto, densidadParticulas, climaHabilitado, profundidadNavegacion) {
    // Suma bruta de todas las capas que comparten presupuesto
    var demandaBruta = densidadParticulas + (climaHabilitado ? 0.5 : 0) + profundidadNavegacion;
    
    // Si la suma no supera el presupuesto, no hay restricción
    if (demandaBruta <= presupuesto) return { particulas: 1, clima: 1, navegacion: 1 };
    
    // Si supera, cada capa se reduce proporcionalmente
    var factorGlobal = presupuesto / demandaBruta;
    return {
      particulas: factorGlobal,
      clima: factorGlobal,
      navegacion: factorGlobal
    };
  }

  function calcularParametros() {
    var c = config();
    var r = rendimiento();
    var a = accesibilidad();
    if (!c) return null;

    var escena = c.obtenerEscena(escenaActualId) || c.obtenerEscena(c.ESCENA_INICIAL);
    if (!escena) return null;

    var nivelId = r ? r.nivelFidelidad : c.NIVEL_FIDELIDAD_INICIAL;
    var nivel = c.obtenerNivelFidelidad(nivelId) || c.obtenerNivelFidelidad(c.NIVEL_FIDELIDAD_INICIAL);
    var reducido = !!(a && a.reducirMovimiento);

    // Calcular valores antes de aplicar presupuesto
    var densidadParticulas = reducido ? 0 : escena.particulas.densidad * nivel.particulas;
    var climaHabilitado = reducido ? false : (escena.clima.habilitado && nivel.clima > 0);
    var profundidadNavegacion = escena.profundidad.navegacion * nivel.navegacion;
    
    // Aplicar presupuesto de contraste (Cap. 7.4)
    var factoresPresupuesto = calcularPresupuestoContraste(
      escena.presupuestoContraste,
      densidadParticulas,
      climaHabilitado,
      profundidadNavegacion
    );
    
    var parametros = {
      escena: escena.nombre,
      // Fondo y Luz nunca se desactivan (Cap. 7.2): sus multiplicadores
      // de nivel son siempre 1, así que esto nunca los lleva a 0 salvo
      // que la propia escena ya los declare así.
      fondo: {
        intensidadRelieve: escena.fondo.intensidadRelieve * nivel.relieve,
        saturacion: escena.fondo.saturacion
      },
      particulas: {
        densidad: densidadParticulas * factoresPresupuesto.particulas,
        libertadRecorrido: escena.particulas.libertadRecorrido,
        factorPresupuesto: factoresPresupuesto.particulas
      },
      clima: {
        habilitado: climaHabilitado,
        nieblaSutil: !!escena.clima.nieblaSutil,
        factorPresupuesto: factoresPresupuesto.clima
      },
      luz: {
        intensidad: escena.luz.intensidad * nivel.luz
      },
      profundidad: Object.assign({}, calcularProfundidad(escena.profundidad, nivel), {
        factorPresupuesto: factoresPresupuesto.navegacion
      }),
      transicion: {
        banda: escena.transicion.banda,
        duracionMs: duracionTransicion(),
        // Fase 4 (Cap. 5): informativo para quien consuma parámetros
        // — permite que un futuro módulo de coreografías (Cap. 6)
        // sepa en qué registro de ritmo está ocurriendo esta
        // transición sin tener que volver a calcularlo. Nunca es la
        // fuente de verdad del registro: eso vive únicamente en
        // AmbienteRitmo y en la variable registroActual de este
        // archivo.
        registro: registroActual
      },
      presupuestoContraste: escena.presupuestoContraste,
      factoresPresupuesto: factoresPresupuesto,
      reducido: reducido,
      nivelFidelidad: nivelId
    };

    return Object.freeze(parametros);
  }

  // Cap. 3.1 Fase 1: banda de contexto, 400-900ms. Cap. 9.5: bajo
  // reducirMovimiento se acorta a un valor corto "nunca cero" (150ms).
  // Sin reducción, un dispositivo/nivel de fidelidad bajo se queda en
  // el extremo inferior de la banda en lugar del punto medio (Cap.
  // 6.5 Fase 1: la Transición nunca se elimina, solo se acorta).
  //
  // Fase 4 (Motion Direction Bible, Cap. 5): la banda 'contexto' de
  // Arquitectura Técnica es, en el vocabulario de la Biblia, el
  // registro conversacional o contemplativo según registroActual. Si
  // AmbienteRitmo está cargado, es la fuente de verdad de esta
  // duración — incluye su propio manejo de reducirMovimiento (Cap.
  // 13), así que aquí solo queda superponer la regla de fidelidad
  // (Cap. 12), que le es ajena a Ritmo por diseño. Si no está
  // cargado, este módulo se degrada exactamente al cálculo que ya
  // tenía antes de la Fase 4 — nunca deja de funcionar.
  function duracionTransicion() {
    var c = config();
    var a = accesibilidad();
    var r = rendimiento();
    var rit = ritmo();

    if (rit) {
      if ((a && a.reducirMovimiento)) return rit.duracion(registroActual);
      if (r && r.nivelFidelidad !== 'completa') return rit.banda(registroActual).minMs;
      return rit.duracion(registroActual);
    }

    var banda = c ? c.BANDAS_VELOCIDAD.contexto : { minMs: 400, maxMs: 900 };
    if (a && a.reducirMovimiento) return 150;
    if (r && r.nivelFidelidad !== 'completa') return banda.minMs;
    return Math.round((banda.minMs + banda.maxMs) / 2);
  }

  function recalcularYEmitir(motivo) {
    parametrosActuales = calcularParametros();
    emitir(motivo);
  }

  // ── Visibilidad de pestaña (Cap. 9.2) ────────────────────────────
  // Señal ambiental cruda, leída una sola vez acá para que ningún
  // subsistema de Contenido Visual necesite su propio listener (ver
  // nota de cabecera). No es un "parámetro de movimiento" en sí, pero
  // viaja en el mismo evento de cambio porque su consecuencia es
  // siempre la misma para quien la escucha: pausar o re-sincronizar.
  function pestanaVisible() {
    return (typeof document !== 'undefined') ? !document.hidden : true;
  }

  var api = {
    // Cap. 3.4: superficie de lectura de los parámetros ya resueltos.
    // Nunca null tras iniciar(), salvo que AmbienteConfig no exista.
    parametros: function () { return parametrosActuales; },

    get pestanaVisible() { return pestanaVisible(); },

    duracionTransicion: duracionTransicion,

    // Sustituto temporal de Scene Manager (ver nota de cabecera,
    // T3→T4). Solo el Ambient Engine (raíz orquestadora) debe llamar
    // a esto — ningún subsistema de Contenido Visual debe conocer
    // siquiera que este método existe.
    //
    // Fase 4 (Cap. 6 "Cambio de escena", Cap. 5): un cambio de escena
    // es, por naturaleza, un evento de registro contemplativo. Si
    // AmbienteRitmo está cargado, se le pide resolver ese registro —
    // aplica la regla de contraste posterior (Cap. 5: un contemplativo
    // nunca sigue inmediatamente a otro) y puede degradarlo a
    // conversacional si el cambio de escena anterior fue reciente. Si
    // no está cargado, se mantiene 'contemplativo' fijo, que era el
    // comportamiento implícito de este módulo antes de la Fase 4.
    setEscena: function (id) {
      if (escenaActualId === id) return;
      escenaActualId = id;
      var rit = ritmo();
      registroActual = rit ? rit.resolver('contemplativo', 'cambio-escena').registro : 'contemplativo';
      recalcularYEmitir('escena');
    },

    // Suscripción para el Grupo de Contenido Visual. cb({parametros,
    // motivo}). motivo es 'escena' | 'rendimiento' | 'accesibilidad' |
    // 'visibilidad' — informativo únicamente; el objeto parametros ya
    // viene completo y resuelto en cualquier caso.
    suscribir: function (cb) {
      if (typeof cb !== 'function') return function () {};
      listeners.push(cb);
      return function desuscribir() {
        var idx = listeners.indexOf(cb);
        if (idx > -1) listeners.splice(idx, 1);
      };
    },

    iniciar: function () {
      if (parametrosActuales) return; // idempotente
      var c = config();
      escenaActualId = c ? c.ESCENA_INICIAL : 'home';
      parametrosActuales = calcularParametros();

      var r = rendimiento();
      if (r) r.suscribir(function () { recalcularYEmitir('rendimiento'); });

      var a = accesibilidad();
      if (a) a.suscribir(function () { recalcularYEmitir('accesibilidad'); });

      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', function () {
          emitir('visibilidad');
        });
      }
    }
  };

  global.AmbienteMovimiento = api;

})(window);

/* ==== ambiente-escenas.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-escenas.js
   Fase 2: Scene Manager (Arquitectura técnica, Cap. 3.3, 6.2)

   Subsistema del Grupo de Orquestación. Responsabilidad única: mantener
   el catálogo de escenas definidas (Cap. 6.1), gestionar su ciclo de vida
   completo (creación, carga, activación, mezcla, reemplazo y destrucción)
   y determinar, en conjunto con el State Manager, qué escena corresponde
   al contexto actual.

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 3.3 — no contiene lógica de animación ni de renderizado. Una
     escena, para el Scene Manager, es exclusivamente una estructura de
     configuración.
   - Cap. 6.2 — carga en dos fases: (1) resolución (obtener definición
     de Config, verificar assets en Registry); (2) activación (entregar
     configuración resuelta al Motion Controller).
   - Cap. 6.2 — si la fase de resolución falla, mantiene la escena
     anterior y registra en Diagnostics, nunca activa parcialmente.
   - Cap. 3.3 — no decide qué escena corresponde al estado actual; eso es
     una relación gestionada en conjunto con State Manager a través del
     Ambient Engine.
   - Cap. 11.4 — este módulo NUNCA es importado desde fuera de la carpeta
     del Ambient Engine. Solo se comunica a través del Ambient Engine
     (raíz orquestadora).

   Debe cargarse después de ambiente-config.js, ambiente-assets.js y
   ambiente-movimiento.js, y antes de ambiente-orquestador.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function config() { return global.AmbienteConfig || null; }
  function assets() { return global.AmbienteAssets || null; }
  function movimiento() { return global.AmbienteMovimiento || null; }
  function diagnostico() { return global.AmbienteDiagnostico || null; }

  var escenaActualId = null;
  var escenaPendienteId = null;

  // Cap. 6.2: Fase 1 — Resolución. Verifica que todos los assets
  // requeridos por una escena estén disponibles o puedan cargarse a tiempo.
  function validarDisponibilidadAssets(escena) {
    var a = assets();
    if (!a || !escena) return false;

    // Por ahora, todas las escenas son definidas en el catálogo (no hay
    // assets dinámicos). Esta función es un punto de extensión para
    // cuando existan assets por escena (por ejemplo, texturas específicas
    // de una escena estacional futura).
    // Cap. 8.1: si en el futuro hay assets diferidos, se verificarían acá.
    return true;
  }

  // Cap. 6.2: Fase 1 — Resolución completa. Obtiene escena de Config,
  // verifica assets, devuelve escena o falla con log en Diagnostics.
  function resolver(id) {
    var c = config();
    if (!c) return null;

    var escena = c.obtenerEscena(id) || c.obtenerEscena(c.ESCENA_INICIAL);
    if (!escena) {
      var d = diagnostico();
      if (d) d.registrar('escenas', 'resolver() falló: escena ' + id + ' no existe');
      return null;
    }

    if (!validarDisponibilidadAssets(escena)) {
      var d = diagnostico();
      if (d) d.registrar('escenas', 'resolver() falló: assets no disponibles para escena ' + id);
      return null;
    }

    return escena;
  }

  // Cap. 6.2: Fase 2 — Activación. Entrega configuración resuelta al
  // Motion Controller, que es quien la convierte en parámetros de
  // movimiento. Aquí es donde se cierra el ciclo de carga de una escena.
  function activar(id) {
    var escenaResuelta = resolver(id);
    if (!escenaResuelta) {
      // Mantener escena anterior (Cap. 6.2)
      return false;
    }

    escenaActualId = id;
    escenaPendienteId = null;

    var m = movimiento();
    if (m) m.setEscena(id);

    return true;
  }

  var api = {
    // Obtener la escena actualmente activa (ID únicamente)
    obtenerActual: function () { return escenaActualId; },

    // Obtener la escena que está en proceso de activación (si hay)
    obtenerPendiente: function () { return escenaPendienteId; },

    // Activar una escena nueva (Cap. 6.2: resolución + activación)
    // Solo el Ambient Engine debe llamar a esto.
    // Devuelve true si tuvo éxito, false si falló y se mantuvo la anterior.
    activar: function (id) {
      if (id === escenaActualId) return true; // idempotente
      if (id === escenaPendienteId) return true; // ya está en cola

      escenaPendienteId = id;
      return activar(id);
    },

    // Obtener la configuración completa de una escena por ID
    // (Cap. 3.3: el Scene Manager no "conoce" la lógica de animación,
    // pero sí expone la configuración que define una escena)
    obtenerConfiguracion: function (id) {
      var c = config();
      if (!c) return null;
      return c.obtenerEscena(id);
    },

    // Inicializar con la escena inicial
    iniciar: function () {
      var c = config();
      if (!c) return;
      escenaActualId = c.ESCENA_INICIAL;
      activar(escenaActualId);
    }
  };

  global.AmbienteEscenas = api;

})(window);

/* ==== ambiente-luz.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-luz.js
   Fase 2: Lighting Engine (Arquitectura técnica, Cap. 3.8)

   Subsistema del Grupo de Contenido Visual. Responsabilidad única:
   gestionar la Capa de Luz: resplandores, viñetas, y la coherencia
   lumínica entre el fondo y los elementos de interfaz que "reciben" esa
   luz.

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 3.8 — no gestiona el ciclo horario en sí (eso es responsabilidad
     del Background Renderer) — recibe ese dato ya resuelto y lo traduce
     en efectos de iluminación coherentes con él.
   - Cap. 3.8 — debe introducir una temperatura de color que coherente con
     la del Background Renderer activo (Cap. 3.8 confirmación, Motion
     Controller la enforza).
   - Cap. 2.3 — nunca se comunica lateralmente con otros subsistemas del
     Grupo de Contenido Visual. Todo pasa por Motion Controller.
   - Cap. 2.3 — solo recibe parámetros del Motion Controller, nunca
     consulta directamente a Performance Manager o Accessibility Manager.
   - Cap. 7.2 — NUNCA se desactiva, incluso bajo restricciones severas
     de rendimiento (siempre tiene nivel.luz = 1).

   Debe cargarse después de ambiente-movimiento.js y antes de
   ambiente-orquestador.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function movimiento() { return global.AmbienteMovimiento || null; }

  var viñeta = null; // elemento de viñeta
  var resplandor = null; // elemento de resplandor
  var parametrosActuales = null;
  var desuscribir = null;

  // Calcular color base según intensidad (simulando ciclo horario)
  //
  // Fase 8 (Visual & Design Master Pass): las tres paradas usaban
  // colores literales de app-del-tiempo genérica (celeste cielo,
  // naranja, azul profundo) — exactamente la iconografía que el Cap.
  // 1.1 del documento de Lenguaje de Assets excluye para el campo
  // "Orientación/tiempo" ("Qué NO aporta: … iconografía de clima tipo
  // app del tiempo"), y sin relación con ningún token de marca. Se
  // reemplazan por los mismos valores RGB que ya son la fuente de
  // verdad en css/tokens.css: --color-tinta (236,237,239) para el
  // brillo neutro del día, --color-granate-clara (201,122,131) para
  // la calidez de atardecer — el mismo acento que ya usa el resto del
  // sitio (marca, hover de tarjetas, foco) — y --color-linea
  // (148,155,171) para el frío sobrio de la noche, en vez de un azul
  // nuevo inventado para la ocasión.
  function calcularTemperaturaColor(intensidad) {
    // Cap. 3.1 Fase 1: transición de día a atardecer a noche
    // Intensidad alta (día) → brillo neutro (--color-tinta)
    // Intensidad media (atardecer) → cálido de marca (--color-granate-clara)
    // Intensidad baja (noche) → frío sobrio (--color-linea)

    if (intensidad >= 0.7) {
      // Día: brillo neutro, mismo tono que la tinta del sitio
      return 'rgba(236, 237, 239, 0.12)';
    } else if (intensidad >= 0.4) {
      // Atardecer: cálido de marca, el mismo acento granate claro
      return 'rgba(201, 122, 131, 0.16)';
    } else {
      // Noche: frío sobrio, el mismo gris que ya usan las líneas del sitio
      return 'rgba(148, 155, 171, 0.14)';
    }
  }

  // Crear viñeta (oscurecimiento en bordes)
  function crearVigneta() {
    if (!viñeta) {
      viñeta = document.createElement('div');
      viñeta.id = 'ambient-vigneta';
      viñeta.style.position = 'fixed';
      viñeta.style.top = '0';
      viñeta.style.left = '0';
      viñeta.style.width = '100%';
      viñeta.style.height = '100%';
      viñeta.style.pointerEvents = 'none';
      viñeta.style.zIndex = '3';
      viñeta.style.background = 'radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, 0.3) 100%)';
      document.body.appendChild(viñeta);
    }
  }

  // Crear resplandor base
  function crearResplandor() {
    if (!resplandor) {
      resplandor = document.createElement('div');
      resplandor.id = 'ambient-resplandor';
      resplandor.style.position = 'fixed';
      resplandor.style.top = '0';
      resplandor.style.left = '0';
      resplandor.style.width = '100%';
      resplandor.style.height = '100%';
      resplandor.style.pointerEvents = 'none';
      resplandor.style.zIndex = '1';
      resplandor.style.mixBlendMode = 'screen';
      // Sin opacity inline: css/ambiente-estilos.css la calcula a
      // partir de --amb-resplandor-base (ver actualizarLuz) sumada a
      // --amb-respiracion (Fase 4, Cap. 8) — un valor inline acá
      // ganaría por especificidad y anularía esa suma.
      document.body.appendChild(resplandor);
    }
  }

  // Actualizar color e intensidad de la luz
  function actualizarLuz(parametros) {
    if (!parametros || !parametros.luz) return;

    var luz = parametros.luz;
    var intensidad = luz.intensidad || 0.5;

    // Crear elementos si no existen
    if (typeof document !== 'undefined') {
      crearVigneta();
      crearResplandor();
    }

    // Actualizar viñeta según intensidad
    if (viñeta) {
      // Menos intensidad = más oscuro en bordes
      var opacidadVigneta = 0.3 + (0.2 * (1 - intensidad));
      viñeta.style.background = 'radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, ' + opacidadVigneta + ') 100%)';
    }

    // Actualizar resplandor según temperatura de color
    if (resplandor) {
      var colorTemperatura = calcularTemperaturaColor(intensidad);
      resplandor.style.backgroundColor = colorTemperatura;
      // Fase 4 (Cap. 8): la opacidad final no se fija acá — se publica
      // solo la base, y css/ambiente-estilos.css le suma la variación
      // continua de --amb-respiracion (ambiente-respiracion.js). Este
      // módulo sigue sin conocer a ese otro módulo (Cap. 2.3): ambos
      // convergen únicamente en la hoja de estilos.
      resplandor.style.setProperty('--amb-resplandor-base', (0.3 * intensidad).toString());
    }
  }

  // Manejador de cambios en parámetros del Motion Controller
  function alCambiarParametros(evento) {
    parametrosActuales = evento.parametros;
    actualizarLuz(parametrosActuales);
  }

  var api = {
    // Obtener la intensidad de luz actual
    obtenerIntensidad: function () {
      return (parametrosActuales && parametrosActuales.luz) 
        ? parametrosActuales.luz.intensidad 
        : 0.5;
    },

    // Inicializar el subsistema
    iniciar: function () {
      if (typeof document === 'undefined') return;

      // Suscribirse a cambios del Motion Controller
      var m = movimiento();
      if (m) {
        desuscribir = m.suscribir(alCambiarParametros);
        parametrosActuales = m.parametros();
        actualizarLuz(parametrosActuales);
      }
    },

    // Limpiar y detener
    destruir: function () {
      if (desuscribir) desuscribir();

      // Remover viñeta
      if (viñeta && viñeta.parentNode) {
        viñeta.parentNode.removeChild(viñeta);
        viñeta = null;
      }

      // Remover resplandor
      if (resplandor && resplandor.parentNode) {
        resplandor.parentNode.removeChild(resplandor);
        resplandor = null;
      }
    }
  };

  global.AmbienteLuz = api;

})(window);

/* ==== ambiente-clima.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-clima.js
   Fase 2: Weather Engine (Arquitectura técnica, Cap. 3.7)

   Subsistema del Grupo de Contenido Visual. Responsabilidad única:
   gestionar la Capa de Clima: activación y desactivación de variaciones
   climáticas (lluvia, niebla, viento) según la configuración de escena
   vigente.

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 3.7 — es el subsistema de menor frecuencia de activación por
     diseño (Cap. 5.7 Fase 1) — no debe activarse de forma constante ni
     convertirse en un elemento permanente de ninguna escena.
   - Cap. 3.7 — nunca debe activarse sin una señal explícita del Motion
     Controller — no tiene lógica propia de decisión sobre cuándo activarse.
   - Cap. 2.3 — nunca se comunica lateralmente con otros subsistemas del
     Grupo de Contenido Visual. Todo pasa por Motion Controller.
   - Cap. 2.3 — solo recibe parámetros del Motion Controller, nunca
     consulta directamente a Performance Manager o Accessibility Manager.
   - Cap. 7.2 — desactivable según orden de degradación (Cap. 7.2: primero
     en ser desactivado cuando hay restricciones de recursos).
   - Cap. 9.2 — bajo reducirMovimiento se desactiva por completo.

   Fase 6 (Playbook, WP5) / Fase 7 (Auditoría §9.1): conecta
   functions/weather.js como primera señal ambiental real. Sigue
   siendo un ejecutor, no un decisor de negocio: solo traduce
   temperatura/código WMO/viento ya normalizados por esa función a
   activar/desactivar los mismos tres efectos que ya existían — nunca
   agrega un cuarto efecto ni decide fuera de ese vocabulario. Nunca
   escribe en ninguna fuente de datos existente, solo lee. Una falla
   de red acá nunca debe notarse: se degrada a exactamente el mismo
   comportamiento de antes (niebla sutil por escena, nada más).

   Debe cargarse después de ambiente-movimiento.js y antes de
   ambiente-orquestador.js.

   PENDIENTE (no relacionado a este módulo, anotado acá para que no
   se vuelva a perder): scripts/build-ambiente-bundle.js en la raíz
   del repo sigue validando contra los <script> de index.html
   (validarContraIndexHtml), que ya no existen ahí desde que los 27
   módulos se concatenaron en ambiente.bundle.js — por eso ese script
   falla siempre con "En index.html: []". Hay que reemplazarlo por la
   versión que valida contra el directorio (validarContraDirectorio,
   comparando ORDEN contra los archivos ambiente-*.js en disco) y que
   ya incluye ambiente-contrato.js + ambiente-metrics.js en ORDEN.
   También queda un duplicado sobrante en
   donde-comer-cdu/js/build-ambiente-bundle.js (lugar incorrecto) para
   borrar. Mientras tanto, ambiente.bundle.js se sigue regenerando a
   mano con esa versión corregida del script cada vez que se edita
   este archivo — el bundle no está desactualizado, solo el script que
   lo genera.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function movimiento() { return global.AmbienteMovimiento || null; }
  function rendimiento() { return global.AmbienteRendimiento || null; }

  // Etapa 3 (Roadmap A+B — Contrato común, ver ambiente-contrato.js):
  // mismo umbral que ya usa AmbienteConfig.NIVELES_FIDELIDAD.clima (0
  // en 'reducida' y 'minima', 1 en 'completa') — hoy ese umbral solo
  // apagaba el EFECTO visual vía Motion Controller (climaHabilitado
  // en ambiente-movimiento.js), nunca el polling real de red de este
  // módulo. Pura y sin leer AmbienteRendimiento por su cuenta (recibe
  // el nivel como parámetro), para que se pueda testear aislada sin
  // mockear el Performance Manager completo.
  function isActive(fidelidad) {
    return fidelidad !== 'reducida' && fidelidad !== 'minima';
  }

  function fidelidadActual() {
    var r = rendimiento();
    return r ? r.nivelFidelidad : 'completa';
  }

  var efectosActivos = {}; // { lluvia: boolean, niebla: boolean, viento: boolean }
  var contenedor = null;
  var parametrosActuales = null;
  var desuscribir = null;

  // Fase 6/7: clima real. Endpoint co-alojado (Cloudflare Pages
  // Function en functions/weather.js) — mismo origen, sin CORS.
  var URL_CLIMA = '/weather';
  // Mismo intervalo que el cache-control del propio endpoint (300s):
  // pedir más seguido no traería datos más frescos (Fase 6 criterio
  // de rechazo: "cualquier polling con frecuencia propia distinta").
  var INTERVALO_REFRESCO_MS = 5 * 60 * 1000;
  var UMBRAL_VIENTO_KMH = 25;
  // Códigos WMO ya normalizados por functions/weather.js.
  var CODIGOS_LLUVIA = { 51: true, 61: true, 65: true, 71: true, 75: true };
  var CODIGO_NIEBLA = 45;

  var temporizadorClima = null;
  var climaRealVientoActivo = false;
  var climaRealLluviaActiva = false;
  var climaRealNieblaActiva = false;
  var listenerVisibilidad = null;
  var desuscribirRendimiento = null;

  // Etapa 3: dos razones independientes para pausar el polling, cada
  // una dueña de su propio booleano — igual que ya hacía el listener
  // de visibilidad antes de este cambio, solo que ahora hay dos en vez
  // de una. Ninguna anula el registro de la otra: si la pestaña está
  // oculta Y la fidelidad está degradada a la vez, al volver a
  // fidelidad completa con la pestaña todavía oculta, el polling debe
  // seguir pausado (por visibilidad), no reanudarse a medias.
  var visibilidadPermitePolling = true;
  var fidelidadPermitePolling = true;

  // Única función que decide arrancar/parar el intervalo real,
  // consultando ambas señales — así ninguna de las dos puede reanudar
  // el polling por su cuenta mientras la otra lo esté vetando.
  function actualizarEstadoPolling() {
    if (visibilidadPermitePolling && fidelidadPermitePolling) {
      reanudarRefresco();
    } else {
      pausarRefresco();
    }
  }

  // Variaciones climáticas posibles (Cap. 5.7 Fase 1)
  var EFECTOS_DISPONIBLES = {
    lluvia: { elemento: null, claseCSS: 'ambient-lluvia' },
    niebla: { elemento: null, claseCSS: 'ambient-niebla' },
    viento: { elemento: null, claseCSS: 'ambient-viento' }
  };

  // Activar un efecto climático
  function activarEfecto(nombreEfecto) {
    if (!EFECTOS_DISPONIBLES[nombreEfecto]) return;
    if (efectosActivos[nombreEfecto]) return; // ya está activo

    var efecto = EFECTOS_DISPONIBLES[nombreEfecto];
    efecto.elemento = document.createElement('div');
    efecto.elemento.className = efecto.claseCSS;
    efecto.elemento.style.position = 'fixed';
    efecto.elemento.style.top = '0';
    efecto.elemento.style.left = '0';
    efecto.elemento.style.width = '100%';
    efecto.elemento.style.height = '100%';
    efecto.elemento.style.pointerEvents = 'none';
    efecto.elemento.style.zIndex = '5';
    efecto.elemento.style.opacity = '0.3';

    if (contenedor) contenedor.appendChild(efecto.elemento);
    efectosActivos[nombreEfecto] = true;
  }

  // Desactivar un efecto climático
  function desactivarEfecto(nombreEfecto) {
    if (!EFECTOS_DISPONIBLES[nombreEfecto]) return;
    if (!efectosActivos[nombreEfecto]) return; // ya está inactivo

    var efecto = EFECTOS_DISPONIBLES[nombreEfecto];
    if (efecto.elemento && efecto.elemento.parentNode) {
      efecto.elemento.parentNode.removeChild(efecto.elemento);
      efecto.elemento = null;
    }
    efectosActivos[nombreEfecto] = false;
  }

  // Manejador de cambios en parámetros del Motion Controller
  function alCambiarParametros(evento) {
    parametrosActuales = evento.parametros;
    if (!parametrosActuales || !parametrosActuales.clima) return;

    var clima = parametrosActuales.clima;

    // Cap. 3.7: nunca debe activarse sin una señal explícita
    // La señal explícita es: clima.habilitado === true
    if (!clima.habilitado) {
      // Desactivar todos los efectos
      Object.keys(EFECTOS_DISPONIBLES).forEach(desactivarEfecto);
      climaRealLluviaActiva = false;
      climaRealVientoActivo = false;
      return;
    }

    // Cap. 3.7: "clima es un toggle que resolverá el futuro Weather Engine"
    // Por ahora, si está habilitado, activamos niebla sutil (Cap. 5.9 Fase 1)
    // Fase 6/7: niebla real (código WMO 45) se suma como OR — cualquiera
    // de las dos razones (escena o dato real) es suficiente, ninguna
    // anula a la otra.
    if (clima.nieblaSutil || climaRealNieblaActiva) {
      activarEfecto('niebla');
    } else {
      desactivarEfecto('niebla');
    }

    // Cap. 5.7 Fase 1: "lluvia, noche y atardecer... variaciones que se
    // superponen". Lluvia es un toggle independiente de la escena.
    // Fase 6/7: ahora sí tiene un Context Manager real — functions/weather.js.
    if (climaRealLluviaActiva) {
      activarEfecto('lluvia');
    } else {
      desactivarEfecto('lluvia');
    }
    if (climaRealVientoActivo) {
      activarEfecto('viento');
    } else {
      desactivarEfecto('viento');
    }
  }

  // Fase 6 WP5 / Fase 7 §9.1: traduce el dato ya normalizado de
  // functions/weather.js al mismo vocabulario de tres efectos que ya
  // existía. No decide nada de negocio nuevo — solo mapea código WMO
  // → efecto ya definido arriba (Cap. 2.3: sigue sin comunicarse
  // lateralmente con otros subsistemas de Contenido Visual).
  function aplicarDatosClimaReal(datos) {
    var codigo = datos && datos.current && datos.current.weather_code;
    var vientoKmh = datos && datos.current && datos.current.wind_speed_10m;

    climaRealLluviaActiva = !!(codigo != null && CODIGOS_LLUVIA[codigo]);
    climaRealNieblaActiva = codigo === CODIGO_NIEBLA;
    climaRealVientoActivo = typeof vientoKmh === 'number' && vientoKmh >= UMBRAL_VIENTO_KMH;

    publicarSenalVientoDOM();

    // Re-aplica contra la escena vigente (si el clima está deshabilitado
    // para esta escena, alCambiarParametros ya lo apaga todo igual).
    if (parametrosActuales) alCambiarParametros({ parametros: parametrosActuales });
  }

  // Auditoría de conexiones (Fase 8): changelog.md v1.0 registraba
  // "Reactividad a clima (lluvia/viento) de Corrientes y Partículas
  // de deriva" como pendiente, a propósito, por "sin señal real de
  // clima en la app". Esa señal ya existe acá desde Fase 6/7 — solo
  // nunca salía de este módulo. Mismo patrón exacto que
  // ambiente-respiracion.js (Cap. 2.3: "publica un valor que
  // cualquier CSS puede leer", nunca llama directo a otro subsistema
  // de Contenido Visual): se escribe una única variable numérica
  // --amb-clima-viento (0 o 1) sobre <html>, que
  // assets/ambient/_tokens/ambiente-tokens-movimiento.css usa para
  // acelerar la Deriva de Corrientes y la Flotación de Partículas —
  // ninguna de las dos familias necesita conocer a este módulo.
  // Deliberadamente solo viento: es la única de las tres señales de
  // clima real con una traducción de movimiento obvia y no forzada
  // (una corriente/partícula que "se apura" con viento real; lluvia y
  // niebla ya tienen su propia traducción visual — los overlays — y
  // forzarlas también sobre Corrientes/Partículas sería inventar una
  // asociación que el Cap. 8.2 pide evitar).
  function publicarSenalVientoDOM() {
    if (typeof document === 'undefined' || !document.documentElement) return;
    document.documentElement.style.setProperty(
      '--amb-clima-viento',
      climaRealVientoActivo ? '1' : '0'
    );
  }

  // Fetch con timeout corto: una falla o demora de la API externa
  // (Cap. 15.3 Blueprint: blast radius) nunca debe bloquear ni
  // degradar nada más del Ambient Engine — silenciosa, sin reintento
  // agresivo, mismo criterio fail-open que el resto del motor.
  function obtenerClimaReal() {
    if (typeof fetch !== 'function') return;
    var controlador = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timeoutId = controlador ? setTimeout(function () { controlador.abort(); }, 5000) : null;

    fetch(URL_CLIMA, { signal: controlador ? controlador.signal : undefined })
      .then(function (res) {
        if (timeoutId) clearTimeout(timeoutId);
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (datos) {
        if (datos) aplicarDatosClimaReal(datos);
      })
      .catch(function () {
        // Fail-open silencioso: se queda con el último estado conocido
        // (o con el comportamiento previo basado solo en escena) en
        // vez de romper o de reintentar agresivamente.
        if (timeoutId) clearTimeout(timeoutId);
      });
  }

  function pausarRefresco() {
    if (temporizadorClima) {
      clearInterval(temporizadorClima);
      temporizadorClima = null;
    }
  }

  function reanudarRefresco() {
    if (temporizadorClima) return;
    obtenerClimaReal();
    temporizadorClima = setInterval(obtenerClimaReal, INTERVALO_REFRESCO_MS);
  }

  var api = {
    // Etapa 3 (Roadmap A+B — Contrato común, ver ambiente-contrato.js):
    // campos de forma. id/tier/frequency son metadata declarativa; el
    // comportamiento real de este módulo sigue siendo el mismo de
    // siempre (dirigido por eventos del Motion Controller + polling
    // async), no por un loop de frames — ver la nota en step() más
    // abajo sobre por qué eso es, a propósito, un no-op por ahora.
    id: 'clima',
    // tier:'visual' (nunca 'core'): Cap. 7.2 dice explícitamente que
    // clima es el primer subsistema en desactivarse ante restricción
    // de recursos — mismo criterio que ya expresa isActive() arriba.
    tier: 'visual',
    // frequency:'static' (no 'full' ni 'reduced'): a diferencia de un
    // módulo que recalcula algo en cada frame o cada N ms, clima no
    // tiene una animación continua propia — solo prende/apaga tres
    // clases CSS ante un evento (cambio de escena o de dato real de
    // viento/lluvia/niebla) y se queda quieto entre esos eventos. No
    // hay "cada cuánto" que declarar porque no hay recómputo
    // periódico que gatear.
    frequency: 'static',
    isActive: isActive,

    // step(dt, sharedState): intencionalmente un no-op. El contrato
    // (ver ambiente-contrato.js) pide que step() sea cómputo puro sin
    // tocar DOM/CSS, y que read() sea lo único que el futuro
    // orquestador consulte para escribir en un único batch (Etapa 5).
    // Este módulo hoy escribe DOM directamente desde sus propios
    // callbacks (alCambiarParametros, aplicarDatosClimaReal) porque
    // esos callbacks no corren en el loop de frames — corren cuando
    // el Motion Controller emite un cambio o cuando responde el
    // fetch. Forzarlos hoy a vivir dentro de step() obligaría a cachear
    // su resultado un frame entero antes de aplicarlo, agregando
    // latencia sin ganar nada (nadie más necesita leer ese estado
    // intermedio todavía). Se documenta como desviación explícita,
    // no aplicada en silencio — separar de verdad "calcular" de
    // "escribir" en este módulo queda para cuando el orquestador
    // realmente lo consuma (Etapa 5, writer único), no antes.
    step: function (dt, sharedState) {},

    // read(): lo único que hoy expone al espíritu del contrato — el
    // último estado ya calculado, sin recalcular nada. Incluye lo
    // mismo que ya devolvía obtenerActivos(), en la forma de objeto
    // que un futuro consumidor esperaría de read().
    read: function () {
      return {
        lluvia: !!efectosActivos.lluvia,
        niebla: !!efectosActivos.niebla,
        viento: !!efectosActivos.viento
      };
    },

    // Verificar si un efecto está actualmente activo
    estaActivo: function (nombreEfecto) {
      return !!efectosActivos[nombreEfecto];
    },

    // Obtener lista de efectos activos
    obtenerActivos: function () {
      return Object.keys(efectosActivos).filter(function (k) {
        return efectosActivos[k];
      });
    },

    // Inicializar el subsistema
    // Fase 6 (auditoría §1/§3): idempotente — sin esta guarda, una
    // segunda llamada duplicaba el contenedor DOM, la suscripción al
    // Motion Controller y el listener de visibilitychange (el segundo
    // sobrescribía la referencia del primero en listenerVisibilidad,
    // por lo que ese primer listener quedaba huérfano, imposible de
    // remover, acumulándose en cada iniciar() repetido).
    iniciar: function () {
      if (typeof document === 'undefined') return;
      if (contenedor) return; // ya inicializado

      // Crear contenedor
      contenedor = document.createElement('div');
      contenedor.id = 'ambient-clima-contenedor';
      document.body.appendChild(contenedor);

      // Inicializar estado de efectos
      Object.keys(EFECTOS_DISPONIBLES).forEach(function (k) {
        efectosActivos[k] = false;
      });

      // Suscribirse a cambios del Motion Controller
      var m = movimiento();
      if (m) {
        desuscribir = m.suscribir(alCambiarParametros);
        parametrosActuales = m.parametros();
      }

      // Fase 6 WP5 / Fase 7 §9.1: clima real. Se pausa completamente
      // cuando la pestaña no es visible (Cap. 8.2 Playbook: "sin
      // listeners activos en background") y retoma con un fetch
      // inmediato al volver, en vez de esperar el próximo intervalo.
      //
      // Etapa 3: mismo mecanismo de pausa, ahora también gateado por
      // fidelidad (isActive arriba) — antes ese umbral solo apagaba el
      // EFECTO visual vía Motion Controller, nunca el polling de red
      // real de este módulo. En 'reducida'/'minima' no tiene sentido
      // seguir pidiendo datos que van a alimentar un efecto que ya
      // está desactivado.
      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        visibilidadPermitePolling = document.visibilityState !== 'hidden';
        fidelidadPermitePolling = isActive(fidelidadActual());
        actualizarEstadoPolling();

        listenerVisibilidad = function () {
          visibilidadPermitePolling = document.visibilityState !== 'hidden';
          actualizarEstadoPolling();
        };
        document.addEventListener('visibilitychange', listenerVisibilidad);

        var r = rendimiento();
        if (r) {
          desuscribirRendimiento = r.suscribir(function (evento) {
            fidelidadPermitePolling = isActive(evento.actual);
            actualizarEstadoPolling();
          });
        }
      }
    },

    // Limpiar y detener
    destruir: function () {
      if (desuscribir) desuscribir();
      pausarRefresco();
      if (listenerVisibilidad && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', listenerVisibilidad);
        listenerVisibilidad = null;
      }
      if (desuscribirRendimiento) {
        desuscribirRendimiento();
        desuscribirRendimiento = null;
      }
      visibilidadPermitePolling = true;
      fidelidadPermitePolling = true;

      // Desactivar todos los efectos
      Object.keys(EFECTOS_DISPONIBLES).forEach(desactivarEfecto);

      // Remover contenedor
      if (contenedor && contenedor.parentNode) {
        contenedor.parentNode.removeChild(contenedor);
      }

      // Auditoría de conexiones: limpiar también la señal publicada,
      // para que Corrientes/Partículas no queden "aceleradas" por un
      // viento que ya nadie está midiendo.
      climaRealVientoActivo = false;
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.style.removeProperty('--amb-clima-viento');
      }
    }
  };

  // Etapa 3: envuelto con AmbienteContrato.crear() para validar la
  // forma contra el contrato común (loggea un warning si algo no
  // calza, nunca lanza — mismo criterio fail-open del resto del
  // motor). Fallback defensivo si por algún desorden de carga
  // AmbienteContrato no existiera todavía: se expone igual el api
  // crudo, sin validar, en vez de romper el arranque — un módulo
  // sin validar es preferible a un módulo ausente (mismo espíritu
  // que ya documenta ambiente-contrato.js sobre módulos inválidos).
  global.AmbienteClima = global.AmbienteContrato
    ? global.AmbienteContrato.crear(api)
    : api;

})(window);

/* ==== ambiente-interaccion.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-interaccion.js
   Fase 2: Interaction Observer (Arquitectura técnica, Cap. 3.12)

   Subsistema del Grupo de Gobierno. Responsabilidad única: observar la
   actividad del usuario (gestos, foco, inactividad) y traducir esa
   actividad en eventos que el State Manager consume para sus transiciones
   (Idle, Activo, Foco).

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 3.12 — no interpreta el significado de negocio de la interacción
     (no sabe qué lugar fue tocado, solo que hubo un gesto).
   - Cap. 3.12 — no acumula o almacena historial sin límite. Solo mantiene
     estado actual: "hubo gesto hace N ms", "hay foco", "ninguno".
   - Cap. 3.12 — emite eventos hacia State Manager, nunca datos sin
     procesar.
   - Cap. 5.2 Fase 2: traduce patrones en transiciones: Activo→Idle
     (inactividad), cualquier gesto→Activo, foco en campo→Foco.

   Debe cargarse antes de ambiente-orquestador.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var listeners = [];
  var ultimoGesto = null; // timestamp del último gesto detectado
  var elementoFoco = null; // elemento que tiene foco actual

  // Fase 4 (Motion Direction Bible v2.0, K.11/B.2.4): antes era un
  // literal local (8000ms) que nunca leía AmbienteConfig — tres veces
  // más corto que AmbienteConfig.UMBRALES.inactividadMs (25000ms,
  // "punto medio del rango 20-30s" según el propio catálogo, la fuente
  // de verdad declarada). Fail-open: si AmbienteConfig no cargó
  // todavía, cae al mismo valor que ya usaba este módulo.
  var tiempoInactividadMs = (global.AmbienteConfig && global.AmbienteConfig.UMBRALES &&
    global.AmbienteConfig.UMBRALES.inactividadMs) || 8000;
  var timerInactividad = null;

  function emitir(evento) {
    listeners.forEach(function (cb) {
      try { cb(evento); }
      catch (e) { /* listener roto no debe tumbar al resto */ }
    });
  }

  function registrarGesto() {
    ultimoGesto = Date.now();
    emitir({ tipo: 'gesto' });
    
    // Resetear timer de inactividad
    if (timerInactividad) clearTimeout(timerInactividad);
    timerInactividad = setTimeout(function () {
      emitir({ tipo: 'inactividad' });
    }, tiempoInactividadMs);
  }

  function registrarFoco(elemento) {
    elementoFoco = elemento;
    emitir({ tipo: 'foco', elemento: elemento });
  }

  function desregistrarFoco() {
    elementoFoco = null;
    emitir({ tipo: 'desfocar' });
  }

  // Detectores de gestos (Cap. 3.12: patrones de interacción relevantes)
  function inicializarDetectores() {
    if (typeof document === 'undefined') return;

    // Gestos de puntero/táctil: click, tap, touchstart
    var gestoEventos = ['click', 'touchstart'];
    gestoEventos.forEach(function (tipo) {
      document.addEventListener(tipo, registrarGesto, true);
    });

    // Foco en campos interactivos
    document.addEventListener('focus', function (e) {
      registrarFoco(e.target);
    }, true);

    document.addEventListener('blur', function (e) {
      desregistrarFoco();
    }, true);

    // Iniciar timer de inactividad
    timerInactividad = setTimeout(function () {
      emitir({ tipo: 'inactividad' });
    }, tiempoInactividadMs);
  }

  var api = {
    // Obtener el timestamp del último gesto (null si nunca hubo)
    ultimoGesto: function () { return ultimoGesto; },

    // Obtener el elemento con foco actual (null si no hay)
    elementoConFoco: function () { return elementoFoco; },

    // Verificar si está inactivo (sin gestos en los últimos N ms)
    estaInactivo: function () {
      if (!ultimoGesto) return true; // nunca interactuó
      return (Date.now() - ultimoGesto) >= tiempoInactividadMs;
    },

    // Suscribirse a cambios de interacción
    // cb({tipo: 'gesto'|'inactividad'|'foco'|'desfocar', elemento?})
    suscribir: function (cb) {
      if (typeof cb !== 'function') return function () {};
      listeners.push(cb);
      return function desuscribir() {
        var idx = listeners.indexOf(cb);
        if (idx > -1) listeners.splice(idx, 1);
      };
    },

    // Inicializar detectores de interacción
    iniciar: function () {
      inicializarDetectores();
    }
  };

  global.AmbienteInteraccion = api;

})(window);

/* ==== ambiente-planos.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-planos.js
   Fase 3: Plane Manager (Asset Language / Sistema Visual, Cap. 4.1)

   Subsistema del Grupo de Contenido Visual. Responsabilidad única:
   crear y mantener los 4 planos fijos que define el Cap. 4.1 — nada
   más. No dibuja ningún asset propio; las 7 familias (cada una en su
   propio módulo) se insertan dentro del contenedor del plano que les
   corresponde.

   Reglas de este documento que este módulo respeta explícitamente:
   - Cap. 4.1 — "El sistema define 4 planos, no más." Este módulo es,
     a propósito, el único lugar donde existen los 4 contenedores;
     ninguna familia crea su propio plano.
   - Cap. 4.2 — "Los planos P0 y P1 nunca cambian de opacidad por
     interacción del usuario." Por eso la opacidad de P0/P1 se fija
     una sola vez desde tokens de color (css/ambiente-tokens.css) y
     nunca se toca desde JS.
   - Cap. 7.3 — el shift de temperatura por clima/horario "nunca se
     aplica al plano P0". Por eso el filtro de temperatura (ver CSS)
     solo se declara sobre los contenedores P1/P2/P3, jamás sobre P0.
   - Cap. 2.3 (Arquitectura) — como cualquier subsistema del Grupo de
     Contenido Visual, este módulo solo lee al Motion Controller, nunca
     directamente a Accesibilidad o Rendimiento.

   Debe cargarse después de ambiente-movimiento.js (se suscribe a sus
   parámetros para fidelidad/reducido) y antes de cualquier módulo de
   familia (ambiente-reticula.js, ambiente-topografia.js, etc.), que
   dependen de AmbientePlanos.contenedor() para existir.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function movimiento() { return global.AmbienteMovimiento || null; }

  var PLANOS = ['p0', 'p1', 'p2', 'p3'];
  var contenedores = {};
  var raiz = null;

  function crear() {
    if (raiz) return; // idempotente

    raiz = document.createElement('div');
    raiz.id = 'ambiente-planos';
    raiz.setAttribute('aria-hidden', 'true');

    PLANOS.forEach(function (id) {
      var el = document.createElement('div');
      el.id = 'ambiente-plano-' + id;
      el.className = 'ambiente-plano ambiente-plano--' + id;
      raiz.appendChild(el);
      contenedores[id] = el;
    });

    document.body.insertBefore(raiz, document.body.firstChild);
  }

  // Cap. 9.4 punto 2 / 8.1 checklist 4: cada familia hereda el plano
  // y la fidelidad de su grupo, nunca decide por asset individual.
  // Este módulo centraliza esa lectura para que ninguna familia
  // tenga que suscribirse por su cuenta al Motion Controller.
  function aplicarFidelidad(parametros) {
    if (!raiz) return;
    var nivel = parametros ? parametros.nivelFidelidad : 'completa';
    var reducido = !!(parametros && parametros.reducido);
    raiz.setAttribute('data-ambiente-fase3-fidelidad', nivel || 'completa');
    raiz.setAttribute('data-ambiente-fase3-reducido', String(reducido));
  }

  var api = {
    // Devuelve el contenedor DOM del plano solicitado ('p0'..'p3'),
    // o null si el Plane Manager todavía no se inicializó. Es la
    // única puerta de entrada que una familia debería usar — ninguna
    // familia debe hacer document.body.appendChild() directamente.
    contenedor: function (id) {
      return contenedores[id] || null;
    },

    iniciar: function () {
      if (typeof document === 'undefined') return;
      crear();

      var m = movimiento();
      if (m) {
        m.suscribir(function (evento) { aplicarFidelidad(evento.parametros); });
        aplicarFidelidad(m.parametros());
      } else {
        aplicarFidelidad(null);
      }
    }
  };

  global.AmbientePlanos = api;

})(window);

/* ==== ambiente-reticula.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-reticula.js
   Fase 3: familia "Retícula cartográfica" (Cap. 2.1, familia 1, del
   documento de Lenguaje de Assets v1.0)

   Subsistema del Grupo de Contenido Visual. Responsabilidad única:
   pedirle su SVG al Asset Registry ('lineas-cartograficas', Cap. 8.1)
   e insertarlo dentro del plano P0 que expone el Plane Manager — no
   dibuja geometría propia (eso vive en el archivo .svg, Cap. 3.3) ni
   decide su propio plano o movimiento (los hereda: plano P0 vía
   AmbientePlanos, firma de movimiento "Respiración" ya declarada en
   assets/ambient/_tokens/ambiente-tokens-movimiento.css sobre la
   clase .amb-asset--reticula que el propio SVG ya trae).

   Idempotente: iniciar() no vuelve a insertar si ya insertó. Si el
   Asset Registry no puede resolver el binario (red, archivo movido),
   simplemente no aparece — nunca rompe el resto del Ambient Engine
   (mismo principio de "degradación aceptable" que ya usa el resto
   del sistema, ver ambiente-capa-fondo.css sobre @property).

   Debe cargarse después de ambiente-planos.js y ambiente-assets.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ID_ASSET = 'lineas-cartograficas';
  var insertado = false;

  function insertarEnPlano(markupSvg) {
    if (insertado || !markupSvg) return;
    var planos = global.AmbientePlanos;
    var contenedor = planos ? planos.contenedor('p0') : null;
    if (!contenedor) return;

    var envoltorio = document.createElement('div');
    envoltorio.innerHTML = markupSvg;
    var svg = envoltorio.querySelector('svg');
    if (!svg) return;

    contenedor.appendChild(svg);
    insertado = true;
  }

  var api = {
    iniciar: function () {
      if (insertado) return;
      if (!global.AmbienteAssets || typeof global.AmbienteAssets.obtenerBinario !== 'function') return;
      global.AmbienteAssets.obtenerBinario(ID_ASSET).then(insertarEnPlano);
    }
  };

  global.AmbienteReticula = api;

})(window);

/* ==== ambiente-topografia.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-topografia.js
   Fase 3: familia "Curvas topográficas" (Cap. 2.1, familia 5, del
   documento de Lenguaje de Assets v1.0)

   Subsistema del Grupo de Contenido Visual. Responsabilidad única:
   pedirle su SVG al Asset Registry ('curvas-topograficas', Cap. 8.1)
   e insertarlo dentro del plano P0 — mismo patrón exacto que
   ambiente-reticula.js (ver ese archivo para el detalle de las
   reglas que ambos respetan). Se mantiene como módulo aparte, no
   fusionado con Retícula, porque son dos familias distintas del Cap.
   2 del documento (Cap. 3.4: "un asset = un archivo"; acá aplicado
   también a nivel de familia — cada una con su propio módulo de
   comportamiento, aunque ambas compartan plano y firma de
   movimiento).

   Debe cargarse después de ambiente-planos.js y ambiente-assets.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ID_ASSET = 'curvas-topograficas';
  var insertado = false;

  function insertarEnPlano(markupSvg) {
    if (insertado || !markupSvg) return;
    var planos = global.AmbientePlanos;
    var contenedor = planos ? planos.contenedor('p0') : null;
    if (!contenedor) return;

    var envoltorio = document.createElement('div');
    envoltorio.innerHTML = markupSvg;
    var svg = envoltorio.querySelector('svg');
    if (!svg) return;

    contenedor.appendChild(svg);
    insertado = true;
  }

  var api = {
    iniciar: function () {
      if (insertado) return;
      if (!global.AmbienteAssets || typeof global.AmbienteAssets.obtenerBinario !== 'function') return;
      global.AmbienteAssets.obtenerBinario(ID_ASSET).then(insertarEnPlano);
    }
  };

  global.AmbienteTopografia = api;

})(window);

/* ==== ambiente-corrientes.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-corrientes.js
   Fase 3: familia "Corrientes" (Cap. 2.1, familia 2, del documento de
   Lenguaje de Assets v1.0)

   Subsistema del Grupo de Contenido Visual. Responsabilidad única:
   pedirle su SVG al Asset Registry ('corrientes', Cap. 8.1) e
   insertarlo dentro del plano P1 — mismo patrón exacto que
   ambiente-reticula.js y ambiente-topografia.js (ver esos archivos
   para el detalle de las reglas que los tres respetan), con una
   sola diferencia deliberada: el contenedor es 'p1', no 'p0', porque
   Corrientes es la familia "Corriente" del Cap. 4.1, un plano más
   cerca que Retícula/Topográficas.

   Se mantiene como módulo aparte, no fusionado con los anteriores,
   por el mismo criterio que ya separa a esos dos entre sí (Cap. 3.4:
   "un asset = un archivo", aplicado también a nivel de familia — cada
   una con su propio módulo de comportamiento).

   Debe cargarse después de ambiente-planos.js y ambiente-assets.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ID_ASSET = 'corrientes';
  var insertado = false;

  function insertarEnPlano(markupSvg) {
    if (insertado || !markupSvg) return;
    var planos = global.AmbientePlanos;
    var contenedor = planos ? planos.contenedor('p1') : null;
    if (!contenedor) return;

    var envoltorio = document.createElement('div');
    envoltorio.innerHTML = markupSvg;
    var svg = envoltorio.querySelector('svg');
    if (!svg) return;

    contenedor.appendChild(svg);
    insertado = true;
  }

  var api = {
    iniciar: function () {
      if (insertado) return;
      if (!global.AmbienteAssets || typeof global.AmbienteAssets.obtenerBinario !== 'function') return;
      global.AmbienteAssets.obtenerBinario(ID_ASSET).then(insertarEnPlano);
    }
  };

  global.AmbienteCorrientes = api;

})(window);

/* ==== ambiente-coordenadas.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-coordenadas.js
   Fase 3: familia "Coordenadas" (Cap. 2.1, familia 4, del documento de
   Lenguaje de Assets v1.0)

   Subsistema del Grupo de Contenido Visual. Responsabilidad única:
   pedirle su SVG al Asset Registry ('coordenadas', Cap. 8.1) e
   insertarlo dentro del plano P1 — mismo patrón de carga que
   ambiente-reticula.js / ambiente-corrientes.js, con una diferencia
   estructural deliberada (Cap. 6.1, Cap. 13.1): Retícula/Topográficas/
   Corrientes se insertan una sola vez y quedan siempre visibles;
   Coordenadas no tiene existencia propia — es un marcador que solo
   tiene sentido cuando hay un punto seleccionado. Por eso este módulo
   NO se muestra solo al iniciar(): prepara el elemento oculto
   (opacity:0 vía CSS, ver assets/ambient/_tokens/
   ambiente-tokens-movimiento.css) y expone mostrarEn(x, y) / ocultar()
   para que quien sepa qué punto está seleccionado decida cuándo
   dispararlo.

   Cableado real pendiente (registrado a propósito en el changelog,
   no es una excepción del Cap. 8.2): mostrarEn()/ocultar() todavía no
   están conectados a ningún evento real de selección de mapa — ese
   evento vive fuera del Ambient Engine (motor-mapa.js / app.js) y no
   se inspeccionó todavía. Este módulo deja el instrumento listo; el
   disparo real es el siguiente sub-paso.

   x/y se reciben en unidades del viewBox 0-100 del propio plano P1
   (Cap. 3.1: mismo sistema de coordenadas que cualquier asset), no en
   píxeles de pantalla — la conversión desde una coordenada real de
   mapa a esa unidad es responsabilidad de quien llame a mostrarEn(),
   no de este módulo (Cap. 3.12: el Ambient Engine "no interpreta el
   significado de negocio de la interacción").

   Debe cargarse después de ambiente-planos.js y ambiente-assets.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ID_ASSET = 'coordenadas';
  var elemento = null; // referencia al <svg> ya insertado en el DOM
  var promesaInsercion = null;
  // BUG REAL corregido (race condition) — mismo hallazgo que
  // ambiente-halos.js, mismo patrón compartido, mismo fix: ver la
  // explicación completa ahí. Resumen: `mostrarEn()` es asíncrono (fetch
  // real vía AmbienteAssets.obtenerBinario la primera vez), `ocultar()`
  // es síncrono y no cancelaba un `mostrarEn()` en vuelo — un click
  // seguido de otra acción antes de que el asset cargue podía dejar la
  // marca de coordenadas visible sin ningún punto seleccionado.
  var tokenVisibilidad = 0;

  function insertarEnPlano(markupSvg) {
    if (elemento || !markupSvg) return null;
    var planos = global.AmbientePlanos;
    var contenedor = planos ? planos.contenedor('p1') : null;
    if (!contenedor) return null;

    var envoltorio = document.createElement('div');
    envoltorio.innerHTML = markupSvg;
    var svg = envoltorio.querySelector('svg');
    if (!svg) return null;

    contenedor.appendChild(svg);
    elemento = svg;
    return elemento;
  }

  // Idempotente y perezoso: la primera llamada a mostrarEn() (o el
  // propio iniciar()) dispara la descarga/inserción una única vez;
  // llamadas siguientes reutilizan la misma promesa ya resuelta.
  function asegurarInsertado() {
    if (promesaInsercion) return promesaInsercion;
    if (!global.AmbienteAssets || typeof global.AmbienteAssets.obtenerBinario !== 'function') {
      promesaInsercion = Promise.resolve(null);
      return promesaInsercion;
    }
    promesaInsercion = global.AmbienteAssets.obtenerBinario(ID_ASSET).then(insertarEnPlano);
    return promesaInsercion;
  }

  function posicionar(svg, x, y) {
    // Traslada el grupo de la marca (no el <svg> completo) al punto
    // pedido, en unidades del viewBox 100x100 (Cap. 3.1) — mismo
    // criterio de transform que usan las primitivas compartidas,
    // nunca se reescribe la geometría interna del símbolo.
    var grupo = svg.querySelector('.coordenadas-marca');
    if (!grupo) return;
    var dx = x - 50;
    var dy = y - 50;
    grupo.setAttribute('transform', 'translate(' + dx + ' ' + dy + ')');
  }

  var api = {
    // Fase 3 (Paso 4, mismo patrón): precarga/inserta el asset oculto
    // desde el arranque del Ambient Engine, para que la primera vez
    // que alguien llame a mostrarEn() no haya que esperar la descarga
    // del SVG — coherente con que iniciar() nunca hace visible nada
    // por su cuenta (Cap. 6.1: "aparece cuando hay algo que señalar").
    iniciar: function () {
      asegurarInsertado();
    },

    // Punto de entrada real (todavía sin cablear a un evento de
    // producto, ver nota de cabecera). x, y en unidades 0-100 del
    // viewBox del plano P1.
    mostrarEn: function (x, y) {
      var miToken = ++tokenVisibilidad;
      asegurarInsertado().then(function (svg) {
        if (!svg) return;
        if (miToken !== tokenVisibilidad) return; // ver nota de arriba / ambiente-halos.js
        posicionar(svg, x, y);
        svg.classList.add('is-visible');
      });
    },

    ocultar: function () {
      tokenVisibilidad++;
      if (!elemento) return;
      elemento.classList.remove('is-visible');
    }
  };

  global.AmbienteCoordenadas = api;

})(window);

/* ==== ambiente-brujula.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-brujula.js
   Fase 3: familia "Brújula" (Cap. 2.1, familia 3, del documento de
   Lenguaje de Assets v1.0)

   Subsistema del Grupo de Contenido Visual. Responsabilidad única:
   pedirle su SVG al Asset Registry ('brujula', Cap. 8.1) e insertarlo
   dentro del plano P2 — mismo patrón de carga e inserción que
   ambiente-reticula.js / ambiente-topografia.js / ambiente-corrientes.js
   (insertado una sola vez, siempre visible desde el arranque), con
   una sola diferencia de plano: 'p2' en vez de 'p0'/'p1', porque la
   Brújula es la familia "Orientación" del Cap. 4.1.

   Reactividad a mapa/ubicación activa (Cap. 6.1: "la aguja apunta
   hacia el spot seleccionado") queda fuera de este paso a propósito
   — la oscilación libre definida en ambiente-tokens-movimiento.css
   es, por ahora, el único comportamiento de la aguja. Cablear un
   ángulo real requiere una proyección geográfica (rumbo real hacia
   el punto elegido) que hoy no existe en ningún subsistema de la
   app (ver la misma limitación ya documentada para Coordenadas en
   changelog.md) — se deja como paso posterior explícito, no como
   una excepción silenciosa (Cap. 8.2).

   Debe cargarse después de ambiente-planos.js y ambiente-assets.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ID_ASSET = 'brujula';
  var insertado = false;

  function insertarEnPlano(markupSvg) {
    if (insertado || !markupSvg) return;
    var planos = global.AmbientePlanos;
    var contenedor = planos ? planos.contenedor('p2') : null;
    if (!contenedor) return;

    var envoltorio = document.createElement('div');
    envoltorio.innerHTML = markupSvg;
    var svg = envoltorio.querySelector('svg');
    if (!svg) return;

    contenedor.appendChild(svg);
    insertado = true;
  }

  var api = {
    iniciar: function () {
      if (insertado) return;
      if (!global.AmbienteAssets || typeof global.AmbienteAssets.obtenerBinario !== 'function') return;
      global.AmbienteAssets.obtenerBinario(ID_ASSET).then(insertarEnPlano);
    }
  };

  global.AmbienteBrujula = api;

})(window);

/* ==== ambiente-particulas-deriva.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-particulas-deriva.js
   Fase 3: familia "Partículas de deriva" (Cap. 2.1, familia 6, del
   documento de Lenguaje de Assets v1.0). Roadmap Cap. 12, orden 7.

   Nombre deliberadamente distinto de js/ambiente-particulas.js: ese
   archivo es el Particle Engine de la Fase 2 (Arquitectura técnica,
   Cap. 3.6) — un subsistema previo, basado en <div>, que no sigue
   ninguna regla de este documento (no usa las 5 primitivas
   compartidas, no vive en un plano P0-P3, no respeta el sistema de
   viewBox 100x100). Son dos cosas distintas que hoy conviven en el
   repo; este módulo es la familia real del Cap. 2.1, no un reemplazo
   del Particle Engine de Fase 2 — fusionarlos sería una decisión de
   arquitectura fuera del alcance de este paso.

   Mismo patrón de carga e inserción que ambiente-brujula.js
   (insertado una sola vez, siempre visible desde el arranque, plano
   P2 — Cap. 4.1: "Orientación", brújula + partículas de deriva).

   Responsabilidad adicional, propia de esta familia (Cap. 6.1: "Sí
   (parallax)", la única reactividad a scroll que exige la matriz de
   reactividad en este paso): además de insertar el asset, escucha
   scroll y traduce la posición a la variable CSS
   --amb-particulas-scroll sobre el grupo .particulas-parallax del
   propio SVG (ver assets/ambient/_tokens/ambiente-tokens-movimiento.
   css — este módulo nunca escribe transform directamente, solo la
   variable que esa regla consume, Cap. 9.1: nunca layout, siempre
   transform/opacity).

   Bajo prefers-reduced-motion (Cap. 9.5, Accessibility Manager) el
   listener de scroll ni se agrega — no tiene sentido computar un
   valor que la propia regla CSS va a ignorar (ver el bloque
   @media (prefers-reduced-motion: reduce) en tokens de movimiento).

   Debe cargarse después de ambiente-planos.js, ambiente-assets.js y
   ambiente-accesibilidad.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ID_ASSET = 'particulas-deriva';
  var insertado = false;
  var grupoParallax = null;
  var ultimoScrollY = null;
  var frameSolicitado = false;

  // Factor de atenuación del parallax — deliberadamente pequeño
  // (Cap. 6.1 lo describe como parallax de una familia de fondo, no
  // como un efecto de scroll protagonista): 0.02 hace que 500px de
  // scroll real se traduzcan en 10px de desplazamiento del grupo.
  var FACTOR_PARALLAX = 0.02;
  // Techo del desplazamiento acumulado, para que una página muy larga
  // no termine sacando las motas del viewport visible del plano P2.
  var TOPE_DESPLAZAMIENTO = 60;

  function accesibilidad() { return global.AmbienteAccesibilidad || null; }

  function insertarEnPlano(markupSvg) {
    if (insertado || !markupSvg) return;
    var planos = global.AmbientePlanos;
    var contenedor = planos ? planos.contenedor('p2') : null;
    if (!contenedor) return;

    var envoltorio = document.createElement('div');
    envoltorio.innerHTML = markupSvg;
    var svg = envoltorio.querySelector('svg');
    if (!svg) return;

    contenedor.appendChild(svg);
    grupoParallax = svg.querySelector('.particulas-parallax');
    insertado = true;

    activarParallaxSiCorresponde();
  }

  function aplicarScroll() {
    frameSolicitado = false;
    if (!grupoParallax) return;
    var y = Math.max(-TOPE_DESPLAZAMIENTO, Math.min(TOPE_DESPLAZAMIENTO, global.scrollY * FACTOR_PARALLAX));
    grupoParallax.style.setProperty('--amb-particulas-scroll', y);
  }

  function alScroll() {
    if (ultimoScrollY === global.scrollY) return;
    ultimoScrollY = global.scrollY;
    if (frameSolicitado) return;
    frameSolicitado = true;
    global.requestAnimationFrame(aplicarScroll);
  }

  var listenerActivo = false;

  function activarParallaxSiCorresponde() {
    var a = accesibilidad();
    var reducido = !!(a && a.reducirMovimiento);
    if (reducido) {
      desactivarParallax();
      return;
    }
    if (listenerActivo || !grupoParallax) return;
    global.addEventListener('scroll', alScroll, { passive: true });
    listenerActivo = true;
    aplicarScroll();
  }

  function desactivarParallax() {
    if (!listenerActivo) return;
    global.removeEventListener('scroll', alScroll);
    listenerActivo = false;
    if (grupoParallax) grupoParallax.style.removeProperty('--amb-particulas-scroll');
  }

  var api = {
    iniciar: function () {
      if (insertado) return;
      if (!global.AmbienteAssets || typeof global.AmbienteAssets.obtenerBinario !== 'function') return;
      global.AmbienteAssets.obtenerBinario(ID_ASSET).then(insertarEnPlano);

      var a = accesibilidad();
      if (a && typeof a.suscribir === 'function') {
        a.suscribir(function () { activarParallaxSiCorresponde(); });
      }
    }
  };

  global.AmbienteParticulasDeriva = api;

})(window);

/* ==== ambiente-halos.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-halos.js
   Fase 3: familia "Halos de posición" (Cap. 2.1, familia 7, del
   documento de Lenguaje de Assets v1.0). Roadmap Cap. 12, orden 8.

   Mismo patrón estructural que js/ambiente-coordenadas.js: el asset
   se inserta oculto desde el arranque (carga anticipada del propio
   markup, nunca de su visibilidad — Cap. 5: "sin loop propio", no
   tiene sentido animarlo hasta que haya algo que enfocar) dentro del
   plano P3, y expone mostrarEn(x, y) / ocultar() para que quien sepa
   qué punto está activo decida cuándo dispararlo. x/y en unidades del
   viewBox 0-100 (Cap. 3.1), misma convención que ya usa Coordenadas.

   Límite del Cap. 4.2 ("el halo nunca convive con más de un asset P2
   activo... dos focos compitiendo anulan el propósito") se cumple
   por construcción: solo existe una instancia insertada (igual que
   Brújula/Corrientes), nunca varias en simultáneo — mostrarEn()
   reposiciona la única instancia existente en vez de crear una
   nueva.

   Cableado real (mismo límite ya documentado para Coordenadas y
   Brújula en changelog.md): motor-mapa.js no expone la proyección de
   lat/lng a coordenadas de pantalla como parte de su API pública, así
   que este módulo también se ancla al centro óptico (50,50) en vez
   de a la posición geográfica real del punto — ver el cableado en
   js/app.js. No es una excepción del Cap. 8.2, es la misma limitación
   de plataforma ya registrada dos veces, no una nueva.

   Debe cargarse después de ambiente-planos.js y ambiente-assets.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ID_ASSET = 'halo';
  var elemento = null;
  var promesaInsercion = null;
  // BUG REAL corregido (race condition): `mostrarEn()` es asíncrono (la
  // primera vez, `asegurarInsertado()` dispara un `fetch()` real del SVG
  // vía AmbienteAssets.obtenerBinario — no una promesa ya resuelta), pero
  // `ocultar()` es síncrono y no tenía forma de cancelar un `mostrarEn()`
  // en vuelo. Secuencia real: hover → mostrarEn() dispara el fetch →
  // el usuario ya se movió (hoverOut) antes de que resuelva → ocultar()
  // no hace nada porque `elemento` todavía es null → el fetch resuelve
  // más tarde y el halo aparece igual, sin ningún hover activo — un
  // halo "fantasma" que solo desaparece en el próximo ciclo real de
  // hover/hoverOut. Más probable cuanto más lenta la red (móvil/PWA).
  // Se agrega un token de generación: cada `mostrarEn()`/`ocultar()` lo
  // incrementa, y una resolución async que ya no coincide con el token
  // vigente se descarta — mismo criterio que un AbortController, sin
  // necesitar cancelar el fetch en sí (el binario igual queda cacheado
  // para el próximo uso legítimo).
  var tokenVisibilidad = 0;

  function insertarEnPlano(markupSvg) {
    if (elemento || !markupSvg) return null;
    var planos = global.AmbientePlanos;
    var contenedor = planos ? planos.contenedor('p3') : null;
    if (!contenedor) return null;

    var envoltorio = document.createElement('div');
    envoltorio.innerHTML = markupSvg;
    var svg = envoltorio.querySelector('svg');
    if (!svg) return null;

    contenedor.appendChild(svg);
    elemento = svg;
    return elemento;
  }

  function asegurarInsertado() {
    if (promesaInsercion) return promesaInsercion;
    if (!global.AmbienteAssets || typeof global.AmbienteAssets.obtenerBinario !== 'function') {
      promesaInsercion = Promise.resolve(null);
      return promesaInsercion;
    }
    promesaInsercion = global.AmbienteAssets.obtenerBinario(ID_ASSET).then(insertarEnPlano);
    return promesaInsercion;
  }

  function posicionar(svg, x, y) {
    var grupo = svg.querySelector('.halo-foco');
    if (!grupo) return;
    var dx = x - 50;
    var dy = y - 50;
    grupo.setAttribute('transform', 'translate(' + dx + ' ' + dy + ')');
  }

  var api = {
    // Precarga/inserta el asset oculto desde el arranque, mismo
    // criterio que Coordenadas — la primera llamada real a
    // mostrarEn() no debería esperar la descarga del SVG.
    iniciar: function () {
      asegurarInsertado();
    },

    // x, y en unidades 0-100 del viewBox del plano P3.
    mostrarEn: function (x, y) {
      var miToken = ++tokenVisibilidad;
      asegurarInsertado().then(function (svg) {
        if (!svg) return;
        // Si `ocultar()` (u otro `mostrarEn()` más nuevo) se llamó
        // mientras esto cargaba, este resultado ya quedó obsoleto —
        // aplicarlo ahora reabriría un halo que el usuario ya pidió
        // cerrar (o pisaría una posición más reciente con una vieja).
        if (miToken !== tokenVisibilidad) return;
        posicionar(svg, x, y);
        svg.classList.add('is-visible');
      });
    },

    ocultar: function () {
      tokenVisibilidad++; // invalida cualquier mostrarEn() todavía en vuelo
      if (!elemento) return;
      elemento.classList.remove('is-visible');
    }
  };

  global.AmbienteHalos = api;

})(window);

/* ==== ambiente-horario-tinte.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-horario-tinte.js
   Fase 3: variantes de clima/horario, Cap. 7.3 del documento de
   Lenguaje de Assets v1.0. Roadmap Cap. 12, orden 9.

   Responsabilidad única: escribir --amb-tinte-monto-p2/p3 y
   --amb-tinte-color-p2/p3 (assets/ambient/_tokens/
   ambiente-tokens-visual.css) según la hora real del día — nunca
   toca --amb-p0-* ni --amb-p1-* (Cap. 7.3, regla dura: el sustrato
   nunca cambia de temperatura).

   Deliberadamente un módulo aparte, no una extensión de
   js/ambiente-capa-fondo.js: ese módulo tiene una responsabilidad ya
   cerrada (el color del cielo, Cap. 4.1 Fase 1) y no debería crecer
   para conocer también planos P2/P3 del Cap. 4.1 de este documento
   — son dos capas distintas que comparten el mismo dato de entrada
   (la hora real), no el mismo subsistema (Cap. 2.3: responsabilidad
   única por módulo). Sí reutiliza el mismo patrón de cálculo y de
   muestreo (60s, ver justificación en ambiente-capa-fondo.js) para
   no introducir un segundo criterio de "cada cuánto se recalcula la
   hora" en el sistema.

   Franjas (Cap. 7.3, tabla):
   - Amanecer (5h-8h): ámbar bajo, monto de mezcla leve.
   - Atardecer (18h-21h): ámbar medio, monto de mezcla más marcado
     que el amanecer (textual: "shift cálido más marcado").
   - Resto del día / noche: monto 0% — sin tinte. La noche ya está
     cubierta por la base dark del sistema (ver nota en tokens
     visuales); este módulo no le suma nada extra a propósito.

   La transición entre franjas se interpola linealmente sobre el
   monto (nunca un salto discreto entre 0% y el pico) para que no se
   note un "click" de color en el borde exacto de cada franja —
   mismo espíritu de continuidad que exige Cap. 3.3 Fase 1 para el
   ciclo del cielo, aplicado acá al monto de mezcla en vez de al
   color en sí.

   No implementa Lluvia (ver nota extensa en el propio archivo de
   tokens visuales): no existe hoy una señal real de clima en la app.

   Debe cargarse después de ambiente-config.js (no depende de él
   directamente, pero por convención carga junto al resto de módulos
   de Contenido Visual) y antes de ambiente-orquestador.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var AMBAR_BAJO = '#E8B77A';   // amanecer — "ámbar bajo" (Cap. 7.3)
  var AMBAR_MEDIO = '#E08A4E';  // atardecer — "ámbar medio" (Cap. 7.3)

  var FRANJAS = [
    { h: 5,  monto: 0,   color: AMBAR_BAJO },
    { h: 6.5, monto: 22, color: AMBAR_BAJO },
    { h: 8,  monto: 0,   color: AMBAR_BAJO },
    { h: 18, monto: 0,   color: AMBAR_MEDIO },
    { h: 19.5, monto: 38, color: AMBAR_MEDIO },
    { h: 21, monto: 0,   color: AMBAR_MEDIO }
  ];

  function horaDecimalActual() {
    var ahora = new Date();
    return ahora.getHours() + ahora.getMinutes() / 60 + ahora.getSeconds() / 3600;
  }

  // Interpolación lineal simple del monto entre los puntos de
  // FRANJAS que rodean la hora actual — fuera de cualquier tramo
  // definido, el monto es 0 (sin tinte, Cap. 7.3: "sin cambio").
  function tinteEnHora(horaDecimal) {
    var h = ((horaDecimal % 24) + 24) % 24;
    for (var i = 0; i < FRANJAS.length - 1; i++) {
      var a = FRANJAS[i], b = FRANJAS[i + 1];
      if (a.color === b.color && h >= a.h && h <= b.h) {
        var t = (h - a.h) / (b.h - a.h);
        return { monto: a.monto + (b.monto - a.monto) * t, color: a.color };
      }
    }
    return { monto: 0, color: AMBAR_BAJO };
  }

  var raiz = null;

  function aplicar() {
    if (!raiz) raiz = document.documentElement;
    var tinte = tinteEnHora(horaDecimalActual());
    // Cap. 7.3: "el shift... solo se aplica a P2/P3" — nunca se
    // escribe acá ninguna variable --amb-p0-*/--amb-p1-*.
    raiz.style.setProperty('--amb-tinte-monto-p2', tinte.monto + '%');
    raiz.style.setProperty('--amb-tinte-color-p2', tinte.color);
    raiz.style.setProperty('--amb-tinte-monto-p3', tinte.monto + '%');
    raiz.style.setProperty('--amb-tinte-color-p3', tinte.color);
  }

  var PERIODO_MUESTREO_MS = 60000;
  var intervalo = null;

  var api = {
    iniciar: function () {
      if (typeof document === 'undefined') return;
      if (intervalo) return; // ya inicializado
      aplicar();
      intervalo = global.setInterval(function () {
        var m = global.AmbienteMovimiento;
        if (m && !m.pestanaVisible) return; // Cap. 9.2: nada se recalcula en 2º plano
        aplicar();
      }, PERIODO_MUESTREO_MS);
    }
  };

  global.AmbienteHorarioTinte = api;

})(window);

/* ==== ambiente-capa-fondo.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-capa-fondo.js
   Fase 1: Capa de Fondo (Documento de diseño, Cap. 4.1)

   Responsabilidad única: definir el color y la luz general de la
   escena según la hora real del día. Es, conceptualmente, "el cielo"
   de todo el sistema (Cap. 4.1) — no contiene formas ni detalle, y
   no conoce escenas, estados ni ninguna otra capa (Cap. 4.9 / 11.3).

   Reglas de este documento que este módulo respeta explícitamente:
   - Banda ambiental, 20-90s por ciclo, imperceptible en el instante
     (Cap. 3.1) — acá el "ciclo" es el día completo, y el muestreo
     (cada 60s) es deliberadamente más lento que cualquier banda de
     movimiento para no producir un cambio que el ojo pueda seguir.
   - Curva de aceleración no lineal, nunca lineal (Cap. 3.2) — la
     interpolación de color usa un easing coseno, no una mezcla
     lineal de RGB.
   - Continuidad (Cap. 3.3) — al abrir la app, el fondo se posiciona
     de inmediato en el punto correcto del ciclo horario real, nunca
     arranca desde un valor por defecto y "salta" al correcto.
   - Cap. 9.2 — no se anima nada mientras la pestaña no es visible.
   - Cap. 9.5 — bajo prefers-reduced-motion, el cambio de color del
     ciclo horario se mantiene (es color, no movimiento) pero se
     aplica de forma instantánea en lugar de gradual.

   Fase 2 (Cap. 2.3 Arquitectura): "el Grupo de Contenido Visual...
   nunca [se comunica] lateralmente" con el Grupo de Gobierno — por eso
   este módulo ya no lee la visibilidad de pestaña de una señal cruda
   propia ni de un subsistema de Gobierno directamente, sino del Motion
   Controller (ambiente-movimiento.js), su única dependencia hacia
   arriba (Cap. 3.5: "Entradas:... provenientes del Motion
   Controller").
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // Paletas clave del ciclo diario (hora, color superior, color
  // inferior del degradé). Los tonos parten de --color-fondo /
  // --color-fondo-2 ya existentes en css/tokens.css y se abren hacia
  // cálidos en el atardecer, coherente con --color-granate-clara —
  // nunca se sale de la identidad de marca ya establecida (Cap. 2.1:
  // "físico, no digital-abstracto"; Cap. 5.9: atardecer como el
  // momento de mayor calidez cromática del ciclo).
  var KEYFRAMES = [
    { h: 0,  c1: '#05070B', c2: '#0A0D13' }, // noche profunda
    { h: 6,  c1: '#141A24', c2: '#2A2018' }, // amanecer
    { h: 13, c1: '#10141C', c2: '#1B2230' }, // día
    { h: 19, c1: '#2A1620', c2: '#4A2530' }, // atardecer (Cap. 5.9)
    { h: 22, c1: '#06080D', c2: '#0A0D13' }, // entrando en noche
    { h: 24, c1: '#05070B', c2: '#0A0D13' }  // cierre del loop (== hora 0)
  ];

  // Cap. 3.1: prohibida la mezcla lineal en cualquier movimiento
  // visible — un ease-in-out senoidal es el recurso explícito para
  // "fenómenos naturales como la deriva de una nube o el vaivén del
  // agua", y el paso del día se rige por el mismo principio.
  function easeCoseno(t) { return (1 - Math.cos(t * Math.PI)) / 2; }

  function hexARgb(hex) {
    var v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function componenteAHex(n) {
    var v = Math.max(0, Math.min(255, Math.round(n)));
    var s = v.toString(16);
    return s.length < 2 ? '0' + s : s;
  }
  function rgbAHex(rgb) {
    return '#' + componenteAHex(rgb[0]) + componenteAHex(rgb[1]) + componenteAHex(rgb[2]);
  }
  function mezclarColor(hexA, hexB, t) {
    var a = hexARgb(hexA), b = hexARgb(hexB), tt = easeCoseno(t);
    return rgbAHex([
      a[0] + (b[0] - a[0]) * tt,
      a[1] + (b[1] - a[1]) * tt,
      a[2] + (b[2] - a[2]) * tt
    ]);
  }

  function colorEnHora(horaDecimal) {
    var h = ((horaDecimal % 24) + 24) % 24;
    for (var i = 0; i < KEYFRAMES.length - 1; i++) {
      var a = KEYFRAMES[i], b = KEYFRAMES[i + 1];
      if (h >= a.h && h <= b.h) {
        var t = (h - a.h) / (b.h - a.h);
        return { c1: mezclarColor(a.c1, b.c1, t), c2: mezclarColor(a.c2, b.c2, t) };
      }
    }
    return { c1: KEYFRAMES[0].c1, c2: KEYFRAMES[0].c2 };
  }

  function horaDecimalActual() {
    var ahora = new Date();
    return ahora.getHours() + ahora.getMinutes() / 60 + ahora.getSeconds() / 3600;
  }

  var elFondo = null;

  function crearElemento() {
    var el = document.createElement('div');
    el.id = 'ambiente-fondo';
    // Puramente decorativo: nunca debe estar en el árbol de
    // accesibilidad ni recibir foco o interacción (Cap. 4.1).
    el.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(el, document.body.firstChild);
    return el;
  }

  function aplicar(horaDecimal, instantaneo) {
    var color = colorEnHora(horaDecimal);
    if (instantaneo) elFondo.classList.add('ambiente-fondo--sin-transicion');
    elFondo.style.setProperty('--ambiente-color-1', color.c1);
    elFondo.style.setProperty('--ambiente-color-2', color.c2);
    if (instantaneo) {
      void elFondo.offsetHeight; // forzar reflow antes de reactivar la transición
      elFondo.classList.remove('ambiente-fondo--sin-transicion');
    }
  }

  // Cap. 3.1: el ciclo se muestrea cada minuto — muy por debajo del
  // umbral de percepción consciente de cualquier cambio individual,
  // y muy por encima del techo de la banda ambiental (90s), que está
  // pensada para elementos que sí tienen movimiento propio visible.
  var PERIODO_MUESTREO_MS = 60000;
  var intervalo = null;

  function tick() {
    var m = global.AmbienteMovimiento;
    if (m && !m.pestanaVisible) return; // Cap. 9.2: nada se anima en 2º plano
    aplicar(horaDecimalActual(), false);
  }

  function iniciar() {
    if (elFondo) return; // ya inicializada
    elFondo = crearElemento();

    // Continuidad (Cap. 3.3): el primer aplicado es instantáneo para
    // que la app abra ya en el punto correcto del ciclo horario real,
    // sin arrancar de un valor por defecto y saltar visiblemente.
    aplicar(horaDecimalActual(), true);

    intervalo = global.setInterval(tick, PERIODO_MUESTREO_MS);

    if (global.AmbienteMovimiento) {
      global.AmbienteMovimiento.suscribir(function (evento) {
        if (evento.motivo === 'visibilidad' && global.AmbienteMovimiento.pestanaVisible) {
          // Al volver a primer plano, re-sincronizar sin animar el
          // salto de tiempo transcurrido mientras estuvo oculta
          // (evita una transición larga y visible de "recuperación").
          aplicar(horaDecimalActual(), true);
        }
      });
    }
  }

  global.AmbienteCapaFondo = { iniciar: iniciar };

})(window);

/* ==== ambiente-flags.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-flags.js
   Fase 5 (Integration Blueprint, Cap. 14 criterio 3): "cada fase
   (F0-F3) es individualmente desactivable sin afectar a las
   anteriores".

   Este módulo NO decide nada por sí mismo (mismo principio que
   gobierna todo el Ambient Engine, Resumen ejecutivo del Blueprint):
   solo expone una lectura de si un grupo de subsistemas debe
   arrancar o no. La decisión de apagarlo vive fuera de este archivo
   — en localStorage o en el querystring — nunca hardcodeada acá.

   Uso pensado para debug/rollback rápido en producción sin redeploy:
     localStorage.setItem('ambienteFlags', JSON.stringify({clima:false}))
   o vía URL: ?ambiente_off=clima,horarioTinte

   Por defecto TODO está activo — agregar este archivo no cambia
   ningún comportamiento visible hasta que alguien apague un flag
   explícitamente (Cap. 1.2 Blueprint: "reversibilidad real").

   Debe cargarse junto al resto del Grupo de Infraestructura, ANTES
   de ambiente-orquestador.js (que es quien lo consulta).
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // Grupos definidos según el Cap. 14 criterio 3 del Blueprint de
  // Integración, mapeados a la arquitectura real ya existente en este
  // repo (no a nombres hipotéticos): los subsistemas de mayor "blast
  // radius" (Cap. 15.3) son los primeros candidatos a poder apagarse
  // de forma aislada sin tocar el resto del motor.
  var NOMBRES_VALIDOS = ['motor', 'sustratoVisual', 'clima', 'horarioTinte'];

  var cache = null;

  function leerOverrideURL() {
    var params;
    try {
      params = new URLSearchParams(global.location.search);
    } catch (e) {
      return {};
    }
    var apagar = params.get('ambiente_off');
    if (!apagar) return {};
    var resultado = {};
    apagar.split(',').forEach(function (nombre) {
      nombre = nombre.trim();
      if (NOMBRES_VALIDOS.indexOf(nombre) !== -1) resultado[nombre] = false;
    });
    return resultado;
  }

  function leerOverrideStorage() {
    try {
      var crudo = global.localStorage.getItem('ambienteFlags');
      if (!crudo) return {};
      var parsed = JSON.parse(crudo);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      // localStorage puede fallar (modo privado, cuota, JSON corrupto).
      // Igual que el resto del motor (Cap. 1.4 diseño): mejor
      // continuar con todo activo que romper el arranque por esto.
      return {};
    }
  }

  function calcular() {
    var deURL = leerOverrideURL();
    var deStorage = leerOverrideStorage();
    var estado = {};
    NOMBRES_VALIDOS.forEach(function (nombre) {
      // Precedencia: URL (debug puntual) gana sobre localStorage
      // (preferencia persistida), que gana sobre el default (true).
      if (Object.prototype.hasOwnProperty.call(deURL, nombre)) {
        estado[nombre] = deURL[nombre];
      } else if (Object.prototype.hasOwnProperty.call(deStorage, nombre)) {
        estado[nombre] = !!deStorage[nombre];
      } else {
        estado[nombre] = true;
      }
    });
    return estado;
  }

  global.AmbienteFlags = {
    // Cap. 14 criterio 3: verificable apagando cada flag de forma
    // aislada. Un nombre desconocido nunca apaga nada (fail-open,
    // mismo criterio que el resto del motor ante datos inesperados).
    activo: function (nombre) {
      if (!cache) cache = calcular();
      return NOMBRES_VALIDOS.indexOf(nombre) === -1 ? true : cache[nombre];
    },
    // Expuesto solo para diagnóstico (ambiente-diagnostico.js) y para
    // que un ingeniero pueda inspeccionar el estado real desde la
    // consola sin adivinar precedencias.
    estadoActual: function () {
      if (!cache) cache = calcular();
      return Object.assign({}, cache);
    }
  };

})(window);

/* ==== ambiente-orquestador.js ==== */
/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-orquestador.js
   Fase 0/2: Orquestador central — Ambient Engine, raíz orquestadora
   (Documento de diseño, Cap. 11.1 / 11.2; Arquitectura técnica, Cap. 3.1)

   Es la única pieza del sistema que efectivamente conecta señales,
   estados, gobierno y capas entre sí (Cap. 11.3 diseño / Cap. 2.3
   arquitectura: "el Grupo de Orquestación es el único que puede
   comunicarse con los tres grupos restantes"). Expone hacia el resto
   de la aplicación la superficie mínima y estable descrita en el
   Cap. 11.1: "una forma de indicar la escena activa, una forma de
   indicar el estado activo, y poco más" — window.AmbientEngine.

   Ninguna pantalla funcional de la aplicación debería necesitar
   conocer los detalles internos de una capa (Cap. 11.4). Este
   archivo es, a propósito, el único lugar donde infraestructura +
   gobierno + estados + Motion Controller + capas se importan juntos;
   ningún otro módulo del Ambient Engine conoce a sus pares de otro
   grupo funcional.

   Fase 2: este archivo ya no lee ambiente-senales.js (retirado — ver
   nota en ambiente-accesibilidad.js). Las señales que antes venían de
   ahí ahora se leen de sus fuentes canónicas: AmbienteAccesibilidad
   (reducirMovimiento) y AmbienteRendimiento (nivel de fidelidad).
   También precalienta el Asset Registry (Cap. 8.1), inicia el Motion
   Controller (Cap. 3.4) y activa la escena inicial a través del Scene
   Manager (Cap. 3.3, T4) — este archivo ya no le pasa nombres de
   escena directamente al Motion Controller, ni señales de gobierno
   directamente a ninguna capa.

   T5 (Cap. 3.12 Arquitectura): el temporizador de inactividad y el
   listener de gestos genéricos que antes vivían acá se movieron a
   ambiente-interaccion.js (Interaction Observer) — este archivo ya
   no conoce ningún nombre de evento DOM de gesto, solo arranca ese
   subsistema.

   Debe cargarse ÚLTIMO entre los scripts del Ambient Engine: con
   scripts `defer`, el orden de ejecución es el orden del documento,
   así que para cuando este módulo corre, todo el Grupo de
   Infraestructura, todo el Grupo de Gobierno, AmbienteEstados,
   AmbienteMovimiento, AmbienteEscenas y AmbienteCapaFondo ya existen.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // Cap. 3.1: el único contrato entre el Ambient Engine y el resto de
  // la aplicación (Cap. 11.1 / 11.4): atributos data-* en <html>,
  // nunca una API que exponga las capas mismas.
  function reflejarEstadoEnDOM(estado) {
    document.documentElement.setAttribute('data-ambiente-estado', estado);
  }

  // Fase 2: ya no refleja una sola "señal" cruda — refleja el
  // resultado ya resuelto de Accessibility Manager y Performance
  // Manager, cada uno desde su propia fuente canónica (Cap. 2.3: el
  // Grupo de Gobierno puede ser consultado por el Grupo de
  // Orquestación sin restricción, a diferencia del Grupo de Contenido
  // Visual).
  function reflejarGobiernoEnDOM() {
    var a = global.AmbienteAccesibilidad;
    var r = global.AmbienteRendimiento;
    if (a) document.documentElement.setAttribute('data-ambiente-reducido', String(a.reducirMovimiento));
    if (r) document.documentElement.setAttribute('data-ambiente-rendimiento', r.nivelFidelidad);
  }

  // Fase 6 (auditoría §1/§3): guarda de nivel superior. La mayoría de
  // los subsistemas de abajo ya eran idempotentes por su cuenta, pero
  // este archivo es el único punto que efectivamente cascadea a todos
  // ellos — sin esta guarda, una segunda invocación de iniciar()
  // (llamada manual repetida, por ejemplo) igual duplicaría las
  // suscripciones de reflejarGobiernoEnDOM (líneas más abajo) y el
  // listener AmbienteEstados.on('cambio', ...), ninguno de los cuales
  // tiene guarda propia porque no la necesitaban mientras este único
  // punto de entrada se llamara una sola vez.
  var yaIniciado = false;

  function iniciar() {
    if (yaIniciado) return;

    // Fase 0 incompleta sin máquina de estados: se aborta
    // silenciosamente en vez de fallar a medias. Mejor no tener
    // Ambient Engine que tenerlo roto compitiendo con el contenido
    // real (Cap. 1.4).
    if (!global.AmbienteEstados) return;

    // Fase 5 (Integration Blueprint, Cap. 14 criterio 3): flag
    // maestro. Ausencia de AmbienteFlags (por ejemplo, si el archivo
    // no llegó a cargar) nunca apaga el motor — mismo criterio
    // fail-open que el resto de este orquestador.
    if (global.AmbienteFlags && !global.AmbienteFlags.activo('motor')) return;

    // Recién acá se sabe que la inicialización va a proceder de
    // verdad — la guarda se activa después de los dos early-returns
    // de arriba para que un bloqueo por flag/estado no impida
    // permanentemente un intento posterior legítimo.
    yaIniciado = true;

    // ── Grupo de Infraestructura (Cap. 8.1) ─────────────────────────
    // Precalienta los assets de carga anticipada de la escena inicial
    // antes de que cualquier capa los pida — así ninguna capa visual
    // tiene que preocuparse por si el Asset Registry ya está "tibio".
    if (global.AmbienteAssets) global.AmbienteAssets.precalentar();

    // ── Grupo de Gobierno (Cap. 3.10 / 3.11) ────────────────────────
    // Performance Manager ya se autoinicia al cargarse (ver su propio
    // archivo); Accessibility Manager no requiere inicio explícito.
    // Este orquestador solo se suscribe a ambos para reflejar su
    // estado en el DOM, el único contrato hacia el resto de la app.
    reflejarGobiernoEnDOM();
    if (global.AmbienteAccesibilidad) global.AmbienteAccesibilidad.suscribir(reflejarGobiernoEnDOM);
    if (global.AmbienteRendimiento) global.AmbienteRendimiento.suscribir(reflejarGobiernoEnDOM);

    // ── Motion Controller (Cap. 3.4) ────────────────────────────────
    // Se inicia antes que cualquier capa de Contenido Visual, para
    // que cuando AmbienteCapaFondo.iniciar() corra ya tenga a quién
    // suscribirse.
    if (global.AmbienteMovimiento) global.AmbienteMovimiento.iniciar();

    // ── Scene Manager (Cap. 3.3, T4) ────────────────────────────────
    // Activa la escena inicial (Cap. 6.1 diseño: "abrir la app ya
    // cuenta como el primer momento de atención del usuario"). Recién
    // después de esto AmbienteMovimiento.parametros() deja de ser
    // null, así que debe correr antes de iniciar cualquier capa visual.
    if (global.AmbienteEscenas && global.AmbienteConfig) {
      var idInicial = global.AmbienteConfig.ESCENA_INICIAL;
      if (global.AmbienteEscenas.activar(idInicial)) {
        // Mismo contrato que setEscena() aplica a cada cambio posterior
        // (Cap. 11.1: "una forma de indicar la escena activa"). La
        // escena inicial no pasa por el Estado de Transición (Cap. 6.1
        // diseño: "abrir la app ya cuenta como el primer momento de
        // atención"), pero igual debe quedar reflejada en el DOM desde
        // el primer instante, no recién en el segundo cambio de escena.
        document.documentElement.setAttribute('data-ambiente-escena', idInicial);
      }
    }

    // ── State Manager (Cap. 6) ───────────────────────────────────────
    global.AmbienteEstados.on('cambio', function (evento) {
      reflejarEstadoEnDOM(evento.actual);
    });
    reflejarEstadoEnDOM(global.AmbienteEstados.actual());

    // ── Interaction Observer (Cap. 3.12, T5) ────────────────────────
    // Gestos genéricos + temporizador de inactividad ya no viven acá
    // (ver nota de cabecera) — este subsistema le habla directo al
    // State Manager, sin pasar por el orquestador.
    if (global.AmbienteInteraccion) global.AmbienteInteraccion.iniciar();

    // ── Comportamiento base del Ambient Engine (Fase 4, Cap. 8,
    // roadmap Cap. 16 etapa 5) ──────────────────────────────────────
    // Se inicia junto al resto de Gobierno/Estados, no junto a las
    // capas visuales: no pertenece al Grupo de Contenido Visual (no
    // dibuja nada propio, solo publica --amb-respiracion) ni depende
    // de que ninguna escena esté activa — solo de data-ambiente-estado,
    // que el State Manager (arriba) ya refleja en <html> antes de este
    // punto.
    if (global.AmbienteRespiracion) global.AmbienteRespiracion.iniciar();

    // ── Grupo de Contenido Visual (Cap. 2.3) ────────────────────────
    // Cada capa se suscribe por su cuenta al Motion Controller ya
    // iniciado arriba — el orquestador no les entrega parámetros
    // directamente (eso violaría el Cap. 3.4: "nunca debe entregar
    // parámetros... sin haber aplicado primero las restricciones");
    // solo dispara su iniciar(), como hace desde la Fase 1 con la
    // Capa de Fondo.
    //
    // Fase 3 (Lenguaje de Assets, Cap. 4.1): el Plane Manager crea
    // los 4 contenedores fijos (P0-P3) donde vivirán las 7 familias
    // de assets. Debe iniciarse antes que cualquier familia — hoy,
    // antes que la Capa de Fondo, la primera capa visual del
    // documento — para que AmbientePlanos.contenedor() ya exista
    // cuando la primera familia lo pida.
    // Fase 5 (Integration Blueprint, Cap. 14 criterio 3): las 7
    // familias de assets + Capa de Fondo se apagan como grupo único
    // ("sustratoVisual"), no una por una — porque AmbientePlanos crea
    // los contenedores P0-P3 de los que el resto depende (ver nota
    // de Fase 3 abajo); apagar una familia sí y otra no dejaría
    // contenedores huérfanos sin sentido arquitectónico propio.
    if (!global.AmbienteFlags || global.AmbienteFlags.activo('sustratoVisual')) {
      if (global.AmbientePlanos) global.AmbientePlanos.iniciar();
      if (global.AmbienteReticula) global.AmbienteReticula.iniciar();
      if (global.AmbienteTopografia) global.AmbienteTopografia.iniciar();
      if (global.AmbienteCorrientes) global.AmbienteCorrientes.iniciar();
      if (global.AmbienteCoordenadas) global.AmbienteCoordenadas.iniciar();
      if (global.AmbienteBrujula) global.AmbienteBrujula.iniciar();
      // Fase 3 (Paso 8/9, roadmap Cap. 12 orden 7/8): mismo patrón que
      // el resto de las familias — cada una inicia su propia inserción
      // en el plano que le corresponde, el orquestador solo dispara.
      if (global.AmbienteParticulasDeriva) global.AmbienteParticulasDeriva.iniciar();
      if (global.AmbienteHalos) global.AmbienteHalos.iniciar();
      if (global.AmbienteCapaFondo) global.AmbienteCapaFondo.iniciar();
      // Fase 8 (Visual & Design Master Pass): AmbienteParticulas (Fase 2,
      // prototipo) queda retirado del arranque. Duplicaba, con puntos
      // azules sin tokenizar (rgba(100,180,255,…), prohibido por el
      // Cap. 11.2 del documento de Lenguaje de Assets: "asignar color
      // fijo, no tokenizado, a un asset"), exactamente el rol que la
      // Familia 6 "Partículas de deriva" (AmbienteParticulasDeriva, ya
      // iniciada arriba) ya cubre de forma oficial: SVG tokenizado,
      // misma gramática cartográfica que el resto del sistema. Dos
      // motores de partículas corriendo a la vez era ruido visual y
      // costo de rendimiento por duplicado, no dos identidades. El
      // módulo js/ambiente-particulas.js queda en el repo sin invocarse
      // (ver css/ambiente-estilos.css para el resto del cambio).
      if (global.AmbienteLuz) global.AmbienteLuz.iniciar();
    }
    // Fase 5 (Integration Blueprint, Cap. 15.3): Horario es cómputo
    // local puro, Clima depende de una API externa que puede fallar
    // o tardar — se mantienen como flags separados entre sí (y del
    // sustrato visual) precisamente para que una falla del Clima
    // nunca pueda arrastrar nada más (aislamiento de blast radius).
    // Fase 3 (Paso 10, roadmap Cap. 12 orden 9): shift de color de
    // P2/P3 por horario — no es una familia de assets, así que se
    // inicia junto a la Capa de Fondo (misma naturaleza: lee la hora
    // real y escribe variables CSS), no junto a las 7 familias.
    if (global.AmbienteHorarioTinte && (!global.AmbienteFlags || global.AmbienteFlags.activo('horarioTinte'))) {
      global.AmbienteHorarioTinte.iniciar();
    }
    if (global.AmbienteClima && (!global.AmbienteFlags || global.AmbienteFlags.activo('clima'))) {
      global.AmbienteClima.iniciar();
    }
  }

  global.AmbientEngine = {
    iniciar: iniciar,

    get estado() {
      return global.AmbienteEstados ? global.AmbienteEstados.actual() : null;
    },

    // Superficie mínima delegada a la máquina de estados (Cap. 11.1).
    // Este objeto es, a propósito, la única puerta de entrada: nada
    // fuera de este archivo debería llamar a AmbienteEstados directo.
    iniciarCarga: function () {
      if (global.AmbienteEstados) global.AmbienteEstados.iniciarCarga();
    },
    finalizarCarga: function (exito) {
      if (global.AmbienteEstados) global.AmbienteEstados.finalizarCarga(exito);
    },
    entrarFoco: function () {
      if (global.AmbienteEstados) global.AmbienteEstados.entrarFoco();
    },
    salirFoco: function () {
      if (global.AmbienteEstados) global.AmbienteEstados.salirFoco();
    },
    reintentar: function () {
      if (global.AmbienteEstados) global.AmbienteEstados.reintentar();
    },

    // Fase 2 (T4): ahora delega en el Scene Manager, que resuelve la
    // escena en dos fases (Cap. 6.2) antes de entregársela al Motion
    // Controller. Un nombre de escena desconocido o con assets no
    // disponibles no rompe nada: AmbienteEscenas.activar() devuelve
    // false y mantiene la escena previamente activa sin tocar el DOM
    // de escena — la Transición visual tampoco se dispara en ese caso,
    // porque no tendría destino real al que llegar.
    setEscena: function (nombre) {
      if (!global.AmbienteEstados) return;
      global.AmbienteEstados.iniciarTransicion(function () {
        var activada = global.AmbienteEscenas ? global.AmbienteEscenas.activar(nombre) : false;
        if (activada) document.documentElement.setAttribute('data-ambiente-escena', nombre);
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

})(window);
