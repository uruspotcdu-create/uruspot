/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-orquestador.js
   Fase 0: Orquestador central (Documento de diseño, Cap. 11.1 / 11.2)

   Es la única pieza del sistema que efectivamente conecta señales,
   estados y capas entre sí (Cap. 11.3). Expone hacia el resto de la
   aplicación la superficie mínima y estable descrita en el Cap. 11.1:
   "una forma de indicar la escena activa, una forma de indicar el
   estado activo, y poco más" — window.AmbientEngine.

   Ninguna pantalla funcional de la aplicación debería necesitar
   conocer los detalles internos de una capa (Cap. 11.4). Este
   archivo es, a propósito, el único lugar donde señales + estados +
   capas se importan juntos; ambiente-senales.js, ambiente-estados.js
   y ambiente-capa-fondo.js no se conocen entre sí.

   Debe cargarse ÚLTIMO entre los scripts del Ambient Engine: con
   scripts `defer`, el orden de ejecución es el orden del documento,
   así que para cuando este módulo corre, AmbienteSenales,
   AmbienteEstados y AmbienteCapaFondo ya existen.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // Cap. 6.1: "más de 20-30 segundos sin gesto alguno". Se usa el
  // punto medio del rango.
  var UMBRAL_INACTIVIDAD_MS = 25000;

  // Cap. 6.2: "Activo se activa por cualquier gesto de usuario" — se
  // escucha un vocabulario mínimo y genérico de gesto, no eventos
  // específicos de ningún componente de la aplicación.
  var GESTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

  var temporizadorInactividad = null;

  function reiniciarTemporizadorInactividad() {
    if (temporizadorInactividad) global.clearTimeout(temporizadorInactividad);
    temporizadorInactividad = global.setTimeout(function () {
      global.AmbienteEstados.pasarAInactivo();
    }, UMBRAL_INACTIVIDAD_MS);
  }

  function onGesto() {
    global.AmbienteEstados.registrarGesto();
    reiniciarTemporizadorInactividad();
  }

  // El único contrato entre el Ambient Engine y el resto de la
  // aplicación (Cap. 11.1 / 11.4): atributos data-* en <html>, nunca
  // una API que exponga las capas mismas.
  function reflejarEstadoEnDOM(estado) {
    document.documentElement.setAttribute('data-ambiente-estado', estado);
  }

  function reflejarSenalesEnDOM() {
    var s = global.AmbienteSenales;
    document.documentElement.setAttribute('data-ambiente-reducido', String(s.reducirMovimiento));
    document.documentElement.setAttribute('data-ambiente-rendimiento', s.rendimiento);
  }

  function iniciar() {
    // Fase 0 incompleta sin señales o sin máquina de estados: se
    // aborta silenciosamente en vez de fallar a medias. Mejor no
    // tener Ambient Engine que tenerlo roto compitiendo con el
    // contenido real (Cap. 1.4).
    if (!global.AmbienteSenales || !global.AmbienteEstados) return;

    reflejarSenalesEnDOM();
    global.AmbienteSenales.suscribir(reflejarSenalesEnDOM);

    global.AmbienteEstados.on('cambio', function (evento) {
      reflejarEstadoEnDOM(evento.actual);
    });
    reflejarEstadoEnDOM(global.AmbienteEstados.actual());

    GESTOS.forEach(function (nombre) {
      document.addEventListener(nombre, onGesto, { passive: true });
    });
    reiniciarTemporizadorInactividad();

    // Fase 1: única capa visual conectada hasta ahora. Fases futuras
    // (2 en adelante) agregarán el catálogo de escenas real; hasta
    // entonces, setEscena() solo dispara la Transición y marca el
    // atributo, sin reconfigurar ninguna capa todavía.
    if (global.AmbienteCapaFondo) global.AmbienteCapaFondo.iniciar();
  }

  global.AmbientEngine = {
    iniciar: iniciar,

    get estado() {
      return global.AmbienteEstados ? global.AmbienteEstados.actual() : null;
    },

    // Superficie mínima delegada a la máquina de estados (Cap. 11.1).
    // Este objeto es, a propósito, la única puerta de entrada: nada
    // fuera de este archivo debería llamar a AmbienteEstados directo.
    iniciarCarga: function () {
      if (global.AmbienteEstados) global.AmbienteEstados.iniciarCarga();
    },
    finalizarCarga: function (exito) {
      if (global.AmbienteEstados) global.AmbienteEstados.finalizarCarga(exito);
    },
    entrarFoco: function () {
      if (global.AmbienteEstados) global.AmbienteEstados.entrarFoco();
    },
    salirFoco: function () {
      if (global.AmbienteEstados) global.AmbienteEstados.salirFoco();
    },
    reintentar: function () {
      if (global.AmbienteEstados) global.AmbienteEstados.reintentar();
    },

    // Declarada desde Fase 0 como parte de la superficie estable
    // (Cap. 11.1), pero sin catálogo de escenas real todavía (eso es
    // Fase 2 — Cap. 13). Por ahora dispara el Estado de Transición y
    // deja constancia de la escena en el DOM; no reconfigura capas.
    setEscena: function (nombre) {
      if (!global.AmbienteEstados) return;
      global.AmbienteEstados.iniciarTransicion(function () {
        document.documentElement.setAttribute('data-ambiente-escena', nombre);
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

})(window);
