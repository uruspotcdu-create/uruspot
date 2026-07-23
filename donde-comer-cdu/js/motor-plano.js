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
      obj.aceptados !== null && typeof obj.aceptados === 'object' &&
      Array.isArray(obj.guardadosRecientes) &&
      obj.exposicion !== null && typeof obj.exposicion === 'object' &&
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
   * `gruposAEvitar()`. No tiene consumidor todavía en
   * motor-exposicion.js (fuera de alcance de esta pasada); queda
   * expuesta públicamente para que ese módulo pueda usarla el día que
   * se decida priorizar por afinidad, sin que motor-plano.js necesite
   * otro cambio de superficie cuando eso pase.
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
   * @returns {'bajo'|'medio'|'alto'}
   */
  function nivelConfianza(estado) {
    var ahora = Date.now();
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
