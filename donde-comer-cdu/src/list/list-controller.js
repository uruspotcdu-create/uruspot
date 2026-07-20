/* ═══════════════════════════════════════════════════════════════════
   list-controller.js — construye y renderiza la lista (los 1.468
   `.paso`). Desde la Etapa 3, ya no construye los puntos del mapa
   esquemático: ese trabajo lo reemplaza `map-controller.js` (Leaflet
   real + clustering), que lee el mismo `registro`/`filterStore` de
   forma independiente.

   No sabe nada de `filter-store` salvo lo que necesita para togglear
   visibilidad (`coincide`, `esFavorito`, `toggleFavorito`) y fijar la
   selección activa (`setSeleccionado`) — no muta estado de filtros
   por su cuenta, y no sabe nada de URLs (eso es `url-state.js`).

   Corrección de regresión (Etapa 2 → ahora): el clic en una fila había
   quedado en modo "solo resaltar" (`resaltar(id, false)`), perdiendo
   el comportamiento de la Etapa 1 donde un clic FIJA la selección
   (para que quede en la URL y sobreviva a un refresh/compartir). Se
   restaura acá: clic en fila = `resaltar(id, true)`.
   ═══════════════════════════════════════════════════════════════════ */

export function createListController(opts){
  var dom = opts.dom;
  var registro = opts.registro;
  var porId = opts.porId;
  var filterStore = opts.filterStore;
  var rubrosMeta = opts.rubrosMeta;
  var escapeHTML = opts.escapeHTML;

  var filasPorId = Object.create(null);

  function pintarConstancia(el, estado){
    if (estado === 'pendiente'){
      el.textContent = 'pendiente de confirmación en terreno';
      el.classList.add('constancia--pendiente');
    } else {
      el.textContent = 'verificado en el padrón';
      el.classList.remove('constancia--pendiente');
    }
  }

  /* ─── construcción de la secuencia (lista), en un único DOM
     construido una sola vez. Los filtros solo togglean visibilidad. ─── */
  function construirSecuenciaYArea(){
    var frag = document.createDocumentFragment();
    registro.forEach(function(r){
      var esFav = filterStore.esFavorito(r.id);
      var fila = document.createElement('div');
      fila.className = 'paso';
      fila.dataset.id = r.id;
      fila.innerHTML =
        '<div class="paso-inner">' +
          '<div class="pos">' + String(r.pos).padStart(4, '0') + '</div>' +
          '<div class="cuerpo-paso">' +
            '<div class="rubro">' + (rubrosMeta[r.grupo] ? rubrosMeta[r.grupo][0] : r.categoria) + '</div>' +
            '<div class="nombre">' + escapeHTML(r.nombre) + '</div>' +
            '<div class="direccion">' + (r.direccion ? escapeHTML(r.direccion) : 'cargando dirección…') + '</div>' +
            '<div class="constancia"></div>' +
          '</div>' +
          '<button class="btn-fav" type="button" aria-label="marcar favorito">' + (esFav ? '★' : '☆') + '</button>' +
        '</div>';
      pintarConstancia(fila.querySelector('.constancia'), r.estado);
      var btnFav = fila.querySelector('.btn-fav');
      btnFav.classList.toggle('activo', esFav);
      frag.appendChild(fila);
      filasPorId[r.id] = fila;
    });
    dom.panelLista.appendChild(frag);

    // delegación de eventos — un solo listener para 1.468 filas
    dom.panelLista.addEventListener('click', function(e){
      var btn = e.target.closest('.btn-fav');
      if (btn){
        var fila = btn.closest('.paso');
        var id = fila.dataset.id;
        var nuevoValor = filterStore.toggleFavorito(id);
        btn.textContent = nuevoValor ? '★' : '☆';
        btn.classList.toggle('activo', nuevoValor);
        return;
      }
      var fila2 = e.target.closest('.paso');
      // Etapa 1 (restaurada): clic en la fila FIJA la selección, no
      // solo la resalta — así entra a la URL y sobrevive a un refresh.
      if (fila2) resaltar(fila2.dataset.id, true);
    });
    dom.panelLista.addEventListener('mouseover', function(e){
      var fila = e.target.closest('.paso');
      if (fila) resaltar(fila.dataset.id, false);
    });
  }

  /** Resalta visualmente una fila. Si `fijar` es true, además pide a
   *  filter-store que la fije como selección activa (única fuente de
   *  verdad — de ahí la sale hacia la URL vía url-state.js, y hacia el
   *  mapa vía map-controller.js). Con `fijar=false` (hover, o cuando
   *  ya viene fijada desde la URL/el mapa) solo pinta, sin volver a
   *  notificar — evita loops entre lista ↔ mapa ↔ URL. */
  function resaltar(id, fijar){
    Object.keys(filasPorId).forEach(function(k){
      filasPorId[k].classList.toggle('activa', k === id);
    });
    if (fijar) filterStore.setSeleccionado(id);
  }

  /* ─── solo actualiza el contenido de filas que ya están en pantalla —
     el contenido se acumula, no se vuelve a construir todo. ─── */
  function refrescarFilasVisibles(){
    Object.keys(filasPorId).forEach(function(id){
      var reg = porId[id];
      var fila = filasPorId[id];
      if (!reg || !fila) return;
      var dirEl = fila.querySelector('.direccion');
      if (dirEl && reg.direccion) dirEl.textContent = reg.direccion;
      var constEl = fila.querySelector('.constancia');
      if (constEl) pintarConstancia(constEl, reg.estado);
    });
  }

  /* ─── render: aplica el filtro actual del filter-store, togglea
     visibilidad de filas, actualiza el contador de resultados. ─── */
  function render(){
    var visibles = 0;
    registro.forEach(function(r){
      var ok = filterStore.coincide(r);
      var fila = filasPorId[r.id];
      if (fila) fila.classList.toggle('oculto', !ok);
      if (ok) visibles++;
    });

    var estado = filterStore.estado;
    var hayFiltro = estado.texto || estado.rubros.size > 0 || estado.soloFav || estado.area;
    if (dom.estadoResultados){
      // Etapa 4: si el único recorte activo es el área del mapa, se
      // avisa distinto — "de 1.468" pierde sentido cuando el corte es
      // geográfico, no de contenido.
      var sufijo = estado.area
        ? ' · recortado a esta área del mapa'
        : ' de 1.468 · dentro del padrón completo';
      dom.estadoResultados.innerHTML = hayFiltro
        ? '<b>' + visibles + '</b> resultado' + (visibles === 1 ? '' : 's') + sufijo
        : 'mostrando el padrón completo · <b>' + registro.length.toLocaleString('es-AR') + '</b> lugares';
    }

    if (dom.sinResultados) dom.sinResultados.hidden = visibles !== 0;
  }

  /** Etapa 4: hace scroll hasta la fila de un lugar seleccionado desde
   *  el mapa (clic en un pin) o desde la URL — misma selección
   *  compartida que ya pinta `resaltar()`, esto solo se encarga de
   *  ponerla a la vista sin que el usuario tenga que buscarla. */
  function scrollHacia(id){
    var fila = filasPorId[id];
    if (!fila) return;
    fila.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /* ─── fracción persistente en la cabecera — coordenada, no progreso ─── */
  function cablearFraccionPersistente(){
    var pasos = dom.panelLista ? dom.panelLista.querySelectorAll('.paso') : [];
    if (!('IntersectionObserver' in window) || !pasos.length) return;
    var obsVisibilidad = new IntersectionObserver(function(entries){
      entries.forEach(function(en){ if (en.isIntersecting) en.target.classList.add('visible'); });
    }, {threshold: .1});
    pasos.forEach(function(p){ obsVisibilidad.observe(p); });

    var obsPosicion = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if (en.isIntersecting){
          var pos = en.target.querySelector('.pos').textContent;
          if (dom.fraccionNum) dom.fraccionNum.textContent = pos;
          pasos.forEach(function(p){ p.classList.remove('paso--activa'); });
          en.target.classList.add('paso--activa');
        }
      });
    }, {threshold: .5, rootMargin: '-40% 0px -40% 0px'});
    pasos.forEach(function(p){ obsPosicion.observe(p); });
  }

  return {
    construirSecuenciaYArea: construirSecuenciaYArea,
    render: render,
    resaltar: resaltar,
    scrollHacia: scrollHacia,
    refrescarFilasVisibles: refrescarFilasVisibles,
    cablearFraccionPersistente: cablearFraccionPersistente,
    filasPorId: filasPorId
  };
}
