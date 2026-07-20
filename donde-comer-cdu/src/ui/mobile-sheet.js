/* ═══════════════════════════════════════════════════════════════════
   ui/mobile-sheet.js — Etapa 6 del plan ("Experiencia mobile: bottom
   sheet + toggle, responsive real").

   Contexto: hasta la Etapa 5, en mobile `.area` simplemente apilaba
   el mapa arriba (`order:-1`) y la lista completa abajo, en el flujo
   normal de la página — el usuario tenía que scrollear un mapa fijo
   de 1:1 y después las filas, dos experiencias pegadas con cinta.

   Esta etapa no toca la página en general (el resto del sitio sigue
   siendo scroll largo y normal): solo el bloque `#secuencia` se
   comporta, en mobile, como una vista tipo app contenida —
   `position:relative` con alto fijo (`.area` gana ese estilo por
   CSS) — donde el mapa ocupa todo el fondo y la lista es una "hoja"
   (`#hojaLista`) que se puede arrastrar desde abajo. Sigue siendo un
   bloque más de la página: arriba y abajo el scroll normal del sitio
   no se interrumpe, no hay nada `position:fixed` a la ventana entera.

   Este módulo NO decide qué se ve (eso lo sigue haciendo
   filter-store + list-controller/map-controller, sin cambios): solo
   gobierna en qué "estado visual" está la hoja —
     'peek'  → colapsada, solo el agarre + el contador (mapa a la vista)
     'media' → a mitad de camino
     'full'  → casi toda la pantalla (mapa apenas asoma arriba)
   — y el toggle "mapa"/"lista", que son dos atajos directos a
   'peek'/'full'. En desktop (>900px) este módulo no hace nada: la
   media query correspondiente ya pone `.hoja-lista{ display:contents }`
   así que `#panelLista` vuelve a comportarse como un hijo normal del
   grid de `.area`, tal como en la Etapa 4.
   ═══════════════════════════════════════════════════════════════════ */

var CONSULTA_MOBILE = '(max-width: 900px)';
var UMBRAL_TOQUE_PX = 6; // menos que esto = "tocar", no "arrastrar"

export function crearHojaMobile(opts){
  var dom = opts.dom;
  var mapController = opts.mapController;

  var hoja = dom.hojaLista;
  var agarre = dom.hojaAgarre;
  var btnLista = dom.toggleVistaLista;
  var btnMapa = dom.toggleVistaMapa;

  if (!hoja || !agarre) return { actualizarContador: function(){} };

  var mql = window.matchMedia(CONSULTA_MOBILE);
  var estado = 'peek';       // arranca mostrando el mapa, como en la Etapa 5
  var arrastrando = false;
  var inicioY = 0;
  var altoContenedor = 0;

  function esMobile(){ return mql.matches; }

  /** Aplica el estado a la hoja (clase + atributos de accesibilidad)
   *  y sincroniza el toggle. No mueve el mapa: el contenedor del
   *  mapa no cambia de tamaño, solo queda tapado por la hoja. */
  function aplicarEstado(nuevo){
    estado = nuevo;
    hoja.dataset.estado = estado;
    hoja.style.transform = ''; // suelta cualquier transform inline del arrastre
    agarre.setAttribute('aria-expanded', estado === 'peek' ? 'false' : 'true');

    var esLista = estado !== 'peek';
    if (btnLista){
      btnLista.classList.toggle('activo', esLista);
      btnLista.setAttribute('aria-selected', String(esLista));
    }
    if (btnMapa){
      btnMapa.classList.toggle('activo', !esLista);
      btnMapa.setAttribute('aria-selected', String(!esLista));
    }
  }

  /* ─── arrastre del agarre (Pointer Events cubre touch y mouse) ─── */
  function alEmpezar(e){
    if (!esMobile()) return;
    arrastrando = true;
    inicioY = e.clientY;
    altoContenedor = hoja.parentElement.getBoundingClientRect().height;
    hoja.classList.add('arrastrando');
    agarre.setPointerCapture(e.pointerId);
  }

  function alMover(e){
    if (!arrastrando) return;
    var delta = e.clientY - inicioY; // positivo = dedo bajando = tapar menos
    var actual = desplazamientoDe(estado, altoContenedor);
    var siguiente = actual + delta;
    // no dejar que se arrastre por encima del techo ni por debajo del piso
    var techo = altoContenedor * 0.04;
    var piso = altoContenedor - 58;
    if (siguiente < techo) siguiente = techo;
    if (siguiente > piso) siguiente = piso;
    hoja.style.transform = 'translateY(' + siguiente + 'px)';
  }

  function alSoltar(e){
    if (!arrastrando) return;
    arrastrando = false;
    hoja.classList.remove('arrastrando');
    var movimiento = e.clientY - inicioY;

    if (Math.abs(movimiento) < UMBRAL_TOQUE_PX){
      // fue un toque, no un arrastre: cicla peek → media → full → peek
      aplicarEstado(estado === 'peek' ? 'media' : (estado === 'media' ? 'full' : 'peek'));
      return;
    }

    // arrastre real: dónde quedó el borde de la hoja al soltar,
    // como fracción del contenedor, decide el snap más cercano.
    var actual = altoContenedor
      ? (parseFloat((hoja.style.transform.match(/-?\d+(\.\d+)?/) || ['0'])[0]) / altoContenedor)
      : 0;
    if (actual > 0.66) aplicarEstado('peek');
    else if (actual > 0.22) aplicarEstado('media');
    else aplicarEstado('full');
  }

  /** Traduce un estado a la distancia (px, dentro del contenedor) que
   *  hay que trasladar la hoja — espejo de los valores fijados en CSS
   *  para los estados sin arrastre, necesario acá para calcular el
   *  punto de partida de un arrastre nuevo. */
  function desplazamientoDe(est, alto){
    if (est === 'full') return alto * 0.04;
    if (est === 'media') return alto * 0.42;
    return alto - 58;
  }

  agarre.addEventListener('pointerdown', alEmpezar);
  agarre.addEventListener('pointermove', alMover);
  agarre.addEventListener('pointerup', alSoltar);
  agarre.addEventListener('pointercancel', alSoltar);

  if (btnLista) btnLista.addEventListener('click', function(){ aplicarEstado('full'); });
  if (btnMapa) btnMapa.addEventListener('click', function(){ aplicarEstado('peek'); });

  // cruzar el breakpoint mobile/desktop en vivo (ventana redimensionada,
  // no solo el teléfono rotado) debe soltar cualquier transform inline
  // que haya quedado de un arrastre — si no, al volver a mobile la hoja
  // arranca en una posición vieja en vez del estado declarado.
  function alCambiarBreakpoint(){
    hoja.style.transform = '';
    if (mapController) mapController.invalidateSize();
  }
  if (typeof mql.addEventListener === 'function') mql.addEventListener('change', alCambiarBreakpoint);
  else if (typeof mql.addListener === 'function') mql.addListener(alCambiarBreakpoint); // Safari viejo

  aplicarEstado('peek');

  return {
    /** list-controller ya escribe el contador en `.estado-resultados`;
     *  esto solo copia ese mismo texto al agarre de la hoja, que es lo
     *  único visible cuando está colapsada (`peek`) — así el usuario
     *  ve "cuántos hay" sin tener que abrir la hoja. */
    actualizarContador: function(texto){
      if (dom.hojaAgarreTexto && texto) dom.hojaAgarreTexto.textContent = texto;
    },
    /** main.js la llama cuando la selección cambia (clic en un pin del
     *  mapa, o `?lugar=` restaurado desde la URL): si la hoja estaba
     *  colapsada ('peek', el caso normal en mobile cuando se está
     *  mirando el mapa), la sube a 'media' para que la fila resaltada
     *  —a la que `list-controller.scrollHacia()` ya le pide scroll—
     *  quede realmente a la vista en vez de tapada. Si ya estaba
     *  abierta ('media'/'full') no la mueve, para no interrumpir al
     *  usuario. En desktop no hace nada visible (la hoja es
     *  `display:contents`, ignora el estado). */
    revelarSiEstaColapsada: function(){
      if (esMobile() && estado === 'peek') aplicarEstado('media');
    }
  };
}
