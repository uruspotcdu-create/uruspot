/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — catalog.js

   FASE 2 del Plan Maestro de Modularización (2026-08-06). Extraído de
   app.js §2 (Cache y Estado Global): REGISTRO (array del catálogo
   completo) y porId (índice por id), sin cambios de comportamiento.

   Un solo punto de escritura real en toda la app: cargarCatalogo()
   (app.js), cuando responde lugares-core.json. establecerCatalogo()
   reemplaza ese único punto — antes REGISTRO se reasignaba y porId se
   llenaba entrada por entrada dentro del mismo .map() que arma cada
   registro; acá se separa en dos pasos (arma la lista en app.js con
   su forma de datos específica del dominio, después
   establecerCatalogo() la adopta y reconstruye el índice) para que
   este módulo no necesite conocer la forma de un "lugar" — incluso
   Fase 4 (recorte/rotación) no muta REGISTRO directamente, así que la
   única otra escritura de porId (línea vieja `porId[l.id] = reg`)
   queda cubierta por el mismo establecerCatalogo().
   ═══════════════════════════════════════════════════════════════════ */

var REGISTRO = [];
var porId = Object.create(null);

export function obtenerRegistro() {
  return REGISTRO;
}

export function obtenerPorId(id) {
  return porId[id];
}

// Reemplaza el catálogo completo y reconstruye el índice por id desde
// cero. Llamado una sola vez por carga real (cargarCatalogo() en
// app.js); si algún día hay recarga/refresh del catálogo, este mismo
// punto de entrada sigue siendo válido.
export function establecerCatalogo(nuevaLista) {
  REGISTRO = nuevaLista;
  porId = Object.create(null);
  REGISTRO.forEach(function (reg) {
    porId[reg.id] = reg;
  });
}
