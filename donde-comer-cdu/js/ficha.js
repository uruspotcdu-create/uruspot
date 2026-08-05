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

  /* ───────────────────────── CARTA DE POSICIÓN (Fase 4) ─────────────────────
     URUSPOT-PENDIENTES §5: la ficha no tenía ninguna celda de "cómo llegar"
     con mapa — solo el botón grande de más abajo. Esto es PURAMENTE
     presentacional: agrega una 4ª celda al .info-strip ya existente. NO
     toca el algoritmo de recorte/scoring (app.js / motor-exposicion.js) —
     decisión explícita: ese sigue rigiéndose únicamente por tieneFicha(),
     sin relación con esta celda.

     Fuente de la coordenada: el propio link "Cómo llegar" a Google Maps
     que cada ficha ya trae en el DOM, con el patrón "@lat,lng,zoom" —
     el mismo patrón que scripts/generar-jsonld-fichas.js usa para el
     JSON-LD. Se lee del <a> real (no del JSON-LD) para que esto funcione
     en las 51 fichas por igual, no solo en las 48 que ya tienen geo en
     el JSON-LD.

     Mapa estático: mismo proveedor de tiles que ya usa motor-mapa.js
     (Carto Voyager, basemaps.cartocdn.com) — sin librería nueva. Un
     <canvas> chico, cuadrícula de tiles alrededor del centro, y la
     matemática estándar de slippy map (misma fórmula que cualquier
     mapa basado en OSM/Carto) para ubicar el pin en el pixel exacto. */
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
    // sombra de contacto en el suelo, para que el pin no "flote"
    ctx.beginPath();
    ctx.ellipse(cx, cy + 3, 7, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fill();
    // gota
    ctx.beginPath();
    ctx.moveTo(cx, cy - 20);
    ctx.bezierCurveTo(cx - 11, cy - 20, cx - 11, cy - 4, cx, cy);
    ctx.bezierCurveTo(cx + 11, cy - 4, cx + 11, cy - 20, cx, cy - 20);
    ctx.closePath();
    ctx.fillStyle = gold;
    ctx.fill();
    // ojo
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
        // tiles fuera del rango válido del mundo (no hay wraparound acá:
        // una ficha real nunca está tan cerca del polo/antimeridiano)
        if (tyy < 0 || tyy >= n) { tileListo(); continue; }
        (function (txi, tyi) {
          var xValida = ((txi % n) + n) % n; // wraparound horizontal real
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

  // Factorizado de inicializarCartaDePosicion() (vivía inline ahí antes)
  // para que inicializarBrujula() lea la MISMA coordenada sin duplicar
  // el parseo ni arriesgarse a que las dos features un día lean de
  // fuentes distintas. OJO: no alcanza con el primer link a
  // google.com/maps del documento — el chip-google del hero ("★ 4.4
  // Google · 626 reseñas") también apunta a Maps, pero vía place_id
  // (sin @lat,lng,zoom) y matchea el selector igual. Se recorre TODOS
  // los links a Maps del documento y se usa el primero cuyo href de
  // verdad trae la coordenada (el botón/sección "Cómo llegar").
  function obtenerCoordenadaLugar() {
    var candidatos = document.querySelectorAll('a[href*="google.com/maps"]');
    for (var i = 0; i < candidatos.length; i++) {
      var m = candidatos[i].href.match(/@(-?[\d.]+),(-?[\d.]+),/);
      if (!m) continue;
      var lat = parseFloat(m[1]), lon = parseFloat(m[2]);
      if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
      return { lat: lat, lon: lon, linkMapa: candidatos[i] };
    }
    return null;
  }

  function inicializarCartaDePosicion() {
    var strip = document.querySelector('.info-strip');
    if (!strip) return;

    var coord = obtenerCoordenadaLugar();
    if (!coord) return;

    // Save-Data / conexión lenta: no se pide la cuadrícula de tiles.
    // Degrada a no mostrar la celda nueva en vez de mostrarla rota o en
    // blanco — el botón "Cómo llegar" grande de más abajo sigue ahí.
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
    enlace.href = linkMapa.href;
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

    // El canvas recién tiene tamaño real (clientWidth/Height) una vez que
    // esta celda ya está en el DOM y el layout se resolvió.
    requestAnimationFrame(function () { cartaRenderizarMinimapa(lienzo, lat, lon); });
  }

  /* ───────────────────────── BRÚJULA FUNCIONAL (Blueprint V2 Cap. 4.1) ────
     El asset decorativo del Ambient Engine (assets/ambient/brujula/) es
     "ancla simbólica" — nunca tuvo la contraparte funcional que pedía el
     capítulo: bearing REAL hacia el lugar, no una animación ambiental sin
     dato detrás. Reusa la misma coordenada que obtenerCoordenadaLugar()
     ya factoriza para Carta de Posición.

     Nunca se activa sola: geolocalización y, en iOS 13+, orientación del
     dispositivo son permisos sensibles — se piden recién al tocar el
     botón, nunca en el load de la página.

     Degradación en niveles, nunca "todo o nada":
       1) Sin geolocalización disponible en el navegador: la celda ni se
          crea.
       2) El usuario tocó el botón pero denegó el permiso de ubicación:
          mensaje de error, sin aguja ni texto de dirección.
       3) Con ubicación pero SIN orientación del dispositivo (desktop, la
          mayoría de Android sin sensor de rumbo, o permiso de
          orientación denegado/no soportado en iOS): se muestra el punto
          cardinal + distancia como TEXTO, aguja fija apuntando al rumbo
          absoluto con una nota "verificá con tu propio norte" — nunca
          se finge que la aguja sigue al teléfono si no hay dato real de
          orientación detrás.
       4) Con ambos permisos: aguja en tiempo real, rotando contra el
          rumbo real del dispositivo. */
  function calcularBearing(lat1, lon1, lat2, lon2) {
    var toRad = Math.PI / 180;
    var y = Math.sin((lon2 - lon1) * toRad) * Math.cos(lat2 * toRad);
    var x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
      Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lon2 - lon1) * toRad);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  // Mismo cálculo (haversine) que ya vive por separado en app.js,
  // motor-exposicion.js y proyeccion.js — ficha.js no comparte módulo
  // con esos archivos (páginas estáticas independientes), así que
  // duplicarlo acá sigue la misma convención que ya usa el resto del
  // repo en vez de introducir un import nuevo para una sola función.
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

  // SVG de la rosa de rumbos: autocontenido (sin <use> a las primitivas
  // del Ambient Engine — esas están pensadas para el sistema decorativo
  // de fondo, con su propia convención de tokens/viewBox; este es un
  // widget funcional real, mismo criterio que separa URU_RUBROS_ICONO_SVG
  // de los assets de rubro del mapa). Un solo <path> para la aguja
  // (triángulo norte + cola sur), rotado vía CSS transform en JS.
  function svgRosaDeRumbos() {
    return '<svg class="brujula-rosa" viewBox="0 0 100 100" width="56" height="56" aria-hidden="true" focusable="false">' +
      '<circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".35"/>' +
      '<circle cx="50" cy="8" r="2.4" fill="currentColor" opacity=".6"/>' +
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

    var cuerpo = document.createElement('div');
    cuerpo.className = 'brujula-cuerpo';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'brujula-activar';
    btn.textContent = '🧭 Orientarme';
    btn.setAttribute('aria-label', 'Mostrar hacia dónde queda' + (DATA.nombre ? ' ' + DATA.nombre : ' el lugar') + ' desde donde estás');
    cuerpo.appendChild(btn);
    celda.appendChild(cuerpo);
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
        mostrarResultadoBrujula(cuerpo, bearing, distancia);
      }, function () {
        btn.disabled = false;
        btn.textContent = '🧭 Orientarme';
        var error = document.createElement('span');
        error.className = 'brujula-error';
        error.setAttribute('role', 'status');
        error.textContent = 'No pudimos acceder a tu ubicación.';
        cuerpo.appendChild(error);
      }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
    });

    function mostrarResultadoBrujula(cuerpo, bearing, distancia) {
      cuerpo.innerHTML = svgRosaDeRumbos();
      var agujaEl = cuerpo.querySelector('.brujula-aguja');
      // En reposo (sin dato de orientación real) la aguja apunta al
      // rumbo absoluto asumiendo "arriba de la pantalla = norte" — es
      // una aproximación, por eso el texto de abajo lo aclara.
      agujaEl.style.transform = 'rotate(' + bearing.toFixed(0) + 'deg)';
      agujaEl.style.transformOrigin = '50px 50px';

      var texto = document.createElement('span');
      texto.className = 'brujula-texto';
      texto.textContent = cardinalDe(bearing) + ' · ' + formatoDistanciaBrujula(distancia);
      cuerpo.appendChild(texto);

      var nota = document.createElement('span');
      nota.className = 'brujula-nota';
      nota.textContent = 'Aproximado — girá tu teléfono para orientarte mejor.';
      cuerpo.appendChild(nota);

      solicitarPermisoOrientacion(function (concedido) {
        if (!concedido) return;
        nota.remove();
        desuscribirOrientacion = iniciarSeguimientoOrientacion(agujaEl, bearing);
      });
    }

    // iOS 13+ exige pedir el permiso con un gesto de usuario real (este
    // click lo es); en el resto de las plataformas no hay API de
    // permiso separada — solo hay que intentar escuchar el evento y
    // ver si trae datos utilizables (ver iniciarSeguimientoOrientacion).
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

    // Se limpia el listener al salir de la ficha (view-transition o
    // navegación normal) para no dejar un sensor activo de fondo.
    window.addEventListener('pagehide', function () {
      if (desuscribirOrientacion) desuscribirOrientacion();
    }, { once: true });
  }

  function iniciarSeguimientoOrientacion(agujaEl, bearingHaciaLugar) {
    var evento = ('ondeviceorientationabsolute' in window) ? 'deviceorientationabsolute' : 'deviceorientation';
    var recibioDatoReal = false;

    // Si en ~2.5s ningún evento trajo un heading utilizable (sensor
    // ausente, permiso concedido pero sin hardware real detrás — pasa
    // en algunos Android/desktop), se deja la aguja fija tal como
    // quedó en mostrarResultadoBrujula() en vez de rotarla con datos
    // basura. La nota de "aproximado" ya se sacó al conceder el
    // permiso, así que se repone si termina sin dato real.
    var timeoutSinDatos = setTimeout(function () {
      if (recibioDatoReal) return;
      var cuerpo = agujaEl.closest('.brujula-cuerpo');
      if (cuerpo && !cuerpo.querySelector('.brujula-nota')) {
        var nota = document.createElement('span');
        nota.className = 'brujula-nota';
        nota.textContent = 'Tu dispositivo no da datos de orientación en tiempo real — aproximado.';
        cuerpo.appendChild(nota);
      }
    }, 2500);

    function manejador(e) {
      var heading = null;
      // Safari/iOS: heading absoluto ya resuelto por el sistema, en el
      // sentido correcto (0 = norte, crece en sentido horario).
      if (typeof e.webkitCompassHeading === 'number') {
        heading = e.webkitCompassHeading;
      } else if (e.absolute && typeof e.alpha === 'number') {
        // Spec estándar: alpha crece en sentido antihorario desde el
        // norte cuando el evento es absoluto — se invierte para tener
        // el mismo sentido horario que webkitCompassHeading arriba.
        heading = (360 - e.alpha) % 360;
      } else {
        return; // sin dato real utilizable — no rotar con basura
      }
      recibioDatoReal = true;
      clearTimeout(timeoutSinDatos);
      var anguloAguja = (bearingHaciaLugar - heading + 360) % 360;
      agujaEl.style.transform = 'rotate(' + anguloAguja.toFixed(1) + 'deg)';
    }

    window.addEventListener(evento, manejador);
    return function desuscribir() {
      clearTimeout(timeoutSinDatos);
      window.removeEventListener(evento, manejador);
    };
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

  // "18:00 p.m. – 02:00 a.m." / "8:00 a.m. – 10:00 p.m." / "Cerrado" -> {openH, closeH} en escala 0-30 (permite cruzar medianoche)
  function parseRangoHora(str) {
    if (!str) return null;
    var s = str.toLowerCase();
    if (s.indexOf("cerrado") !== -1) return null;

    var partes = s.split(/–|-|a\s(?=\d)/).map(function (p) { return p.trim(); });
    if (partes.length < 2) return null;

    function aHora24(p) {
      var m = p.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
      if (!m) return null;
      var h = parseInt(m[1], 10);
      var min = m[2] ? parseInt(m[2], 10) : 0;
      var ampm = m[3] ? m[3].replace(/\./g, "").toLowerCase() : null;
      if (ampm === "pm" && h < 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      return h + min / 60;
    }

    var open = aHora24(partes[0]);
    var close = aHora24(partes[1]);
    if (open === null || close === null) return null;
    if (close <= open) close += 24; // cruza medianoche
    return { open: open, close: close };
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

  function calcularEstado(scheduleRows) {
    if (!scheduleRows || !scheduleRows.length) return null;

    // Si ninguna fila del horario corresponde a un día real de la semana (p. ej. fichas de
    // hotel cuyo "horario" son categorías como "Check-in" / "Recepción" / "Desayuno"), no hay
    // base para calcular abierto/cerrado: mostrar un estado neutral en vez de "Cerrado" fijo.
    var hayDatosDeDia = scheduleRows.some(function (row) {
      return expandirDias(row.day).length > 0;
    });
    if (!hayDatosDeDia) {
      return { abierto: null, mensaje: "Consultar horario" };
    }

    var ahora = new Date();
    var diaHoy = ahora.getDay(); // 0=domingo
    var horaAhora = ahora.getHours() + ahora.getMinutes() / 60;

    var ventanasHoy = [];
    scheduleRows.forEach(function (row) {
      var dias = expandirDias(row.day);
      if (dias.indexOf(diaHoy) === -1) return;
      var rango = parseRangoHora(row.time);
      if (rango) ventanasHoy.push(rango);
    });

    // También considerar el cierre "extendido" de la ventana de ayer (cruza medianoche)
    var diaAyer = (diaHoy + 6) % 7;
    scheduleRows.forEach(function (row) {
      var dias = expandirDias(row.day);
      if (dias.indexOf(diaAyer) === -1) return;
      var rango = parseRangoHora(row.time);
      if (rango && rango.close > 24) {
        ventanasHoy.push({ open: rango.open - 24, close: rango.close - 24 });
      }
    });

    if (!ventanasHoy.length) {
      return { abierto: false, mensaje: "Cerrado hoy" };
    }

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
      var h = Math.floor(proxima.open % 24);
      var m = Math.round((proxima.open % 1) * 60);
      var hs = (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
      return { abierto: false, mensaje: "Abre hoy a las " + hs };
    }

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

    // FASE 4 (26/07/2026): mismos valores que --color-estado-abierto/
    // --color-estado-cerrado en css/tokens.css, actualizados juntos
    // para pasar WCAG AA 4.5:1 (antes 4.34:1 / 2.98:1, no alcanzaban).
    // Este archivo no puede leer variables CSS desde JS, así que los
    // valores quedan duplicados a mano — si tokens.css vuelve a
    // cambiar estos dos colores, hay que actualizar acá también.
    var openColor = "#44996f", openBg = "rgba(68,153,111,0.15)";
    var closedColor = "#f04552", closedBg = "rgba(240,69,82,0.12)";
    var neutralColor = "#a0a0a0", neutralBg = "rgba(160,160,160,0.15)";

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

  /* ───────────────────────── CTA STICKY EN MOBILE (Fase 4) ─────────────────
     URUSPOT-PENDIENTES §5: en mobile, una vez que el usuario scrollea más
     allá del hero, los botones de contacto/"cómo llegar" quedan arriba,
     lejos, y hay que volver a subir para actuar. Barra fija abajo, solo en
     mobile, que aparece cuando el hero sale de vista y junta las DOS
     acciones que más importan: contacto directo (WhatsApp si existe, si no
     teléfono) y "Cómo llegar" — reutilizando los links reales que ya trae
     cada ficha, sin datos nuevos ni tocar ningún HTML de locales/*.
     Igual que Carta de Posición: puramente presentacional, sin ninguna
     relación con el algoritmo de recorte/scoring. */
  function ctaStickyBuscarContacto() {
    return document.querySelector('a[href^="https://wa.me/"]') ||
      document.querySelector('a[href^="tel:"]');
  }

  function ctaStickyBuscarComoLlegar() {
    var links = document.querySelectorAll('a[href*="google.com/maps"], a[href*="maps.google.com"]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].textContent.indexOf('Cómo llegar') !== -1) return links[i];
    }
    return null;
  }

  function inicializarCtaSticky() {
    var contacto = ctaStickyBuscarContacto();
    var comoLlegar = ctaStickyBuscarComoLlegar();
    if (!contacto && !comoLlegar) return; // nada real que ofrecer, no se crea la barra

    var hero = document.querySelector('.hero');
    if (!hero || typeof IntersectionObserver !== 'function') return;

    var barra = document.createElement('div');
    barra.className = 'cta-sticky';
    barra.setAttribute('role', 'region');
    barra.setAttribute('aria-label', 'Acciones rápidas');

    if (contacto) {
      var esWhatsapp = contacto.href.indexOf('wa.me') !== -1;
      var btnContacto = document.createElement('a');
      btnContacto.className = 'cta-sticky__btn cta-sticky__btn--principal';
      btnContacto.href = contacto.href;
      btnContacto.target = contacto.target || '_blank';
      btnContacto.rel = 'noopener noreferrer';
      btnContacto.textContent = esWhatsapp ? '💬 WhatsApp' : '📞 Llamar';
      barra.appendChild(btnContacto);
    }
    if (comoLlegar) {
      var btnMapa = document.createElement('a');
      btnMapa.className = 'cta-sticky__btn cta-sticky__btn--secundario';
      btnMapa.href = comoLlegar.href;
      btnMapa.target = '_blank';
      btnMapa.rel = 'noopener noreferrer';
      btnMapa.textContent = '🗺️ Cómo llegar';
      barra.appendChild(btnMapa);
    }

    document.body.appendChild(barra);

    var io = new IntersectionObserver(function (entries) {
      barra.classList.toggle('is-visible', !entries[0].isIntersecting);
    }, { threshold: 0 });
    io.observe(hero);
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

  /* ───────────────────────── INIT ───────────────────────── */

  document.addEventListener("DOMContentLoaded", function () {
    aplicarEstado();
    animarScores();
    initShare();
    aplicarNombreDeTransicion();
    aplicarPictogramaRubro();
    inicializarSupresionVidrio();
    inicializarCartaDePosicion();
    inicializarCtaSticky();
    inicializarBrujula();
  });
})();
