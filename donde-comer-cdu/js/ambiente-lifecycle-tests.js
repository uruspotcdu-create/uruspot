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
// Qué verifica (Fase 6, auditoría §7 "tests"):
//   1. Inicialización idempotente (ambiente-clima.js, ambiente-
//      rendimiento.js) — una segunda llamada a iniciar() no debe
//      duplicar contenedores DOM, suscripciones ni listeners.
//   2. Ausencia de timers duplicados (ambiente-clima.js): iniciar()
//      llamado dos veces deja exactamente un setInterval activo.
//   3. Pausa/reanudación real de rAF ante ocultamiento de pestaña
//      (ambiente-respiracion.js, ambiente-rendimiento.js): al ocultar,
//      el ciclo se cancela por completo (cero frames pendientes) en
//      vez de seguir reprogramándose; al volver a mostrar, se reanuda
//      exactamente una vez.
//   4. Ausencia de listeners duplicados de visibilitychange tras
//      ciclos repetidos de iniciar()/detener() (ambiente-rendimiento.js).
//   5. No regresión de la API pública: cada módulo sigue exponiendo
//      los mismos métodos que antes de la Fase 6.
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

// ── Suite 2: ambiente-respiracion.js — pausa/reanudación real de rAF ─

(function suiteRespiracion() {
  const entorno = crearEntorno();
  cargarModulo(entorno, 'ambiente-respiracion.js');
  const Respiracion = entorno.sandbox.AmbienteRespiracion;

  afirmar(typeof Respiracion === 'object' && Respiracion !== null, 'ambiente-respiracion.js expone AmbienteRespiracion');
  afirmar(
    typeof Respiracion.iniciar === 'function' && typeof Respiracion.amplitudActual === 'number',
    'ambiente-respiracion.js conserva su API pública (iniciar/amplitudActual)'
  );

  Respiracion.iniciar();
  afirmar(entorno.cantidadFramesPendientes() === 1, 'iniciar() deja exactamente un frame en cola');

  entorno.dispararFrame(1000);
  afirmar(entorno.cantidadFramesPendientes() === 1, 'con la pestaña visible, cada frame reprograma el siguiente (ciclo continuo)');

  entorno.ocultar();
  entorno.dispararFrame(1016);
  afirmar(entorno.cantidadFramesPendientes() === 0, 'al ocultar la pestaña, el ciclo se cancela por completo (cero frames en cola) en vez de seguir reprogramándose');

  entorno.dispararVisibilitychange(); // sigue oculta — no debería reanudar
  afirmar(entorno.cantidadFramesPendientes() === 0, 'un visibilitychange mientras sigue oculta no reanuda el ciclo');

  entorno.mostrar();
  entorno.dispararVisibilitychange();
  afirmar(entorno.cantidadFramesPendientes() === 1, 'al volver a mostrarse, el ciclo se reanuda con exactamente un frame nuevo');

  entorno.dispararVisibilitychange();
  afirmar(entorno.cantidadFramesPendientes() === 1, 'un segundo visibilitychange ya visible no agrega un frame adicional (no hay doble reanudación)');
})();

// ── Suite 3: ambiente-rendimiento.js — pausa/reanudación + listeners ─

(function suiteRendimiento() {
  const entorno = crearEntorno();
  cargarModulo(entorno, 'ambiente-rendimiento.js');
  const Rendimiento = entorno.sandbox.AmbienteRendimiento;

  afirmar(typeof Rendimiento === 'object' && Rendimiento !== null, 'ambiente-rendimiento.js expone AmbienteRendimiento');
  afirmar(
    typeof Rendimiento.iniciar === 'function' && typeof Rendimiento.detener === 'function' &&
    typeof Rendimiento.suscribir === 'function' && typeof Rendimiento.restricciones === 'function',
    'ambiente-rendimiento.js conserva su API pública (iniciar/detener/suscribir/restricciones)'
  );

  // El módulo se auto-inicia al cargarse (última línea del archivo:
  // api.iniciar()) — ya debería haber un frame en cola.
  afirmar(entorno.cantidadFramesPendientes() === 1, 'ambiente-rendimiento.js se auto-inicia al cargar (un frame en cola)');

  Rendimiento.iniciar(); // segunda llamada explícita — idempotente
  afirmar(entorno.cantidadFramesPendientes() === 1, 'una segunda llamada a iniciar() no agrega un frame adicional');
  afirmar(entorno.cantidadListenersVisibilitychange() === 1, 'un único listener de visibilitychange tras múltiples llamadas a iniciar()');

  entorno.ocultar();
  entorno.dispararFrame(1000);
  afirmar(entorno.cantidadFramesPendientes() === 0, 'al ocultar, el muestreo de FPS cancela el ciclo por completo (cero frames en cola)');

  entorno.mostrar();
  entorno.dispararVisibilitychange();
  afirmar(entorno.cantidadFramesPendientes() === 1, 'al volver a mostrarse, el muestreo de FPS se reanuda con un único frame nuevo');

  // Ciclo detener()/iniciar() repetido — no debe acumular listeners.
  Rendimiento.detener();
  afirmar(entorno.cantidadFramesPendientes() === 0, 'detener() cancela el frame en cola');
  Rendimiento.iniciar();
  Rendimiento.detener();
  Rendimiento.iniciar();
  afirmar(entorno.cantidadListenersVisibilitychange() === 1, 'ciclos repetidos de detener()/iniciar() no acumulan listeners de visibilitychange');
})();

// ── Suite 4: ambiente-orquestador.js — guarda de nivel superior ─────

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
