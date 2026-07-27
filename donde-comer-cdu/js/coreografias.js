/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — js/coreografias.js
   Motion Direction Bible v2.0, Parte K — Arquitectura de implementación

   Módulo de la CAPA DE APLICACIÓN, hermano de app.js — deliberadamente
   NO se llama ambiente-coreografias.js ni se carga entre los <script>
   ambiente-*.js (Parte K.7): el Grupo de Contenido Visual del Ambient
   Engine nunca se comunica lateralmente con componentes de interfaz
   real (tarjetas, chips, fichas) — eso es conocimiento de la
   aplicación, no del Ambient Engine. Este archivo CONSUME al Ambient
   Engine como servicio de solo lectura (AmbienteGramatica, AmbienteRitmo,
   AmbienteAccesibilidad, AmbientEngine), exactamente como ya lo hace
   cualquier módulo ambiente-* con AmbienteConfig — nunca al revés.

   Responsabilidad única: ser el ÚNICO lugar del repositorio donde una
   coreografía real de interfaz decide su registro de ritmo y su
   duración. Antes de este archivo, esa decisión vivía cableada a mano
   en tres lugares distintos (tokens.css con números propios,
   app.js con un contador local `uiState.vecesTransicionFiltro`, y
   comentarios en motion-gramatica.css que citaban la gramática sin
   importarla) — Parte K.1/K.10 de la Bible. Ninguna función de este
   archivo debe declarar su propio contador de repetición: eso ya lo
   resuelve AmbienteRitmo.resolver() vía claveAccion.

   No tiene ciclo de vida propio (no expone iniciar()/detener()): es
   una librería de funciones puras + helpers fail-open sobre el DOM
   que le pasan sus llamantes, no un observador con su propio estado
   de arranque/apagado como los módulos ambiente-*. La única memoria
   mutable de este archivo es la caché de "última escena activada"
   (para no relanzar transiciones redundantes, Parte L) y el contador
   de generación de `cambioFiltro` (para invalidar una salida animada
   abandonada por una reentrada, Parte F.2/G.3.1) — ninguna de las dos
   es un timer ni un listener global.

   Debe cargarse después de ambiente-config.js, ambiente-accesibilidad.js,
   ambiente-gramatica.js, ambiente-ritmo.js y ambiente-orquestador.js, y
   antes de app.js, que es quien lo consume (ver index.html).
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function ritmo() { return global.AmbienteRitmo || null; }
  function gramatica() { return global.AmbienteGramatica || null; }
  function accesibilidad() { return global.AmbienteAccesibilidad || null; }
  function engine() { return global.AmbientEngine || null; }

  // ── Resolución de ritmo (Parte K.4) ──────────────────────────────
  // Superficie fina sobre AmbienteRitmo.resolver — no reimplementa
  // fatiga ni contraste posterior, solo delega. Fail-open (Cap. 1.4):
  // si el Ambient Engine no llegó a cargar por algún motivo, no
  // bloquea la coreografía — devuelve el registro solicitado tal cual
  // con una duración conservadora en vez de romper al llamante.
  function resolver(registroSolicitado, claveAccion) {
    var r = ritmo();
    if (!r || typeof r.resolver !== 'function') {
      return { registro: registroSolicitado || 'conversacional', duracionMs: 400 };
    }
    return r.resolver(registroSolicitado, claveAccion);
  }

  // ── Accesibilidad (Parte K.11/B.2.2) ─────────────────────────────
  // Reemplaza a prefiereMovimientoReducido() de app.js: consulta
  // AmbienteAccesibilidad (que ya combina señal de sistema + futura
  // preferencia manual de producto sin que la manual pueda anular la
  // real) en vez de leer matchMedia por su cuenta. Fail-open: si
  // AmbienteAccesibilidad no cargó, cae al mismo matchMedia directo
  // que ya usaba app.js antes de esta migración — nunca deja de
  // respetar la preferencia del usuario solo porque un script no
  // llegó a tiempo.
  function reducirMovimiento() {
    var a = accesibilidad();
    if (a && typeof a.reducirMovimiento === 'boolean') return a.reducirMovimiento;
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // ── Validación de gramática en modo debug (Parte K.3) ────────────
  // No-op fail-open en producción si AmbienteGramatica no está
  // disponible; en debug (?debugMotion en la URL) avisa por consola
  // si alguna coreografía de este archivo intentara usar un verbo que
  // no existe en el vocabulario cerrado de nueve verbos — para que un
  // futuro décimo verbo inventado a mano se note en desarrollo, no en
  // producción silenciosa (Cap. 14, Parte J: "cualquier verbo o
  // registro adicional... debe rechazarse salvo justificación").
  var DEBUG = (function () {
    try { return /[?&]debugMotion/.test(global.location && global.location.search); }
    catch (e) { return false; }
  })();

  function validarVerbo(id) {
    if (!DEBUG) return;
    var g = gramatica();
    if (g && !g.esValido(id)) {
      console.warn('[Coreografias] verbo desconocido fuera del vocabulario cerrado: "' + id + '"');
    }
  }

  // ── Helper DOM fail-open ──────────────────────────────────────────
  function marcarSaliendo(el, duracionMs) {
    if (!el) return;
    if (el.classList && typeof el.classList.add === 'function') {
      el.classList.add('u-mov-saliendo');
    }
    if (el.style && typeof el.style.setProperty === 'function') {
      el.style.setProperty('--mov-salida', duracionMs + 'ms');
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // G.3.1 — Cambio de filtros: salida antes que entrada
  // ═════════════════════════════════════════════════════════════════
  // Sustituye la lógica que antes vivía a mano en
  // renderConTransicionDeFiltro() de app.js (contador local
  // `uiState.vecesTransicionFiltro`, sin guarda de reentrada real).
  // Verbo: Desvanecerse (elementos salientes) — válido en solitario
  // según AmbienteGramatica.validarCombinacion (Parte K.3, validación
  // solo en modo debug para no gastar ciclos en producción).
  //
  // Regla de fatiga (Cap. 5): la 1ª vez en la sesión que se llama con
  // claveAccion 'filtro:rubro', AmbienteRitmo.resolver() devuelve
  // 'conversacional' — se anima la salida y solo se llama a `render`
  // cuando termina (transitionend del primer nodo, o un timeout de
  // seguridad si el evento nunca llega). Desde la 2ª repetición en la
  // sesión, resolver() ya degrada a 'inmediato' por su cuenta — acá
  // eso se traduce en reemplazo instantáneo sin animar salida, que es
  // exactamente la guarda de reentrada que pedía Parte F.2/G.3.1: no
  // hace falta un contador de reentrada aparte, la fatiga ya existente
  // cubre el caso (Parte K.10 — no duplicar lo que AmbienteRitmo ya
  // resuelve).
  //
  // `generacionFiltro` invalida la salida animada de una corrida
  // anterior si una corrida nueva empieza antes de que la primera
  // termine (transitionend tardío de un panel ya reemplazado no debe
  // volver a llamar a `render`).
  var generacionFiltro = 0;

  function cambioFiltro(elementosSalientes, render) {
    if (typeof render !== 'function') return;

    generacionFiltro += 1;
    var miGeneracion = generacionFiltro;

    validarVerbo('desvanecerse');

    var resultado = resolver('conversacional', 'filtro:rubro');
    var instantaneo = reducirMovimiento() || resultado.registro === 'inmediato';

    if (instantaneo) {
      render();
      return;
    }

    var lista = [];
    try {
      lista = Array.prototype.slice.call(elementosSalientes || []);
    } catch (e) {
      lista = [];
    }

    if (!lista.length) {
      // Nada que animar de salida (primer render, panel vacío) — no
      // hay razón para retrasar la entrada esperando un evento que
      // nunca va a llegar.
      render();
      return;
    }

    var yaCompletado = false;
    function completar() {
      if (yaCompletado) return;
      if (miGeneracion !== generacionFiltro) return; // corrida abandonada por una reentrada
      yaCompletado = true;
      render();
    }

    lista.forEach(function (el) { marcarSaliendo(el, resultado.duracionMs); });

    var primero = lista[0];
    if (primero && typeof primero.addEventListener === 'function') {
      primero.addEventListener('transitionend', completar, { once: true });
    }
    // Failsafe: mismo criterio que programarRenderTrasSalida en
    // app.js — nunca depender solo del evento del navegador.
    global.setTimeout(completar, resultado.duracionMs + 120);
  }

  // ═════════════════════════════════════════════════════════════════
  // Parte I — Coreografía global de escenas narrativas
  // ═════════════════════════════════════════════════════════════════
  // Único punto real de activación de AmbientEngine.setEscena() más
  // allá de la escena inicial 'home' (Parte I: "el hueco de mayor
  // impacto narrativo de todo el sistema"). Se llama desde el único
  // render() real de app.js con la rama de navegación resuelta y el
  // conteo de resultados.
  //
  // Mapeo (Parte I + G.5.3):
  //   - conteo === 0            -> 'sinResultados' (la escena ambiental
  //     ya existe en AmbienteConfig.ESCENAS y nunca se disparaba;
  //     "invitación a seguir explorando" en vez de comunicar fracaso,
  //     sin importar qué rama produjo el conteo en cero — un listado
  //     vacío es un listado vacío, la invitación a seguir explorando
  //     aplica igual venga de un filtro, de una búsqueda o de un
  //     rubro sin resultados).
  //   - rama === 'buscador'      -> 'buscando' (acción explícita:
  //     búsqueda en vivo, filtro de rubro, o "ver catálogo completo").
  //   - cualquier otra rama       -> 'explorando' (paseo/curiosidad —
  //     incluye 'curaduria' (favoritos) y las ramas 'recorte:*' de
  //     iniciativa propia, Parte I: "incluida la curaduría de
  //     favoritos").
  //
  // No relanza la misma escena dos veces seguidas: cada render() la
  // llama de nuevo aunque nada haya cambiado, y una transición de
  // escena redundante sería exactamente el "temblor" que el Cap. 14
  // prohíbe.
  var ultimaEscenaActivada = null;

  function nombreEscenaPorRama(rama, conteo) {
    if (conteo === 0) return 'sinResultados';
    if (rama === 'buscador') return 'buscando';
    return 'explorando';
  }

  function activarEscena(nombre) {
    if (!nombre || nombre === ultimaEscenaActivada) return;
    ultimaEscenaActivada = nombre;
    var e = engine();
    if (e && typeof e.setEscena === 'function') e.setEscena(nombre);
  }

  function activarEscenaPorRama(rama, conteo) {
    activarEscena(nombreEscenaPorRama(rama, conteo));
  }

  // ═════════════════════════════════════════════════════════════════
  // G.4 — Apertura y cierre de ficha
  // ═════════════════════════════════════════════════════════════════
  // La coreografía visual en sí (Acercarse / Alejarse, continuidad de
  // forma tarjeta<->encabezado) ya la resuelve la View Transitions API
  // nativa cross-document (css/tokens.css: `@view-transition{
  // navigation:auto }`) — este archivo nunca reimplementa esa
  // animación. Lo que sí hace es dejar constancia en la memoria de
  // sesión de AmbienteRitmo (fatiga por slug repetido, contraste
  // posterior entre contemplativos) y activar la escena ambiental
  // 'ficha' antes de que el navegador siga la navegación real.

  // G.4.1 — se llama en el click de "ver ficha", sin bloquear ni
  // hacer preventDefault del <a href> real (Parte L: "Regla de
  // interrupción: delegada al comportamiento nativo del browser").
  function aperturaFicha(slugLugar) {
    if (!slugLugar) return;
    validarVerbo('acercarse');
    resolver('contemplativo', 'ficha:apertura:' + slugLugar);
    activarEscena('ficha');
  }

  // G.4.2 — se llama al volver de una ficha (ver vieneDeFicha), antes
  // de que el primer render() real dispare la escena que corresponda
  // al estado restaurado vía activarEscenaPorRama. Verbo Alejarse
  // (nunca Desvanecerse: el listado de origen cede el centro de
  // atención pero no desapareció) — acá no hay nodo DOM que animar
  // (la transición de salida ya la resolvió la navegación nativa del
  // navegador antes de llegar a este punto); esta llamada solo deja
  // registro de sesión para que la regla de contraste posterior sepa
  // que hubo un contemplativo inmediatamente antes.
  function cierreFicha() {
    validarVerbo('alejarse');
    resolver('contemplativo', 'ficha:regreso');
  }

  // Detecta un regreso real desde una ficha (navegación completa, no
  // SPA: las 51 páginas de locales/ son documentos aparte). Se basa en
  // document.referrer en vez de un flag propio en sessionStorage
  // porque debe funcionar en la primera ejecución de inicializar()
  // tras una recarga completa del documento — no hay memoria de JS
  // que sobreviva esa navegación salvo lo que el propio navegador
  // reporte.
  function vieneDeFicha() {
    var ref = (global.document && global.document.referrer) || '';
    return ref.indexOf('/locales/') !== -1;
  }

  // ═════════════════════════════════════════════════════════════════
  // G.2.1 — Primer scroll: revelado progresivo
  // ═════════════════════════════════════════════════════════════════
  // La coreografía visual (stagger por --motion-desfase, umbral
  // anti-temblor 0/0.12) ya la resuelve inicializarScrollReveal() en
  // app.js con CSS puro — este archivo no la reimplementa. Lo único
  // que faltaba (Parte K: "hoy no usa AmbienteRitmo en absoluto") era
  // que cada primera revelación quedara registrada en la memoria de
  // sesión compartida, para que scroll:reveal:<id> participe de la
  // misma regla de fatiga/contraste que cualquier otra coreografía —
  // por ejemplo, para que un aluvión de secciones revelándose de
  // golpe en un scroll rápido no cuente como una sucesión de
  // contemplativos (no lo son: son 'conversacional' por definición,
  // así que esto es en la práctica solo trazabilidad de sesión, no
  // un cambio de comportamiento visible).
  function registrarRevelado(idOrClase) {
    if (!idOrClase) return;
    validarVerbo('acercarse');
    resolver('conversacional', 'scroll:reveal:' + idOrClase);
  }

  // ═════════════════════════════════════════════════════════════════
  var api = {
    // Superficie de ritmo/accesibilidad — usada directamente por
    // coreografias-tests.js y disponible para cualquier coreografía
    // futura que necesite resolver un registro sin duplicar lógica.
    resolver: resolver,
    reducirMovimiento: reducirMovimiento,

    // Coreografías reales (Parte G/L), una función por evento del
    // producto que este documento prioriza.
    cambioFiltro: cambioFiltro,
    activarEscenaPorRama: activarEscenaPorRama,
    aperturaFicha: aperturaFicha,
    cierreFicha: cierreFicha,
    vieneDeFicha: vieneDeFicha,
    registrarRevelado: registrarRevelado
  };

  global.Coreografias = api;

})(window);
