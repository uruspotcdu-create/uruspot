/* ═══════════════════════════════════════════════════════════════════
   url-state.js — Etapa 1 del plan ("Estado en URL"), restaurada como
   módulo propio después de perderse en el refactor de la Etapa 2.

   Qué pasó: el `main.js` de la Etapa 2 se armó a partir de una foto de
   `fase4-motor.js` anterior a la Etapa 1 — el micro-router de
   `URLSearchParams` + `history.pushState/replaceState` que sí existía
   en el `fase4-motor.js` de la Etapa 1 nunca se copió a los módulos
   nuevos. Filtros y selección funcionaban, pero dejaron de reflejarse
   en la URL: sin deep-linking, sin "atrás" funcional.

   Este módulo reimplementa exactamente ese comportamiento, ahora
   apoyado en `filter-store` como única fuente de verdad en vez de
   tocar el DOM o un `estadoUI` propio:
     - lee `?q=&rubros=&fav=1&lugar=ID` al cargar y en cada `popstate`,
       y llama a `filterStore.aplicarEstado(...)`.
     - escucha `filterStore.onChange(tipo)` y escribe la URL: texto usa
       `replaceState` con debounce (no ensucia el historial letra por
       letra), rubros/favoritos-filtro/limpiar/selección usan
       `pushState` porque son gestos discretos que tiene sentido poder
       deshacer uno a uno con "atrás".
     - un toggle de favorito individual (tipo 'favorito') NO se refleja
       en la URL — ya persiste en localStorage, igual que en la Etapa 1.
   ═══════════════════════════════════════════════════════════════════ */

export function createUrlState(opts){
  var dom = opts.dom;
  var filterStore = opts.filterStore;

  var sincronizando = false;
  var temporizadorTexto = null;

  function leerDesdeParams(params){
    return {
      texto: (params.get('q') || '').trim().toLowerCase(),
      rubros: new Set((params.get('rubros') || '').split(',').filter(Boolean)),
      soloFav: params.get('fav') === '1',
      seleccionado: params.get('lugar') || null
    };
  }

  /** Refleja texto/rubros/favoritos en los controles — la selección la
   *  resuelve quien llama (necesita el registro para ubicar la fila). */
  function reflejarEnDOM(estado){
    if (dom.inputBuscar) dom.inputBuscar.value = estado.texto || '';
    if (dom.chipFav) dom.chipFav.classList.toggle('activo', estado.soloFav);
    if (dom.chipsRubros){
      dom.chipsRubros.querySelectorAll('.chip').forEach(function(c){
        c.classList.toggle('activo', estado.rubros.has(c.dataset.grupo));
      });
    }
  }

  function escribirEnURL(reemplazar){
    if (sincronizando) return;
    var estado = filterStore.estado;
    var params = new URLSearchParams();
    if (estado.texto) params.set('q', estado.texto);
    if (estado.rubros.size) params.set('rubros', Array.from(estado.rubros).join(','));
    if (estado.soloFav) params.set('fav', '1');
    if (estado.seleccionado) params.set('lugar', estado.seleccionado);
    var qs = params.toString();
    var url = window.location.pathname + (qs ? '?' + qs : '');
    history[reemplazar ? 'replaceState' : 'pushState']({}, '', url);
  }

  /** Aplica el estado leído de la URL a filter-store + DOM, sin
   *  reescribir la URL (evita el loop leer→escribir→leer). */
  function aplicarDesdeURL(params){
    sincronizando = true;
    var estado = leerDesdeParams(params);
    filterStore.aplicarEstado(estado);
    reflejarEnDOM(estado);
    sincronizando = false;
    return estado.seleccionado;
  }

  /** Se llama una vez, después de que la lista (y el mapa) ya existen. */
  function iniciar(listController){
    var lugarInicial = aplicarDesdeURL(new URLSearchParams(window.location.search));
    if (lugarInicial && listController.filasPorId[lugarInicial]){
      listController.filasPorId[lugarInicial].scrollIntoView({block: 'center', behavior: 'auto'});
      listController.resaltar(lugarInicial, false);
    }

    window.addEventListener('popstate', function(){
      var lugarId = aplicarDesdeURL(new URLSearchParams(window.location.search));
      listController.render();
      if (lugarId && listController.filasPorId[lugarId]){
        listController.filasPorId[lugarId].scrollIntoView({block: 'center', behavior: 'smooth'});
        listController.resaltar(lugarId, false);
      } else {
        listController.resaltar(null, false);
      }
    });

    filterStore.onChange(function(tipo){
      // Etapa 4: 'area' (el recorte de "buscar en esta área") queda
      // fuera de la URL a propósito — es un gesto de exploración del
      // mapa, no algo que tenga sentido compartir/recargar, y
      // reflejarlo pediría persistir 4 coordenadas de más.
      if (sincronizando || tipo === 'url' || tipo === 'favorito' || tipo === 'area') return;
      if (tipo === 'texto'){
        if (temporizadorTexto) clearTimeout(temporizadorTexto);
        temporizadorTexto = setTimeout(function(){ escribirEnURL(true); }, 400);
      } else {
        escribirEnURL(false);
      }
    });
  }

  return { iniciar: iniciar };
}
