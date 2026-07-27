// js/coreografias-tests.js — URU SPOT
// ---------------------------------------------------------------------
// Motion Direction Bible v2.0, Parte M.2 — suite hermana de
// ambiente-lifecycle-tests.js (mismo patrón: node, sin navegador, vm
// para ejecutar el código fuente real de los módulos bajo prueba).
// Corrible con `node js/coreografias-tests.js`.
//
// Verifica exactamente la lista de la Parte M.2:
//   1. Regla de combinación de AmbienteGramatica.
//   2. Regla de fatiga de AmbienteRitmo (vía Coreografias.resolver).
//   3. Regla de contraste posterior.
//   4. Precedencia de accesibilidad — duraciones <=150ms bajo
//      reducirMovimiento, incluida la superficie de coreografias.js.
//   5. Reentrada de cambio de filtro — Coreografias.cambioFiltro no
//      deja dos coreografías de salida corriendo a la vez sobre el
//      mismo panel.
//   6. Unificación del timeout de carga (AmbienteConfig.UMBRALES.
//      timeoutCargaMs y js/failsafe-reintentar.js apuntan al mismo
//      número, ahora por la misma fuente).
//   7. Activación de escena 'sinResultados' desde
//      Coreografias.activarEscenaPorRama().
//   8. Regresión de slugs de View Transitions contra los locales
//      reales del catálogo (js/locales-slug.js + carpetas locales/).
//   9. No-regresión: coreografias.js no registra listeners/timers
//      propios de ciclo de vida (es una librería de funciones puras +
//      helpers fail-open, a diferencia de los módulos ambiente-* que
//      sí tienen iniciar()/detener() — se verifica explícitamente que
//      NO expone ese patrón, para que quede documentado por qué este
//      archivo no repite el test de idempotencia de iniciar().
//
// Sale con código 0 si todo pasa, 1 si algo falla.

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = __dirname;
const ROOT = JS_DIR.replace(/[/\\]js$/, '');

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

// ── Entorno vm mínimo: window === global del contexto, igual criterio
//    que ambiente-lifecycle-tests.js. Acá además se necesita un DOM
//    lo bastante real como para que Coreografias.cambioFiltro() pueda
//    agregar clases, fijar --mov-salida y escuchar transitionend.
function crearElementoFalso() {
  const listeners = {};
  return {
    className: '',
    style: {
      _props: {},
      setProperty(k, v) { this._props[k] = v; }
    },
    classList: {
      _set: new Set(),
      add(...clases) { clases.forEach((c) => this._set.add(c)); },
      remove(...clases) { clases.forEach((c) => this._set.delete(c)); },
      contains(c) { return this._set.has(c); }
    },
    addEventListener(tipo, cb, opts) {
      (listeners[tipo] = listeners[tipo] || []).push({ cb, once: !!(opts && opts.once) });
    },
    _disparar(tipo) {
      (listeners[tipo] || []).slice().forEach((l) => l.cb());
      if (listeners[tipo]) listeners[tipo] = listeners[tipo].filter((l) => !l.once);
    },
    _cantidadListeners(tipo) { return (listeners[tipo] || []).length; }
  };
}

function crearEntorno() {
  const timers = new Map();
  let timerSeq = 1;

  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.console = console;
  sandbox.navigator = { hardwareConcurrency: 8, deviceMemory: 8 };
  sandbox.document = {
    referrer: '',
    createElement: crearElementoFalso
  };

  // matchMedia falso: por defecto "no reduce" — cada suite lo
  // sobreescribe si necesita simular la preferencia de sistema activa.
  sandbox.matchMedia = function () {
    return { matches: false, addEventListener() {}, addListener() {} };
  };

  sandbox.setTimeout = function (fn, ms) {
    const id = timerSeq++;
    timers.set(id, { fn, ms });
    return id;
  };
  sandbox.clearTimeout = function (id) { timers.delete(id); };

  vm.createContext(sandbox);

  return {
    sandbox,
    crearElementoFalso,
    // Ejecuta todos los timers pendientes en orden de registro — sin
    // reloj real, determinista, igual criterio que dispararFrame() en
    // ambiente-lifecycle-tests.js.
    dispararTimers() {
      const pendientes = Array.from(timers.values());
      timers.clear();
      pendientes.forEach((t) => t.fn());
    },
    cantidadTimersPendientes() { return timers.size; }
  };
}

function cargarModulo(entorno, nombreArchivo) {
  const rutaAbs = path.join(JS_DIR, nombreArchivo);
  const codigo = fs.readFileSync(rutaAbs, 'utf8');
  vm.runInContext(codigo, entorno.sandbox, { filename: rutaAbs });
}

// Carga el stack completo real que Coreografias necesita, en el mismo
// orden que index.html: config -> accesibilidad -> gramática -> ritmo
// -> coreografias.
function cargarStackCompleto(entorno) {
  cargarModulo(entorno, 'ambiente-config.js');
  cargarModulo(entorno, 'ambiente-accesibilidad.js');
  cargarModulo(entorno, 'ambiente-gramatica.js');
  cargarModulo(entorno, 'ambiente-ritmo.js');
  cargarModulo(entorno, 'coreografias.js');
}

// ── Suite 1: regla de combinación de AmbienteGramatica ─────────────

(function suiteGramatica() {
  const entorno = crearEntorno();
  cargarModulo(entorno, 'ambiente-gramatica.js');
  const G = entorno.sandbox.AmbienteGramatica;

  afirmar(typeof G === 'object' && G !== null, 'ambiente-gramatica.js expone AmbienteGramatica');

  const tresVerbos = G.validarCombinacion(['acercarse', 'rotar', 'respirar']);
  afirmar(tresVerbos.valido === false, "validarCombinacion(['acercarse','rotar','respirar']) es inválida (más de dos verbos)");

  const desvanecerYRotar = G.validarCombinacion(['desvanecerse', 'rotar']);
  afirmar(desvanecerYRotar.valido === true, "validarCombinacion(['desvanecerse','rotar']) es válida (incluye desvanecerse)");

  const acercarseAlejarseSinOpacidad = G.validarCombinacion(['acercarse', 'alejarse'], false);
  afirmar(acercarseAlejarseSinOpacidad.valido === false, "validarCombinacion(['acercarse','alejarse'], incluyeOpacidad:false) es inválida");

  const acercarseConOpacidad = G.validarCombinacion(['acercarse'], true);
  afirmar(acercarseConOpacidad.valido === true, 'un solo verbo válido siempre es una combinación válida');

  afirmar(G.validarRotar('indicador-expansion-colapso') === true, "validarRotar admite 'indicador-expansion-colapso'");
  afirmar(G.validarRotar('giro-decorativo') === false, "validarRotar rechaza usos no declarados (anti-patrón Cap. 14)");
})();

// ── Suite 2/3: fatiga y contraste posterior de AmbienteRitmo, vía
//    Coreografias.resolver() (la superficie que la interfaz real usa) ─

(function suiteRitmoFatigaYContraste() {
  const entorno = crearEntorno();
  cargarStackCompleto(entorno);
  const C = entorno.sandbox.Coreografias;

  afirmar(typeof C === 'object' && C !== null, 'coreografias.js expone Coreografias');

  // Fatiga: misma claveAccion, 3 llamadas.
  const r1 = C.resolver('conversacional', 'filtro:rubro');
  const r2 = C.resolver('conversacional', 'filtro:rubro');
  const r3 = C.resolver('conversacional', 'filtro:rubro');
  afirmar(r1.registro === 'conversacional', '1ª llamada a filtro:rubro devuelve registro conversacional');
  afirmar(r2.registro === 'inmediato', '2ª llamada a la misma claveAccion se degrada a inmediato (fatiga)');
  afirmar(r3.registro === 'inmediato', '3ª llamada a la misma claveAccion sigue en inmediato');

  // Contraste posterior: dos contemplativos consecutivos con claves
  // DISTINTAS (para no confundir con la regla de fatiga de arriba).
  const entorno2 = crearEntorno();
  cargarStackCompleto(entorno2);
  const C2 = entorno2.sandbox.Coreografias;
  const x = C2.resolver('contemplativo', 'escena:x');
  const y = C2.resolver('contemplativo', 'escena:y');
  afirmar(x.registro === 'contemplativo', 'primer contemplativo de la sesión se mantiene contemplativo');
  afirmar(y.registro === 'conversacional', 'un segundo contemplativo consecutivo (clave distinta) se degrada a conversacional');
})();

// ── Suite 4: precedencia de accesibilidad ───────────────────────────

(function suiteAccesibilidadPrecedencia() {
  const entorno = crearEntorno();
  // Preferencia de sistema activa desde el arranque (antes de cargar
  // ambiente-accesibilidad.js, que la lee al definirse el módulo).
  entorno.sandbox.matchMedia = function () {
    return { matches: true, addEventListener() {}, addListener() {} };
  };
  cargarStackCompleto(entorno);
  const C = entorno.sandbox.Coreografias;
  const A = entorno.sandbox.AmbienteAccesibilidad;

  afirmar(A.reducirMovimiento === true, 'AmbienteAccesibilidad detecta la preferencia de sistema activa');
  afirmar(C.reducirMovimiento() === true, 'Coreografias.reducirMovimiento() refleja la misma señal');

  const contemplativo = C.resolver('contemplativo', 'test:accesibilidad-contemplativo');
  const conversacional = C.resolver('conversacional', 'test:accesibilidad-conversacional');
  afirmar(contemplativo.duracionMs <= 150, 'bajo reducirMovimiento, duración contemplativo <= 150ms');
  afirmar(conversacional.duracionMs <= 150, 'bajo reducirMovimiento, duración conversacional <= 150ms');

  // Precedencia también verificada también con AmbienteAccesibilidad
  // manual en false: nunca debe poder anular una señal de sistema real
  // (Cap. 3.11 / A.7 de la Bible).
  A.establecerPreferenciaManual(false);
  afirmar(A.reducirMovimiento === true, 'una preferencia manual en false NUNCA anula la señal real de sistema operativo');
})();

// ── Suite 5: reentrada de cambio de filtro ──────────────────────────

(function suiteReentradaFiltro() {
  const entorno = crearEntorno();
  cargarStackCompleto(entorno);
  const C = entorno.sandbox.Coreografias;

  const el1 = entorno.crearElementoFalso();
  const el2 = entorno.crearElementoFalso();
  let corridasDeRender = 0;
  const render = function () { corridasDeRender++; };

  // 1ª corrida: registro conversacional (primera vez en la sesión) —
  // debe animar salida y esperar a transitionend/timeout, NUNCA
  // renderizar de forma síncrona.
  C.cambioFiltro([el1, el2], render);
  afirmar(corridasDeRender === 0, '1ª corrida de cambioFiltro no renderiza de forma síncrona (anima la salida primero)');
  afirmar(el1.classList.contains('u-mov-saliendo'), '1ª corrida marca los nodos salientes con u-mov-saliendo');

  // Reentrada: un segundo cambio de filtro mientras el primero seguía
  // en curso (transitionend de el1 nunca disparó). La claveAccion
  // 'filtro:rubro' ya lleva 2 llamadas acumuladas -> AmbienteRitmo
  // fuerza inmediato -> Coreografias.cambioFiltro debe renderizar de
  // inmediato en la 2ª corrida, SIN dejar una segunda coreografía de
  // salida corriendo en paralelo sobre el panel.
  const el3 = entorno.crearElementoFalso();
  C.cambioFiltro([el3], render);
  afirmar(corridasDeRender === 1, 'la reentrada (2ª corrida, misma claveAccion) renderiza de inmediato por la regla de fatiga — sin necesitar una guarda de reentrada aparte');

  // El transitionend tardío de la 1ª corrida, si llega, no debe volver
  // a renderizar una segunda vez (guarda yaRenderizo por corrida).
  el1._disparar('transitionend');
  afirmar(corridasDeRender === 1, 'un transitionend tardío de una coreografía de salida ya abandonada no dispara un render adicional');
})();

// ── Suite 6: unificación del timeout de carga ───────────────────────

(function suiteUnificacionTimeoutCarga() {
  const entorno = crearEntorno();
  cargarModulo(entorno, 'ambiente-config.js');
  const cfg = entorno.sandbox.AmbienteConfig;

  afirmar(cfg.UMBRALES.timeoutCargaMs === 12000, 'AmbienteConfig.UMBRALES.timeoutCargaMs quedó unificado en 12000');

  const failsafeSrc = fs.readFileSync(path.join(JS_DIR, 'failsafe-reintentar.js'), 'utf8');
  afirmar(
    failsafeSrc.includes('AmbienteConfig.UMBRALES.timeoutCargaMs'),
    'failsafe-reintentar.js lee AmbienteConfig.UMBRALES.timeoutCargaMs en vez de un literal propio'
  );
})();

// ── Suite 7: activación de escena 'sinResultados' ───────────────────

(function suiteEscenaSinResultados() {
  const entorno = crearEntorno();
  cargarStackCompleto(entorno);
  const C = entorno.sandbox.Coreografias;

  const escenasActivadas = [];
  entorno.sandbox.AmbientEngine = {
    setEscena(nombre) { escenasActivadas.push(nombre); }
  };

  C.activarEscenaPorRama('buscador', 0);
  afirmar(escenasActivadas[0] === 'sinResultados', "activarEscenaPorRama(rama, 0) activa la escena 'sinResultados' sin importar la rama");

  C.activarEscenaPorRama('buscador', 12);
  afirmar(escenasActivadas[1] === 'buscando', "con resultados y rama 'buscador', activa la escena 'buscando'");

  C.activarEscenaPorRama('recorte:guia', 5);
  afirmar(escenasActivadas[2] === 'explorando', "con resultados y rama de recorte/curaduría, activa la escena 'explorando'");

  C.activarEscenaPorRama('recorte:guia', 5);
  afirmar(escenasActivadas.length === 3, 'activar la misma escena de nuevo no relanza una transición redundante');
})();

// ── Suite 8: regresión de slugs de View Transitions contra el
//    catálogo real de locales/ ──────────────────────────────────────

(function suiteRegresionSlugsFichas() {
  const slugsSrc = fs.readFileSync(path.join(JS_DIR, 'locales-slug.js'), 'utf8');
  const mapa = {};
  const re = /"([\w-]+)"\s*:\s*"([\w-]+)"/g;
  let m;
  while ((m = re.exec(slugsSrc)) !== null) {
    mapa[m[1]] = m[2];
  }

  const slugs = Object.keys(mapa).map((id) => mapa[id]);
  afirmar(slugs.length > 0, 'js/locales-slug.js expone al menos un slug real para verificar');

  let faltantes = 0;
  let sinFichaJs = 0;
  slugs.forEach((slugLugar) => {
    const dir = path.join(ROOT, 'locales', slugLugar);
    const htmlPath = path.join(dir, 'index.html');
    if (!fs.existsSync(htmlPath)) {
      faltantes++;
      console.log(`  ✗ locales/${slugLugar}/index.html no existe (slug huérfano en locales-slug.js)`);
      return;
    }
    const html = fs.readFileSync(htmlPath, 'utf8');
    if (!/src=["']\.\.\/ficha\.js["']/.test(html)) {
      sinFichaJs++;
      console.log(`  ✗ locales/${slugLugar}/index.html no carga ../ficha.js`);
    }
  });

  afirmar(faltantes === 0, `los ${slugs.length} slugs de locales-slug.js tienen su carpeta locales/<slug>/index.html real`);
  afirmar(sinFichaJs === 0, 'todas las fichas reales cargan ../ficha.js (contraparte de la view-transition-name del lado tarjeta)');
})();

// ── Suite 9: coreografias.js no tiene ciclo de vida propio ──────────

(function suiteSinCicloDeVidaPropio() {
  const entorno = crearEntorno();
  cargarStackCompleto(entorno);
  const C = entorno.sandbox.Coreografias;

  // A diferencia de los módulos ambiente-* (que sí tienen iniciar()/
  // detener() y necesitan test de idempotencia, ver ambiente-lifecycle-
  // tests.js), coreografias.js es deliberadamente una librería de
  // funciones — no registra listeners ni timers propios al cargarse,
  // así que no hay estado de ciclo de vida que pueda duplicarse entre
  // llamadas. Se verifica explícitamente para que quede documentado
  // (y para que una futura adición de estado global lo note acá).
  afirmar(typeof C.iniciar !== 'function' && typeof C.detener !== 'function',
    'coreografias.js no expone iniciar()/detener() — no tiene ciclo de vida propio que testear');
  afirmar(entorno.cantidadTimersPendientes() === 0,
    'cargar coreografias.js no deja ningún timer pendiente por su cuenta (sin efectos secundarios al importar)');
})();

console.log('');
console.log(`${total - fallos}/${total} pruebas de coreografías OK`);
if (fallos > 0) {
  console.error(`${fallos} prueba(s) de coreografías FALLARON.`);
  process.exit(1);
}
process.exit(0);
