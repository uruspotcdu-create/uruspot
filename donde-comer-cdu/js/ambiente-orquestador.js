/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-orquestador.js
   Fase 0/2: Orquestador central — Ambient Engine, raíz orquestadora
   (Documento de diseño, Cap. 11.1 / 11.2; Arquitectura técnica, Cap. 3.1)

   Es la única pieza del sistema que efectivamente conecta señales,
   estados, gobierno y capas entre sí (Cap. 11.3 diseño / Cap. 2.3
   arquitectura: "el Grupo de Orquestación es el único que puede
   comunicarse con los tres grupos restantes"). Expone hacia el resto
   de la aplicación la superficie mínima y estable descrita en el
   Cap. 11.1: "una forma de indicar la escena activa, una forma de
   indicar el estado activo, y poco más" — window.AmbientEngine.

   Ninguna pantalla funcional de la aplicación debería necesitar
   conocer los detalles internos de una capa (Cap. 11.4). Este
   archivo es, a propósito, el único lugar donde infraestructura +
   gobierno + estados + Motion Controller + capas se importan juntos;
   ningún otro módulo del Ambient Engine conoce a sus pares de otro
   grupo funcional.

   Fase 2: este archivo ya no lee ambiente-senales.js (retirado — ver
   nota en ambiente-accesibilidad.js). Las señales que antes venían de
   ahí ahora se leen de sus fuentes canónicas: AmbienteAccesibilidad
   (reducirMovimiento) y AmbienteRendimiento (nivel de fidelidad).
   También precalienta el Asset Registry (Cap. 8.1) e inicia el Motion
   Controller (Cap. 3.4), que es quien de ahora en más decide qué
   parámetros de movimiento recibe cada capa — este archivo ya no le
   pasa señales de gobierno directamente a ninguna capa.

   Debe cargarse ÚLTIMO entre los scripts del Ambient Engine: con
   scripts `defer`, el orden de ejecución es el orden del documento,
   así que para cuando este módulo corre, todo el Grupo de
   Infraestructura, todo el Grupo de Gobierno, AmbienteEstados,
   AmbienteMovimiento y AmbienteCapaFondo ya existen.
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

  // Fase 2: ya no refleja una sola "señal" cruda — refleja el
  // resultado ya resuelto de Accessibility Manager y Performance
  // Manager, cada uno desde su propia fuente canónica (Cap. 2.3: el
  // Grupo de Gobierno puede ser consultado por el Grupo de
  // Orquestación sin restricción, a diferencia del Grupo de Contenido
  // Visual).
  function reflejarGobiernoEnDOM() {
    var a = global.AmbienteAccesibilidad;
    var r = global.AmbienteRendimiento;
    if (a) document.documentElement.setAttribute('data-ambiente-reducido', String(a.reducirMovimiento));
    if (r) document.documentElement.setAttribute('data-ambiente-rendimiento', r.nivelFidelidad);
  }

  function iniciar() {
    // Fase 0 incompleta sin máquina de estados: se aborta
    // silenciosamente en vez de fallar a medias. Mejor no tener
    // Ambient Engine que tenerlo roto compitiendo con el contenido
    // real (Cap. 1.4).
    if (!global.AmbienteEstados) return;

    // ── Grupo de Infraestructura (Cap. 8.1) ─────────────────────────
    // Precalienta los assets de carga anticipada de la escena inicial
    // antes de que cualquier capa los pida — así ninguna capa visual
    // tiene que preocuparse por si el Asset Registry ya está "tibio".
    if (global.AmbienteAssets) global.AmbienteAssets.precalentar();

    // ── Grupo de Gobierno (Cap. 3.10 / 3.11) ────────────────────────
    // Performance Manager ya se autoinicia al cargarse (ver su propio
    // archivo); Accessibility Manager no requiere inicio explícito.
    // Este orquestador solo se suscribe a ambos para reflejar su
    // estado en el DOM, el único contrato hacia el resto de la app.
    reflejarGobiernoEnDOM();
    if (global.AmbienteAccesibilidad) global.AmbienteAccesibilidad.suscribir(reflejarGobiernoEnDOM);
    if (global.AmbienteRendimiento) global.AmbienteRendimiento.suscribir(reflejarGobiernoEnDOM);

    // ── Motion Controller (Cap. 3.4) ────────────────────────────────
    // Se inicia antes que cualquier capa de Contenido Visual, para
    // que cuando AmbienteCapaFondo.iniciar() corra ya tenga a quién
    // suscribirse.
    if (global.AmbienteMovimiento) global.AmbienteMovimiento.iniciar();

    // ── State Manager (Cap. 6) ───────────────────────────────────────
    global.AmbienteEstados.on('cambio', function (evento) {
      reflejarEstadoEnDOM(evento.actual);
    });
    reflejarEstadoEnDOM(global.AmbienteEstados.actual());

    GESTOS.forEach(function (nombre) {
      document.addEventListener(nombre, onGesto, { passive: true });
    });
    reiniciarTemporizadorInactividad();

    // Fase 1: única capa visual conectada hasta ahora. Fases futuras
    // (T4 en adelante del roadmap técnico) agregarán el catálogo real
    // de escenas vía Scene Manager; hasta entonces, setEscena() abajo
    // le informa la escena directamente al Motion Controller (ver nota
    // de cabecera de ambiente-movimiento.js) y dispara la Transición.
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

    // Fase 2: ahora sí tiene un catálogo real detrás (AmbienteConfig,
    // vía el Motion Controller) en lugar de solo marcar el DOM. Un
    // nombre de escena desconocido no rompe nada: AmbienteMovimiento
    // cae de vuelta a la escena inicial (Cap. 6.2 Arquitectura: "el
    // Scene Manager es quien decide qué hacer si una resolución
    // falla" — mientras ese módulo no exista, este es el mismo
    // criterio aplicado por su sustituto temporal).
    setEscena: function (nombre) {
      if (!global.AmbienteEstados) return;
      global.AmbienteEstados.iniciarTransicion(function () {
        document.documentElement.setAttribute('data-ambiente-escena', nombre);
        if (global.AmbienteMovimiento) global.AmbienteMovimiento.setEscena(nombre);
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

})(window);
