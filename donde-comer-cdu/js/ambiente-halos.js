/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — js/ambiente-halos.js
   Fase 3: familia "Halos de posición" (Cap. 2.1, familia 7, del
   documento de Lenguaje de Assets v1.0). Roadmap Cap. 12, orden 8.

   Mismo patrón estructural que js/ambiente-coordenadas.js: el asset
   se inserta oculto desde el arranque (carga anticipada del propio
   markup, nunca de su visibilidad — Cap. 5: "sin loop propio", no
   tiene sentido animarlo hasta que haya algo que enfocar) dentro del
   plano P3, y expone mostrarEn(x, y) / ocultar() para que quien sepa
   qué punto está activo decida cuándo dispararlo. x/y en unidades del
   viewBox 0-100 (Cap. 3.1), misma convención que ya usa Coordenadas.

   Límite del Cap. 4.2 ("el halo nunca convive con más de un asset P2
   activo... dos focos compitiendo anulan el propósito") se cumple
   por construcción: solo existe una instancia insertada (igual que
   Brújula/Corrientes), nunca varias en simultáneo — mostrarEn()
   reposiciona la única instancia existente en vez de crear una
   nueva.

   Cableado real (mismo límite ya documentado para Coordenadas y
   Brújula en changelog.md): motor-mapa.js no expone la proyección de
   lat/lng a coordenadas de pantalla como parte de su API pública, así
   que este módulo también se ancla al centro óptico (50,50) en vez
   de a la posición geográfica real del punto — ver el cableado en
   js/app.js. No es una excepción del Cap. 8.2, es la misma limitación
   de plataforma ya registrada dos veces, no una nueva.

   Debe cargarse después de ambiente-planos.js y ambiente-assets.js.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ID_ASSET = 'halo';
  var elemento = null;
  var promesaInsercion = null;

  function insertarEnPlano(markupSvg) {
    if (elemento || !markupSvg) return null;
    var planos = global.AmbientePlanos;
    var contenedor = planos ? planos.contenedor('p3') : null;
    if (!contenedor) return null;

    var envoltorio = document.createElement('div');
    envoltorio.innerHTML = markupSvg;
    var svg = envoltorio.querySelector('svg');
    if (!svg) return null;

    contenedor.appendChild(svg);
    elemento = svg;
    return elemento;
  }

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
    var grupo = svg.querySelector('.halo-foco');
    if (!grupo) return;
    var dx = x - 50;
    var dy = y - 50;
    grupo.setAttribute('transform', 'translate(' + dx + ' ' + dy + ')');
  }

  var api = {
    // Precarga/inserta el asset oculto desde el arranque, mismo
    // criterio que Coordenadas — la primera llamada real a
    // mostrarEn() no debería esperar la descarga del SVG.
    iniciar: function () {
      asegurarInsertado();
    },

    // x, y en unidades 0-100 del viewBox del plano P3.
    mostrarEn: function (x, y) {
      asegurarInsertado().then(function (svg) {
        if (!svg) return;
        posicionar(svg, x, y);
        svg.classList.add('is-visible');
      });
    },

    ocultar: function () {
      if (!elemento) return;
      elemento.classList.remove('is-visible');
    }
  };

  global.AmbienteHalos = api;

})(window);
