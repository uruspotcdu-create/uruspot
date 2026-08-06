/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — favorites.js

   FASE 2 del Plan Maestro de Modularización (2026-08-06). Extraído de
   app.js §13 (Sistema de Favoritos con Persistencia) sin cambios de
   comportamiento — la propia auditoría (ARQUITECTURA_MAESTRO_APP.md
   §2.1) marcaba este bloque como "✅ Aislado pero pequeño", el más
   seguro de extraer después de cache.js.

   Único cambio real: en vez de llamar directamente a
   ErrorRecovery.procesar() (que vive en app.js y todavía no está
   modularizado — sacarlo ahora mezclaría esta etapa con la extracción
   del manejo de errores, fuera del alcance de este paso), este módulo
   recibe un callback `onError(error, contexto)` opcional. app.js sigue
   llamando a ErrorRecovery.procesar() exactamente igual que antes,
   solo que ahora desde ese callback en vez de inline. Mismo patrón de
   inyección explícita de dependencias que recomienda el ADR-003 del
   propio plan maestro (no reference directa a un global de app.js).

   No incluye actualizarContadorGuardados() ni el listener de
   `storage`: esos leen/escriben DOM y llaman a render(), pertenecen a
   la capa de orquestación de app.js, no al almacenamiento de datos.
   ═══════════════════════════════════════════════════════════════════ */

var STORAGE_KEY = 'uruspot_favoritos';

// favoritosCache === null es el estado "todavía no se leyó nunca" — se
// distingue a propósito de `{}` (leído y vacío), para no releer de
// disco de más la primera vez que localStorage esté genuinamente
// vacío. Primera lectura real: perezosa, en el primer leerFavoritos()
// que se llame (no necesariamente al arrancar la app).
var favoritosCache = null;

export function leerFavoritos(onError) {
  if (favoritosCache !== null) return favoritosCache;
  try {
    favoritosCache = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (e) {
    if (onError) onError(e, 'leerFavoritos');
    favoritosCache = {};
  }
  return favoritosCache;
}

// guardarFavoritos() actualiza el cache con la MISMA referencia que
// persiste — en la práctica, todo el código existente ya llama
// `var favoritos = leerFavoritos(); favoritos[id] = ...;
// guardarFavoritos(favoritos);`, así que `favoritos` YA ES el objeto
// cacheado (leerFavoritos() no devuelve copia) y mutarlo ya mantenía
// el cache al día incluso sin esta línea — se deja explícita igual
// por si en el futuro algún llamador arma un objeto nuevo en vez de
// mutar el leído.
export function guardarFavoritos(f, onError) {
  favoritosCache = f;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
  } catch (e) {
    if (onError) onError(e, 'guardarFavoritos');
  }
}

// Multi-pestaña: app.js sigue siendo dueño del listener de `storage`
// (necesita disparar actualizarContadorGuardados() + render()), pero
// invalida el cache de este módulo a través de esta función en vez de
// tocar favoritosCache directamente desde afuera.
export function invalidarCacheFavoritos() {
  favoritosCache = null;
}
