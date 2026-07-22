/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — motor-plano.js
   El núcleo del sistema. Reemplaza cualquier noción de "estado
   discreto" por un punto que se calcula en un plano de dos ejes
   (autonomía × fricción tolerable), tal como lo fija el Blueprint de
   Producto v2, sección 1.

   Todas las funciones que calculan algo son puras (reciben estado,
   devuelven estado nuevo) para poder testearlas sin DOM ni red —
   ver tests/motor.test.js. La única parte impura es la persistencia
   (leerEstado/guardarEstado/borrarEstado), aislada al final del
   archivo.

   No depende de motor-exposicion.js ni de motor-mapa.js: estos leen
   el estado que expone este módulo, nunca al revés.

   ───────────────────────────────────────────────────────────────────
   Auditoría y evolución de esta pasada — motivo de cada cambio no
   trivial, con la evidencia que lo sostiene, para que quien lea el
   diff no tenga que reconstruir el razonamiento desde cero:

   BUGS REALES corregidos (esta pasada)
   • `Acciones.guardar` nunca leía `payload.guardado`. `app.js` ya
     manda `{ guardado: true/false }` desde su propia pasada anterior,
     con un comentario que afirma que esto ya distingue guardar de
     desguardar para el disparador de Curaduría (Blueprint v2, sección
     4a) — pero esta función ignoraba el campo por completo. Verificado
     con un script de prueba: desguardar 2 veces dentro de la ventana
     activaba `curaduriaActiva` exactamente igual que guardar 2 veces.
     Ahora un desguardado explícito no cuenta para el disparador.
   • El empuje de fricción de `Acciones.rechazar` (patrón estable) se
     comprobaba DESPUÉS de sumar el rechazo actual, así que se repetía
     en cada rechazo adicional del mismo rubro dentro de la ventana —
     verificado: 6 rechazos seguidos del mismo rubro empujan la
     fricción de 0.55 a 0.35, no solo una vez. Ahora se compara el
     patrón antes/después y el empuje dispara una sola vez, en la
     transición a estable, tal como describe el comentario original.

   BUG REAL corregido (pasada anterior)
   • `obtenerUsuarioId()` generaba un id nuevo con `Math.random()` en
     CADA llamada cuando `localStorage` no estaba disponible (modo
     privado con storage bloqueado, cuota agotada, algunos navegadores
     in-app). Como `claveContexto()` invoca `obtenerUsuarioId()` en
     cada `leerEstado()`/`guardarEstado()`, la clave de contexto
     cambiaba en cada lectura — el estado nunca se encontraba a sí
     mismo, ni siquiera dentro de la misma sesión de pestaña. Ahora el
     id de sesión de emergencia se genera una sola vez y se cachea en
     una variable de módulo: sigue sin persistir entre visitas (eso es
     inevitable sin storage), pero es estable durante toda la sesión.

   CÓDIGO MUERTO eliminado (con la evidencia que lo confirma)
   • `gruposAEvitar()`: su único consumidor en todo el repo era
     `recortePorIniciativaPropia()` dentro de motor-exposicion.js —
     una función que a su vez nunca se invoca desde app.js (el único
     call site posible). Sin `recortePorIniciativaPropia()` en el
     camino de ejecución, `gruposAEvitar()` no tiene ningún llamador
     alcanzable. Se elimina. El decaimiento de rechazos que la
     alimentaba (`rechazosVigentes`, `grupoEsPatronEstable`) SÍ se
     conserva, porque además de alimentar a `gruposAEvitar()` también
     empuja `friccion` dentro de `Acciones.rechazar` — y `friccion`
     sigue siendo parte del estado persistido (ver nota más abajo
     sobre qué NO se tocó).
   • `reposoForzadoActivo()`: exportada en la API pública, cero call
     sites en app.js (el único consumidor posible de la superficie
     pública de este módulo). No la consume ni siquiera otro módulo
     interno de este archivo. Se elimina.
   • Bloque `exposicion` dentro de `Acciones.aceptar` (el que llevaba
     la cuenta de `vecesMostrado`/`ultimaVez` por lugar): su único
     lector era `descansando()` en motor-exposicion.js, función que
     — igual que `recortePorIniciativaPropia()` — nunca se ejecuta
     porque nadie la llama. Se elimina la escritura, y por lo tanto
     también el campo `exposicion` del shape de `estadoInicial()`
     (ver "cambio de esquema" abajo: es un caso legítimo porque la
     migración de versión ya lo cubre).

   QUÉ NO SE TOCÓ, Y POR QUÉ (para que no se lea como un olvido)
   • `region()` sigue distinguiendo 'guia' / 'exploracion' /
     'accionDirecta' exactamente igual que antes, aunque hoy esa
     distinción de tres nombres es cosméticamente indistinguible en
     el render de app.js (las tres ramas producen la misma lista y el
     mismo texto de cabecera — ver diagnóstico previo). No es código
     muerto en el sentido de "sin llamador": SÍ se llama, y SÍ decide
     entre curaduría y el resto. Colapsar 'guia'/'exploracion'/
     'accionDirecta' en un solo valor es un cambio de comportamiento
     de producto, no una poda de código muerto, y por eso queda fuera
     de esta pasada — se hace en un commit propio, explícito, cuando
     se decida qué reemplaza a esa distinción (o si simplemente se
     retira). Tocarlo acá, mezclado con el resto, sería exactamente
     el tipo de cambio no trazable que este mismo archivo advierte
     evitar en sus propios comentarios de auditoría.
   • `Acciones.permanecer` / `Acciones.aceptar` (empuje de autonomía) /
     `Acciones.rechazar` (empuje de fricción) siguen mutando el plano
     igual que antes, por la misma razón: `region()` todavía los
     consume, y decidir si dejan de importar es parte de la misma
     decisión de producto que `region()`, no de esta pasada.

   CAMBIO DE ESQUEMA (el único de esta pasada, y por qué es seguro)
   • Se agrega versionado explícito (`SCHEMA_VERSION`) al estado
     persistido, con una función `migrarEstado()` que normaliza
     cualquier objeto leído de `localStorage` — de esta versión, de
     una anterior sin campo `version`, o corrupto — a la forma actual.
     Esto es lo que permite retirar el campo `exposicion` (ya muerto,
     ver arriba) sin dejar basura en los `localStorage` de usuarios
     que ya tenían estado guardado: la migración simplemente no lo
     copia al normalizar. Ningún dato con efecto real se pierde,
     porque ya no tenía efecto real. Sin este mecanismo, retirar el
     campo del shape hoy y agregar campos nuevos mañana habría
     significado, tarde o temprano, un `leerEstado()` que devuelve un
     objeto a medio camino entre dos formas — la clase de bug que
     este cambio existe para prevenir de raíz, no solo para esta vez.

   ROBUSTEZ agregada
   • `esEstadoValido()`: antes, un JSON sintácticamente válido pero
     con la forma equivocada (p. ej. `{}` guardado por error, o un
     objeto de otra clave que compartiera el mismo namespace por un
     bug futuro) pasaba el `try/catch` de `JSON.parse` sin problema y
     rompía más adelante, en el primer lugar que asumiera que
     `estado.sesion.curaduriaActiva` existe. Ahora se valida la forma
     después de parsear, no solo la sintaxis.
   • Guardas de payload en `Acciones` (`segundos`, `grupo`, `lugarId`)
     para que un valor inesperado degrade sin excepción en vez de
     propagar `NaN` o `undefined` al plano.

   NUEVO (funcionalidad, no relleno)
   • `borrarEstado(ciudadId)`: no existía ninguna forma de limpiar el
     estado persistido de un contexto. Hace falta para cualquier
     futuro control de privacidad ("olvidame en esta ciudad") y para
     QA/debug — hoy la única forma de resetear era borrar
     `localStorage` a mano desde devtools.
   • `resumenEstado(estado)`: una vista plana y redondeada del estado,
     pensada para logging/telemetría/debug — nunca se debería loguear
     el objeto de estado crudo completo (incluye timestamps de
     rechazos y guardados que no aportan nada a un log y solo
     ensucian).

   La superficie pública que SÍ consume app.js hoy no cambia:
   `leerEstado`, `registrarApertura`, `guardarEstado`, `aplicarAccion`,
   `region`, `rolPorAperturas`. Se retiran de `URU_PLANO` únicamente
   `gruposAEvitar` y `reposoForzadoActivo`, confirmado arriba que no
   tienen llamador alcanzable.
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
  // localStorage. Esta pasada retira el campo `exposicion` (código
  // muerto, ver auditoría arriba) — de ahí el salto de la versión
  // implícita anterior (sin campo `version`, tratada como 1) a 2.
  var SCHEMA_VERSION = 2;

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
      rechazos: {},              // { grupo: [timestamps] }
      guardadosRecientes: [],    // timestamps para detectar Curaduría
      sesion: {
        curaduriaActiva: false,
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
      obj.rechazos !== null && typeof obj.rechazos === 'object' &&
      Array.isArray(obj.guardadosRecientes) &&
      obj.sesion !== null && typeof obj.sesion === 'object';
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
    if (crudo.rechazos && typeof crudo.rechazos === 'object') {
      base.rechazos = crudo.rechazos;
    }
    if (Array.isArray(crudo.guardadosRecientes)) {
      base.guardadosRecientes = crudo.guardadosRecientes;
    }
    // `crudo.exposicion` — si existe, viene de un estado pre-migración
    // (versión 1) y se descarta a propósito: es el campo muerto que
    // esta pasada retira del esquema. No se copia.

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

  // reposoForzadoActivo() se eliminó en esta pasada — ver auditoría al
  // inicio del archivo. Cero call sites en todo el repo fuera de su
  // propia definición/export.

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

  // gruposAEvitar() se eliminó en esta pasada — ver auditoría al
  // inicio del archivo. Su único llamador (recortePorIniciativaPropia,
  // en motor-exposicion.js) no tiene a su vez ningún llamador
  // alcanzable desde app.js.

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
     6. Las seis acciones mínimas — Vocabulario de Interacción
     Cada una recibe el estado actual y devuelve un estado NUEVO
     (no muta el original) — más fácil de testear y de razonar.
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
     * El usuario acepta una oferta: suelta autonomía.
     * Antes también llevaba la cuenta de `vecesMostrado`/`ultimaVez`
     * por lugar en `estado.exposicion` — se retira en esta pasada
     * porque su único lector (descansando(), en motor-exposicion.js)
     * es código muerto. Ver auditoría al inicio del archivo.
     */
    aceptar: function (estado, payload) {
      var e = copiarEstado(estado);
      e.autonomia = clamp(e.autonomia + CFG.acciones.aceptar.empujeAutonomia);
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
      // BUG REAL corregido: antes se comprobaba "¿es patrón estable
      // AHORA?" después de sumar el rechazo actual, así que el empuje
      // de fricción se repetía en cada rechazo adicional del mismo
      // rubro dentro de la ventana (4°, 5°, 6°... rechazo seguían
      // restando fricción cada vez, sin tope más que el clamp global
      // del plano). El comentario original describe un evento de
      // transición ("cuando se CONVIERTE en patrón estable"), no un
      // estado continuo — así que ahora se compara el patrón ANTES y
      // DESPUÉS de este rechazo, y el empuje solo se aplica la vez
      // que cruza el umbral por primera vez dentro de la ventana
      // vigente. Rechazos repetidos después de eso siguen quedando
      // registrados (siguen alimentando `evitar` el rubro) pero ya no
      // vuelven a mover la fricción tolerable de nuevo.
      var eraEstable = grupoEsPatronEstable(e, grupo, ahora);
      var vigentes = rechazosVigentes(e, grupo, ahora);
      vigentes.push(ahora);
      e.rechazos[grupo] = vigentes;
      var esEstableAhora = grupoEsPatronEstable(e, grupo, ahora);
      if (esEstableAhora && !eraEstable) {
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
     * activa Curaduría, sin importar la región de origen — sección 4a
     * del Blueprint. No importa desde qué región llegó el primer
     * guardado, solo la repetición en el tiempo.
     */
    guardar: function (estado, payload) {
      var e = copiarEstado(estado);
      // BUG REAL corregido: app.js ya manda `{ guardado: true/false }`
      // desde su propia pasada anterior (ver su comentario: "así
      // 'quitar' nunca cuenta para el disparador que activa la vista
      // de guardados"), pero esta función nunca leía ese campo — todo
      // click de guardar/desguardar empujaba `guardadosRecientes` por
      // igual. Resultado real: desguardar 2 veces dentro de la
      // ventana activaba Curaduría exactamente igual que guardar 2
      // veces. Ahora un desguardado explícito (`guardado === false`)
      // no cuenta para el disparador — solo un guardado real (o un
      // payload sin el campo, por compatibilidad con cualquier otro
      // llamador que no lo envíe) sigue alimentando la ventana.
      if (payload && payload.guardado === false) return e;
      var ahora = Date.now();
      var ventanaMs = CFG.acciones.guardar.ventanaCuradoriaSegundos * 1000;
      var recientes = (e.guardadosRecientes || []).filter(function (ts) {
        return (ahora - ts) <= ventanaMs;
      });
      recientes.push(ahora);
      e.guardadosRecientes = recientes;
      if (recientes.length >= CFG.acciones.guardar.disparadorCantidad) {
        e.sesion.curaduriaActiva = true;
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
   * Resumen plano y legible del estado, para logging/debug. No es
   * parte del contrato de negocio — es una utilidad de observación.
   * @param {object} estado
   * @returns {object|null}
   */
  function resumenEstado(estado) {
    if (!estado) return null;
    var reg = region(estado);
    return {
      ciudad: estado.ciudad,
      rol: rolPorAperturas(estado.aperturas),
      aperturas: estado.aperturas,
      autonomia: Number(estado.autonomia.toFixed(3)),
      friccion: Number(estado.friccion.toFixed(3)),
      region: reg.nombre,
      variante: reg.variante,
      curaduriaActiva: !!estado.sesion.curaduriaActiva,
      guardadosRecientes: (estado.guardadosRecientes || []).length,
      rubrosConRechazosVigentes: Object.keys(estado.rechazos || {}).length
    };
  }

  /* ─────────────────────────────────────────────────────────────
     API pública

     Respecto de la versión anterior: se retiran `gruposAEvitar` y
     `reposoForzadoActivo` (código muerto confirmado, ver auditoría).
     Se agregan `borrarEstado` y `resumenEstado` (funcionalidad nueva,
     ver auditoría). El resto de la superficie —la que efectivamente
     consume app.js hoy— no cambia.
     ───────────────────────────────────────────────────────────── */
  global.URU_PLANO = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    estadoInicial: estadoInicial,
    region: region,
    aplicarAccion: aplicarAccion,
    registrarApertura: registrarApertura,
    rolPorAperturas: rolPorAperturas,
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
