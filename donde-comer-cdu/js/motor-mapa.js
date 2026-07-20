/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — motor-mapa.js
   El mapa-herramienta ya no es exclusivo de Acción Directa: participa
   de las cuatro regiones (Guía, Exploración, Acción Directa,
   Curaduría), mostrando siempre el mismo recorte que ya está en
   pantalla como tarjetas — nunca un conjunto aparte. La única
   condición real es que haya algo georreferenciado para mostrar.
   El mapa-textura (capa ambiental de motor-render/app.js) sigue
   siendo la única pieza no interactiva, de baja densidad.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var CFG = global.URU_CONFIG;

  // Puntos ambientales: muestreo estable y acotado del registro
  // completo, nunca 1.468 puntos — ver motor-config.js: mapa.texturaDensidadMax.
  function puntosTextura(registro) {
    var max = CFG.mapa.texturaDensidadMax;
    if (registro.length <= max) return registro.slice();
    var paso = Math.floor(registro.length / max);
    var out = [];
    for (var i = 0; i < registro.length && out.length < max; i += paso) out.push(registro[i]);
    return out;
  }

  // Puntos herramienta: los del recorte activo de la región actual,
  // acotados por el mismo tipo de límite (mapa.herramientaRecorte) —
  // el mapa nunca muestra más lugares que los que ya están como
  // tarjetas en pantalla.
  function puntosHerramienta(recorteActivo) {
    return recorteActivo.slice(0, CFG.mapa.herramientaRecorte);
  }

  // Criterio único: que haya al menos un resultado con coordenadas.
  // El presupuesto de exposición (motor-exposicion.js) ya se encarga
  // de que "resultados" nunca sea el padrón entero, en ninguna
  // región — así que este criterio no necesita distinguir por región.
  function debeMostrarHerramienta(nombreRegion, resultados) {
    if (!resultados || !resultados.length) return false;
    return resultados.some(function (r) { return typeof r.lat === 'number' && typeof r.lng === 'number'; });
  }

  global.URU_MAPA = {
    puntosTextura: puntosTextura,
    puntosHerramienta: puntosHerramienta,
    debeMostrarHerramienta: debeMostrarHerramienta
  };
})(typeof window !== 'undefined' ? window : global);
if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window.URU_MAPA : global.URU_MAPA);
}
