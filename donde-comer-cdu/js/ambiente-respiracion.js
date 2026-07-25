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
    // entren y salgan como atenuación, no como salto.
    multiplicadorActual += (objetivo - multiplicadorActual) * TASA_SUAVIZADO;

    var amplitud = r.amplitudMaxima * multiplicadorActual;
    var valor = onda * amplitud;

    document.documentElement.style.setProperty('--amb-respiracion', valor.toFixed(4));
  }

  function tick(timestamp) {
    rafId = global.requestAnimationFrame(tick);

    if (!pestanaVisible()) {
      // Cap. 9.2: no se anima nada en 2º plano. No se acumula fase
      // acá a propósito — al volver a primer plano se retoma desde el
      // mismo punto del ciclo en vez de "recuperar" de golpe el tiempo
      // que estuvo oculta.
      ultimoTimestamp = null;
      return;
    }

    if (ultimoTimestamp === null) ultimoTimestamp = timestamp;
    faseAcumuladaMs += (timestamp - ultimoTimestamp);
    ultimoTimestamp = timestamp;

    aplicar();
  }

  var api = {
    // Diagnóstico de solo lectura — ningún otro módulo debería
    // necesitar esto en operación normal, ya que el contrato real es
    // la variable CSS.
    get amplitudActual() { return multiplicadorActual; },

    iniciar: function () {
      if (rafId !== null) return; // idempotente
      periodoMs = calcularPeriodoMs();
      rafId = global.requestAnimationFrame(tick);
    }
  };

  global.AmbienteRespiracion = api;

})(window);
