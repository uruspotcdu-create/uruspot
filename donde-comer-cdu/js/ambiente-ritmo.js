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

