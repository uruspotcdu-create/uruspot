/**
 * filter-engine.js — Fase 1 del motor nuevo de URU SPOT (último módulo)
 * ─────────────────────────────────────────────────────────────────────
 * Responsabilidad: decidir QUÉ subconjunto de fichas se muestra —
 * búsqueda de texto, filtro por rubro, "solo favoritos", orden y
 * "cerca de mí". No dibuja nada: le pasa el resultado a map-engine.js
 * vía render(fichas) y emite eventos para que la lista en HTML (Fase
 * 3) se sincronice sin acoplarse al mapa.
 *
 * Favoritos: localStorage, sin cuenta ni servidor — se mantiene tal
 * cual la decisión de producto original documentada en el FAQ del
 * sitio ("¿Mis favoritos se guardan si cambio de celular?" → No).
 */

const STORAGE_KEY_FAVORITOS = 'uruspot:favoritos';

class PadronFilterEngine extends EventTarget {
  /**
   * @param {import('./data-store.js').PadronDataStore} dataStore
   * @param {import('./map-engine.js').PadronMapEngine} mapEngine
   */
  constructor(dataStore, mapEngine) {
    super();
    this.dataStore = dataStore;
    this.mapEngine = mapEngine;

    this.estado = {
      texto: '',
      rubro: null,        // null = todos los rubros
      soloFavoritos: false,
      orden: 'relevancia', // relevancia | recomendados | recientes | cercania
      ubicacion: null,     // {lat, lng} si el usuario activó "cerca de mí"
    };

    this.favoritos = this._cargarFavoritos();

    // Se aplica el filtro automáticamente en cuanto el data-store
    // avisa que terminó de cargar — nadie más necesita orquestar esto.
    this.dataStore.addEventListener('padron:datos-listos', () => this.aplicar());
  }

  // ── mutadores de estado — cada uno reaplica y notifica ──────────

  buscar(texto) {
    this.estado.texto = (texto || '').trim().toLowerCase();
    this.aplicar();
  }

  filtrarPorRubro(rubro) {
    this.estado.rubro = rubro || null;
    this.aplicar();
  }

  toggleSoloFavoritos(valor) {
    this.estado.soloFavoritos = valor ?? !this.estado.soloFavoritos;
    this.aplicar();
  }

  ordenarPor(criterio) {
    this.estado.orden = criterio;
    this.aplicar();
  }

  setUbicacion(coords) {
    this.estado.ubicacion = coords; // {lat, lng} | null
    this.aplicar();
  }

  limpiarFiltros() {
    this.estado.texto = '';
    this.estado.rubro = null;
    this.estado.soloFavoritos = false;
    this.estado.orden = 'relevancia';
    this.aplicar();
  }

  // ── favoritos ─────────────────────────────────────────────────

  esFavorito(id) {
    return this.favoritos.has(id);
  }

  toggleFavorito(id) {
    if (this.favoritos.has(id)) {
      this.favoritos.delete(id);
    } else {
      this.favoritos.add(id);
    }
    this._guardarFavoritos();

    this.dispatchEvent(new CustomEvent('padron:favorito-toggled', {
      detail: { id, esFavorito: this.favoritos.has(id), total: this.favoritos.size },
    }));

    if (this.estado.soloFavoritos) this.aplicar();
  }

  _cargarFavoritos() {
    try {
      const crudo = localStorage.getItem(STORAGE_KEY_FAVORITOS);
      return new Set(crudo ? JSON.parse(crudo) : []);
    } catch {
      // localStorage puede fallar (modo privado, cuota, etc.) — el
      // padrón sigue funcionando, solo que sin persistencia.
      return new Set();
    }
  }

  _guardarFavoritos() {
    try {
      localStorage.setItem(STORAGE_KEY_FAVORITOS, JSON.stringify([...this.favoritos]));
    } catch {
      // silenciosamente ignorado — ver nota en _cargarFavoritos
    }
  }

  // ── el pipeline de filtrado en sí ────────────────────────────────

  aplicar() {
    const todas = this.dataStore.getAll();
    let resultado = todas;

    if (this.estado.texto) {
      resultado = resultado.filter((f) => this._coincideTexto(f, this.estado.texto));
    }

    if (this.estado.rubro) {
      resultado = resultado.filter((f) => f.grupo === this.estado.rubro);
    }

    if (this.estado.soloFavoritos) {
      resultado = resultado.filter((f) => this.favoritos.has(f.id));
    }

    resultado = this._ordenar(resultado);

    this.mapEngine.render(resultado);

    this.dispatchEvent(new CustomEvent('padron:filtro-cambiado', {
      detail: {
        resultado,
        total: resultado.length,
        totalSinFiltrar: todas.length,
        estado: { ...this.estado },
      },
    }));

    return resultado;
  }

  _coincideTexto(ficha, texto) {
    return (
      ficha.nombre.toLowerCase().includes(texto) ||
      (ficha.categoria && ficha.categoria.toLowerCase().includes(texto))
    );
  }

  _ordenar(fichas) {
    const copia = [...fichas];

    switch (this.estado.orden) {
      case 'cercania':
        if (!this.estado.ubicacion) return copia; // sin ubicación, no hay nada que ordenar
        return copia.sort((a, b) => (
          this._distancia(a, this.estado.ubicacion) - this._distancia(b, this.estado.ubicacion)
        ));

      case 'recomendados':
        return copia.sort((a, b) => (b.rating || 0) - (a.rating || 0));

      case 'recientes':
        // El dataset no trae fecha de alta; el orden "recientes" cae
        // a orden de ingreso (ID), que es lo único disponible hoy.
        // TODO(Fase 4 o dataset): agregar campo de fecha real si se
        // quiere un orden "recién agregados" honesto.
        return copia.sort((a, b) => (a.id < b.id ? 1 : -1));

      case 'relevancia':
      default:
        // Relevancia = cantidad de reseñas verificadas, como manda el
        // criterio de "destacado" documentado en el FAQ del sitio.
        return copia.sort((a, b) => (b.ratingCount || 0) - (a.ratingCount || 0));
    }
  }

  _distancia(ficha, desde) {
    // Fórmula de Haversine — suficiente para ordenar, no para
    // navegación turn-by-turn.
    const R = 6371;
    const dLat = this._rad(ficha.lat - desde.lat);
    const dLng = this._rad(ficha.lng - desde.lng);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(this._rad(desde.lat)) * Math.cos(this._rad(ficha.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  _rad(deg) {
    return (deg * Math.PI) / 180;
  }
}

export { PadronFilterEngine };
