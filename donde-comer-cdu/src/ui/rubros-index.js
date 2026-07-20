/* ═══════════════════════════════════════════════════════════════════
   ui/rubros-index.js — índice editorial de rubros, alfabético, con
   las cifras reales del padrón. Mismo comportamiento que la función
   construirRubros() de fase4-motor.js.
   ═══════════════════════════════════════════════════════════════════ */

export function construirRubros(opts){
  var dom = opts.dom;
  var registro = opts.registro;
  var rubrosMeta = opts.rubrosMeta;

  if (!dom.listaRubros) return;
  var conteo = Object.create(null);
  registro.forEach(function(r){ conteo[r.grupo] = (conteo[r.grupo] || 0) + 1; });
  var claves = Object.keys(rubrosMeta).filter(function(k){ return conteo[k]; });
  claves.sort(function(a, b){ return rubrosMeta[a][0].localeCompare(rubrosMeta[b][0], 'es'); });
  claves.forEach(function(k){
    var fila = document.createElement('div');
    fila.className = 'fila-rubro';
    fila.innerHTML =
      '<div class="col-izq"><span class="nombre">' + rubrosMeta[k][0] + '</span>' +
      '<span class="desc">' + rubrosMeta[k][1] + '</span></div>' +
      '<span class="cifra">' + conteo[k] + ' fichas</span>';
    dom.listaRubros.appendChild(fila);
  });
}
