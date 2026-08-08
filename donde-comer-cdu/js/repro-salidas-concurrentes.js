// Evidencia reproducible: aísla la lógica exacta de programarRenderTrasSalida
// (original vs corregida) con un DOM y un reloj simulados, sin necesitar un
// navegador real. `node repro-salidas-concurrentes.js`

function crearCartaFalsa() {
  var handlers = {};
  var viva = true; // simula que innerHTML='' "mata" la carta: ya no puede
                    // disparar transitionend después de eso.
  return {
    classList: { add: function () {} },
    addEventListener: function (evt, cb) { handlers[evt] = cb; },
    // Llamado por el test para simular que el navegador completó la
    // transición CSS real de ESTA carta.
    dispararTransitionEnd: function () {
      if (viva && handlers.transitionend) handlers.transitionend();
    },
    // Llamado por el test para simular que un render() de OTRA carta
    // vació panelDescubrimiento.innerHTML mientras esta seguía animando.
    destruirPorInnerHTML: function () { viva = false; }
  };
}

function crearReloj() {
  var tareas = [];
  return {
    setTimeout: function (fn, ms) { tareas.push({ fn: fn, ms: ms }); },
    dispararTimeoutsVencidos: function (ms) {
      tareas = tareas.filter(function (t) {
        if (t.ms <= ms) { t.fn(); return false; }
        return true;
      });
    }
  };
}

console.log('=== Código ORIGINAL (con bug) ===');
(function () {
  var renders = 0;
  function render() { renders++; }
  var reloj = crearReloj();

  function programarRenderTrasSalida(carta) {
    carta.classList.add('descartada');
    var yaRenderizo = false;
    var terminar = function () {
      if (yaRenderizo) return;
      yaRenderizo = true;
      render();
      // Efecto real de render() -> pintarTarjetas(): vacía el panel,
      // lo que desmonta cualquier otra carta que siguiera animando.
      cartaB.destruirPorInnerHTML();
    };
    carta.addEventListener('transitionend', terminar);
    reloj.setTimeout(terminar, 260);
  }

  var cartaA = crearCartaFalsa();
  var cartaB = crearCartaFalsa();

  programarRenderTrasSalida(cartaA); // usuario rechaza tarjeta A
  programarRenderTrasSalida(cartaB); // rechaza B ~50ms después, misma ventana

  cartaA.dispararTransitionEnd(); // A termina su transición real primero
  console.log('Renders tras terminar A:', renders, '(dispara render y destruye el nodo de B)');

  cartaB.dispararTransitionEnd(); // el navegador SÍ intentaría disparar esto,
  // pero el nodo de B ya no existe (innerHTML=''), así que en la vida real
  // este evento nunca llega — lo probamos igual para dejar constancia.
  console.log('¿B pudo notificar su propio fin de transición? Nodo destruido antes de eso.');

  reloj.dispararTimeoutsVencidos(260); // el timeout de seguridad de B sigue
  // en pie (no se cancela por perder el nodo) y dispara un SEGUNDO render.
  console.log('Renders tras el timeout de seguridad de B:', renders, '<- redundante, y sobre una tarjeta ya desmontada');
})();

console.log('\n=== Código CORREGIDO ===');
(function () {
  var renders = 0;
  function render() { renders++; }
  var reloj = crearReloj();
  var salidasPendientes = 0;

  function programarRenderTrasSalida(carta) {
    carta.classList.add('descartada');
    var yaResuelto = false;
    salidasPendientes++;
    var resolver = function () {
      if (yaResuelto) return;
      yaResuelto = true;
      salidasPendientes--;
      if (salidasPendientes <= 0) { salidasPendientes = 0; render(); }
    };
    carta.addEventListener('transitionend', resolver);
    reloj.setTimeout(resolver, 260);
  }

  var cartaA = crearCartaFalsa();
  var cartaB = crearCartaFalsa();

  programarRenderTrasSalida(cartaA);
  programarRenderTrasSalida(cartaB);

  cartaA.dispararTransitionEnd();
  console.log('Renders tras terminar A:', renders, '(todavía hay 1 salida pendiente: B sigue vivo y animando)');

  cartaB.dispararTransitionEnd();
  console.log('Renders tras terminar B:', renders, '(un solo render, ambas tarjetas ya terminaron su salida)');

  reloj.dispararTimeoutsVencidos(260); // no deberían quedar timeouts activos
  console.log('Renders tras vencer timeouts (no debería haber ninguno pendiente):', renders);
})();

