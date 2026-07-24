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
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function config() { return global.AmbienteConfig || null; }
  function rendimiento() { return global.AmbienteRendimiento || null; }
  function accesibilidad() { return global.AmbienteAccesibilidad || null; }
  function profundidad() { return global.AmbienteProfundidad || null; }

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
        densidad: reducido ? 0 : escena.particulas.densidad * nivel.particulas,
        libertadRecorrido: escena.particulas.libertadRecorrido
      },
      clima: {
        habilitado: reducido ? false : (escena.clima.habilitado && nivel.clima > 0),
        nieblaSutil: !!escena.clima.nieblaSutil
      },
      luz: {
        intensidad: escena.luz.intensidad * nivel.luz
      },
      profundidad: calcularProfundidad(escena.profundidad, nivel),
      transicion: {
        banda: escena.transicion.banda,
        duracionMs: duracionTransicion()
      },
      presupuestoContraste: escena.presupuestoContraste,
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
  function duracionTransicion() {
    var c = config();
    var a = accesibilidad();
    var r = rendimiento();
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
    setEscena: function (id) {
      if (escenaActualId === id) return;
      escenaActualId = id;
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
