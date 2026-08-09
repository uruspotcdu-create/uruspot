/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-brujulitas.js
   Fase 3: familia "Brújula" (Cap. 2.1, familia 3) — variante
   "brujulitas": varias copias chicas del mismo asset 'brujula' (Cap.
   8.1), girando y rebotando por todo el viewport, estilo "logo de
   DVD". Mismo asset, mismo Asset Registry, mismo plano P2 que
   ambiente-brujula.js — la diferencia es que esta familia inserta N
   instancias en vez de una sola, y las anima con un loop propio en
   vez de con la oscilación estática de ambiente-tokens-movimiento.css
   (Cap. 5 permite hasta 2 ejes de movimiento por familia; acá el eje
   es "traslación + rotación" del ícono completo, no aro/aguja por
   separado).

   Reemplaza a los dos anillos de resplandor que vivían en
   .ambiente-plano--p2::before/::after (ver css/ambiente-planos.css) —
   esos anillos eran puramente decorativos (glow radial, sin ninguna
   función de orientación ni de interfaz) y se sacaron a pedido
   explícito, a favor de este movimiento.

   Solo transform (translate3d + rotate), nunca top/left (Cap. 9.1:
   jamás disparar reflow) — la posición de cada instancia vive en
   estado JS, no en el DOM, y se vuelca a transform en cada frame.

   Respeta prefers-reduced-motion (Cap. 9.5, Accessibility Manager): si
   está activo, las brujulitas se insertan quietas, en su posición
   inicial, sin loop de animación — igual criterio que el resto del
   Ambient Engine (ningún subsistema anima nada bajo reducirMovimiento).
   También se pausa el loop cuando la pestaña no está visible
   (document.hidden), para no gastar ciclos de rAF de más en una
   pestaña en segundo plano.

   Debe cargarse después de ambiente-planos.js, ambiente-assets.js y
   ambiente-accesibilidad.js — mismo requisito que ambiente-brujula.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ID_ASSET = 'brujula';

  // "Varias, chiquitas, muy chiquitas" — cantidad y rango de tamaño a
  // propósito bajos: son un detalle de fondo, nunca deberían competir
  // visualmente con la Brújula grande ni con el contenido real.
  var CANTIDAD = 12;
  var TAMANO_MIN_PX = 14;
  var TAMANO_MAX_PX = 30;
  var OPACIDAD_MIN = 0.22;
  var OPACIDAD_MAX = 0.5;

  // Velocidad en píxeles por milisegundo y giro en grados por
  // milisegundo — rangos chicos para que se lean como "deriva", no
  // como algo errático.
  var VELOCIDAD_MIN = 0.014;
  var VELOCIDAD_MAX = 0.05;
  var GIRO_MIN = 0.02;
  var GIRO_MAX = 0.075;

  var insertado = false;
  var instancias = [];
  var frameId = null;
  var ultimoTs = null;
  var pausadoPorVisibilidad = false;

  function accesibilidad() { return global.AmbienteAccesibilidad || null; }
  function reducido() {
    var a = accesibilidad();
    return !!(a && a.reducirMovimiento);
  }

  function aleatorioEntre(min, max) { return min + Math.random() * (max - min); }
  function signoAleatorio() { return Math.random() < 0.5 ? -1 : 1; }

  function crearInstancia(markupSvg, anchoViewport, altoViewport) {
    var envoltorio = document.createElement('div');
    envoltorio.innerHTML = markupSvg;
    var svg = envoltorio.querySelector('svg');
    if (!svg) return null;

    var tamano = aleatorioEntre(TAMANO_MIN_PX, TAMANO_MAX_PX);

    // Estilos propios de esta instancia, en línea: siempre ganan por
    // sobre la regla .amb-asset--brujula de css/ambiente-planos.css
    // (pensada para la Brújula grande centrada), sin necesitar tocar
    // ni duplicar esa regla. El resto del <svg> (aro/marcas/aguja,
    // color, relleno) queda intacto — es el mismo asset, "exactamente
    // igual" al de fondo, solo que chico.
    svg.classList.add('amb-brujulita');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = tamano + 'px';
    svg.style.height = tamano + 'px';
    svg.style.opacity = String(aleatorioEntre(OPACIDAD_MIN, OPACIDAD_MAX));
    svg.style.willChange = 'transform';

    var x = aleatorioEntre(0, Math.max(1, anchoViewport - tamano));
    var y = aleatorioEntre(0, Math.max(1, altoViewport - tamano));

    return {
      el: svg,
      tamano: tamano,
      x: x,
      y: y,
      vx: signoAleatorio() * aleatorioEntre(VELOCIDAD_MIN, VELOCIDAD_MAX),
      vy: signoAleatorio() * aleatorioEntre(VELOCIDAD_MIN, VELOCIDAD_MAX),
      angulo: aleatorioEntre(0, 360),
      giro: signoAleatorio() * aleatorioEntre(GIRO_MIN, GIRO_MAX)
    };
  }

  function pintar(instancia) {
    instancia.el.style.transform =
      'translate3d(' + instancia.x.toFixed(1) + 'px,' + instancia.y.toFixed(1) + 'px,0) ' +
      'rotate(' + instancia.angulo.toFixed(1) + 'deg)';
  }

  function avanzar(deltaMs, anchoViewport, altoViewport) {
    for (var i = 0; i < instancias.length; i++) {
      var inst = instancias[i];
      inst.x += inst.vx * deltaMs;
      inst.y += inst.vy * deltaMs;
      inst.angulo = (inst.angulo + inst.giro * deltaMs) % 360;

      // Rebote estilo "logo de DVD": al tocar un borde del viewport,
      // se clampea la posición a ese borde y se invierte el signo de
      // la velocidad en ese eje — nunca se sale de pantalla.
      var limiteX = Math.max(1, anchoViewport - inst.tamano);
      var limiteY = Math.max(1, altoViewport - inst.tamano);
      if (inst.x <= 0) { inst.x = 0; inst.vx = Math.abs(inst.vx); }
      else if (inst.x >= limiteX) { inst.x = limiteX; inst.vx = -Math.abs(inst.vx); }
      if (inst.y <= 0) { inst.y = 0; inst.vy = Math.abs(inst.vy); }
      else if (inst.y >= limiteY) { inst.y = limiteY; inst.vy = -Math.abs(inst.vy); }

      pintar(inst);
    }
  }

  function loop(ts) {
    if (pausadoPorVisibilidad || reducido()) { frameId = null; ultimoTs = null; return; }
    if (ultimoTs === null) ultimoTs = ts;
    var deltaMs = Math.min(ts - ultimoTs, 100); // tope: un tab que vuelve de segundo plano no "salta" de golpe
    ultimoTs = ts;
    avanzar(deltaMs, global.innerWidth, global.innerHeight);
    frameId = global.requestAnimationFrame(loop);
  }

  function iniciarLoopSiCorresponde() {
    if (reducido() || pausadoPorVisibilidad || !instancias.length) return;
    if (frameId !== null) return;
    ultimoTs = null;
    frameId = global.requestAnimationFrame(loop);
  }

  function detenerLoop() {
    if (frameId !== null) {
      global.cancelAnimationFrame(frameId);
      frameId = null;
    }
    ultimoTs = null;
  }

  function alCambiarVisibilidad() {
    pausadoPorVisibilidad = !!document.hidden;
    if (pausadoPorVisibilidad) detenerLoop();
    else iniciarLoopSiCorresponde();
  }

  function insertarEnPlano(markupSvg) {
    if (insertado || !markupSvg) return;
    var planos = global.AmbientePlanos;
    var contenedor = planos ? planos.contenedor('p2') : null;
    if (!contenedor) return;

    insertado = true;

    var anchoViewport = global.innerWidth;
    var altoViewport = global.innerHeight;

    for (var i = 0; i < CANTIDAD; i++) {
      var instancia = crearInstancia(markupSvg, anchoViewport, altoViewport);
      if (!instancia) continue;
      instancias.push(instancia);
      contenedor.appendChild(instancia.el);
      pintar(instancia); // posición inicial pintada siempre, incluso bajo reducirMovimiento (quietas, no ausentes)
    }

    if (!instancias.length) return;

    document.addEventListener('visibilitychange', alCambiarVisibilidad);

    var a = accesibilidad();
    if (a && typeof a.suscribir === 'function') {
      a.suscribir(function () {
        if (reducido()) detenerLoop();
        else iniciarLoopSiCorresponde();
      });
    }

    iniciarLoopSiCorresponde();
  }

  var api = {
    iniciar: function () {
      if (insertado) return;
      if (!global.AmbienteAssets || typeof global.AmbienteAssets.obtenerBinario !== 'function') return;
      global.AmbienteAssets.obtenerBinario(ID_ASSET).then(insertarEnPlano);
    }
  };

  global.AmbienteBrujulitas = api;

})(window);
