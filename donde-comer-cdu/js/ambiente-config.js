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
      // 2026-08-08: nombre de archivo con sufijo -v2. El repo cachea
      // assets/ambient/*.svg como immutable/1 año en el borde de
      // Cloudflare (ver _headers: "estos archivos jamás cambian de
      // contenido sin cambiar de nombre... la convención correcta es
      // cambiarles el nombre"). El primer fix de este SVG (geometría
      // de aro/marcas inline en vez de <use> a archivo externo) editó
      // el contenido bajo el mismo nombre, así que cualquier navegador
      // que ya lo había pedido una vez seguía sirviendo la versión
      // vieja desde su propia caché HTTP — sin que ningún bump de
      // versión del Service Worker pudiera hacer nada al respecto,
      // porque esa caché vive un nivel por debajo del SW. Renombrar a
      // -v2 es la forma correcta, documentada en este mismo repo, de
      // invalidar eso: URL nueva, nadie tiene nada cacheado para ella.
      // 2026-08-08 (Revisión 4): reemplazo completo del SVG — dejó
      // de ser un diagrama abstracto de línea+círculo para ser una
      // brújula reconocible (aguja de rombo bicolor). Ver la
      // cabecera de brujula--default--regular-v3.svg para el detalle
      // completo. Nombre -v3 por el mismo motivo de cache-busting ya
      // documentado en el bump anterior a -v2: URL nueva, nadie
      // tiene nada cacheado para ella.
      archivo: 'assets/ambient/brujula/brujula--default--regular-v3.svg'
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
