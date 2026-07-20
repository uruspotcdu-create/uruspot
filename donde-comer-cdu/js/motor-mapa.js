/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — motor-mapa.js
   Blueprint v2, sección 4c: el mapa no es una sola decisión binaria
   (aparece/desaparece) — son DOS roles independientes.
   1) Mapa-herramienta: interactivo, control real. Aparece en Acción
      Directa siempre que haya al menos un resultado georreferenciado.
      Recorte acotado, igual que el resto del sistema — nunca el
      universo completo de puntos.
   2) Mapa-textura: capa ambiental, no interactiva, de baja densidad.
      Puede estar presente en Guía o Exploración — su función no es
      responder "dónde", es dar la certeza subconsciente de que esto
      es un lugar real. Por eso nunca compite por atención ni se
      comporta como control (sin hover, sin click, sin tooltip).
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

  // Puntos herramienta: los del recorte activo de Acción Directa,
  // acotados por el mismo tipo de límite (mapa.herramientaRecorte).
  function puntosHerramienta(recorteActivo) {
    return recorteActivo.slice(0, CFG.mapa.herramientaRecorte);
  }

  // Criterio único: Acción Directa + al menos un resultado con
  // coordenadas. El presupuesto de exposición (motor-exposicion.js)
  // ya se encarga de que "resultados" nunca sea el padrón entero, así
  // que este criterio no necesita filtrar por texto de consulta.
  function debeMostrarHerramienta(nombreRegion, resultados) {
    if (nombreRegion !== 'accionDirecta') return false;
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
