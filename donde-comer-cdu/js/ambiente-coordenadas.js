/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-coordenadas.js
   Fase 3: familia "Coordenadas" (Cap. 2.1, familia 4, del documento de
   Lenguaje de Assets v1.0)

   Subsistema del Grupo de Contenido Visual. Responsabilidad única:
   pedirle su SVG al Asset Registry ('coordenadas', Cap. 8.1) e
   insertarlo dentro del plano P1 — mismo patrón de carga que
   ambiente-reticula.js / ambiente-corrientes.js, con una diferencia
   estructural deliberada (Cap. 6.1, Cap. 13.1): Retícula/Topográficas/
   Corrientes se insertan una sola vez y quedan siempre visibles;
   Coordenadas no tiene existencia propia — es un marcador que solo
   tiene sentido cuando hay un punto seleccionado. Por eso este módulo
   NO se muestra solo al iniciar(): prepara el elemento oculto
   (opacity:0 vía CSS, ver assets/ambient/_tokens/
   ambiente-tokens-movimiento.css) y expone mostrarEn(x, y) / ocultar()
   para que quien sepa qué punto está seleccionado decida cuándo
   dispararlo.

   Cableado real pendiente (registrado a propósito en el changelog,
   no es una excepción del Cap. 8.2): mostrarEn()/ocultar() todavía no
   están conectados a ningún evento real de selección de mapa — ese
   evento vive fuera del Ambient Engine (motor-mapa.js / app.js) y no
   se inspeccionó todavía. Este módulo deja el instrumento listo; el
   disparo real es el siguiente sub-paso.

   x/y se reciben en unidades del viewBox 0-100 del propio plano P1
   (Cap. 3.1: mismo sistema de coordenadas que cualquier asset), no en
   píxeles de pantalla — la conversión desde una coordenada real de
   mapa a esa unidad es responsabilidad de quien llame a mostrarEn(),
   no de este módulo (Cap. 3.12: el Ambient Engine "no interpreta el
   significado de negocio de la interacción").

   Debe cargarse después de ambiente-planos.js y ambiente-assets.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ID_ASSET = 'coordenadas';
  var elemento = null; // referencia al <svg> ya insertado en el DOM
  var promesaInsercion = null;
  // BUG REAL corregido (race condition) — mismo hallazgo que
  // ambiente-halos.js, mismo patrón compartido, mismo fix: ver la
  // explicación completa ahí. Resumen: `mostrarEn()` es asíncrono (fetch
  // real vía AmbienteAssets.obtenerBinario la primera vez), `ocultar()`
  // es síncrono y no cancelaba un `mostrarEn()` en vuelo — un click
  // seguido de otra acción antes de que el asset cargue podía dejar la
  // marca de coordenadas visible sin ningún punto seleccionado.
  var tokenVisibilidad = 0;

  function insertarEnPlano(markupSvg) {
    if (elemento || !markupSvg) return null;
    var planos = global.AmbientePlanos;
    var contenedor = planos ? planos.contenedor('p1') : null;
    if (!contenedor) return null;

    var envoltorio = document.createElement('div');
    envoltorio.innerHTML = markupSvg;
    var svg = envoltorio.querySelector('svg');
    if (!svg) return null;

    contenedor.appendChild(svg);
    elemento = svg;
    return elemento;
  }

  // Idempotente y perezoso: la primera llamada a mostrarEn() (o el
  // propio iniciar()) dispara la descarga/inserción una única vez;
  // llamadas siguientes reutilizan la misma promesa ya resuelta.
  function asegurarInsertado() {
    if (promesaInsercion) return promesaInsercion;
    if (!global.AmbienteAssets || typeof global.AmbienteAssets.obtenerBinario !== 'function') {
      promesaInsercion = Promise.resolve(null);
      return promesaInsercion;
    }
    promesaInsercion = global.AmbienteAssets.obtenerBinario(ID_ASSET).then(insertarEnPlano);
    return promesaInsercion;
  }

  function posicionar(svg, x, y) {
    // Traslada el grupo de la marca (no el <svg> completo) al punto
    // pedido, en unidades del viewBox 100x100 (Cap. 3.1) — mismo
    // criterio de transform que usan las primitivas compartidas,
    // nunca se reescribe la geometría interna del símbolo.
    var grupo = svg.querySelector('.coordenadas-marca');
    if (!grupo) return;
    var dx = x - 50;
    var dy = y - 50;
    grupo.setAttribute('transform', 'translate(' + dx + ' ' + dy + ')');
  }

  var api = {
    // Fase 3 (Paso 4, mismo patrón): precarga/inserta el asset oculto
    // desde el arranque del Ambient Engine, para que la primera vez
    // que alguien llame a mostrarEn() no haya que esperar la descarga
    // del SVG — coherente con que iniciar() nunca hace visible nada
    // por su cuenta (Cap. 6.1: "aparece cuando hay algo que señalar").
    iniciar: function () {
      asegurarInsertado();
    },

    // Punto de entrada real (todavía sin cablear a un evento de
    // producto, ver nota de cabecera). x, y en unidades 0-100 del
    // viewBox del plano P1.
    mostrarEn: function (x, y) {
      var miToken = ++tokenVisibilidad;
      asegurarInsertado().then(function (svg) {
        if (!svg) return;
        if (miToken !== tokenVisibilidad) return; // ver nota de arriba / ambiente-halos.js
        posicionar(svg, x, y);
        svg.classList.add('is-visible');
      });
    },

    ocultar: function () {
      tokenVisibilidad++;
      if (!elemento) return;
      elemento.classList.remove('is-visible');
    }
  };

  global.AmbienteCoordenadas = api;

})(window);
