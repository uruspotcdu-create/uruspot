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
   También precalienta el Asset Registry (Cap. 8.1), inicia el Motion
   Controller (Cap. 3.4) y activa la escena inicial a través del Scene
   Manager (Cap. 3.3, T4) — este archivo ya no le pasa nombres de
   escena directamente al Motion Controller, ni señales de gobierno
   directamente a ninguna capa.

   T5 (Cap. 3.12 Arquitectura): el temporizador de inactividad y el
   listener de gestos genéricos que antes vivían acá se movieron a
   ambiente-interaccion.js (Interaction Observer) — este archivo ya
   no conoce ningún nombre de evento DOM de gesto, solo arranca ese
   subsistema.

   Debe cargarse ÚLTIMO entre los scripts del Ambient Engine: con
   scripts `defer`, el orden de ejecución es el orden del documento,
   así que para cuando este módulo corre, todo el Grupo de
   Infraestructura, todo el Grupo de Gobierno, AmbienteEstados,
   AmbienteMovimiento, AmbienteEscenas y AmbienteCapaFondo ya existen.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // Cap. 3.1: el único contrato entre el Ambient Engine y el resto de
  // la aplicación (Cap. 11.1 / 11.4): atributos data-* en <html>,
  // nunca una API que exponga las capas mismas.
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

    // ── Scene Manager (Cap. 3.3, T4) ────────────────────────────────
    // Activa la escena inicial (Cap. 6.1 diseño: "abrir la app ya
    // cuenta como el primer momento de atención del usuario"). Recién
    // después de esto AmbienteMovimiento.parametros() deja de ser
    // null, así que debe correr antes de iniciar cualquier capa visual.
    if (global.AmbienteEscenas && global.AmbienteConfig) {
      var idInicial = global.AmbienteConfig.ESCENA_INICIAL;
      if (global.AmbienteEscenas.activar(idInicial)) {
        // Mismo contrato que setEscena() aplica a cada cambio posterior
        // (Cap. 11.1: "una forma de indicar la escena activa"). La
        // escena inicial no pasa por el Estado de Transición (Cap. 6.1
        // diseño: "abrir la app ya cuenta como el primer momento de
        // atención"), pero igual debe quedar reflejada en el DOM desde
        // el primer instante, no recién en el segundo cambio de escena.
        document.documentElement.setAttribute('data-ambiente-escena', idInicial);
      }
    }

    // ── State Manager (Cap. 6) ───────────────────────────────────────
    global.AmbienteEstados.on('cambio', function (evento) {
      reflejarEstadoEnDOM(evento.actual);
    });
    reflejarEstadoEnDOM(global.AmbienteEstados.actual());

    // ── Interaction Observer (Cap. 3.12, T5) ────────────────────────
    // Gestos genéricos + temporizador de inactividad ya no viven acá
    // (ver nota de cabecera) — este subsistema le habla directo al
    // State Manager, sin pasar por el orquestador.
    if (global.AmbienteInteraccion) global.AmbienteInteraccion.iniciar();

    // ── Grupo de Contenido Visual (Cap. 2.3) ────────────────────────
    // Cada capa se suscribe por su cuenta al Motion Controller ya
    // iniciado arriba — el orquestador no les entrega parámetros
    // directamente (eso violaría el Cap. 3.4: "nunca debe entregar
    // parámetros... sin haber aplicado primero las restricciones");
    // solo dispara su iniciar(), como hace desde la Fase 1 con la
    // Capa de Fondo.
    //
    // Fase 3 (Lenguaje de Assets, Cap. 4.1): el Plane Manager crea
    // los 4 contenedores fijos (P0-P3) donde vivirán las 7 familias
    // de assets. Debe iniciarse antes que cualquier familia — hoy,
    // antes que la Capa de Fondo, la primera capa visual del
    // documento — para que AmbientePlanos.contenedor() ya exista
    // cuando la primera familia lo pida.
    if (global.AmbientePlanos) global.AmbientePlanos.iniciar();
    if (global.AmbienteReticula) global.AmbienteReticula.iniciar();
    if (global.AmbienteTopografia) global.AmbienteTopografia.iniciar();
    if (global.AmbienteCorrientes) global.AmbienteCorrientes.iniciar();
    if (global.AmbienteCoordenadas) global.AmbienteCoordenadas.iniciar();
    if (global.AmbienteBrujula) global.AmbienteBrujula.iniciar();
    // Fase 3 (Paso 8/9, roadmap Cap. 12 orden 7/8): mismo patrón que
    // el resto de las familias — cada una inicia su propia inserción
    // en el plano que le corresponde, el orquestador solo dispara.
    if (global.AmbienteParticulasDeriva) global.AmbienteParticulasDeriva.iniciar();
    if (global.AmbienteHalos) global.AmbienteHalos.iniciar();
    if (global.AmbienteCapaFondo) global.AmbienteCapaFondo.iniciar();
    // Fase 3 (Paso 10, roadmap Cap. 12 orden 9): shift de color de
    // P2/P3 por horario — no es una familia de assets, así que se
    // inicia junto a la Capa de Fondo (misma naturaleza: lee la hora
    // real y escribe variables CSS), no junto a las 7 familias.
    if (global.AmbienteHorarioTinte) global.AmbienteHorarioTinte.iniciar();
    if (global.AmbienteParticulas) global.AmbienteParticulas.iniciar();
    if (global.AmbienteLuz) global.AmbienteLuz.iniciar();
    if (global.AmbienteClima) global.AmbienteClima.iniciar();
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

    // Fase 2 (T4): ahora delega en el Scene Manager, que resuelve la
    // escena en dos fases (Cap. 6.2) antes de entregársela al Motion
    // Controller. Un nombre de escena desconocido o con assets no
    // disponibles no rompe nada: AmbienteEscenas.activar() devuelve
    // false y mantiene la escena previamente activa sin tocar el DOM
    // de escena — la Transición visual tampoco se dispara en ese caso,
    // porque no tendría destino real al que llegar.
    setEscena: function (nombre) {
      if (!global.AmbienteEstados) return;
      global.AmbienteEstados.iniciarTransicion(function () {
        var activada = global.AmbienteEscenas ? global.AmbienteEscenas.activar(nombre) : false;
        if (activada) document.documentElement.setAttribute('data-ambiente-escena', nombre);
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

})(window);
