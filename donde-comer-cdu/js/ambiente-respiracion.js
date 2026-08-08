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

   Debe cargarse después de ambiente-config.js, ambiente-ritmo.js,
   ambiente-accesibilidad.js (de los que lee bandas, período y señal de
   reducción) y ambiente-scheduler.js (Etapa 5: quien efectivamente
   dispara tick() en cada frame — sin él, iniciar() se degrada
   fail-open y el ciclo de respiración no arranca), y puede cargarse
   en cualquier punto antes de ambiente-orquestador.js, que es quien lo
   inicia. Ya no depende de ambiente-movimiento.js en ningún sentido
   (Etapa 5: la pausa/reanudación por visibilidad se centralizó en
   ambiente-scheduler.js).
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function config() { return global.AmbienteConfig || null; }
  function ritmo() { return global.AmbienteRitmo || null; }
  function accesibilidad() { return global.AmbienteAccesibilidad || null; }

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

  var registradoEnScheduler = false;
  var desregistrarScheduler = null;
  var GAP_RESET_MS = 500; // ver nota en ambiente-scheduler.js sobre gap-detection
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

  // pestanaVisible()/movimiento() se retiraron acá (Etapa 5): la
  // responsabilidad de pausar/reanudar por visibilidad ahora vive
  // exclusivamente en ambiente-scheduler.js — este módulo ya no
  // necesita conocer ni a AmbienteMovimiento ni a document.hidden.

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

  // Etapa 5 (perf, 2026-07-31): antes, este tick pedía y cancelaba su
  // propio rAF, con su propio listener de visibilidad (directo o vía
  // AmbienteMovimiento) — casi idéntico al que también tenía
  // ambiente-rendimiento.js (ver nota de cabecera de
  // ambiente-scheduler.js, que ahora es la única implementación de
  // ese patrón en todo el motor). Ahora es una tarea "pura" registrada
  // en el scheduler compartido: nunca vuelve a pedir su propio frame,
  // y detecta ella misma un salto anómalo de timestamp (gap-detection)
  // para tratarlo como "primer frame tras reanudar" — sin acumular
  // fase de golpe — en vez de depender de que alguien la pause y
  // reanude desde afuera.
  function tick(timestamp) {
    if (ultimoTimestamp === null || (timestamp - ultimoTimestamp) > GAP_RESET_MS) {
      ultimoTimestamp = timestamp;
      return; // no acumula fase en el frame de reanudación
    }
    faseAcumuladaMs += (timestamp - ultimoTimestamp);
    ultimoTimestamp = timestamp;
    aplicar();
  }

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

    // step(dt, sharedState): no-op — el ciclo real vive en tick()/
    // aplicar() de arriba, ahora corriendo dentro del rAF compartido
    // de AmbienteScheduler en vez de uno propio (Etapa 5), pero
    // todavía con su propio timestamp de alta precisión recibido
    // directamente del scheduler, no por un dt agregado. Migrar el
    // cómputo a step(dt,...) exigiría además separar la escritura ya
    // throttleada (INTERVALO_ESCRITURA) de un mecanismo de batching
    // que todavía no existe — mezclar ambos throttles sin ese writer
    // sería adivinar. Se documenta como desviación explícita, misma
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

    // Etapa 5: requiere AmbienteScheduler (debe cargar antes en el
    // ORDEN del bundle). Sin él, se degrada fail-open (Cap. 1.4):
    // el ciclo de respiración simplemente no arranca, en vez de caer
    // de vuelta a un rAF propio que reintroduciría el loop duplicado
    // que esta etapa vino a eliminar — mismo criterio que
    // ambiente-rendimiento.js.
    iniciar: function () {
      if (registradoEnScheduler) return; // idempotente
      var s = global.AmbienteScheduler;
      if (!s || typeof s.registrar !== 'function') return;
      periodoMs = calcularPeriodoMs();
      registradoEnScheduler = true;
      desregistrarScheduler = s.registrar('respiracion', tick);
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

