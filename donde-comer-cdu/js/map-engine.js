/**
 * map-engine.js — Fase 1 del motor nuevo de URU SPOT
 * ─────────────────────────────────────────────────────────────────────
 * Responsabilidad: Leaflet, clustering, marcadores y popups. No sabe
 * nada de filtros ni de favoritos — filter-engine.js le pide
 * "mostrame este subconjunto de fichas" vía render(), y este módulo
 * solo se encarga de dibujarlas bien. Tampoco decide contenido de UI
 * fuera del mapa: emite eventos, no toca el DOM de afuera.
 *
 * Arquitectura de carga diferida (se conserva de la implementación
 * anterior): Leaflet + Leaflet.markercluster se descargan recién
 * cuando el contenedor del mapa entra en viewport, vía
 * IntersectionObserver — no en el arranque de la página. El fetch de
 * datos (data-store.js) arranca en PARALELO con esa descarga, no
 * encadenado después: ver iniciarFetch() en data-store.js.
 */

const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const CLUSTER_JS = 'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js';
const CLUSTER_CSS = [
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
];

// Centro de Concepción del Uruguay — usado como vista inicial antes
// de que las fichas terminen de cargar.
const CENTRO_CDU = [-32.4835, -58.2331];
const ZOOM_INICIAL = 14;

/**
 * Un color por rubro, para que el pin "hable el mismo idioma" que el
 * resto de la página (leyenda, breakdown, spotlight). Se define acá
 * como single source of truth — Fase 3 (CSS) debe leer estos mismos
 * valores, no reinventar la paleta en el CSS por separado.
 * TODO(Fase 3): sincronizar contra los tokens finales del sistema de
 * diseño (--stamp-red, --seal-gold, --ledger-teal, etc.) una vez que
 * ese archivo de tokens exista como CSS real.
 */
const COLOR_POR_RUBRO = {
  gastronomia: '#A5382A',
  compras: '#3E6E68',
  salud: '#B98A34',
  finanzas: '#5C6B63',
  transporte: '#12211E',
  deporte: '#3E6E68',
  patrimonio: '#A5382A',
  educacion: '#B98A34',
  belleza: '#5C6B63',
  alojamiento: '#12211E',
  servicios_publicos: '#3E6E68',
  mascotas: '#A5382A',
  naturaleza: '#B98A34',
  oficios_tecnicos: '#5C6B63',
  sin_clasificar: '#999999',
};

class PadronMapEngine extends EventTarget {
  /**
   * @param {string} containerId  id del div donde va a vivir el mapa
   * @param {import('./data-store.js').PadronDataStore} dataStore
   */
  constructor(containerId, dataStore) {
    super();
    this.containerId = containerId;
    this.dataStore = dataStore;
    this.map = null;
    this.clusterGroup = null;
    this.markersPorId = new Map();
    this._leafletListo = null;
  }

  /**
   * Arranca el IntersectionObserver — no descarga nada todavía. Se
   * llama una sola vez, apenas la página está lista para observar el
   * contenedor.
   */
  observarViewport() {
    const el = document.getElementById(this.containerId);
    if (!el) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        this._inicializar();
      }
    }, { rootMargin: '200px' });

    observer.observe(el);
  }

  /**
   * Descarga Leaflet + cluster plugin y el dataset EN PARALELO
   * (nunca uno después del otro), inicializa el mapa vacío, y en
   * cuanto ambas cosas están listas dibuja el padrón completo.
   */
  async _inicializar() {
    const leafletPromise = this._cargarLeaflet();
    this.dataStore.iniciarFetch(); // el fetch de red arranca ya, en paralelo

    await leafletPromise;
    this._crearMapa();

    const fichas = await this.dataStore.cargar();
    this.render(fichas);
    this.dispatchEvent(new CustomEvent('mapa:listo'));
  }

  _cargarLeaflet() {
    if (this._leafletListo) return this._leafletListo;

    CLUSTER_CSS.concat(LEAFLET_CSS).forEach((href) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    });

    this._leafletListo = this._cargarScript(LEAFLET_JS).then(() => this._cargarScript(CLUSTER_JS));
    return this._leafletListo;
  }

  _cargarScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      document.head.appendChild(script);
    });
  }

  _crearMapa() {
    // eslint-disable-next-line no-undef -- L llega global desde leaflet.js
    this.map = L.map(this.containerId, { zoomControl: true }).setView(CENTRO_CDU, ZOOM_INICIAL);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(this.map);

    this.clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
    });
    this.map.addLayer(this.clusterGroup);
  }

  /**
   * Redibuja el mapa con exactamente el subconjunto de fichas que le
   * pasen. filter-engine.js es quien decide QUÉ fichas mostrar — este
   * método no filtra nada, solo pinta.
   * @param {Array} fichas
   */
  render(fichas) {
    if (!this.clusterGroup) return; // el mapa todavía no está listo

    this.clusterGroup.clearLayers();
    this.markersPorId.clear();

    fichas.forEach((ficha) => {
      const marker = this._crearMarker(ficha);
      this.markersPorId.set(ficha.id, marker);
      this.clusterGroup.addLayer(marker);
    });
  }

  _crearMarker(ficha) {
    const color = COLOR_POR_RUBRO[ficha.grupo] || COLOR_POR_RUBRO.sin_clasificar;

    // eslint-disable-next-line no-undef
    const icon = L.divIcon({
      className: 'padron-pin',
      html: `<span style="--pill-color:${color}"></span>`,
      iconSize: [18, 18],
    });

    // eslint-disable-next-line no-undef
    const marker = L.marker([ficha.lat, ficha.lng], { icon });
    marker.bindPopup(this._popupHtml(ficha));
    marker.on('click', () => {
      this.dispatchEvent(new CustomEvent('mapa:ficha-clic', { detail: { ficha } }));
    });

    return marker;
  }

  _popupHtml(ficha) {
    const rating = ficha.rating
      ? `<span class="popup-rating">★ ${ficha.rating.toFixed(1)} (${ficha.ratingCount})</span>`
      : '';
    const direccion = ficha.direccion ? `<p class="popup-dir">${ficha.direccion}</p>` : '';

    return `
      <div class="mapa-popup-content-wrapper" data-id="${ficha.id}">
        <p class="popup-categoria">${ficha.categoria ?? ''}</p>
        <h3 class="popup-nombre">${ficha.nombre}</h3>
        ${direccion}
        ${rating}
      </div>
    `.trim();
  }

  /** Centra el mapa en una ficha puntual y abre su popup. */
  irAFicha(id) {
    const marker = this.markersPorId.get(id);
    if (!marker || !this.map) return;
    this.map.setView(marker.getLatLng(), Math.max(this.map.getZoom(), 16));
    this.clusterGroup.zoomToShowLayer(marker, () => marker.openPopup());
  }
}

export { PadronMapEngine, COLOR_POR_RUBRO };
