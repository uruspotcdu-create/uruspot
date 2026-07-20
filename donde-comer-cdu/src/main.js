/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — main.js

   Orquestador: el único archivo que conoce todas las piezas.
     - filter-store    → única fuente de verdad de texto/rubros/
                          favoritos/selección
     - url-state        → Etapa 1: refleja filter-store en la URL
                          (deep-linking, "atrás" funcional) — restaurado
                          acá después de haberse perdido en la Etapa 2
     - list-controller  → filas de la lista
     - map-controller    → Etapa 3: mapa real (Leaflet + clustering),
                          reemplaza el mapa esquemático de puntos.
                          Etapa 4: además centra el mapa en la
                          selección activa y ofrece "buscar en esta
                          área" (filterStore.setArea)
     - ui/*             → chips, buscador, índice de rubros, FAQ

   filter-store sigue siendo el único punto de acople: list-controller
   y map-controller no se conocen entre sí, solo escuchan sus cambios.
   La única excepción puntual es acá abajo, en `arrancar()`: main.js
   sí conoce a los dos para pedirle al mapa que centre y a la lista
   que scrollee cuando cambia la selección (Etapa 4) — ninguno de los
   dos controllers se llama directamente entre sí.
   ═══════════════════════════════════════════════════════════════════ */

import { RUBROS_META } from './data/rubros-meta.js';
import { PREGUNTAS } from './data/preguntas.js';
import { cargarPadron, cargarDetallesEnSegundoPlano } from './data/fetch-padron.js';
import { createFilterStore } from './filters/filter-store.js';
import { createUrlState } from './state/url-state.js';
import { createListController } from './list/list-controller.js';
import { createMapController } from './map/map-controller.js';
import { construirRubros } from './ui/rubros-index.js';
import { construirFAQ } from './ui/faq.js';
import { construirChips, cablearHerramientas } from './ui/chips.js';
import { crearHojaMobile } from './ui/mobile-sheet.js';
import { escapeHTML } from './util/escape-html.js';

(function(){
  'use strict';

  var DOM = {};
  ['fraccionNum', 'fraccionTotal', 'aperturaNum', 'chipsRubros', 'inputBuscar', 'chipFav',
   'chipLimpiar', 'chipArea', 'estadoResultados', 'panelLista', 'mapaReal', 'listaRubros',
   'listaPreguntas', 'sinResultados', 'secuencia', 'hojaLista', 'hojaAgarre', 'hojaAgarreTexto',
   'toggleVistaLista', 'toggleVistaMapa'].forEach(function(id){
    DOM[id] = document.getElementById(id);
  });

  var favoritosIniciales = {};
  try { favoritosIniciales = JSON.parse(localStorage.getItem('uruspot_favoritos') || '{}'); }
  catch(e){ favoritosIniciales = {}; }

  var filterStore = createFilterStore(favoritosIniciales);
  var listController = null;
  var mapController = null;
  var urlState = createUrlState({ dom: DOM, filterStore: filterStore });

  /* ─── 1. carga bloqueante: lugares-core.json ─── */
  cargarPadron()
    .then(function(resultado){
      arrancar(resultado.registro, resultado.porId);
      cargarDetallesEnSegundoPlano(resultado.porId, function(){
        listController.refrescarFilasVisibles();
      });
    })
    .catch(function(err){
      console.error('No se pudo cargar lugares-core.json', err);
      if (DOM.secuencia){
        DOM.secuencia.innerHTML = '<p style="padding:40px 0;color:var(--tinta-60)">No se pudo cargar el padrón. Probá recargar la página.</p>';
      }
    });

  /* ─── 2. arranque: una vez que hay datos, construir todo lo estático
     (fracción, rubros, FAQ, chips) y la secuencia completa. ─── */
  function arrancar(registro, porId){
    var total = registro.length;
    if (DOM.fraccionNum) DOM.fraccionNum.textContent = '0000';
    if (DOM.fraccionTotal) DOM.fraccionTotal.textContent = total;
    if (DOM.aperturaNum) DOM.aperturaNum.textContent = total.toLocaleString('es-AR');

    construirRubros({ dom: DOM, registro: registro, rubrosMeta: RUBROS_META });
    construirFAQ({ dom: DOM, preguntas: PREGUNTAS });
    construirChips({ dom: DOM, registro: registro, rubrosMeta: RUBROS_META, filterStore: filterStore });
    cablearHerramientas({ dom: DOM, filterStore: filterStore });

    listController = createListController({
      dom: DOM,
      registro: registro,
      porId: porId,
      filterStore: filterStore,
      rubrosMeta: RUBROS_META,
      escapeHTML: escapeHTML
    });
    listController.construirSecuenciaYArea();
    listController.cablearFraccionPersistente();

    mapController = createMapController({
      dom: DOM,
      registro: registro,
      porId: porId,
      filterStore: filterStore,
      escapeHTML: escapeHTML
    });
    mapController.iniciarPerezoso();

    // Etapa 6: la hoja mobile no conoce filter-store ni el registro —
    // solo gobierna el estado visual (peek/media/full) de #hojaLista y
    // el toggle mapa/lista. Le pasamos mapController para que pueda
    // pedir invalidateSize() al cruzar el breakpoint mobile/desktop.
    var mobileSheet = crearHojaMobile({ dom: DOM, mapController: mapController });

    /** Copia el texto ya armado por list-controller en `.estado-resultados`
     *  al agarre de la hoja — es lo único visible cuando está colapsada
     *  ('peek'), así el usuario ve "cuántos hay" sin abrirla. */
    function sincronizarAgarre(){
      if (DOM.estadoResultados) mobileSheet.actualizarContador(DOM.estadoResultados.textContent);
    }

    // única fuente de verdad de filtros → cada lente reacciona por su lado.
    filterStore.onChange(function(tipo){
      listController.render();
      sincronizarAgarre();
      // Etapa 4: selección compartida, ahora sincronizada de verdad en
      // ambos sentidos — clic en una fila centra el mapa en su pin;
      // clic en un pin (o `?lugar=` restaurado desde la URL) hace
      // scroll hasta la fila. filter-store no sabe cuál de los dos
      // gatilló el cambio, así que ambos reaccionan siempre: el que ya
      // estaba a la vista simplemente no se mueve mucho.
      if (tipo === 'seleccion'){
        var id = filterStore.estado.seleccionado;
        listController.resaltar(id, false);
        if (id){
          listController.scrollHacia(id);
          mapController.centrarEnSeleccion(id);
          mobileSheet.revelarSiEstaColapsada();
        }
      }
    });
    listController.render();
    sincronizarAgarre();

    // Etapa 1 restaurada: aplica ?q=&rubros=&fav=&lugar= de la URL
    // actual (si la hay) y engancha popstate + escritura de URL.
    urlState.iniciar(listController);
  }

})();
