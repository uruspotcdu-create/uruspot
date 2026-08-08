// js/ambiente-lifecycle-tests.js — URU SPOT
// ---------------------------------------------------------------------
// FASE 6 del roadmap de optimización del Ambient Engine (2026-07-26):
// suite dedicada a lo que motor-test.js y contract-tests.js no cubren
// — el CICLO DE VIDA en tiempo de ejecución de los módulos ambiente-*
// (rAF, setInterval, listeners), no su lógica de negocio ni el
// contrato DOM↔JS estático. Corrible con `node js/ambiente-lifecycle-
// tests.js`, sin dependencias externas ni navegador real.
//
// Estrategia: cada módulo bajo prueba es un IIFE `(function (global) {
// ... })(window)` que además usa `document`/`requestAnimationFrame`/
// `setInterval` como identificadores sueltos (no siempre vía
// `global.*`). Para reproducir eso sin navegador, se ejecuta el código
// fuente real del archivo (leído de disco, nunca reescrito a mano) en
// un contexto vm donde `window === globalThis` de ese contexto — igual
// que en un navegador real — con un rAF/setInterval/document mínimos y
// controlables a mano (sin temporizadores reales: los frames y los
// intervalos se disparan explícitamente desde el test).
//
// Qué verifica (Fase 6, auditoría §7 "tests"; Suites 2-4 actualizadas
// en la revisión 2026-07-31 tras la Etapa 5 — ver nota más abajo):
//   1. Inicialización idempotente (ambiente-clima.js, ambiente-
//      rendimiento.js) — una segunda llamada a iniciar() no debe
//      duplicar contenedores DOM, suscripciones ni listeners.
//   2. Ausencia de timers duplicados (ambiente-clima.js): iniciar()
//      llamado dos veces deja exactamente un setInterval activo.
//   3. Pausa/reanudación real del rAF compartido ante ocultamiento de
//      pestaña (ambiente-scheduler.js, hoy el único dueño del rAF
//      permanente): al ocultar, el ciclo se cancela por completo
//      (cero frames pendientes) en vez de seguir reprogramándose; al
//      volver a mostrar, se reanuda exactamente una vez.
//   4. Ausencia de listeners/tareas duplicadas tras ciclos repetidos
//      de iniciar()/detener() y de múltiples tareas compartiendo un
//      único scheduler (ambiente-rendimiento.js, ambiente-
//      respiracion.js, ambiente-scheduler.js).
//   5. No regresión de la API pública: cada módulo sigue exponiendo
//      los mismos métodos que antes de la Fase 6.
//
// Nota (revisión 2026-07-31): la Etapa 5 (perf) movió la propiedad del
// rAF/visibilitychange permanente DESDE ambiente-respiracion.js y
// ambiente-rendimiento.js HACIA ambiente-scheduler.js (un único loop
// compartido en vez de uno por módulo — ver cabecera de ese archivo).
// Las Suites 2 y 3 de esta prueba seguían verificando el contrato
// VIEJO (cada módulo pidiendo su propio rAF) cargando esos dos
// archivos SIN ambiente-scheduler.js en el sandbox: con el código
// real ya migrado, `iniciar()` no encontraba `AmbienteScheduler` y se
// degradaba fail-open (comportamiento documentado y correcto), así
// que los contadores de frames/listeners daban 0 en vez del 1
// esperado por la aserción vieja — 9 falsos negativos, no una
// regresión de comportamiento real. Se reescribieron ambas suites
// para cargar ambiente-scheduler.js junto con el módulo bajo prueba y
// verificar el contrato ACTUAL: registro/desregistro en el scheduler
// compartido, no un rAF propio.
//
// Qué NO verifica (requiere navegador real, ver informe de la Fase 6
// entregado junto a este cambio): FPS real, compositing/will-change,
// comportamiento de rAF real bajo el throttling propio de cada
// navegador, memoria.
//
// Sale con código 0 si todo pasa, 1 si algo falla.

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = __dirname;

let total = 0;
let fallos = 0;

function afirmar(condicion, descripcion) {
  total++;
  if (condicion) {
    console.log(`✓ ${descripcion}`);
  } else {
    fallos++;
    console.log(`✗ ${descripcion}`);
  }
}

// ── DOM/BOM mínimo y controlable a mano ─────────────────────────────

function crearElementoFalso(tag) {
  return {
    tagName: tag,
    id: '',
    className: '',
    attributes: {},
    style: {
      _props: {},
      setProperty(k, v) { this._props[k] = v; },
      removeProperty(k) { delete this._props[k]; }
    },
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); }
    },
    children: [],
    parentNode: null,
    get offsetHeight() { return 0; },
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
    appendChild(hijo) { hijo.parentNode = this; this.children.push(hijo); return hijo; },
    insertBefore(hijo) { hijo.parentNode = this; this.children.unshift(hijo); return hijo; },
    removeChild(hijo) {
      const i = this.children.indexOf(hijo);
      if (i > -1) this.children.splice(i, 1);
      hijo.parentNode = null;
      return hijo;
    }
  };
}

// Crea un entorno de prueba aislado: window === global de ese
// contexto vm (mismo comportamiento que un navegador real), document
// falso con addEventListener/removeEventListener rastreables, y un
// rAF/setInterval falsos cuya cola se controla a mano desde el test
// (sin temporizadores reales, para que los tests sean deterministas
// e instantáneos).
function crearEntorno() {
  const listenersDoc = {};
  const rafPendientes = new Map();
  const intervalos = new Map();
  let rafSeq = 1;
  let intervaloSeq = 1;
  let oculto = false;

  const documentoFalso = {
    get hidden() { return oculto; },
    get visibilityState() { return oculto ? 'hidden' : 'visible'; },
    readyState: 'complete',
    createElement: crearElementoFalso,
    documentElement: crearElementoFalso('html'),
    body: crearElementoFalso('body'),
    addEventListener(tipo, cb) {
      (listenersDoc[tipo] = listenersDoc[tipo] || []).push(cb);
    },
    removeEventListener(tipo, cb) {
      if (!listenersDoc[tipo]) return;
      const i = listenersDoc[tipo].indexOf(cb);
      if (i > -1) listenersDoc[tipo].splice(i, 1);
    },
    _dispararVisibilitychange() {
      (listenersDoc.visibilitychange || []).slice().forEach((cb) => cb());
    },
    _cantidadListeners(tipo) { return (listenersDoc[tipo] || []).length; }
  };

  const sandbox = {};
  sandbox.window = sandbox; // igual que en un navegador real: window === global
  sandbox.document = documentoFalso;
  sandbox.navigator = { hardwareConcurrency: 8, deviceMemory: 8 };
  sandbox.console = console;

  sandbox.requestAnimationFrame = function (cb) {
    const id = rafSeq++;
    rafPendientes.set(id, cb);
    return id;
  };
  sandbox.cancelAnimationFrame = function (id) { rafPendientes.delete(id); };
  sandbox.setInterval = function (fn, ms) {
    const id = intervaloSeq++;
    intervalos.set(id, { fn, ms });
    return id;
  };
  sandbox.clearInterval = function (id) { intervalos.delete(id); };
  sandbox.setTimeout = function () { return 0; }; // no usado por los módulos bajo prueba
  sandbox.clearTimeout = function () {};

  vm.createContext(sandbox);

  return {
    sandbox,
    documentoFalso,
    ocultar() { oculto = true; },
    mostrar() { oculto = false; },
    cantidadFramesPendientes() { return rafPendientes.size; },
    // Ejecuta y remueve el/los callback(s) de rAF actualmente en cola,
    // con la marca de tiempo dada — simula exactamente un frame real.
    dispararFrame(marcaTiempo) {
      const pendientes = Array.from(rafPendientes.entries());
      rafPendientes.clear();
      pendientes.forEach(([, cb]) => cb(marcaTiempo));
    },
    cantidadIntervalosActivos() { return intervalos.size; },
    dispararIntervalo() {
      Array.from(intervalos.values()).forEach((i) => i.fn());
    },
    dispararVisibilitychange() { documentoFalso._dispararVisibilitychange(); },
    cantidadListenersVisibilitychange() { return documentoFalso._cantidadListeners('visibilitychange'); }
  };
}

function cargarModulo(entorno, nombreArchivo) {
  const rutaAbs = path.join(JS_DIR, nombreArchivo);
  const codigo = fs.readFileSync(rutaAbs, 'utf8');
  vm.runInContext(codigo, entorno.sandbox, { filename: rutaAbs });
}

// ── Suite 0: ciclo-vida.js — infraestructura de proyecto (Oportunidad 1) ─
// Módulo nuevo (auditoría, hallazgo "procesos periódicos", 2026-08-05):
// sin dependencias del Ambient Engine, así que se prueba aislado, sin
// cargar ningún otro módulo en el mismo sandbox.

(function suiteCicloVida() {
  const entorno = crearEntorno();
  cargarModulo(entorno, 'ciclo-vida.js');
  const CicloVida = entorno.sandbox.CicloVida;

  afirmar(typeof CicloVida === 'object' && CicloVida !== null, 'ciclo-vida.js expone CicloVida');
  afirmar(
    typeof CicloVida.suscribirVisibilidad === 'function' && typeof CicloVida.programarTareaPeriodica === 'function',
    'ciclo-vida.js expone su API pública (suscribirVisibilidad/programarTareaPeriodica)'
  );

  // ── suscribirVisibilidad: un único listener real de document ──────
  afirmar(entorno.cantidadListenersVisibilitychange() === 0, 'antes de suscribir a nadie, no hay ningún listener de visibilitychange');

  const notificaciones1 = [];
  const desuscribir1 = CicloVida.suscribirVisibilidad((visible) => notificaciones1.push(visible));
  afirmar(entorno.cantidadListenersVisibilitychange() === 1, 'la primera suscripción registra un único listener real de document');

  const notificaciones2 = [];
  CicloVida.suscribirVisibilidad((visible) => notificaciones2.push(visible));
  afirmar(entorno.cantidadListenersVisibilitychange() === 1, 'una segunda suscripción no duplica el listener real de document (comparten el mismo)');

  entorno.ocultar();
  entorno.dispararVisibilitychange();
  afirmar(notificaciones1.length === 1 && notificaciones1[0] === false, 'al ocultar, ambos suscriptores reciben visible=false');
  afirmar(notificaciones2.length === 1 && notificaciones2[0] === false, 'segundo suscriptor también notificado, con el mismo valor');

  entorno.mostrar();
  entorno.dispararVisibilitychange();
  afirmar(notificaciones1.length === 2 && notificaciones1[1] === true, 'al volver a mostrar, notifica visible=true');

  desuscribir1();
  entorno.ocultar();
  entorno.dispararVisibilitychange();
  afirmar(notificaciones1.length === 2, 'tras desuscribirse, ese callback deja de recibir notificaciones');
  afirmar(notificaciones2.length === 3, 'el otro suscriptor, no desuscripto, sigue recibiéndolas');
  entorno.mostrar();
  entorno.dispararVisibilitychange();

  const entornoAislado = crearEntorno();
  cargarModulo(entornoAislado, 'ciclo-vida.js');
  let explotoAlgunaVez = false;
  entornoAislado.sandbox.CicloVida.suscribirVisibilidad(() => { throw new Error('suscriptor roto'); });
  let laOtraCorrio = false;
  entornoAislado.sandbox.CicloVida.suscribirVisibilidad(() => { laOtraCorrio = true; });
  try { entornoAislado.dispararVisibilitychange(); } catch (e) { explotoAlgunaVez = true; }
  afirmar(!explotoAlgunaVez, 'un suscriptor que arroja excepción no se propaga hacia afuera');
  afirmar(laOtraCorrio === true, 'un suscriptor roto no impide que los demás sean notificados');

  // ── programarTareaPeriodica: pausa/reanudación real (clearInterval) ─
  const entornoTarea = crearEntorno();
  cargarModulo(entornoTarea, 'ciclo-vida.js');
  const llamadasTarea = [];
  const cancelar = entornoTarea.sandbox.CicloVida.programarTareaPeriodica(() => llamadasTarea.push(1), 5000);
  afirmar(entornoTarea.cantidadIntervalosActivos() === 1, 'programarTareaPeriodica() con la pestaña visible arranca un único intervalo real');

  entornoTarea.dispararIntervalo();
  afirmar(llamadasTarea.length === 1, 'el intervalo real dispara la función programada');

  entornoTarea.ocultar();
  entornoTarea.dispararVisibilitychange();
  afirmar(entornoTarea.cantidadIntervalosActivos() === 0, 'al ocultar la pestaña, el intervalo se cancela de verdad (clearInterval real, no un no-op)');

  entornoTarea.mostrar();
  entornoTarea.dispararVisibilitychange();
  afirmar(entornoTarea.cantidadIntervalosActivos() === 1, 'al volver a mostrar, se arranca un único intervalo nuevo');

  cancelar();
  afirmar(entornoTarea.cantidadIntervalosActivos() === 0, 'cancelar() detiene el intervalo si estaba activo');
  entornoTarea.mostrar();
  entornoTarea.dispararVisibilitychange();
  afirmar(entornoTarea.cantidadIntervalosActivos() === 0, 'tras cancelar(), un cambio de visibilidad posterior no reinicia la tarea');

  // Arrancar ya oculta: no debe crear un intervalo hasta que aparezca.
  const entornoOculto = crearEntorno();
  entornoOculto.ocultar();
  cargarModulo(entornoOculto, 'ciclo-vida.js');
  entornoOculto.sandbox.CicloVida.programarTareaPeriodica(() => {}, 1000);
  afirmar(entornoOculto.cantidadIntervalosActivos() === 0, 'si la pestaña ya está oculta al programar la tarea, no arranca ningún intervalo todavía');
  entornoOculto.mostrar();
  entornoOculto.dispararVisibilitychange();
  afirmar(entornoOculto.cantidadIntervalosActivos() === 1, 'al aparecer la pestaña, recién ahí arranca el intervalo');
})();

// ── Suite 1: ambiente-clima.js — idempotencia + timers duplicados ──

(function suiteClima() {
  const entorno = crearEntorno();
  cargarModulo(entorno, 'ambiente-clima.js');
  const Clima = entorno.sandbox.AmbienteClima;

  afirmar(typeof Clima === 'object' && Clima !== null, 'ambiente-clima.js expone AmbienteClima');
  afirmar(
    typeof Clima.iniciar === 'function' && typeof Clima.destruir === 'function' &&
    typeof Clima.estaActivo === 'function' && typeof Clima.obtenerActivos === 'function',
    'ambiente-clima.js conserva su API pública (iniciar/destruir/estaActivo/obtenerActivos)'
  );

  Clima.iniciar();
  Clima.iniciar(); // segunda llamada — no debería duplicar nada

  const contenedores = entorno.documentoFalso.body.children.filter((el) => el.id === 'ambient-clima-contenedor');
  afirmar(contenedores.length === 1, 'iniciar() llamado dos veces crea un único #ambient-clima-contenedor');
  afirmar(entorno.cantidadIntervalosActivos() === 1, 'iniciar() llamado dos veces deja un único setInterval de refresco de clima activo');
  afirmar(entorno.cantidadListenersVisibilitychange() === 1, 'iniciar() llamado dos veces registra un único listener de visibilitychange');

  Clima.destruir();
  afirmar(entorno.cantidadIntervalosActivos() === 0, 'destruir() limpia el setInterval de refresco');
  afirmar(entorno.cantidadListenersVisibilitychange() === 0, 'destruir() remueve el listener de visibilitychange');
})();

// ── Suite 2: ambiente-scheduler.js — loop compartido (Etapa 5) ──────
// Dueño único del rAF/visibilitychange permanente desde la Etapa 5.
// Se prueba de forma aislada (sin tareas reales) para separar su
// contrato del de las tareas que se registran en él.

(function suiteScheduler() {
  const entorno = crearEntorno();
  cargarModulo(entorno, 'ambiente-scheduler.js');
  const Scheduler = entorno.sandbox.AmbienteScheduler;

  afirmar(typeof Scheduler === 'object' && Scheduler !== null, 'ambiente-scheduler.js expone AmbienteScheduler');
  afirmar(typeof Scheduler.registrar === 'function', 'ambiente-scheduler.js expone registrar()');

  afirmar(entorno.cantidadFramesPendientes() === 0, 'sin tareas registradas, el loop no arranca solo (nada que correr)');

  const llamadas = [];
  const desregistrar = Scheduler.registrar('tarea-a', (ts) => llamadas.push(ts));
  afirmar(entorno.cantidadFramesPendientes() === 1, 'la primera tarea registrada arranca el loop compartido (un frame en cola)');
  afirmar(entorno.cantidadListenersVisibilitychange() === 1, 'registrar() suscribe un único listener de visibilitychange');

  Scheduler.registrar('tarea-b', () => {});
  afirmar(entorno.cantidadFramesPendientes() === 1, 'una segunda tarea no duplica el rAF (sigue siendo un único loop)');
  afirmar(entorno.cantidadListenersVisibilitychange() === 1, 'una segunda tarea no duplica el listener de visibilitychange');
  afirmar(Scheduler.tareasActivas.length === 2, 'ambas tareas quedan registradas en orden');

  entorno.dispararFrame(1000);
  afirmar(llamadas.length === 1, 'cada frame ejecuta las tareas registradas con el timestamp real');
  afirmar(entorno.cantidadFramesPendientes() === 1, 'con la pestaña visible, el tick reprograma el siguiente frame (ciclo continuo)');

  entorno.ocultar();
  entorno.dispararFrame(1016);
  afirmar(entorno.cantidadFramesPendientes() === 0, 'al ocultar la pestaña, el loop se cancela por completo (cero frames en cola) en vez de seguir reprogramándose');

  entorno.dispararVisibilitychange(); // sigue oculta — no debería reanudar
  afirmar(entorno.cantidadFramesPendientes() === 0, 'un visibilitychange mientras sigue oculta no reanuda el loop');

  entorno.mostrar();
  entorno.dispararVisibilitychange();
  afirmar(entorno.cantidadFramesPendientes() === 1, 'al volver a mostrarse, el loop se reanuda con exactamente un frame nuevo');

  entorno.dispararVisibilitychange();
  afirmar(entorno.cantidadFramesPendientes() === 1, 'un segundo visibilitychange ya visible no agrega un frame adicional (no hay doble reanudación)');

  const llamadasAntes = llamadas.length;
  desregistrar();
  afirmar(Scheduler.tareasActivas.length === 1, 'desregistrar() saca solo la tarea indicada, la otra sigue activa');
  entorno.dispararFrame(2000);
  afirmar(llamadas.length === llamadasAntes, 'una tarea desregistrada deja de recibir frames');

  const entornoAislado = crearEntorno();
  entornoAislado.sandbox.testExplotoAlgunaVez = false;
  cargarModulo(entornoAislado, 'ambiente-scheduler.js');
  entornoAislado.sandbox.AmbienteScheduler.registrar('rota', () => { throw new Error('tarea rota'); });
  let laOtraCorrio = false;
  entornoAislado.sandbox.AmbienteScheduler.registrar('sana', () => { laOtraCorrio = true; });
  entornoAislado.dispararFrame(1000);
  afirmar(laOtraCorrio === true, 'una tarea que arroja excepción no tumba al resto de las tareas del mismo frame');
})();

// ── Suite 3: ambiente-respiracion.js — integración con el scheduler ─
// Etapa 5: este módulo ya no pide su propio rAF, se registra en
// AmbienteScheduler (cargado en el mismo sandbox, mismo orden que en
// el bundle real — ver contract-tests.js).

(function suiteRespiracion() {
  const entorno = crearEntorno();
  cargarModulo(entorno, 'ambiente-scheduler.js');
  cargarModulo(entorno, 'ambiente-respiracion.js');
  const Respiracion = entorno.sandbox.AmbienteRespiracion;
  const Scheduler = entorno.sandbox.AmbienteScheduler;

  afirmar(typeof Respiracion === 'object' && Respiracion !== null, 'ambiente-respiracion.js expone AmbienteRespiracion');
  afirmar(
    typeof Respiracion.iniciar === 'function' && typeof Respiracion.amplitudActual === 'number',
    'ambiente-respiracion.js conserva su API pública (iniciar/amplitudActual)'
  );

  afirmar(Scheduler.tareasActivas.length === 0, 'antes de iniciar(), no hay ninguna tarea registrada en el scheduler');

  Respiracion.iniciar();
  afirmar(Scheduler.tareasActivas.indexOf('respiracion') > -1, 'iniciar() registra la tarea "respiracion" en el scheduler compartido');
  afirmar(entorno.cantidadFramesPendientes() === 1, 'iniciar() arranca el loop compartido (un frame en cola)');

  Respiracion.iniciar(); // segunda llamada — debe ser idempotente
  afirmar(Scheduler.tareasActivas.filter((t) => t === 'respiracion').length === 1, 'una segunda llamada a iniciar() no duplica el registro en el scheduler');

  // Sin AmbienteScheduler disponible, iniciar() debe degradarse
  // fail-open (Cap. 1.4) en vez de reintroducir un rAF propio.
  const entornoSinScheduler = crearEntorno();
  cargarModulo(entornoSinScheduler, 'ambiente-respiracion.js');
  entornoSinScheduler.sandbox.AmbienteRespiracion.iniciar();
  afirmar(entornoSinScheduler.cantidadFramesPendientes() === 0, 'sin AmbienteScheduler cargado, iniciar() se degrada fail-open (no reintroduce un rAF propio)');

  // Gap-detection: un salto de tiempo grande (equivalente a la
  // pestaña habiendo estado oculta) no debe acumular fase de golpe —
  // el primer tick tras el salto solo fija la marca, no avanza el
  // ciclo (ver comentario de tick() en ambiente-respiracion.js).
  entorno.dispararFrame(1000);
  const amplitudTrasPrimerFrame = Respiracion.amplitudActual;
  entorno.dispararFrame(1000 + 5000); // salto > GAP_RESET_MS (500ms)
  afirmar(Respiracion.amplitudActual === amplitudTrasPrimerFrame, 'un salto de timestamp mayor al umbral no hace avanzar el ciclo de golpe (gap-detection)');
})();

// ── Suite 4: ambiente-rendimiento.js — integración con el scheduler ─
// Etapa 5: igual que respiracion, se registra en AmbienteScheduler en
// vez de pedir su propio rAF. Además se prueba junto con respiracion
// en el MISMO scheduler, para verificar que dos tareas reales
// comparten un único loop sin pisarse (el caso real en producción:
// ambos módulos conviven en la misma página).

(function suiteRendimiento() {
  const entorno = crearEntorno();
  cargarModulo(entorno, 'ambiente-scheduler.js');
  cargarModulo(entorno, 'ambiente-rendimiento.js'); // se auto-inicia al cargar
  const Rendimiento = entorno.sandbox.AmbienteRendimiento;
  const Scheduler = entorno.sandbox.AmbienteScheduler;

  afirmar(typeof Rendimiento === 'object' && Rendimiento !== null, 'ambiente-rendimiento.js expone AmbienteRendimiento');
  afirmar(
    typeof Rendimiento.iniciar === 'function' && typeof Rendimiento.detener === 'function' &&
    typeof Rendimiento.suscribir === 'function' && typeof Rendimiento.restricciones === 'function',
    'ambiente-rendimiento.js conserva su API pública (iniciar/detener/suscribir/restricciones)'
  );

  // El módulo se auto-inicia al cargarse (última línea del archivo:
  // api.iniciar()) — ya debería estar registrado en el scheduler.
  afirmar(Scheduler.tareasActivas.indexOf('rendimiento') > -1, 'ambiente-rendimiento.js se auto-registra en el scheduler al cargar');
  afirmar(entorno.cantidadFramesPendientes() === 1, 'la auto-inicialización arranca el loop compartido (un frame en cola)');

  Rendimiento.iniciar(); // segunda llamada explícita — idempotente
  afirmar(Scheduler.tareasActivas.filter((t) => t === 'rendimiento').length === 1, 'una segunda llamada a iniciar() no duplica el registro en el scheduler');
  afirmar(entorno.cantidadListenersVisibilitychange() === 1, 'un único listener de visibilitychange (propiedad del scheduler compartido, no del módulo)');

  // Se registra también respiracion en el MISMO scheduler: el caso
  // real de producción, ambos módulos activos a la vez.
  cargarModulo(entorno, 'ambiente-respiracion.js');
  entorno.sandbox.AmbienteRespiracion.iniciar();
  afirmar(Scheduler.tareasActivas.length === 2, 'rendimiento y respiracion conviven como dos tareas separadas en el mismo scheduler');
  afirmar(entorno.cantidadFramesPendientes() === 1, 'dos tareas activas siguen compartiendo un único rAF (no uno por tarea)');

  entorno.ocultar();
  entorno.dispararFrame(1000);
  afirmar(entorno.cantidadFramesPendientes() === 0, 'al ocultar, el loop compartido se cancela por completo (cero frames en cola) — afecta a ambas tareas por igual');

  entorno.mostrar();
  entorno.dispararVisibilitychange();
  afirmar(entorno.cantidadFramesPendientes() === 1, 'al volver a mostrarse, el loop se reanuda con un único frame nuevo para ambas tareas');

  // Ciclo detener()/iniciar() repetido — no debe acumular registros.
  Rendimiento.detener();
  afirmar(Scheduler.tareasActivas.indexOf('rendimiento') === -1, 'detener() desregistra la tarea del scheduler');
  afirmar(Scheduler.tareasActivas.length === 1, 'detener() de una tarea no afecta a la otra tarea activa (respiracion sigue registrada)');
  Rendimiento.iniciar();
  Rendimiento.detener();
  Rendimiento.iniciar();
  afirmar(Scheduler.tareasActivas.filter((t) => t === 'rendimiento').length === 1, 'ciclos repetidos de detener()/iniciar() no acumulan registros duplicados');
  afirmar(entorno.cantidadListenersVisibilitychange() === 1, 'ciclos repetidos de detener()/iniciar() no acumulan listeners de visibilitychange');
})();

// ── Suite 5: ambiente-orquestador.js — guarda de nivel superior ─────

(function suiteOrquestador() {
  const entorno = crearEntorno();

  // Stub mínimo de AmbienteEstados: lo único que ambiente-orquestador.js
  // necesita para no abortar (Cap. 1.4: "aborta silenciosamente si la
  // máquina de estados no existe").
  const listenersCambio = [];
  entorno.sandbox.AmbienteEstados = {
    on(evento, cb) { if (evento === 'cambio') listenersCambio.push(cb); },
    actual() { return 'activo'; },
    iniciarCarga() {}, finalizarCarga() {}, entrarFoco() {}, salirFoco() {}, reintentar() {}
  };

  cargarModulo(entorno, 'ambiente-orquestador.js');
  const Engine = entorno.sandbox.AmbientEngine;

  afirmar(typeof Engine === 'object' && Engine !== null, 'ambiente-orquestador.js expone AmbientEngine');
  afirmar(
    typeof Engine.iniciar === 'function' && typeof Engine.setEscena === 'function' &&
    typeof Engine.iniciarCarga === 'function' && typeof Engine.finalizarCarga === 'function' &&
    typeof Engine.entrarFoco === 'function' && typeof Engine.salirFoco === 'function' &&
    typeof Engine.reintentar === 'function',
    'ambiente-orquestador.js conserva su API pública (iniciar/setEscena/iniciarCarga/finalizarCarga/entrarFoco/salirFoco/reintentar)'
  );

  // El script ya se auto-inicia al cargar (document.readyState ===
  // 'complete' en nuestro entorno falso) — ya debería existir 1 listener.
  afirmar(listenersCambio.length === 1, 'la auto-inicialización al cargar registra un único listener AmbienteEstados.on("cambio")');

  Engine.iniciar(); // segunda llamada explícita — no debería duplicar nada
  Engine.iniciar(); // tercera, por si acaso
  afirmar(listenersCambio.length === 1, 'llamadas repetidas a iniciar() no duplican el listener AmbienteEstados.on("cambio")');
})();

console.log('');
console.log(`${total - fallos}/${total} pruebas de ciclo de vida OK`);
if (fallos > 0) {
  console.error(`${fallos} prueba(s) de ciclo de vida FALLARON.`);
  process.exit(1);
}
process.exit(0);

