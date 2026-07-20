/* ═══════════════════════════════════════════════════════════════════
   filter-store.js — única fuente de verdad de texto/rubros/favoritos
   Y de la selección activa (lugar elegido desde la lista o el mapa).

   Responsabilidad única (Fase 7.2 del plan): nada fuera de este módulo
   muta este estado. `list-controller.js`, `map-controller.js` y `ui/*`
   solo leen (`coincide`, `esFavorito`, `estado`) o piden mutaciones a
   través de estos métodos, y se enteran de los cambios suscribiéndose
   con `onChange`.

   Cada notificación lleva un `tipo` (texto/rubro/fav/limpiar/favorito/
   seleccion/area/url) para que quien escuche —hoy, `url-state.js`—
   pueda decidir cómo reflejarlo en la URL sin que este módulo sepa
   nada de URLs, history ni query params.

   Etapa 4 del plan ("Buscar en esta área"): agrega `estado.area`, un
   rectángulo geográfico opcional {sur,norte,oeste,este} que recorta
   `coincide()` igual que un rubro o un texto. Nadie fuera de este
   módulo decide cuándo hay área activa — `map-controller.js` solo
   pide `setArea()`/`clearArea()` con los bounds ya calculados; este
   módulo no sabe nada de Leaflet, LatLngBounds ni mapas.
   ═══════════════════════════════════════════════════════════════════ */

export function createFilterStore(favoritosIniciales){
  var listeners = [];
  var estado = { texto: '', rubros: new Set(), soloFav: false, seleccionado: null, area: null };
  var favoritos = favoritosIniciales || {};

  function guardarFavoritos(){
    try { localStorage.setItem('uruspot_favoritos', JSON.stringify(favoritos)); }
    catch(e){ /* localStorage no disponible: se degrada sin romper */ }
  }

  function notificar(tipo){
    listeners.forEach(function(fn){ fn(tipo); });
  }

  return {
    /** Se llama cada vez que cambia texto, rubros, soloFav, favoritos o
     *  la selección. Recibe un `tipo` (ver cabecera) como único argumento. */
    onChange: function(fn){ listeners.push(fn); },

    /** Estado de solo-lectura para quien necesite inspeccionarlo (ej. UI de chips). */
    get estado(){ return estado; },

    setTexto: function(t){
      estado.texto = t;
      notificar('texto');
    },

    toggleRubro: function(grupo){
      if (estado.rubros.has(grupo)) estado.rubros.delete(grupo);
      else estado.rubros.add(grupo);
      notificar('rubro');
    },

    toggleSoloFav: function(){
      estado.soloFav = !estado.soloFav;
      notificar('fav');
    },

    limpiar: function(){
      estado.texto = '';
      estado.rubros.clear();
      estado.soloFav = false;
      estado.area = null;
      notificar('limpiar');
    },

    esFavorito: function(id){
      return !!favoritos[id];
    },

    toggleFavorito: function(id){
      favoritos[id] = !favoritos[id];
      guardarFavoritos();
      // Marcar una estrella no cambia qué se ve en el mapa/URL (los
      // favoritos individuales ya persisten en localStorage) — tipo
      // propio para que url-state.js no dispare un pushState por cada
      // clic en una estrella.
      notificar('favorito');
      return favoritos[id];
    },

    /** Fija el lugar activo (clic en una fila o en un pin del mapa). */
    setSeleccionado: function(id){
      estado.seleccionado = id || null;
      notificar('seleccion');
    },

    /** Etapa 4: fija el rectángulo geográfico activo — lo pide
     *  map-controller.js con los bounds ya leídos del mapa cuando el
     *  usuario aprieta "buscar en esta área". No se refleja en la URL
     *  (ver url-state.js: tipo 'area' está excluido a propósito). */
    setArea: function(bounds){
      estado.area = bounds || null;
      notificar('area');
    },

    /** Quita el recorte por área (clic en el chip "área del mapa ✕",
     *  o al limpiar filtros). */
    clearArea: function(){
      if (!estado.area) return;
      estado.area = null;
      notificar('area');
    },

    /** Aplica varios campos a la vez sin decidir tipo de historial —
     *  usado por url-state.js al leer `?q=&rubros=&fav=&lugar=` de la
     *  URL (carga inicial o "atrás"/"adelante" del navegador). */
    aplicarEstado: function(parcial){
      if ('texto' in parcial) estado.texto = parcial.texto;
      if ('rubros' in parcial) estado.rubros = parcial.rubros;
      if ('soloFav' in parcial) estado.soloFav = parcial.soloFav;
      if ('seleccionado' in parcial) estado.seleccionado = parcial.seleccionado;
      notificar('url');
    },

    /** Igual que el `coincide(r)` de fase4-motor.js, sin cambios de lógica,
     *  + el recorte por área geográfica de la Etapa 4. */
    coincide: function(r){
      if (estado.soloFav && !favoritos[r.id]) return false;
      if (estado.rubros.size > 0 && !estado.rubros.has(r.grupo)) return false;
      if (estado.area){
        if (typeof r.lat !== 'number' || typeof r.lng !== 'number') return false;
        if (r.lat < estado.area.sur || r.lat > estado.area.norte) return false;
        if (r.lng < estado.area.oeste || r.lng > estado.area.este) return false;
      }
      if (estado.texto){
        var hay = (r.nombre + ' ' + r.categoria + ' ' + (r.direccion || '')).toLowerCase();
        if (hay.indexOf(estado.texto) === -1) return false;
      }
      return true;
    }
  };
}
