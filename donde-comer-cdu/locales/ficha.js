/* ficha.js — lógica compartida de todas las fichas de locales/
 * Reemplaza los <script> inline bespoke que tenía cada una de las 51 páginas.
 * Lee los datos de #ficha-data (JSON embebido por el template) y:
 *   1. Calcula "Abierto ahora / Cerrado" a partir de schedule_rows (texto en español).
 *   2. Anima las barras de score cuando entran en viewport.
 *   3. Maneja el botón de compartir (Web Share API / clipboard).
 */
(function () {
  "use strict";

  var DATA_EL = document.getElementById("ficha-data");
  var DATA = {};
  try {
    DATA = DATA_EL ? JSON.parse(DATA_EL.textContent) : {};
  } catch (e) {
    DATA = {};
  }

  /* REFACTOR (auditoría "Ficha Maestra" 2026-08): la misma consulta
     window.matchMedia("(prefers-reduced-motion: reduce)").matches se
     repetía, idéntica, en 3 lugares distintos de este archivo
     (inicializarFotosReveal, inicializarRevealGenerico, crearTarjetaResena).
     Una sola fuente de verdad -- se sigue consultando en vivo en cada
     llamado (no se cachea en una variable de módulo) para no asumir que la
     preferencia del usuario no puede cambiar durante la sesión. */
  function prefiereMenosMovimiento() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /* ───────────────────────── PICTOGRAMA DE RUBRO EN HERO (Design System) ──
     URUSPOT-PENDIENTES §6: URU_RUBROS_ICONO_SVG() ya se usaba en el filtro
     "Por rubro" y en la leyenda del mapa, pero no en hero-eyebrow de la
     ficha — la última superficie que faltaba. rubros-meta.js (que expone
     window.URU_RUBROS_ICONO_SVG) ya se carga antes que este script en las
     51 fichas, y #ficha-data ya trae "rubro" — no hace falta tocar HTML. */
  function aplicarPictogramaRubro() {
    var eyebrow = document.querySelector(".hero-eyebrow");
    var textoEl = eyebrow && eyebrow.querySelector(".eyebrow-text");
    if (!eyebrow || !textoEl || !DATA.rubro) return;
    if (typeof window.URU_RUBROS_ICONO_SVG !== "function") return;
    var svg = window.URU_RUBROS_ICONO_SVG(DATA.rubro, { tam: 15, color: "currentColor" });
    if (!svg) return;
    var wrap = document.createElement("span");
    wrap.className = "eyebrow-icono";
    wrap.style.color = "var(--gold)";
    wrap.style.display = "flex";
    wrap.innerHTML = svg;
    eyebrow.insertBefore(wrap, textoEl);
  }

  /* ───────────────────────── CARTA DE POSICIÓN (Fase 4) ─────────────────────
     URUSPOT-PENDIENTES §5: la ficha no tenía ninguna celda de "cómo llegar"
     con mapa — solo el botón grande de más abajo. Esto es PURAMENTE
     presentacional: agrega una 4ª celda al .info-strip ya existente. NO
     toca el algoritmo de recorte/scoring (app.js / motor-exposicion.js) —
     decisión explícita: ese sigue rigiéndose únicamente por tieneFicha(),
     sin relación con esta celda.

     Mapa estático: mismo proveedor de tiles que ya usa motor-mapa.js
     (Carto Voyager, basemaps.cartocdn.com) — sin librería nueva. Un
     <canvas> chico, cuadrícula de tiles alrededor del centro, y la
     matemática estándar de slippy map (misma fórmula que cualquier mapa
     basado en OSM/Carto) para ubicar el pin en el pixel exacto. */
  var CARTA_TILE_SIZE = 256;
  var CARTA_ZOOM = 16;
  var CARTA_SERVIDORES = ['a', 'b', 'c', 'd'];

  function cartaLonLatAPixel(lat, lon, zoom) {
    var n = Math.pow(2, zoom);
    var latRad = lat * Math.PI / 180;
    var x = (lon + 180) / 360 * n;
    var y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
    return { x: x * CARTA_TILE_SIZE, y: y * CARTA_TILE_SIZE };
  }

  function cartaDibujarPin(ctx, cx, cy) {
    var gold = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || '#c9a84c';
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy + 3, 7, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx, cy - 20);
    ctx.bezierCurveTo(cx - 11, cy - 20, cx - 11, cy - 4, cx, cy);
    ctx.bezierCurveTo(cx + 11, cy - 4, cx + 11, cy - 20, cx, cy - 20);
    ctx.closePath();
    ctx.fillStyle = gold;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy - 13, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();
    ctx.restore();
  }

  function cartaRenderizarMinimapa(canvas, lat, lon) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cssW = canvas.clientWidth || 220;
    var cssH = canvas.clientHeight || 130;
    if (!cssW || !cssH) return;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var centro = cartaLonLatAPixel(lat, lon, CARTA_ZOOM);
    var origenX = centro.x - cssW / 2;
    var origenY = centro.y - cssH / 2;
    var n = Math.pow(2, CARTA_ZOOM);

    var tileMinX = Math.floor(origenX / CARTA_TILE_SIZE);
    var tileMaxX = Math.floor((origenX + cssW) / CARTA_TILE_SIZE);
    var tileMinY = Math.floor(origenY / CARTA_TILE_SIZE);
    var tileMaxY = Math.floor((origenY + cssH) / CARTA_TILE_SIZE);

    var pendientes = 0, total = 0;
    for (var tx = tileMinX; tx <= tileMaxX; tx++) {
      for (var ty = tileMinY; ty <= tileMaxY; ty++) total++;
    }
    if (total === 0) return;

    function tileListo() {
      pendientes++;
      if (pendientes === total) cartaDibujarPin(ctx, cssW / 2, cssH / 2);
    }

    for (var txx = tileMinX; txx <= tileMaxX; txx++) {
      for (var tyy = tileMinY; tyy <= tileMaxY; tyy++) {
        if (tyy < 0 || tyy >= n) { tileListo(); continue; }
        (function (txi, tyi) {
          var xValida = ((txi % n) + n) % n;
          var servidor = CARTA_SERVIDORES[Math.abs(txi + tyi) % CARTA_SERVIDORES.length];
          var img = new Image();
          img.onload = function () {
            ctx.drawImage(img, txi * CARTA_TILE_SIZE - origenX, tyi * CARTA_TILE_SIZE - origenY,
              CARTA_TILE_SIZE, CARTA_TILE_SIZE);
            tileListo();
          };
          img.onerror = tileListo;
          img.src = 'https://' + servidor + '.basemaps.cartocdn.com/rastertiles/voyager/' +
            CARTA_ZOOM + '/' + xValida + '/' + tyi + '.png';
        })(txx, tyy);
      }
    }
  }

  // [FIX] (2026-08, integración Fase 4): la versión original de esta
  // función solo entendía el patrón "@lat,lng,zoom" en el href de "Cómo
  // llegar", asumiendo que era el formato universal de los links a Maps
  // de las 51 fichas. No lo es: 48 de las 51 usan
  // "google.com/maps/place/?q=place_id:XXXX" (sin coordenada en la URL)
  // y las que sí traen coordenada (ej. Brødë) la traen como
  // "...search/?api=1&query=LAT,LNG..." — ningún link real de este sitio
  // usa el patrón "@lat,lng,zoom" que se buscaba. Con el código original
  // esta feature nunca se hubiera activado en ninguna ficha real.
  // Fuente primaria ahora: el bloque geo del JSON-LD (LocalBusiness),
  // que sí es universal para 48/51 fichas (dato estructurado ya
  // validado — ver scripts/generar-jsonld-fichas.js) y no depende de
  // qué variante de URL a Maps eligió cada ficha. Fallback: parsear el
  // href visible, cubriendo ambos patrones reales en uso, para las
  // fichas nuevas que ya traigan coordenada en el link pero todavía no
  // en JSON-LD.
  function obtenerCoordenadaLugar() {
    var linkMapa = document.querySelector('a[href*="google.com/maps"]');
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < scripts.length; i++) {
      var datos;
      try {
        datos = JSON.parse(scripts[i].textContent);
      } catch (e) {
        continue;
      }
      var geo = datos && datos.geo;
      if (!geo || geo.latitude == null || geo.longitude == null) continue;
      var lat = parseFloat(geo.latitude), lon = parseFloat(geo.longitude);
      if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
      return { lat: lat, lon: lon, linkMapa: linkMapa };
    }
    var candidatos = document.querySelectorAll('a[href*="google.com/maps"]');
    for (var j = 0; j < candidatos.length; j++) {
      var href = candidatos[j].href;
      var m = href.match(/@(-?[\d.]+),(-?[\d.]+)/) || href.match(/[?&]query=(-?[\d.]+),(-?[\d.]+)/);
      if (!m) continue;
      var lat2 = parseFloat(m[1]), lon2 = parseFloat(m[2]);
      if (!isFinite(lat2) || !isFinite(lon2) || Math.abs(lat2) > 90 || Math.abs(lon2) > 180) continue;
      return { lat: lat2, lon: lon2, linkMapa: candidatos[j] };
    }
    return null;
  }

  function inicializarCartaDePosicion() {
    var strip = document.querySelector('.info-strip');
    if (!strip) return;

    var coord = obtenerCoordenadaLugar();
    if (!coord) return;

    if (navigator.connection && navigator.connection.saveData) return;
    var lat = coord.lat, lon = coord.lon, linkMapa = coord.linkMapa;

    var celda = document.createElement('div');
    celda.className = 'info-cell info-cell--posicion';

    var etiqueta = document.createElement('span');
    etiqueta.className = 'info-cell-label';
    etiqueta.textContent = 'Ubicación exacta';
    celda.appendChild(etiqueta);

    var enlace = document.createElement('a');
    enlace.className = 'carta-posicion';
    enlace.href = linkMapa ? linkMapa.href : ('https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lon);
    enlace.target = '_blank';
    enlace.rel = 'noopener noreferrer';
    enlace.setAttribute('aria-label', 'Ver mapa y cómo llegar' + (DATA.nombre ? ' a ' + DATA.nombre : ''));

    var lienzo = document.createElement('canvas');
    lienzo.className = 'carta-posicion__lienzo';
    enlace.appendChild(lienzo);

    var cta = document.createElement('span');
    cta.className = 'carta-posicion__etiqueta';
    cta.setAttribute('aria-hidden', 'true');
    cta.textContent = '🗺️ Cómo llegar';
    enlace.appendChild(cta);

    celda.appendChild(enlace);
    strip.appendChild(celda);
    strip.classList.add('info-strip--con-mapa');

    requestAnimationFrame(function () { cartaRenderizarMinimapa(lienzo, lat, lon); });
  }

  /* ───────────────────────── BRÚJULA FUNCIONAL (Blueprint V2 Cap. 4.1) ────
     Bearing REAL hacia el lugar, reusando la misma coordenada que
     obtenerCoordenadaLugar() ya factoriza para Carta de Posición.

     Nunca se activa sola: geolocalización y, en iOS 13+, orientación del
     dispositivo son permisos sensibles — se piden recién al tocar el
     botón, nunca en el load de la página.

     Degradación en niveles, nunca "todo o nada":
       1) Sin geolocalización disponible en el navegador: la celda ni se
          crea.
       2) El usuario tocó el botón pero denegó el permiso de ubicación:
          mensaje de error, sin aguja ni texto de dirección.
       3) Con ubicación pero SIN orientación del dispositivo: se muestra
          el punto cardinal + distancia como TEXTO, aguja fija apuntando
          al rumbo absoluto con una nota "aproximado" — nunca se finge
          que la aguja sigue al teléfono si no hay dato real detrás.
       4) Con ambos permisos: aguja en tiempo real, rotando contra el
          rumbo real del dispositivo. */
  function calcularBearing(lat1, lon1, lat2, lon2) {
    var toRad = Math.PI / 180;
    var y = Math.sin((lon2 - lon1) * toRad) * Math.cos(lat2 * toRad);
    var x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
      Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lon2 - lon1) * toRad);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function distanciaMetrosBrujula(lat1, lon1, lat2, lon2) {
    var R = 6371e3, toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  var BRUJULA_CARDINALES = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  function cardinalDe(bearing) {
    return BRUJULA_CARDINALES[Math.round(bearing / 45) % 8];
  }

  function formatoDistanciaBrujula(m) {
    if (m < 1000) return Math.round(m / 10) * 10 + ' m';
    return (m / 1000).toFixed(1).replace('.0', '') + ' km';
  }

  function suavizarAngulo(anterior, nuevo, factor) {
    if (anterior === null || typeof anterior !== 'number' || isNaN(anterior)) return nuevo;
    var delta = ((nuevo - anterior + 540) % 360) - 180;
    return (anterior + delta * factor + 360) % 360;
  }

  function svgRosaDeRumbos() {
    return '<svg class="brujula-rosa" viewBox="0 0 100 100" width="56" height="56" aria-hidden="true" focusable="false">' +
      '<g class="brujula-aguja">' +
      '<path d="M50 12 L58 50 L50 42 L42 50 Z" fill="var(--gold)"/>' +
      '<path d="M50 88 L42 50 L50 58 L58 50 Z" fill="currentColor" opacity=".35"/>' +
      '</g>' +
      '</svg>';
  }

  function inicializarBrujula() {
    if (!navigator.geolocation) return;
    var coord = obtenerCoordenadaLugar();
    if (!coord) return;
    var strip = document.querySelector('.info-strip');
    if (!strip) return;

    var celda = document.createElement('div');
    celda.className = 'info-cell info-cell--brujula';

    var etiqueta = document.createElement('span');
    etiqueta.className = 'info-cell-label';
    etiqueta.textContent = 'Hacia acá';
    celda.appendChild(etiqueta);

    var cuerpoBrujula = document.createElement('div');
    cuerpoBrujula.className = 'brujula-cuerpo';
    cuerpoBrujula.setAttribute('role', 'status');
    cuerpoBrujula.setAttribute('aria-live', 'polite');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'brujula-activar';
    btn.textContent = '🧭 Orientarme';
    btn.setAttribute('aria-label', 'Mostrar hacia dónde queda' + (DATA.nombre ? ' ' + DATA.nombre : ' el lugar') + ' desde donde estás');
    cuerpoBrujula.appendChild(btn);
    celda.appendChild(cuerpoBrujula);
    strip.appendChild(celda);
    strip.classList.add('info-strip--con-brujula');

    var desuscribirOrientacion = null;

    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = 'Ubicándote…';
      navigator.geolocation.getCurrentPosition(function (pos) {
        var origenLat = pos.coords.latitude, origenLon = pos.coords.longitude;
        var bearing = calcularBearing(origenLat, origenLon, coord.lat, coord.lon);
        var distancia = distanciaMetrosBrujula(origenLat, origenLon, coord.lat, coord.lon);
        mostrarResultadoBrujula(cuerpoBrujula, bearing, distancia);
      }, function () {
        btn.disabled = false;
        btn.textContent = '🧭 Orientarme';
        var error = document.createElement('span');
        error.className = 'brujula-error';
        error.setAttribute('role', 'status');
        error.textContent = 'No pudimos acceder a tu ubicación.';
        cuerpoBrujula.appendChild(error);
      }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
    });

    function mostrarResultadoBrujula(cuerpoBrujula, bearing, distancia) {
      cuerpoBrujula.innerHTML = svgRosaDeRumbos();
      var agujaEl = cuerpoBrujula.querySelector('.brujula-aguja');
      agujaEl.style.transform = 'rotate(' + bearing.toFixed(0) + 'deg)';
      agujaEl.style.transformOrigin = '50px 50px';

      var texto = document.createElement('span');
      texto.className = 'brujula-texto';
      texto.textContent = cardinalDe(bearing) + ' · ' + formatoDistanciaBrujula(distancia);
      cuerpoBrujula.appendChild(texto);

      var nota = document.createElement('span');
      nota.className = 'brujula-nota';
      nota.textContent = 'Aproximado — girá tu teléfono para orientarte mejor.';
      cuerpoBrujula.appendChild(nota);

      solicitarPermisoOrientacion(function (concedido) {
        if (!concedido) return;
        nota.remove();
        desuscribirOrientacion = iniciarSeguimientoOrientacion(agujaEl, bearing, cuerpoBrujula, texto);
      });
    }

    function solicitarPermisoOrientacion(callback) {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
          .then(function (resp) { callback(resp === 'granted'); })
          .catch(function () { callback(false); });
      } else if (typeof DeviceOrientationEvent !== 'undefined') {
        callback(true);
      } else {
        callback(false);
      }
    }

    window.addEventListener('pagehide', function () {
      if (desuscribirOrientacion) desuscribirOrientacion();
    }, { once: true });
  }

  var BRUJULA_PRECISION_MIN_ACEPTABLE = 25;
  var BRUJULA_SUAVIZADO_FACTOR = 0.18;
  var BRUJULA_CALIBRACION_SOSTEN_MS = 3000;

  function iniciarSeguimientoOrientacion(agujaEl, bearingHaciaLugar, cuerpoBrujula, texto) {
    var evento = ('ondeviceorientationabsolute' in window) ? 'deviceorientationabsolute' : 'deviceorientation';
    var recibioDatoReal = false;
    var headingSuavizado = null;
    var desdeCuandoImpreciso = null;
    var elementoCalibracion = null;
    var avisoTiempoRealMostrado = false;

    var timeoutSinDatos = setTimeout(function () {
      if (recibioDatoReal) return;
      if (cuerpoBrujula && !cuerpoBrujula.querySelector('.brujula-nota')) {
        var nota = document.createElement('span');
        nota.className = 'brujula-nota';
        nota.textContent = 'Tu dispositivo no da datos de orientación en tiempo real — aproximado.';
        cuerpoBrujula.appendChild(nota);
      }
    }, 2500);

    function actualizarAvisoCalibracion(accuracyDeg, ahora) {
      var imprecisoAhora = typeof accuracyDeg === 'number' && (accuracyDeg < 0 || accuracyDeg > BRUJULA_PRECISION_MIN_ACEPTABLE);

      if (!imprecisoAhora) {
        desdeCuandoImpreciso = null;
        if (elementoCalibracion) {
          elementoCalibracion.remove();
          elementoCalibracion = null;
        }
        return;
      }

      if (desdeCuandoImpreciso === null) desdeCuandoImpreciso = ahora;
      if (ahora - desdeCuandoImpreciso < BRUJULA_CALIBRACION_SOSTEN_MS) return;
      if (elementoCalibracion || !cuerpoBrujula) return;

      elementoCalibracion = document.createElement('span');
      elementoCalibracion.className = 'brujula-nota brujula-calibracion';
      elementoCalibracion.textContent = 'Brújula poco precisa — moví el teléfono en forma de 8 para calibrarla.';
      cuerpoBrujula.appendChild(elementoCalibracion);
    }

    function manejador(e) {
      var heading = null;
      if (typeof e.webkitCompassHeading === 'number') {
        heading = e.webkitCompassHeading;
      } else if (e.absolute && typeof e.alpha === 'number') {
        heading = (360 - e.alpha) % 360;
      } else {
        return;
      }
      recibioDatoReal = true;
      clearTimeout(timeoutSinDatos);

      headingSuavizado = suavizarAngulo(headingSuavizado, heading, BRUJULA_SUAVIZADO_FACTOR);
      var anguloAguja = (bearingHaciaLugar - headingSuavizado + 360) % 360;
      agujaEl.style.transform = 'rotate(' + anguloAguja.toFixed(1) + 'deg)';

      var ahora = (e.timeStamp && typeof e.timeStamp === 'number') ? e.timeStamp : Date.now();
      actualizarAvisoCalibracion(e.webkitCompassAccuracy, ahora);

      if (!avisoTiempoRealMostrado && cuerpoBrujula) {
        avisoTiempoRealMostrado = true;
        var avisoVivo = document.createElement('span');
        avisoVivo.className = 'brujula-nota brujula-en-vivo';
        avisoVivo.textContent = 'Orientación en tiempo real activada.';
        cuerpoBrujula.appendChild(avisoVivo);
        setTimeout(function () {
          if (avisoVivo.parentNode) avisoVivo.remove();
        }, 4000);
      }
    }

    window.addEventListener(evento, manejador);
    return function desuscribir() {
      clearTimeout(timeoutSinDatos);
      window.removeEventListener(evento, manejador);
    };
  }

  /* ───────────────────────── CONTINUIDAD DE APERTURA (Fase 4, Cap. 6) ─────
     "El elemento de origen (la tarjeta tocada) se convierte visualmente en
     el encabezado de la ficha". Contraparte de la view-transition-name que
     ya pinta app.js en .tarjeta-nombre (mismo slug, tomado acá de la URL
     en vez de datos propios porque #ficha-data no incluye el id/slug). */
  function aplicarNombreDeTransicion() {
    var titulo = document.querySelector(".hero-title");
    if (!titulo || !titulo.style) return;
    var m = location.pathname.match(/\/locales\/([^\/]+)\/?$/);
    if (!m) return;
    titulo.style.viewTransitionName = "vt-titulo-" + m[1];
  }

  /* ───────────────────────── ESTADO ABIERTO/CERRADO ───────────────────────── */

  // Nombres completos, plurales y abreviaturas (con y sin tilde) -> índice 0=domingo .. 6=sábado.
  // Los datos reales de las 51 fichas usan las cuatro formas indistintamente
  // ("Sábados", "Mar – Sáb", "Lun · Mié · Jue · Vie · Sáb · Dom", etc.).
  var DIA_INDEX = {
    domingo: 0, domingos: 0, dom: 0,
    lunes: 1, lun: 1,
    martes: 2, mar: 2,
    "miércoles": 3, miercoles: 3, "miér": 3, mier: 3, "mié": 3, mie: 3,
    jueves: 4, jue: 4,
    viernes: 5, vie: 5,
    "sábado": 6, sabado: 6, "sábados": 6, sabados: 6, "sáb": 6, sab: 6,
  };

  // Mismo orden que Date.getDay() (0=domingo). Usado solo para armar el
  // mensaje "Abre el <día> a las HH:MM" cuando la próxima apertura no es
  // hoy ni mañana (ver FIX "próxima apertura futura" más abajo).
  var NOMBRE_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

  // "18:00 p.m. – 02:00 a.m." / "8:00 a.m. – 10:00 p.m." / "8:00 a.m. – 12:30
  // p.m. · 4 – 8 p.m." / "Cerrado" -> lista de {openH, closeH} en escala 0-30
  // (permite cruzar medianoche).
  //
  // BUGFIX (auditoría "Ficha Maestra" 2026-08, ficha.js): esta función se
  // llamaba parseRangoHora (singular) y devolvía UN SOLO rango -- con turno
  // partido ("8:00 a.m. – 12:30 p.m. · 4 – 8 p.m.", el propio horario de
  // Brødë de miércoles a domingo) sólo se veía el primer "–" de la cadena
  // completa, así que calcularEstado() nunca se enteraba del segundo turno:
  // entre las 16:00 y las 20:00 la ficha mostraba "Cerrado hoy" o "Abre
  // mañana" estando en realidad abierta. Ahora la cadena se separa primero
  // por "·" (mismo separador que ya usa este archivo para días, ver
  // expandirDias) y cada turno se parsea por separado, devolviendo un array.
  //
  // De paso resuelve una ambigüedad real de este mismo dato: "4 – 8 p.m."
  // (el segundo turno de Brødë) no aclara a.m./p.m. en el extremo de
  // apertura -- sin más contexto, "4" se leería como 4 a.m. y el turno de
  // la tarde quedaría invertido (4:00–20:00 en vez de 16:00–20:00). Cuando
  // un extremo no trae período propio, hereda el del otro extremo (mismo
  // criterio que usaría una persona leyendo "4 a 8 de la tarde").
  function partesHora(p) {
    var m = p.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
    if (!m) return null;
    return {
      h: parseInt(m[1], 10),
      min: m[2] ? parseInt(m[2], 10) : 0,
      ampm: m[3] ? m[3].replace(/\./g, "").toLowerCase() : null,
    };
  }

  function aHoraDecimal(hm, ampm) {
    var h = hm.h;
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return h + hm.min / 60;
  }

  // [FIX] (2026-08, auditoría migración 1500): la inferencia anterior
  // ("openAmpm = o.ampm || c.ampm", y su espejo para el cierre) copiaba
  // LITERALMENTE el mismo período (am/pm) del extremo que sí lo traía
  // explícito. Funciona para el caso que la motivó ("4 – 8 p.m." -> ambos
  // extremos son de tarde), pero falla en formatos igual de comunes donde
  // los dos extremos NO comparten período: "10 a.m. – 6" (comercio típico,
  // se cerraba a las 6 de la TARDE) se leía como cierre a las 6 de la
  // mañana DEL DÍA SIGUIENTE (20 horas de apertura); "6 p.m. – 1" (previa/
  // bar típico, cierra 1 de la MADRUGADA) se leía como cierre a la 1 de
  // la TARDE del día siguiente (19 horas). Con "tema-nocturno" ya
  // existente en ficha.css para bares/discotecas/previas, este segundo
  // caso no es hipotético para las 1500 fichas.
  //
  // Reemplazo por minimización de duración: para cada extremo AMBIGUO
  // (hora 1-12 sin marcador propio) se generan las 2 lecturas posibles
  // (a.m./p.m.); los extremos ya explícitos, o en formato 24h inequívoco
  // (13-23), generan una sola. Se cruzan todas las combinaciones open×close
  // y se elige la de MENOR duración de turno -- mismo criterio que usaría
  // una persona leyendo el horario: "10 a.m. – 6" son más probablemente
  // 8 horas de comercio (10-18) que 20 horas cruzando el día (10-30);
  // "6 p.m. – 1" son más probablemente 7 horas de noche (18-25, cruza
  // medianoche) que 19 horas hasta la tarde siguiente (18-37). En caso de
  // empate exacto (ambos extremos totalmente ambiguos, ej. "9 – 5" sin
  // ningún a.m./p.m. en toda la fila) se prioriza la lectura diurna
  // (a.m. de apertura) por ser el caso más común en el dataset real,
  // mediante el orden de generación de candidatos (ver candidatosHora).
  function candidatosHora(hm) {
    if (hm.ampm) return [aHoraDecimal(hm, hm.ampm)];
    if (hm.h === 0 || hm.h >= 13) return [hm.h + hm.min / 60]; // 24h inequívoco
    // Ambiguo (1-12 sin marcador): a.m. primero, para que desempate a
    // favor de la lectura diurna cuando las duraciones dan igual.
    return [aHoraDecimal(hm, "am"), aHoraDecimal(hm, "pm")];
  }

  function mejorRango(o, c) {
    var mejor = null;
    candidatosHora(o).forEach(function (open) {
      candidatosHora(c).forEach(function (closeCrudo) {
        var close = closeCrudo <= open ? closeCrudo + 24 : closeCrudo; // cruza medianoche
        var duracion = close - open;
        if (duracion <= 0) return; // no debería pasar, resguardo
        if (!mejor || duracion < mejor.duracion) {
          mejor = { open: open, close: close, duracion: duracion };
        }
      });
    });
    return mejor ? { open: mejor.open, close: mejor.close } : null;
  }

  function parseRangosHora(str) {
    if (!str) return [];
    var s = str.toLowerCase();
    if (s.indexOf("cerrado") !== -1) return [];

    var turnos = s.split(/·|,(?=\s*\d)/).map(function (t) { return t.trim(); }).filter(Boolean);

    var rangos = [];
    turnos.forEach(function (turno) {
      var partes = turno.split(/–|-|a\s(?=\d)/).map(function (p) { return p.trim(); });
      if (partes.length < 2) return;

      var o = partesHora(partes[0]);
      var c = partesHora(partes[1]);
      if (!o || !c) return;

      var rango = mejorRango(o, c);
      if (rango) rangos.push(rango);
    });
    return rangos;
  }

  // Expande "Lunes a Viernes", "Mar – Sáb (mediodía)", "Sábado y Domingo", "Lunes a Domingo",
  // "Lun · Mié · Jue · Vie · Sáb · Dom", "Todos los días", "Fines de semana", día suelto (incl.
  // abreviado/plural) -> lista de índices 0-6. Filas puramente informativas sin día real
  // ("Check-in", "Recepción", "Desayuno"...) devuelven [] intencionalmente.
  function expandirDias(diaStr) {
    if (!diaStr) return [];
    var s = diaStr.toLowerCase().trim();

    if (s.indexOf("todos los d") !== -1) return [0, 1, 2, 3, 4, 5, 6];
    if (s.indexOf("fin de semana") !== -1 || s.indexOf("fines de semana") !== -1) return [0, 6];

    // Quitar aclaraciones entre paréntesis y sufijos de franja horaria ("— mañana", "(noche)", etc.)
    // antes de intentar reconocer los nombres de día.
    var core = s
      .replace(/\([^)]*\)/g, " ")
      .replace(/[—·-]\s*(mañana|tarde|noche|mediod[ií]a)\s*$/, "")
      .trim();

    // Rango de dos días: separador puede ser la palabra "a" o un guion/en dash/em dash.
    var rango = core.match(/^([a-záéíóúñ]+)\s*(?:a|[–—-])\s*([a-záéíóúñ]+)$/iu);
    if (rango) {
      var d1 = DIA_INDEX[rango[1]], d2 = DIA_INDEX[rango[2]];
      if (d1 !== undefined && d2 !== undefined) {
        var out = [];
        var i = d1;
        while (true) {
          out.push(i);
          if (i === d2) break;
          i = (i + 1) % 7;
        }
        return out;
      }
    }

    // Lista de días sueltos separados por coma, " y " o "·".
    var partes = core.split(/,|\sy\s|·/).map(function (p) { return p.trim(); });
    var idxs = [];
    partes.forEach(function (p) {
      if (DIA_INDEX[p] !== undefined) idxs.push(DIA_INDEX[p]);
    });
    return idxs;
  }

  // [FIX] (2026-08, auditoría migración 1500): "Estado actual" (abierto/
  // cerrado) se calculaba con new Date().getDay()/getHours(), que leen la
  // hora LOCAL DEL DISPOSITIVO del visitante -- correcto para alguien
  // navegando desde Argentina, pero silenciosamente incorrecto para
  // cualquiera con el reloj del teléfono en otro huso horario (turista
  // extranjero planificando la visita antes de viajar, el caso de uso más
  // relevante para una guía gastronómica). Argentina no aplica horario de
  // verano desde 2009 (UTC-3 fijo todo el año), así que alcanza con restar
  // el offset y leer los campos en UTC para obtener el reloj real de
  // Concepción del Uruguay sin importar dónde esté physicalmente el
  // dispositivo del visitante.
  function ahoraEnArgentina() {
    var epochMs = Date.now() - 3 * 60 * 60 * 1000;
    var d = new Date(epochMs);
    return { dia: d.getUTCDay(), hora: d.getUTCHours() + d.getUTCMinutes() / 60 };
  }

  function calcularEstado(scheduleRows) {
    if (!Array.isArray(scheduleRows) || !scheduleRows.length) return null;

    // Si ninguna fila del horario corresponde a un día real de la semana (p. ej. fichas de
    // hotel cuyo "horario" son categorías como "Check-in" / "Recepción" / "Desayuno"), no hay
    // base para calcular abierto/cerrado: mostrar un estado neutral en vez de "Cerrado" fijo.
    var hayDatosDeDia = scheduleRows.some(function (row) {
      return expandirDias(row.day).length > 0;
    });
    if (!hayDatosDeDia) {
      return { abierto: null, mensaje: "Consultar horario" };
    }

    // Ventanas horarias de un día de la semana dado (0=domingo..6=sábado),
    // sin considerar cruces de medianoche desde el día anterior -- eso se
    // maneja aparte, solo para "hoy" (ver más abajo), porque para calcular
    // la PRÓXIMA apertura futura alcanza con el horario propio de ese día.
    function ventanasDelDia(dia) {
      var vs = [];
      scheduleRows.forEach(function (row) {
        if (expandirDias(row.day).indexOf(dia) === -1) return;
        parseRangosHora(row.time).forEach(function (rango) { vs.push(rango); });
      });
      return vs;
    }

    function formatoHora(horaDecimal) {
      var h = Math.floor(horaDecimal % 24);
      var m = Math.round((horaDecimal % 1) * 60);
      return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
    }

    var ahora = ahoraEnArgentina();
    var diaHoy = ahora.dia; // 0=domingo
    var horaAhora = ahora.hora;

    var ventanasHoy = ventanasDelDia(diaHoy);

    // También considerar el cierre "extendido" de la ventana de ayer (cruza medianoche)
    var diaAyer = (diaHoy + 6) % 7;
    ventanasDelDia(diaAyer).forEach(function (rango) {
      if (rango.close > 24) {
        ventanasHoy.push({ open: rango.open - 24, close: rango.close - 24 });
      }
    });

    if (ventanasHoy.length) {
      for (var i = 0; i < ventanasHoy.length; i++) {
        var v = ventanasHoy[i];
        if (horaAhora >= v.open && horaAhora < v.close) {
          var minsRestantes = Math.round((v.close - horaAhora) * 60);
          var msg = minsRestantes <= 60
            ? "Cierra en " + minsRestantes + " min"
            : "Abierto ahora";
          return { abierto: true, mensaje: msg };
        }
      }

      // buscar próxima apertura hoy
      var proxima = ventanasHoy
        .filter(function (v) { return v.open > horaAhora; })
        .sort(function (a, b) { return a.open - b.open; })[0];

      if (proxima) {
        return { abierto: false, mensaje: "Abre hoy a las " + formatoHora(proxima.open) };
      }
    }

    // FIX (auditoría Brode, 2026-08): antes, si hoy ya no quedaban turnos
    // (o el día estaba cerrado por completo, ej. lunes/martes de Brødë),
    // acá se devolvía siempre el mismo mensaje "Cerrado" -- literalmente
    // idéntico al label del pill ("Cerrado"), así que el usuario veía
    // "Estado actual: Cerrado / Cerrado" repetido dos veces sin ningún
    // dato nuevo (ver aplicarEstado(): val.textContent=label,
    // sub.textContent=estado.mensaje). Ahora se busca la próxima apertura
    // en los próximos 6 días para dar información real ("Abre mañana a
    // las 08:00" en vez de un "Cerrado" que no dice nada más).
    for (var d = 1; d <= 6; d++) {
      var diaFuturo = (diaHoy + d) % 7;
      var vsFuturas = ventanasDelDia(diaFuturo).sort(function (a, b) { return a.open - b.open; });
      if (vsFuturas.length) {
        var etiquetaDia = d === 1 ? "mañana" : "el " + NOMBRE_DIA[diaFuturo];
        return { abierto: false, mensaje: "Abre " + etiquetaDia + " a las " + formatoHora(vsFuturas[0].open) };
      }
    }

    // Ningún día de la semana tiene horario real (caso extremo, no debería
    // pasar con datos válidos): último fallback, sin más información posible.
    return { abierto: false, mensaje: "Cerrado" };
  }

  function aplicarEstado() {
    var pill = document.getElementById("schedStatusPill");
    var text = document.getElementById("schedStatusText");
    var dot = document.getElementById("schedDot");
    var info = document.getElementById("schedInfo");
    var val = document.getElementById("statusValue");
    var sub = document.getElementById("statusSub");

    var estado = calcularEstado(DATA.schedule_rows);
    if (!estado) return;

    // FIX (legibilidad, 2026-08): el fallback de FASE 4 (26/07/2026)
    // habia aplanado abierto y cerrado al mismo blanco plano porque los
    // tonos verde/rojo de ese momento no llegaban a 4.5:1 (4.34 / 2.98).
    // Pero css/badge-estado.css (usado en la tarjeta de descubrimiento)
    // ya corrio esos mismos dos colores a los valores actuales de
    // tokens.css -- --color-estado-abierto-fondo: rgb(68,153,111) y
    // --color-estado-cerrado: #F04552 -- que si pasan AA sobre el fondo
    // oscuro donde vive este pill (--ink-soft #1a1a1a: 5.00:1 y 4.71:1
    // respectivamente). Esta ficha se habia quedado con el aplanado a
    // blanco de antes y nunca se actualizo, perdiendo el codigo de color
    // verde/rojo que el resto del sitio si tiene: "Abierto" y "Cerrado"
    // se distinguian solo por una diferencia de fondo casi imperceptible,
    // obligando a leer el texto en vez de reconocerlo de un vistazo.
    var openColor = "#44996f", openBg = "rgba(68,153,111,0.15)";
    var closedColor = "#F04552", closedBg = "rgba(240,69,82,0.12)";
    var neutralColor = "#ffffff", neutralBg = "rgba(160,160,160,0.15)";

    var color = estado.abierto === null ? neutralColor : (estado.abierto ? openColor : closedColor);
    var bg = estado.abierto === null ? neutralBg : (estado.abierto ? openBg : closedBg);
    var label = estado.abierto === null ? estado.mensaje : (estado.abierto ? "Abierto ahora" : "Cerrado");

    if (pill) { pill.style.background = bg; pill.style.color = color; }
    if (dot) dot.style.background = color;
    if (text) text.textContent = label;
    if (info) info.textContent = estado.abierto === null ? "" : estado.mensaje;
    if (val) { val.textContent = label; val.style.color = color; }
    if (sub) sub.textContent = estado.abierto === null ? "" : estado.mensaje;
  }

  /* ───────────────────────── BARRAS DE SCORE ───────────────────────── */

  function animarScores() {
    var fills = document.querySelectorAll(".score-fill");
    var section = document.querySelector(".scores-section");
    if (!fills.length || !section) return;

    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          fills.forEach(function (f, i) {
            setTimeout(function () {
              var w = f.dataset.width || "0%";
              var scale = parseFloat(w) / 100;
              if (isNaN(scale)) scale = 0;
              f.style.transform = "scaleX(" + scale + ")";
            }, i * 150);
          });
          io.disconnect();
        }
      }, { threshold: 0.3 });
      io.observe(section);
    } else {
      fills.forEach(function (f) {
        var scale = parseFloat(f.dataset.width) / 100 || 0;
        f.style.transform = "scaleX(" + scale + ")";
      });
    }
  }

  /* ───────────────────────── COMPARTIR ───────────────────────── */

  function initShare() {
    var btn = document.getElementById("share-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var title = (DATA.nombre || document.title) + " — URU SPOT";
      var text = DATA.share_text || "";
      if (navigator.share) {
        navigator.share({ title: title, text: text, url: window.location.href }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(window.location.href).then(function () {
          btn.textContent = "✓ Link copiado";
          setTimeout(function () { btn.innerHTML = "📤 Compartir"; }, 2000);
        });
      }
    });
  }

  /* ───────────────────────── SUPRESIÓN DE VIDRIO EN SCROLL ────────────
     PERF (auditoría scroll, 2026-08-04): .nav es position:fixed con
     backdrop-filter (css/ficha.css → locales/ficha.css) y queda en
     pantalla durante TODO el scroll de la ficha — sin esto, paga el
     costo completo de recomponer el fondo en cada frame. Mismo patrón
     exacto que manejarScrollParaSupresionVidrio() en app.js (índice):
     un solo listener passive, coalescido a como mucho un toggle de
     clase por frame vía rAF (nunca trabajo por evento de scroll crudo),
     y un debounce de 150ms para reponer el vidrio recién cuando el
     usuario realmente se detuvo. */
  var scrollRafPendiente = false;
  var scrollFinTimeout = null;

  function manejarScrollParaSupresionVidrio() {
    if (scrollRafPendiente) return;
    scrollRafPendiente = true;
    requestAnimationFrame(function () {
      scrollRafPendiente = false;
      document.documentElement.classList.add("u-suprimir-vidrio");
      if (scrollFinTimeout) clearTimeout(scrollFinTimeout);
      scrollFinTimeout = setTimeout(function () {
        document.documentElement.classList.remove("u-suprimir-vidrio");
      }, 150);
    });
  }

  function inicializarSupresionVidrio() {
    window.addEventListener("scroll", manejarScrollParaSupresionVidrio, { passive: true });
  }

  /* ───────────────────────── RESEÑAS DE LA COMUNIDAD ──────────────────
     Consume functions/reviews.js (GET/POST /reviews?id=URU-XXXXX), que ya
     existía y funcionaba en el backend sin que ninguna ficha lo llamara
     todavía. Vive en este archivo compartido (no en brode/cuerpo.html)
     para que activar la sección en cualquier otra ficha, más adelante,
     sea solo: 1) sumar "uruId" a su #ficha-data, 2) copiar el bloque
     HTML de reviews-section de Brode a su cuerpo.html. Todo acá abajo
     está guardado con "si no existe el elemento/dato, no hacer nada" —
     no rompe ninguna de las fichas que todavía no tienen esta sección. */

  var ESTRELLA_LLENA = "★", ESTRELLA_VACIA = "☆";

  function dibujarEstrellas(valor) {
    var redondeado = Math.round(valor);
    var out = "";
    for (var i = 1; i <= 5; i++) out += i <= redondeado ? ESTRELLA_LLENA : ESTRELLA_VACIA;
    return out;
  }

  function formatearFechaResena(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleDateString("es-AR", { year: "numeric", month: "long" });
    } catch (e) {
      return "";
    }
  }

  // Crea el DOM de una tarjeta de reseña con textContent (nunca innerHTML)
  // porque autor/comentario son texto enviado por usuarios: no hay que
  // interpretarlo nunca como HTML, sanitizado en el backend o no.
  function crearTarjetaResena(r, indice) {
    var card = document.createElement("article");
    card.className = "review-card review-card--in";
    if (!prefiereMenosMovimiento() && typeof indice === "number") {
      card.style.animationDelay = Math.min(indice * 70, 420) + "ms";
    }

    var autor = document.createElement("div");
    autor.className = "review-author";
    autor.textContent = r.autor || "Anónimo";
    card.appendChild(autor);

    var stars = document.createElement("div");
    stars.className = "review-stars";
    stars.setAttribute("aria-label", "Puntuación: " + r.puntuacion + " de 5");
    stars.textContent = dibujarEstrellas(r.puntuacion);
    card.appendChild(stars);

    if (r.comentario) {
      var texto = document.createElement("p");
      texto.className = "review-text";
      texto.textContent = r.comentario;
      card.appendChild(texto);
    }

    var fechaTexto = formatearFechaResena(r.fecha);
    if (fechaTexto) {
      var fecha = document.createElement("div");
      fecha.className = "review-date";
      fecha.textContent = fechaTexto;
      card.appendChild(fecha);
    }

    return card;
  }

  function cargarResenas() {
    var grid = document.getElementById("reviewsGrid");
    var status = document.getElementById("reviewsStatus");
    var summary = document.getElementById("reviewsSummary");
    if (!grid || !status) return; // ficha sin sección de reseñas todavía

    if (!DATA.uruId) {
      status.textContent = "Reseñas no disponibles para este local por el momento.";
      return;
    }

    status.dataset.loading = "true";

    // MEJORA (auditoría robustez, 2026-08): timeout de 5s vía AbortController.
    // Sin esto, si /reviews no responde (red caída, función colgada), el
    // status se queda en "Cargando…" para siempre. Con el fetch cancelado
    // solo, el usuario ve un mensaje claro en vez de un spinner infinito.
    // Feature-detect: en navegadores sin AbortController simplemente no
    // hay timeout, igual que el comportamiento original.
    var timeoutMs = 5000;
    var controller = ("AbortController" in window) ? new AbortController() : null;
    var timedOut = false;
    var timeoutId = controller && setTimeout(function () {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    fetch("/reviews?id=" + encodeURIComponent(DATA.uruId), controller ? { signal: controller.signal } : undefined)
      .then(function (res) {
        if (!res.ok) throw new Error("http_" + res.status);
        return res.json();
      })
      .then(function (data) {
        if (timeoutId) clearTimeout(timeoutId);
        delete status.dataset.loading;
        var resenas = (data && data.resenas) || [];
        if (!resenas.length) {
          status.textContent = "Todavía no hay reseñas publicadas de la comunidad — ¡sé el primero en dejar la tuya!";
          return;
        }

        status.textContent = "";
        status.hidden = true;

        if (summary && data.promedio != null) {
          var num = document.getElementById("reviewSummaryNum");
          var starsBig = document.getElementById("reviewSummaryStars");
          var count = document.getElementById("reviewSummaryCount");
          var desc = document.getElementById("reviewSummaryDesc");
          if (num) num.textContent = String(data.promedio).replace(".", ",");
          if (starsBig) starsBig.textContent = dibujarEstrellas(data.promedio);
          if (count) count.textContent = data.total + (data.total === 1 ? " reseña" : " reseñas") + " de la comunidad URU SPOT";
          if (desc) desc.textContent = "Promedio de reseñas enviadas y aprobadas por usuarios de URU SPOT.";
          summary.hidden = false;
        }

        grid.innerHTML = "";
        resenas.forEach(function (r, i) {
          grid.appendChild(crearTarjetaResena(r, i));
        });
      })
      .catch(function () {
        if (timeoutId) clearTimeout(timeoutId);
        delete status.dataset.loading;
        status.hidden = false;
        status.textContent = timedOut
          ? "La carga de reseñas tardó demasiado. Recargá la página o escribinos directo por WhatsApp mientras tanto."
          : "No pudimos cargar las reseñas en este momento. Podés escribirnos directo por WhatsApp mientras tanto.";
      });
  }

  function manejarFormularioResena() {
    var form = document.getElementById("reviewForm");
    if (!form) return;
    var btn = document.getElementById("reviewSubmitBtn");
    var statusEl = document.getElementById("reviewFormStatus");
    var autorEl = document.getElementById("reviewAutor");
    var autorError = document.getElementById("reviewAutorError");

    // MEJORA (auditoría UX, 2026-08): validación visual en tiempo real del
    // campo nombre -- aria-invalid + mensaje en el span que ya existía en
    // el HTML (reviewAutorError) pero hasta ahora no se usaba desde JS.
    if (autorEl && autorError) {
      autorEl.addEventListener("blur", function () {
        if (!autorEl.value.trim()) {
          autorEl.setAttribute("aria-invalid", "true");
          autorError.textContent = "Ingresá tu nombre.";
        } else {
          autorEl.removeAttribute("aria-invalid");
          autorError.textContent = "";
        }
      });
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!DATA.uruId) {
        if (statusEl) statusEl.textContent = "No se pudo enviar: reseñas no disponibles para este local.";
        return;
      }

      var autor = (form.autor.value || "").trim();
      var comentario = (form.comentario.value || "").trim();
      var puntuacionEl = form.querySelector('input[name="puntuacion"]:checked');
      var website = form.website ? form.website.value : "";

      // Honeypot anti-spam (auditoría UX, 2026-08): si el campo trampa
      // viene completo, es casi seguro un bot. Se corta acá mismo, sin
      // pegarle al backend, y se muestra éxito falso para no delatar el
      // mecanismo -- el backend (functions/reviews.js) ya lo descartaba
      // también del lado del servidor; esto solo evita el round-trip.
      if (website) {
        form.reset();
        if (statusEl) statusEl.textContent = "¡Gracias! Tu reseña quedó pendiente de aprobación y se va a publicar pronto.";
        return;
      }

      if (!autor) {
        if (statusEl) statusEl.textContent = "Falta tu nombre.";
        if (autorEl) {
          autorEl.setAttribute("aria-invalid", "true");
          autorEl.focus();
        }
        if (autorError) autorError.textContent = "Ingresá tu nombre.";
        return;
      }
      if (autorEl) autorEl.removeAttribute("aria-invalid");
      if (autorError) autorError.textContent = "";

      if (!puntuacionEl) {
        if (statusEl) statusEl.textContent = "Elegí una puntuación de 1 a 5 estrellas.";
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.setAttribute("aria-busy", "true");
      }
      if (statusEl) statusEl.textContent = "Enviando…";

      fetch("/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: DATA.uruId,
          autor: autor,
          puntuacion: parseInt(puntuacionEl.value, 10),
          comentario: comentario,
          website: website,
        }),
      })
        .then(function (res) {
          if (res.status === 429) throw new Error("rate_limit");
          if (!res.ok) throw new Error("http_" + res.status);
          return res.json();
        })
        .then(function () {
          form.reset();
          if (statusEl) statusEl.textContent = "¡Gracias! Tu reseña quedó pendiente de aprobación y se va a publicar pronto.";
        })
        .catch(function (err) {
          if (statusEl) {
            statusEl.textContent = err && err.message === "rate_limit"
              ? "Ya enviaste una reseña hace poco. Probá de nuevo en unos minutos."
              : "No pudimos enviar tu reseña. Probá de nuevo o escribinos por WhatsApp.";
          }
        })
        .finally(function () {
          if (btn) {
            btn.disabled = false;
            btn.removeAttribute("aria-busy");
          }
        });
    });
  }

  /* ───────────────────────── FOTOS CON REVEAL AL SCROLLEAR ────────────
     Contraparte JS de .u-fade-in-img/.reveal-photo en ficha.css. Mismo
     patrón que animarScores() más arriba: IntersectionObserver, dispara
     una sola vez por elemento (unobserve tras el reveal, no un
     toggle que se prenda y apague en cada scroll) y respeta
     prefers-reduced-motion mostrando todo directo, sin animación. Sin
     esta función, o sin JS, las fotos NUNCA se verían (arrancan en
     opacity:0 por CSS) -- por eso el fallback siempre las muestra en vez
     de asumir que el observer va a correr. */
  function inicializarFotosReveal() {
    var fotos = document.querySelectorAll(".u-fade-in-img");
    if (!fotos.length) return;

    if (prefiereMenosMovimiento() || !("IntersectionObserver" in window)) {
      fotos.forEach(function (f) { f.classList.add("is-visible"); });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.2, rootMargin: "0px 0px -80px 0px" }
    );
    fotos.forEach(function (f) { io.observe(f); });
  }

  /* ───────────────── REVELADO GENÉRICO DE CONTENIDO ──────────────────
     Contraparte de inicializarFotosReveal() pero para .u-reveal /
     .u-reveal-stagger (encabezados de sección, side-box, veredicto,
     grillas de tags/amenities/scores — ver ficha.css, sección "PASE DE
     REFINAMIENTO PREMIUM"). Mismo patrón: dispara una sola vez por
     elemento, respeta prefers-reduced-motion, y si no hay
     IntersectionObserver muestra todo directo en vez de dejarlo
     invisible para siempre. */
  function inicializarRevealGenerico() {
    var elementos = document.querySelectorAll(".u-reveal, .u-reveal-stagger");
    if (!elementos.length) return;

    if (prefiereMenosMovimiento() || !("IntersectionObserver" in window)) {
      elementos.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    elementos.forEach(function (el) { io.observe(el); });
  }

  /* ═══════════════════════════════════════════════════════════════════
     PASE DE REFINAMIENTO PREMIUM — comportamiento (2026-08)
     Fusionado desde los <script> exclusivos que tenían index.html y
     cuerpo.html de la ficha Brode. Todo acá abajo sigue el mismo patrón
     defensivo que el resto de este archivo: si el elemento no existe, la
     función no hace nada (así que no rompe en fichas que no incluyan
     este HTML), scroll siempre con requestAnimationFrame, y respeto
     total de prefers-reduced-motion. Las piezas puramente decorativas
     (contador animado, tilt de las highlight-card) además respetan un
     flag opcional en #ficha-data → "features", para que una ficha pueda
     apagarlas sin tocar este archivo (ej. un rubro más sobrio que no
     quiere el efecto tilt). Si "features" no viene en los datos, quedan
     activas por defecto — mismo criterio que ya usaba Brode. */
  var FEATURES = DATA.features || {};

  /* ───────── Barra de progreso de lectura ───────── */
  function inicializarBarraProgreso() {
    var fill = document.getElementById("fichaProgressFill");
    if (!fill) return;
    var pendiente = false;
    function actualizar() {
      pendiente = false;
      var doc = document.documentElement;
      var alto = doc.scrollHeight - doc.clientHeight;
      var pct = alto > 0 ? Math.min(100, Math.max(0, (doc.scrollTop / alto) * 100)) : 0;
      fill.style.width = pct + "%";
    }
    function solicitar() {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(actualizar);
    }
    window.addEventListener("scroll", solicitar, { passive: true });
    window.addEventListener("resize", solicitar, { passive: true });
    actualizar();
  }

  /* ───────── Botón "volver arriba" ───────── */
  function inicializarBotonVolverArriba() {
    var topBtn = document.getElementById("fichaTopBtn");
    if (!topBtn) return;
    var hero = document.querySelector(".hero");
    var pendiente = false;

    function actualizar() {
      pendiente = false;
      var umbral = hero ? Math.max(hero.offsetHeight - 100, 240) : 500;
      topBtn.classList.toggle("is-visible", window.scrollY > umbral);
    }
    function solicitar() {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(actualizar);
    }
    window.addEventListener("scroll", solicitar, { passive: true });
    window.addEventListener("resize", solicitar, { passive: true });
    actualizar();

    topBtn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: prefiereMenosMovimiento() ? "auto" : "smooth" });
    });
  }

  /* ───────── Barra .cta-sticky + scroll-cue del hero: un solo listener ─────────
     Único punto del sistema que muestra/oculta la barra fija de
     Llamar/WhatsApp en mobile (antes existía, además, una segunda barra
     redundante -- #brodeStickyBar -- exclusiva de index.html en Brode;
     se eliminó al fusionar, ver CAMBIOS-2026-08.txt). */
  function inicializarCtaSticky() {
    var hero = document.querySelector(".hero");
    var cue = document.querySelector(".hero-scroll-cue");
    var cta = document.querySelector(".cta-sticky");
    if (!hero || (!cue && !cta)) return;

    var stickyLinks = cta ? cta.querySelectorAll("a") : [];
    var altoHero = hero.offsetHeight;
    var pendiente = false;

    function actualizar() {
      pendiente = false;
      var y = window.scrollY || window.pageYOffset;
      if (cue) cue.classList.toggle("is-hidden", y > 80);
      if (cta) {
        var visible = y > altoHero * 0.6;
        cta.classList.toggle("is-visible", visible);
        for (var i = 0; i < stickyLinks.length; i++) {
          if (visible) stickyLinks[i].removeAttribute("tabindex");
          else stickyLinks[i].setAttribute("tabindex", "-1");
        }
      }
    }
    function solicitar() {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(actualizar);
    }

    actualizar();
    window.addEventListener("scroll", solicitar, { passive: true });
    window.addEventListener("resize", function () {
      altoHero = hero.offsetHeight;
      solicitar();
    }, { passive: true });
  }

  /* ───────── Contador animado de números de puntuación ─────────
     Versión única: antes existían DOS implementaciones independientes
     de este mismo efecto corriendo en paralelo sobre la misma página
     (una en el <script> de index.html, otra en el de cuerpo.html) --
     ver CAMBIOS-2026-08.txt. ficha.js ya anima las BARRAS (.score-fill,
     función animarScores() de arriba); esto sólo suma el conteo de los
     NÚMEROS para que lleguen con la misma sensación de revelado. */
  function inicializarContadorPuntuacion() {
    if (FEATURES.animatedCounters === false) return;
    if (prefiereMenosMovimiento() || !("IntersectionObserver" in window)) return;

    function animar(el, delayMs) {
      if (!el) return;
      var textoFinal = (el.textContent || "").trim();
      var destino = parseFloat(textoFinal.replace(",", "."));
      if (isNaN(destino)) return;
      var decimales = /[.,]/.test(textoFinal) ? 1 : 0;
      setTimeout(function () {
        var inicio = null;
        var duracion = 1000;
        function paso(ts) {
          if (inicio === null) inicio = ts;
          var t = Math.min(1, (ts - inicio) / duracion);
          var facilitado = 1 - Math.pow(1 - t, 3);
          el.textContent = (destino * facilitado).toFixed(decimales);
          if (t < 1) requestAnimationFrame(paso);
          else el.textContent = textoFinal;
        }
        requestAnimationFrame(paso);
      }, delayMs || 0);
    }

    // Score del hero: siempre sobre el fold, entra en cascada con el resto
    // del hero (mismo delay que .hero-score en el CSS), no depende de scroll.
    var numHero = document.querySelector(".hero-score .score-num");
    if (numHero) setTimeout(function () { animar(numHero, 0); }, 950);

    // Números de la sección de scores: disparan al entrar en viewport.
    var section = document.querySelector(".scores-section");
    if (!section) return;
    var big = section.querySelector(".score-big-num");
    var vals = section.querySelectorAll(".score-val");
    if (!big && !vals.length) return;

    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      animar(big, 0);
      vals.forEach(function (v, i) { animar(v, i * 150); }); // mismo stagger que animarScores()
      io.disconnect();
    }, { threshold: 0.3 });
    io.observe(section);
  }

  /* ───────── Spotlight + tilt en highlight cards ───────── */
  function inicializarHighlightCards() {
    if (FEATURES.tiltCards === false) return;
    var puedeHover = !!(window.matchMedia && window.matchMedia("(hover:hover) and (pointer:fine)").matches);
    if (!puedeHover || prefiereMenosMovimiento()) return;
    var cards = document.querySelectorAll(".highlight-card");
    if (!cards.length) return;

    cards.forEach(function (card) {
      card.addEventListener("mousemove", function (ev) {
        var r = card.getBoundingClientRect();
        var x = ev.clientX - r.left;
        var y = ev.clientY - r.top;
        card.style.setProperty("--mx", x + "px");
        card.style.setProperty("--my", y + "px");

        var relX = (x / r.width) - 0.5;
        var relY = (y / r.height) - 0.5;
        var rotY = relX * 8;
        var rotX = relY * -8;
        card.style.transform =
          "translateY(-4px) rotateX(" + rotX.toFixed(2) + "deg) rotateY(" + rotY.toFixed(2) + "deg) scale(1.015)";
      }, { passive: true });

      card.addEventListener("mouseleave", function () {
        card.style.transform = "";
      });
    });
  }

  /* ───────── Acordeón FAQ: alto animado sobre el <details> nativo ───────── */
  function inicializarFaqAcordeon() {
    var items = document.querySelectorAll(".faq-item");
    if (!items.length) return;
    if (prefiereMenosMovimiento() || typeof Element.prototype.animate !== "function") return;

    items.forEach(function (item) {
      var summary = item.querySelector("summary");
      var contenido = item.querySelector(".faq-a");
      if (!summary || !contenido) return;
      var animando = false;

      summary.addEventListener("click", function (e) {
        e.preventDefault();
        if (animando) return;
        if (item.open) {
          cerrar();
        } else {
          item.open = true;
          abrir();
        }
      });

      function abrir() {
        animando = true;
        var alto = contenido.scrollHeight;
        contenido.style.overflow = "hidden";
        var anim = contenido.animate(
          [{ height: "0px", opacity: 0.4 }, { height: alto + "px", opacity: 1 }],
          { duration: 260, easing: "cubic-bezier(.16,.84,.32,1)" }
        );
        anim.onfinish = function () {
          contenido.style.overflow = "";
          contenido.style.height = "";
          animando = false;
        };
      }

      function cerrar() {
        animando = true;
        var alto = contenido.scrollHeight;
        contenido.style.overflow = "hidden";
        var anim = contenido.animate(
          [{ height: alto + "px", opacity: 1 }, { height: "0px", opacity: 0.4 }],
          { duration: 220, easing: "cubic-bezier(.16,.84,.32,1)" }
        );
        anim.onfinish = function () {
          item.open = false;
          contenido.style.overflow = "";
          contenido.style.height = "";
          animando = false;
        };
      }
    });
  }

  /* ───────── Chips de copiar (teléfono / dirección) ───────── */
  function inicializarCopyChips() {
    var chips = document.querySelectorAll(".copy-chip[data-copy-value]");
    if (!chips.length) return;

    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      chips.forEach(function (chip) { chip.style.display = "none"; });
      return;
    }

    chips.forEach(function (chip) {
      var etiquetaOriginal = chip.textContent;
      // MEJORA (auditoría UX, 2026-08): si el chip tiene un .copy-feedback
      // como hermano (como el de teléfono en Info rápida), el resultado
      // también se anuncia ahí vía aria-live -- mejor para lectores de
      // pantalla que solo el cambio de texto del botón. Si no existe (la
      // mayoría de los chips no lo tienen), se mantiene el comportamiento
      // anterior sin romper nada.
      var feedback = chip.nextElementSibling;
      if (!feedback || !feedback.classList.contains("copy-feedback")) feedback = null;

      chip.addEventListener("click", function () {
        var valor = chip.getAttribute("data-copy-value");
        navigator.clipboard
          .writeText(valor)
          .then(function () {
            chip.setAttribute("data-copied", "true");
            chip.textContent = "✓ Copiado";
            if (feedback) feedback.textContent = "✓ Copiado al portapapeles";
            setTimeout(function () {
              chip.removeAttribute("data-copied");
              chip.textContent = etiquetaOriginal;
              if (feedback) feedback.textContent = "";
            }, 1800);
          })
          .catch(function () {
            chip.textContent = "❌ No se pudo copiar";
            if (feedback) feedback.textContent = "No se pudo copiar. Copiá el valor manualmente.";
            setTimeout(function () {
              chip.textContent = etiquetaOriginal;
              if (feedback) feedback.textContent = "";
            }, 3000);
          });
      });
    });
  }

  /* ───────────────────────── INIT ───────────────────────── */

  document.addEventListener("DOMContentLoaded", function () {
    aplicarEstado();
    animarScores();
    initShare();
    aplicarNombreDeTransicion();
    aplicarPictogramaRubro();
    inicializarSupresionVidrio();
    inicializarCartaDePosicion();
    inicializarBrujula();
    cargarResenas();
    manejarFormularioResena();
    inicializarFotosReveal();
    inicializarRevealGenerico();
    inicializarBarraProgreso();
    inicializarBotonVolverArriba();
    inicializarCtaSticky();
    inicializarContadorPuntuacion();
    inicializarHighlightCards();
    inicializarFaqAcordeon();
    inicializarCopyChips();
  });
})();
