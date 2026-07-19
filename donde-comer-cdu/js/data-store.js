/**
 * data-store.js — Fase 1 del motor nuevo de URU SPOT
 * ─────────────────────────────────────────────────────────────────────
 * Responsabilidad única: traer, fusionar y normalizar el padrón.
 * No sabe nada de Leaflet, de filtros, ni de DOM — eso es map-engine.js
 * y filter-engine.js. Este módulo solo produce una lista de "fichas"
 * limpias y avisa cuándo están listas, vía el contrato de eventos
 * definido en la Fase 0 (padron:datos-listos, etc.), usando un
 * EventTarget real en vez de inventar un pub/sub propio.
 *
 * Arquitectura de carga (se conserva de la implementación anterior,
 * porque sigue siendo objetivamente la mejor decisión disponible):
 * el fetch de ambos JSON arranca en paralelo con la carga de Leaflet,
 * no encadenado después. Este módulo no decide CUÁNDO arrancar el
 * fetch — expone init() y quien orqueste (map-engine.js) lo llama en
 * el momento oportuno.
 */

const DEFAULT_URLS = {
  core: 'lugares-core.json',
  detalles: 'lugares-detalles.json',
};

// Taxonomía "canónica" de rubros que el resto del sitio ya usa
// (manifiesto, breakdown, spotlight). Cualquier `grupo` fuera de esta
// lista se considera SIN CLASIFICAR — ver normalizeGrupo() más abajo.
const RUBROS_CANONICOS = new Set([
  'gastronomia', 'compras', 'salud', 'finanzas', 'transporte',
  'deporte', 'patrimonio', 'educacion', 'belleza', 'alojamiento',
  'servicios_publicos', 'mascotas', 'naturaleza', 'oficios_tecnicos',
]);

const SIN_CLASIFICAR = 'sin_clasificar';

class PadronDataStore extends EventTarget {
  constructor(urls = DEFAULT_URLS) {
    super();
    this.urls = urls;
    this._fichas = null; // null = todavía no cargó
    this._corePromise = null;
    this._detallesPromise = null;
    /** @type {{total:number, sinClasificar:number, gruposLegado:Record<string,number>}} */
    this.auditoria = { total: 0, sinClasificar: 0, gruposLegado: {} };
  }

  /**
   * Arranca ambos fetch en paralelo. Idempotente: si ya se llamó, no
   * vuelve a pedir la red — reutiliza la misma promesa (igual que el
   * motor anterior).
   */
  iniciarFetch() {
    if (this._corePromise) return;

    this._corePromise = fetch(this.urls.core)
      .then((r) => { if (!r.ok) throw new Error(`core: HTTP ${r.status}`); return r.json(); })
      .catch((err) => {
        this._emitError('core', err);
        return [];
      });

    this._detallesPromise = fetch(this.urls.detalles)
      .then((r) => (r.ok ? r.json() : []))
      .catch((err) => {
        this._emitError('detalles', err);
        return [];
      });
  }

  /**
   * Fusiona, normaliza y publica. Devuelve la promesa de la lista
   * final por si el llamador quiere await en vez de escuchar el
   * evento.
   */
  async cargar() {
    this.iniciarFetch();
    const [core, detalles] = await Promise.all([this._corePromise, this._detallesPromise]);

    const detallesPorId = new Map(detalles.map((d) => [d.id, d]));

    this._fichas = core
      .map((entry) => this._normalizar(entry, detallesPorId.get(entry.id)))
      .filter(Boolean); // descarta fichas sin coordenadas válidas

    this.dispatchEvent(new CustomEvent('padron:datos-listos', {
      detail: { fichas: this._fichas, auditoria: this.auditoria },
    }));

    return this._fichas;
  }

  getAll() {
    return this._fichas || [];
  }

  getById(id) {
    return (this._fichas || []).find((f) => f.id === id) || null;
  }

  // ── privado ────────────────────────────────────────────────────

  _normalizar(entry, detalle) {
    const lat = Number(entry.lat);
    const lng = Number(entry.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      // Ficha sin geolocalización utilizable: no entra al padrón
      // renderizable. Se cuenta igual para no perderla silenciosamente.
      this.auditoria.total++;
      return null;
    }

    const grupo = this._normalizarGrupo(entry.grupo);

    this.auditoria.total++;

    return {
      id: entry.id,
      nombre: entry.nombre,
      categoria: entry.categoria || null,
      grupo,
      grupoOriginal: entry.grupo, // se conserva para auditoría/migración futura
      lat,
      lng,
      rating: typeof entry.rating === 'number' ? entry.rating : null,
      ratingCount: typeof entry.rating_count === 'number' ? entry.rating_count : 0,
      // Del archivo de detalles — puede no existir todavía si el
      // fetch de detalles fue más lento o falló; queda null y el
      // motor de mapa/lista debe tolerar esos campos ausentes.
      direccion: detalle?.direccion || null,
      telefono: detalle?.telefono || null,
      placeId: detalle?.place_id || null,
      descripcion: detalle?.descripcion || null,
    };
  }

  _normalizarGrupo(grupoOriginal) {
    if (RUBROS_CANONICOS.has(grupoOriginal)) return grupoOriginal;

    this.auditoria.sinClasificar++;
    this.auditoria.gruposLegado[grupoOriginal] =
      (this.auditoria.gruposLegado[grupoOriginal] || 0) + 1;

    return SIN_CLASIFICAR;
  }

  _emitError(fuente, err) {
    this.dispatchEvent(new CustomEvent('padron:error-carga', {
      detail: { fuente, mensaje: err.message },
    }));
  }
}

export { PadronDataStore, RUBROS_CANONICOS, SIN_CLASIFICAR };
