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
  // BUG REAL corregido (race condition): `mostrarEn()` es asíncrono (la
  // primera vez, `asegurarInsertado()` dispara un `fetch()` real del SVG
  // vía AmbienteAssets.obtenerBinario — no una promesa ya resuelta), pero
  // `ocultar()` es síncrono y no tenía forma de cancelar un `mostrarEn()`
  // en vuelo. Secuencia real: hover → mostrarEn() dispara el fetch →
  // el usuario ya se movió (hoverOut) antes de que resuelva → ocultar()
  // no hace nada porque `elemento` todavía es null → el fetch resuelve
  // más tarde y el halo aparece igual, sin ningún hover activo — un
  // halo "fantasma" que solo desaparece en el próximo ciclo real de
  // hover/hoverOut. Más probable cuanto más lenta la red (móvil/PWA).
  // Se agrega un token de generación: cada `mostrarEn()`/`ocultar()` lo
  // incrementa, y una resolución async que ya no coincide con el token
  // vigente se descarta — mismo criterio que un AbortController, sin
  // necesitar cancelar el fetch en sí (el binario igual queda cacheado
  // para el próximo uso legítimo).
  var tokenVisibilidad = 0;

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
      var miToken = ++tokenVisibilidad;
      asegurarInsertado().then(function (svg) {
        if (!svg) return;
        // Si `ocultar()` (u otro `mostrarEn()` más nuevo) se llamó
        // mientras esto cargaba, este resultado ya quedó obsoleto —
        // aplicarlo ahora reabriría un halo que el usuario ya pidió
        // cerrar (o pisaría una posición más reciente con una vieja).
        if (miToken !== tokenVisibilidad) return;
        posicionar(svg, x, y);
        svg.classList.add('is-visible');
      });
    },

    ocultar: function () {
      tokenVisibilidad++; // invalida cualquier mostrarEn() todavía en vuelo
      if (!elemento) return;
      elemento.classList.remove('is-visible');
    }
  };

  global.AmbienteHalos = api;

})(window);

