// URU SPOT — helper de siembra de estado para tests visuales.
//
// NO reimplementa la lógica de motor-plano.js: arma únicamente el
// objeto que `esEstadoValido()`/`migrarEstado()` (js/motor-plano.js)
// ya aceptan como válido hoy, para no depender de interacción real
// acumulada a lo largo de sesiones (la región "exploracion" solo se
// alcanza con autonomia >= 0.35 Y friccion >= 0.45 — Fase 3A §1.4 —
// algo que ningún usuario nuevo cumple en una sola visita real).
//
// Si `motor-plano.js` cambia de SCHEMA_VERSION o de forma mínima
// esperada, este helper debe actualizarse en el mismo cambio — está
// aislado en un solo archivo a propósito para que ese ajuste sea
// mínimo y visible en el diff.

const CIUDAD = 'concepcion-del-uruguay';
const SCHEMA_VERSION = 4; // js/motor-plano.js — mantener sincronizado

function estadoBase(overrides) {
  return Object.assign(
    {
      version: SCHEMA_VERSION,
      ciudad: CIUDAD,
      autonomia: 0.15, // default real, motor-config.js
      friccion: 0.55,  // default real, motor-config.js
      aperturas: 1,
      ultimaApertura: Date.now(),
      rechazos: {},
      aceptados: {},
      guardadosRecientes: [],
      exposicion: {},
      sesion: { empujeFriccionSesion: 0 }
    },
    overrides || {}
  );
}

/**
 * Siembra localStorage ANTES de que cargue app.js, para que
 * `PLANO.leerEstado(CIUDAD)` encuentre el estado ya armado en el
 * primer render. Debe llamarse con `page.addInitScript` antes de
 * `page.goto(...)`.
 */
async function sembrarEstado(page, overrides) {
  const uid = 'e2e-visual-fixture';
  const clave = `uru_plano::${CIUDAD}::${uid}`;
  const estado = estadoBase(overrides);

  await page.addInitScript(
    ([clave, uid, estado]) => {
      window.localStorage.setItem('uru_uid', uid);
      window.localStorage.setItem(clave, JSON.stringify(estado));
    },
    [clave, uid, estado]
  );
}

module.exports = {
  CIUDAD,
  sembrarEstado,
  // Región Guía: exactamente el estado de un usuario nuevo real
  // (Fase 3A §1.2 — "para CUALQUIER usuario nuevo, la región
  // calculada es siempre guia").
  ESTADO_GUIA: () => estadoBase({ autonomia: 0.15, friccion: 0.55, aperturas: 1 }),
  // Región Exploración: autonomia >= 0.35, friccion >= 0.45 (Fase 3A
  // §1.4) — friccion ya está sobre el umbral por defecto, solo
  // autonomia necesita subir.
  ESTADO_EXPLORACION: () => estadoBase({ autonomia: 0.4, friccion: 0.5, aperturas: 5 })
};
