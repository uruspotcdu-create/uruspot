/* ═══════════════════════════════════════════════════════════════════
   ui/chips.js — chips de rubro/favoritos/limpiar + buscador.
   Mismo comportamiento que fase4-motor.js: cada control solo pide
   mutaciones al filter-store, nunca las decide por su cuenta.
   ═══════════════════════════════════════════════════════════════════ */

/** Construye un chip por rubro presente en el padrón, orden alfabético. */
export function construirChips(opts){
  var dom = opts.dom;
  var registro = opts.registro;
  var rubrosMeta = opts.rubrosMeta;
  var filterStore = opts.filterStore;

  if (!dom.chipsRubros) return;
  var conteo = Object.create(null);
  registro.forEach(function(r){ conteo[r.grupo] = (conteo[r.grupo] || 0) + 1; });
  var claves = Object.keys(rubrosMeta).filter(function(k){ return conteo[k]; });
  claves.sort(function(a, b){ return rubrosMeta[a][0].localeCompare(rubrosMeta[b][0], 'es'); });
  claves.forEach(function(k){
    var chip = document.createElement('button');
    chip.className = 'chip';
    chip.type = 'button';
    chip.textContent = rubrosMeta[k][0];
    chip.dataset.grupo = k;
    chip.addEventListener('click', function(){
      filterStore.toggleRubro(k);
      chip.classList.toggle('activo');
    });
    dom.chipsRubros.appendChild(chip);
  });
}

/** Cablea el buscador de texto, el chip de favoritos y el chip de limpiar. */
export function cablearHerramientas(opts){
  var dom = opts.dom;
  var filterStore = opts.filterStore;

  if (dom.inputBuscar){
    dom.inputBuscar.addEventListener('input', function(e){
      filterStore.setTexto(e.target.value.trim().toLowerCase());
    });
  }
  if (dom.chipFav){
    dom.chipFav.addEventListener('click', function(){
      filterStore.toggleSoloFav();
      dom.chipFav.classList.toggle('activo', filterStore.estado.soloFav);
    });
  }
  if (dom.chipLimpiar){
    dom.chipLimpiar.addEventListener('click', function(){
      filterStore.limpiar();
      if (dom.inputBuscar) dom.inputBuscar.value = '';
      if (dom.chipFav) dom.chipFav.classList.remove('activo');
      dom.chipsRubros.querySelectorAll('.chip.activo').forEach(function(c){ c.classList.remove('activo'); });
    });
  }

  // Etapa 4: chip que solo aparece cuando hay un filtro de "área del
  // mapa" activo (map-controller.js lo pide vía filterStore.setArea);
  // clickearlo lo quita sin tocar texto/rubros/favoritos.
  if (dom.chipArea){
    dom.chipArea.addEventListener('click', function(){
      filterStore.clearArea();
    });
    filterStore.onChange(function(tipo){
      if (tipo === 'area' || tipo === 'limpiar'){
        dom.chipArea.hidden = !filterStore.estado.area;
      }
    });
  }
}
