/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — search.js

   FASE 3 del Plan Maestro de Modularización (2026-08-06), módulos
   pendientes: extraído de app.js §12 (Listado de Lugares — Búsqueda,
   Filtros, Ordenamiento). Cubre lo que el plan llama SearchService:
   resolver qué lista de lugares corresponde a una búsqueda/filtro
   explícito del usuario, y ordenar esa lista por cercanía cuando
   corresponde.

   Mismo criterio ya usado por cache.js/render-engine.js/listeners.js
   (ADR-003 del plan): dependencias explícitas por parámetro, nada de
   `uiState`/`EXPO` asumidos como globales dentro del módulo — EXPO
   viaja como parámetro (no por import) porque, igual que en app.js,
   se asigna en runtime después del arranque (var EXPO = null; más
   abajo se le asigna window.MotorExposicion) y capturarlo una sola
   vez lo dejaría congelado en null.

   NO migra acá (queda en app.js, sin tocar): el recorte por
   iniciativa propia del sistema (EXPO.coleccionCurada /
   EXPO.recortePorIniciativaPropiaExplicado) — esa parte de "discovery"
   ya vive dentro de render-engine.js desde Fase 4 (cerrada y con
   render-engine-tests.js pasando). Separarla ahora en un
   domain/discovery.js aparte implicaría reabrir render-engine.js y su
   suite de tests ya cerrada; se deja pendiente como decisión aparte,
   no incluida en este cambio.
   ═══════════════════════════════════════════════════════════════════ */

import { RAMA_CURADURIA, RAMA_BUSCADOR } from './constants.js';
import { ordenarPorCercaniaConCache } from './cache.js';

/**
 * Retorna la lista de lugares por acción explícita del usuario
 * (búsqueda de texto y/o filtro de rubro). Mismo comportamiento que
 * listaPorAccionExplicita() en app.js: EXPO.resultadosPorAccionExplicita()
 * primero, filtro de rubro después.
 */
export function listaPorAccionExplicita(EXPO, registro, consultaActual, filtroRubroActivo) {
  var lista = EXPO.resultadosPorAccionExplicita(registro, consultaActual);
  if (filtroRubroActivo) {
    lista = lista.filter(function (l) { return l.grupo === filtroRubroActivo; });
  }
  return lista;
}

/**
 * Hay texto de búsqueda (no solo espacios).
 */
export function hayBusquedaTexto(consultaActual) {
  return consultaActual.trim().length > 0;
}

/**
 * Hay búsqueda de texto O filtro de rubro activo. Se usa para casos
 * que no necesitan distinguir uno del otro (visibilidad de sugerencias
 * rápidas, aria-expanded del buscador, copy del subtítulo). La única
 * excepción es ramaActual(), que solo mira hayBusquedaTexto() — ver
 * nota ahí abajo.
 */
export function hayBusquedaOFiltro(consultaActual, filtroRubroActivo) {
  return hayBusquedaTexto(consultaActual) || !!filtroRubroActivo;
}

/**
 * Ordena una lista por cercanía si "cerca de mí" está activo y hay
 * ubicación conocida del usuario. Delega en cache.js para reusar
 * distancias ya calculadas.
 */
export function ordenarPorCercania(lista, cercaTuyoActivo, ubicacionUsuario) {
  if (!cercaTuyoActivo || !ubicacionUsuario) return lista;
  return ordenarPorCercaniaConCache(lista, ubicacionUsuario.lat, ubicacionUsuario.lng);
}

/**
 * Determina la rama visual actual (curaduria | buscador | recorte:guia
 * | recorte:exploracion). Fase 4 (Journey/UX, ver comentario original
 * en app.js): usa hayBusquedaTexto(), NO hayBusquedaOFiltro() — elegir
 * un rubro desde los chips de Guía/Exploración sigue siendo iniciativa
 * propia del sistema; solo la búsqueda de texto fuerza el salto a
 * Acción Directa.
 */
export function ramaActual(reg, consultaActual, verCatalogoCompleto) {
  if (reg.nombre === 'curaduria') return RAMA_CURADURIA;
  if (reg.nombre === 'accionDirecta' || hayBusquedaTexto(consultaActual) || verCatalogoCompleto) {
    return RAMA_BUSCADOR;
  }
  return 'recorte:' + reg.nombre;
}

/**
 * Sufijo de accesibilidad para anunciar "Ordenado por cercanía." cuando
 * corresponde.
 */
export function sufijoCercania(cercaTuyoActivo, ubicacionUsuario) {
  return (cercaTuyoActivo && ubicacionUsuario) ? ' Ordenado por cercanía.' : '';
}
