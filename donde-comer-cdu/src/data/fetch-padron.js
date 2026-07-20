/* ═══════════════════════════════════════════════════════════════════
   fetch-padron.js — capa de datos.

   Mismo contrato que documentaba fase4-motor.js (sin cambios de
   comportamiento, Etapa 2 solo reubica el código):
     - lugares-core.json      → bloqueante. id, nombre, categoria, grupo,
                                 lat, lng, rating?, rating_count?
     - lugares-detalles.json  → perezoso (requestIdleCallback). direccion,
                                 telefono, place_id, descripcion?
     - lugares-mapa.json      → perezoso, solo se usa para leer
                                 estado_verificacion. El resto de sus
                                 campos se ignora a propósito: mapa.json
                                 quedó desincronizado en "grupo" respecto
                                 de core.json (66 lugares con "comercios"
                                 vs "compras"), así que core.json manda.

   "Posición" en el padrón = índice + 1 dentro de lugares-core.json.
   No se inventa un orden nuevo: se respeta el que ya trae el archivo.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Carga bloqueante del padrón base.
 * @returns {Promise<{registro: Array, porId: Object}>}
 */
export function cargarPadron(){
  return fetch('lugares-core.json')
    .then(function(r){ return r.json(); })
    .then(function(core){
      var porId = Object.create(null);
      var registro = core.map(function(l, i){
        var reg = {
          pos: i + 1,
          id: l.id,
          nombre: l.nombre,
          categoria: l.categoria,
          grupo: l.grupo,
          lat: l.lat,
          lng: l.lng,
          rating: l.rating || null,
          rating_count: l.rating_count || null,
          direccion: null,
          telefono: null,
          estado: 'verificado' // por defecto, hasta que carguen los detalles
        };
        porId[l.id] = reg;
        return reg;
      });
      return { registro: registro, porId: porId };
    });
}

/**
 * Cargas perezosas: direcciones/teléfonos + estado de verificación.
 * Parchea los objetos de `porId` in-place y avisa vía `onUpdate` cada
 * vez que termina una de las dos cargas, para que quien esté mostrando
 * filas ya construidas pueda refrescarlas.
 * @param {Object} porId
 * @param {Function} onUpdate
 */
export function cargarDetallesEnSegundoPlano(porId, onUpdate){
  var lanzar = function(){
    fetch('lugares-detalles.json')
      .then(function(r){ return r.json(); })
      .then(function(det){
        det.forEach(function(d){
          var reg = porId[d.id];
          if (!reg) return;
          reg.direccion = d.direccion || null;
          reg.telefono = d.telefono || null;
          reg.descripcion = d.descripcion || null;
        });
        onUpdate();
      })
      .catch(function(err){ console.warn('lugares-detalles.json no disponible', err); });

    fetch('lugares-mapa.json')
      .then(function(r){ return r.json(); })
      .then(function(mapa){
        var PATRONES_PENDIENTE = ['pendiente', 'no encontrado', 'requiere confirmacion', 'requiere_confirmacion'];
        mapa.forEach(function(m){
          var reg = porId[m.id];
          if (!reg || !m.estado_verificacion) return;
          var low = m.estado_verificacion.toLowerCase();
          var pendiente = PATRONES_PENDIENTE.some(function(p){ return low.indexOf(p) !== -1; });
          reg.estado = pendiente ? 'pendiente' : 'verificado';
        });
        onUpdate();
      })
      .catch(function(err){ console.warn('lugares-mapa.json no disponible', err); });
  };
  if ('requestIdleCallback' in window) requestIdleCallback(lanzar, {timeout: 2000});
  else setTimeout(lanzar, 200);
}
