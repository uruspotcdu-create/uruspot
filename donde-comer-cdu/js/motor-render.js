/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — motor-render.js
   Motor de mapa propio. No es una librería genérica envuelta: dibuja
   sus propios tiles y marcadores sobre <canvas>, con su propio
   vocabulario visual (mismos tokens de --granate / --fondo-2 que el
   resto de la interfaz), su propia interacción (pan, zoom, cluster,
   popup) y su propio puente de accesibilidad por teclado.

   No decide QUÉ mostrar — eso es responsabilidad de motor-mapa.js y
   del presupuesto de exposición. Este archivo solo sabe CÓMO
   mostrarlo. Separación deliberada: calibrar cuántos puntos van al
   mapa nunca debería requerir tocar el renderer, y cambiar cómo se
   ve un marcador nunca debería requerir tocar la regla de negocio.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var PROY = global.URU_PROYECCION;
  // Voyager en vez de dark_all: mismo proveedor (CARTO/OSM), pero un
  // basemap claro con calles, nombres y puntos de referencia legibles
  // — dark_all a este tamaño quedaba casi negro y sin contraste.
  var TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  var SUBDOMINIOS = ['a', 'b', 'c', 'd'];
  var TAM_TILE = PROY.TAM_TILE;
  var RADIO_MARCADOR = 10;
  var RADIO_CLUSTER_PX = 36;
  var ZOOM_MIN = 4, ZOOM_MAX = 18;

  var cacheTiles = Object.create(null);

  function cargarTile(z, x, y) {
    var n = Math.pow(2, z);
    var xw = ((x % n) + n) % n; // wrap horizontal
    if (y < 0 || y >= n) return null;
    var clave = z + '/' + xw + '/' + y;
    var existente = cacheTiles[clave];
    if (existente) return existente;
    var img = new Image();
    img.crossOrigin = 'anonymous';
    var sub = SUBDOMINIOS[(xw + y) % SUBDOMINIOS.length];
    img.src = TILE_URL.replace('{s}', sub).replace('{z}', z).replace('{x}', xw).replace('{y}', y).replace('{r}', (global.devicePixelRatio > 1 ? '@2x' : ''));
    var entrada = { img: img, cargado: false };
    img.onload = function () { entrada.cargado = true; if (entrada.onReady) entrada.onReady(); };
    cacheTiles[clave] = entrada;
    return entrada;
  }

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function crear(contenedor, opciones) {
    opciones = opciones || {};
    var emisor = {};
    (function initEmisor() {
      var listeners = Object.create(null);
      emisor.on = function (ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb); return emisor; };
      emisor.emitir = function (ev, payload) { (listeners[ev] || []).forEach(function (cb) { cb(payload); }); };
    })();

    contenedor.classList.add('uru-mapa');
    contenedor.setAttribute('role', 'application');
    contenedor.setAttribute('aria-label', opciones.ariaLabel || 'Mapa interactivo de lugares');

    var lienzo = document.createElement('canvas');
    lienzo.className = 'uru-mapa-lienzo';
    lienzo.tabIndex = 0;
    lienzo.setAttribute('aria-hidden', 'true'); // la navegación real accesible es la lista paralela
    contenedor.appendChild(lienzo);
    var ctx = lienzo.getContext('2d');

    var listaAccesible = document.createElement('ul');
    listaAccesible.className = 'uru-mapa-lista-accesible';
    listaAccesible.setAttribute('aria-label', 'Lista de lugares en el mapa');
    contenedor.appendChild(listaAccesible);

    var controles = document.createElement('div');
    controles.className = 'uru-mapa-controles';
    controles.innerHTML =
      '<button type="button" class="uru-mapa-btn" data-zoom="1" aria-label="Acercar">+</button>' +
      '<button type="button" class="uru-mapa-btn" data-zoom="-1" aria-label="Alejar">−</button>';
    contenedor.appendChild(controles);

    var atribucion = document.createElement('div');
    atribucion.className = 'uru-mapa-atribucion';
    atribucion.innerHTML = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';
    contenedor.appendChild(atribucion);

    var popup = document.createElement('div');
    popup.className = 'uru-mapa-popup';
    popup.hidden = true;
    contenedor.appendChild(popup);

    var etiqueta = document.createElement('div');
    etiqueta.className = 'uru-mapa-etiqueta';
    etiqueta.hidden = true;
    contenedor.appendChild(etiqueta);

    var viewport = { lat: opciones.lat || -32.4833, lng: opciones.lng || -58.2333, zoom: opciones.zoom || 14, ancho: 0, alto: 0 };
    var puntos = [];
    var idResaltado = null;
    var puntoResaltado = null;
    var idAbierto = null;
    var clusterResaltadoKey = null;
    var ondas = []; // feedback de toque: cada clic dispara un anillo que se expande y se apaga

    function dispararOnda(x, y, color) {
      ondas.push({ x: x, y: y, inicio: performance.now(), color: color || '#ECEDEF' });
      animarOndas();
    }
    function animarOndas() {
      if (!ondas.length) return;
      var ahora = performance.now();
      ondas = ondas.filter(function (o) { return ahora - o.inicio < 550; });
      dibujar();
      if (ondas.length) requestAnimationFrame(animarOndas);
    }
    function dibujarOndas() {
      var ahora = performance.now();
      ondas.forEach(function (o) {
        var t = Math.min(1, (ahora - o.inicio) / 550);
        var e = 1 - Math.pow(1 - t, 2);
        ctx.beginPath();
        ctx.arc(o.x, o.y, 6 + e * 34, 0, Math.PI * 2);
        ctx.strokeStyle = hexARgba(o.color, (1 - t) * 0.65);
        ctx.lineWidth = 2.5;
        ctx.stroke();
      });
    }
    var dpr = Math.max(1, global.devicePixelRatio || 1);
    var animacionZoom = null;

    function medir() {
      var rect = contenedor.getBoundingClientRect();
      viewport.ancho = rect.width;
      viewport.alto = rect.height;
      lienzo.width = Math.round(rect.width * dpr);
      lienzo.height = Math.round(rect.height * dpr);
      lienzo.style.width = rect.width + 'px';
      lienzo.style.height = rect.height + 'px';
    }

    var pendienteRedibujo = false;
    function redibujar() {
      if (pendienteRedibujo) return;
      pendienteRedibujo = true;
      requestAnimationFrame(function () { pendienteRedibujo = false; dibujar(); });
    }

    function dibujar() {
      if (!viewport.ancho || !viewport.alto) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewport.ancho, viewport.alto);
      dibujarTiles();
      var proyectados = proyectarPuntos();
      var clusters = agruparEnClusters(proyectados);
      dibujarMarcadores(clusters);
      dibujarOndas();
      posicionarPopupAbierto(proyectados);
      posicionarEtiqueta(proyectados);
    }

    function dibujarTiles() {
      var zTiles = PROY.clamp(Math.round(viewport.zoom), ZOOM_MIN, ZOOM_MAX);
      var escalaExtra = Math.pow(2, viewport.zoom - zTiles);
      var centroMundo = PROY.proyectar(viewport.lat, viewport.lng, zTiles);
      var origenX = centroMundo.x - (viewport.ancho / 2) / escalaExtra;
      var origenY = centroMundo.y - (viewport.alto / 2) / escalaExtra;

      var tileX0 = Math.floor(origenX / TAM_TILE) - 1;
      var tileY0 = Math.floor(origenY / TAM_TILE) - 1;
      var tileX1 = Math.ceil((origenX + viewport.ancho / escalaExtra) / TAM_TILE) + 1;
      var tileY1 = Math.ceil((origenY + viewport.alto / escalaExtra) / TAM_TILE) + 1;

      for (var tx = tileX0; tx <= tileX1; tx++) {
        for (var ty = tileY0; ty <= tileY1; ty++) {
          var entrada = cargarTile(zTiles, tx, ty);
          if (!entrada) continue;
          var sx = (tx * TAM_TILE - origenX) * escalaExtra;
          var sy = (ty * TAM_TILE - origenY) * escalaExtra;
          var s = TAM_TILE * escalaExtra;
          if (entrada.cargado) {
            ctx.drawImage(entrada.img, sx, sy, s, s);
          } else if (!entrada.onReady) {
            entrada.onReady = redibujar;
          }
        }
      }
    }

    function proyectarPuntos() {
      return puntos.map(function (p) {
        var xy = PROY.puntoAPantalla(p.lat, p.lng, viewport);
        return { punto: p, x: xy.x, y: xy.y };
      }).filter(function (p) {
        return p.x > -40 && p.x < viewport.ancho + 40 && p.y > -40 && p.y < viewport.alto + 40;
      });
    }

    // Clustering por grilla en espacio de pantalla: solo agrupa cuando
    // hay verdadero solapamiento visual, no por regla arbitraria de zoom.
    function agruparEnClusters(proyectados) {
      var usados = new Array(proyectados.length);
      var resultado = [];
      for (var i = 0; i < proyectados.length; i++) {
        if (usados[i]) continue;
        var grupo = [proyectados[i]];
        usados[i] = true;
        for (var j = i + 1; j < proyectados.length; j++) {
          if (usados[j]) continue;
          var dx = proyectados[i].x - proyectados[j].x;
          var dy = proyectados[i].y - proyectados[j].y;
          if (Math.sqrt(dx * dx + dy * dy) < RADIO_CLUSTER_PX) { grupo.push(proyectados[j]); usados[j] = true; }
        }
        if (grupo.length === 1) {
          resultado.push({ tipo: 'punto', x: grupo[0].x, y: grupo[0].y, punto: grupo[0].punto });
        } else {
          var cx = grupo.reduce(function (s, g) { return s + g.x; }, 0) / grupo.length;
          var cy = grupo.reduce(function (s, g) { return s + g.y; }, 0) / grupo.length;
          resultado.push({ tipo: 'cluster', x: cx, y: cy, miembros: grupo.map(function (g) { return g.punto; }) });
        }
      }
      return resultado;
    }

    function dibujarMarcadores(clusters) {
      clusters.forEach(function (c) {
        if (c.tipo === 'cluster') { dibujarCluster(c); return; }
        var esResaltado = c.punto.id === idResaltado;
        var esAbierto = c.punto.id === idAbierto;
        dibujarMarcador(c.x, c.y, c.punto, esResaltado || esAbierto);
      });
    }

    // Pin con forma de gota — silueta reconocible de "lugar en un mapa",
    // no una bolita genérica. El color codifica el rubro (ver
    // rubros-meta.js) para que de un vistazo se distinga qué es qué,
    // igual que la franja de color de la etiqueta de rubro en las
    // tarjetas. Además de color, la ventana central lleva la inicial
    // del rubro: el color solo no alcanza (dos rubros pueden quedar
    // parecidos en un mapa oscuro, y no es accesible para daltonismo),
    // la letra es un segundo canal de distinción que no depende del color.
    function dibujarMarcador(x, y, punto, activo) {
      var color = (punto && punto.color) || '#C97A83';
      var r = activo ? RADIO_MARCADOR + 2.5 : RADIO_MARCADOR;
      ctx.save();
      if (activo) {
        ctx.beginPath();
        ctx.arc(x, y, r + 9, 0, Math.PI * 2);
        ctx.fillStyle = hexARgba(color, 0.22);
        ctx.fill();
      }
      ctx.translate(x, y);
      ctx.beginPath();
      // Cabeza circular del pin + punta triangular hacia abajo
      ctx.arc(0, -r * 0.35, r, Math.PI * 0.08, Math.PI * 0.92, true);
      ctx.lineTo(0, r * 1.55);
      ctx.closePath();
      var grad = ctx.createLinearGradient(0, -r * 1.3, 0, r * 1.55);
      grad.addColorStop(0, aclarar(color, 18));
      grad.addColorStop(1, color);
      ctx.fillStyle = grad;
      ctx.shadowColor = 'rgba(0,0,0,.45)';
      ctx.shadowBlur = activo ? 10 : 5;
      ctx.shadowOffsetY = 2;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = activo ? 2.5 : 2;
      ctx.strokeStyle = '#ECEDEF';
      ctx.stroke();
      // Centro claro: hace de "ventana" del pin, referencia visual de
      // mapas profesionales (Google/Apple Maps usan el mismo recurso)
      ctx.beginPath();
      ctx.arc(0, -r * 0.35, r * 0.36, 0, Math.PI * 2);
      ctx.fillStyle = '#0A0D13';
      ctx.fill();
      // Inicial del rubro dentro de la ventana — segundo canal de
      // distinción además del color (ver comentario arriba).
      if (punto && punto.rubroNombre) {
        var inicial = String(punto.rubroNombre).trim().charAt(0).toUpperCase();
        ctx.fillStyle = color;
        ctx.font = '700 ' + Math.round(r * 0.5) + 'px "IBM Plex Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(inicial, 0, -r * 0.35 + 0.5);
      }
      ctx.restore();
    }

    function hexARgba(hex, alpha) {
      var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }
    function aclarar(hex, pct) {
      var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      r = Math.min(255, r + pct * 2.55); g = Math.min(255, g + pct * 2.55); b = Math.min(255, b + pct * 2.55);
      return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
    }

    // Antes: todo cluster era el mismo círculo bordó, sin importar qué
    // rubros agrupaba — indistinguible de otro cluster, y del resto de
    // los pines. Ahora el cluster hereda el color de los rubros que
    // agrupa: si todos sus miembros son del mismo rubro, se rellena con
    // ese color (mismo código que un pin individual); si mezcla rubros,
    // se deja neutro pero con el borde en el color dominante, para que
    // "mixto" también se lea de un vistazo en vez de camuflarse.
    function dibujarCluster(c) {
      var conteo = Object.create(null);
      c.miembros.forEach(function (m) {
        var col = (m && m.color) || '#C97A83';
        conteo[col] = (conteo[col] || 0) + 1;
      });
      var colores = Object.keys(conteo).sort(function (a, b) { return conteo[b] - conteo[a]; });
      var colorDominante = colores[0];
      var esUnRubro = colores.length === 1;

      var r = 16;
      var esResaltado = clusterResaltadoKey === (Math.round(c.x) + ':' + Math.round(c.y));
      var rGlow = r + (esResaltado ? 11 : 7);
      // Halo de luz detrás del cluster — sin esto el círculo quedaba
      // plano contra el tile pálido del basemap y se perdía. Con el
      // halo, el mismo cluster "flota" sobre el mapa.
      ctx.beginPath();
      ctx.arc(c.x, c.y, rGlow, 0, Math.PI * 2);
      ctx.fillStyle = hexARgba(colorDominante, esResaltado ? 0.35 : 0.22);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      var gradCluster = ctx.createRadialGradient(c.x - r * 0.3, c.y - r * 0.3, 1, c.x, c.y, r);
      if (esUnRubro) {
        gradCluster.addColorStop(0, aclarar(colorDominante, 22));
        gradCluster.addColorStop(1, colorDominante);
      } else {
        gradCluster.addColorStop(0, 'rgba(32,38,50,.96)');
        gradCluster.addColorStop(1, 'rgba(14,17,24,.96)');
      }
      ctx.fillStyle = gradCluster;
      ctx.shadowColor = 'rgba(0,0,0,.4)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 1;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = esUnRubro ? '#ECEDEF' : colorDominante;
      ctx.stroke();
      ctx.fillStyle = esUnRubro ? '#0A0D13' : '#ECEDEF';
      ctx.font = '700 12px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(c.miembros.length), c.x, c.y + 1);
    }

    /* ── Interacción: pan + zoom (mouse, touch, rueda, teclado) ── */
    var arrastrando = false, ultimoX = 0, ultimoY = 0, sePanneo = false;

    lienzo.addEventListener('pointerdown', function (e) {
      arrastrando = true; sePanneo = false;
      ultimoX = e.clientX; ultimoY = e.clientY;
      lienzo.setPointerCapture(e.pointerId);
    });
    lienzo.addEventListener('pointermove', function (e) {
      var proyectados = proyectarPuntos();
      var clusters = agruparEnClusters(proyectados);
      if (!arrastrando) {
        var cerca = buscarMarcadorEn(e, clusters);
        if (cerca && cerca.tipo === 'punto') {
          lienzo.style.cursor = 'pointer';
          if (cerca.punto.id !== idResaltado) { idResaltado = cerca.punto.id; puntoResaltado = cerca.punto; emisor.emitir('hover', cerca.punto); redibujar(); }
          if (clusterResaltadoKey !== null) { clusterResaltadoKey = null; redibujar(); }
        } else if (cerca && cerca.tipo === 'cluster') {
          lienzo.style.cursor = 'pointer';
          var key = Math.round(cerca.x) + ':' + Math.round(cerca.y);
          if (clusterResaltadoKey !== key) { clusterResaltadoKey = key; redibujar(); }
          if (idResaltado !== null) { idResaltado = null; puntoResaltado = null; emisor.emitir('hoverOut'); redibujar(); }
        } else if (idResaltado !== null || clusterResaltadoKey !== null) {
          idResaltado = null; puntoResaltado = null; clusterResaltadoKey = null; lienzo.style.cursor = 'grab'; emisor.emitir('hoverOut'); redibujar();
        }
        return;
      }
      var dx = e.clientX - ultimoX, dy = e.clientY - ultimoY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) sePanneo = true;
      ultimoX = e.clientX; ultimoY = e.clientY;
      var escala = TAM_TILE * Math.pow(2, viewport.zoom);
      var nuevo = PROY.desproyectar(
        PROY.proyectar(viewport.lat, viewport.lng, viewport.zoom).x - dx,
        PROY.proyectar(viewport.lat, viewport.lng, viewport.zoom).y - dy,
        viewport.zoom
      );
      viewport.lat = nuevo.lat; viewport.lng = nuevo.lng;
      cerrarPopup();
      redibujar();
    });
    lienzo.addEventListener('pointerup', function (e) {
      arrastrando = false;
      lienzo.style.cursor = 'grab';
      if (!sePanneo) {
        var proyectados = proyectarPuntos();
        var clusters = agruparEnClusters(proyectados);
        var cerca = buscarMarcadorEn(e, clusters);
        if (cerca) manejarClick(cerca);
      }
    });
    lienzo.style.cursor = 'grab';

    function buscarMarcadorEn(evtPointer, clusters) {
      var rect = lienzo.getBoundingClientRect();
      var mx = evtPointer.clientX - rect.left, my = evtPointer.clientY - rect.top;
      var mejor = null, mejorDist = 20;
      clusters.forEach(function (c) {
        var d = Math.sqrt(Math.pow(c.x - mx, 2) + Math.pow(c.y - my, 2));
        if (d < mejorDist) { mejorDist = d; mejor = c; }
      });
      return mejor;
    }

    function manejarClick(c) {
      if (c.tipo === 'cluster') {
        dispararOnda(c.x, c.y, c.miembros[0] && c.miembros[0].color);
        var enc = PROY.encuadrar(c.miembros, viewport.ancho, viewport.alto, 50, ZOOM_MAX);
        var zoomDestino = Math.max(viewport.zoom + 1.2, Math.min(viewport.zoom + 2.4, enc.zoom));
        animarA(enc.lat, enc.lng, PROY.clamp(zoomDestino, ZOOM_MIN, ZOOM_MAX));
        return;
      }
      dispararOnda(c.x, c.y, c.punto && c.punto.color);
      abrirPopup(c.punto);
      emisor.emitir('click', c.punto);
    }

    lienzo.addEventListener('wheel', function (e) {
      e.preventDefault();
      var delta = e.deltaY > 0 ? -0.5 : 0.5;
      viewport.zoom = PROY.clamp(viewport.zoom + delta, ZOOM_MIN, ZOOM_MAX);
      cerrarPopup();
      redibujar();
    }, { passive: false });

    lienzo.addEventListener('dblclick', function () {
      animarA(viewport.lat, viewport.lng, Math.min(viewport.zoom + 1, ZOOM_MAX));
    });

    lienzo.addEventListener('keydown', function (e) {
      var paso = 40;
      if (e.key === 'ArrowUp') { desplazarPx(0, paso); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { desplazarPx(0, -paso); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { desplazarPx(paso, 0); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { desplazarPx(-paso, 0); e.preventDefault(); }
      else if (e.key === '+' || e.key === '=') { animarA(viewport.lat, viewport.lng, Math.min(viewport.zoom + 1, ZOOM_MAX)); }
      else if (e.key === '-') { animarA(viewport.lat, viewport.lng, Math.max(viewport.zoom - 1, ZOOM_MIN)); }
    });

    function desplazarPx(dx, dy) {
      var c0 = PROY.proyectar(viewport.lat, viewport.lng, viewport.zoom);
      var n = PROY.desproyectar(c0.x - dx, c0.y - dy, viewport.zoom);
      viewport.lat = n.lat; viewport.lng = n.lng;
      redibujar();
    }

    controles.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-zoom]');
      if (!btn) return;
      var dz = parseFloat(btn.dataset.zoom);
      animarA(viewport.lat, viewport.lng, PROY.clamp(viewport.zoom + dz, ZOOM_MIN, ZOOM_MAX));
    });

    // Soporte táctil de pellizco (pinch) básico
    var pinchDist0 = null, pinchZoom0 = null;
    contenedor.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        pinchDist0 = distanciaToques(e.touches);
        pinchZoom0 = viewport.zoom;
      }
    }, { passive: true });
    contenedor.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2 && pinchDist0) {
        var d = distanciaToques(e.touches);
        viewport.zoom = PROY.clamp(pinchZoom0 + Math.log2(d / pinchDist0), ZOOM_MIN, ZOOM_MAX);
        redibujar();
      }
    }, { passive: true });
    contenedor.addEventListener('touchend', function (e) { if (e.touches.length < 2) pinchDist0 = null; });
    function distanciaToques(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }

    /* ── Animación suave de zoom/pan (usada por focar/encuadrar) ── */
    function animarA(lat, lng, zoom, duracion) {
      if (animacionZoom) cancelAnimationFrame(animacionZoom);
      var origen = { lat: viewport.lat, lng: viewport.lng, zoom: viewport.zoom };
      var destino = { lat: lat, lng: lng, zoom: zoom };
      var inicio = performance.now();
      duracion = duracion || 420;
      function paso(ahora) {
        var t = Math.min(1, (ahora - inicio) / duracion);
        var e = easeOutCubic(t);
        viewport.lat = origen.lat + (destino.lat - origen.lat) * e;
        viewport.lng = origen.lng + (destino.lng - origen.lng) * e;
        viewport.zoom = origen.zoom + (destino.zoom - origen.zoom) * e;
        redibujar();
        if (t < 1) animacionZoom = requestAnimationFrame(paso);
        else animacionZoom = null;
      }
      animacionZoom = requestAnimationFrame(paso);
    }

    /* ── Popup ── */
    function abrirPopup(punto) {
      idAbierto = punto.id;
      popup.innerHTML =
        '<div class="uru-mapa-popup-cerrar" role="button" tabindex="0" aria-label="Cerrar">×</div>' +
        '<strong class="uru-mapa-popup-nombre"></strong>' +
        '<div class="uru-mapa-popup-direccion"></div>' +
        (punto.href ? '<a class="uru-mapa-popup-link">Ver ficha completa →</a>' : '');
      popup.querySelector('.uru-mapa-popup-nombre').textContent = punto.nombre;
      popup.querySelector('.uru-mapa-popup-direccion').textContent = punto.direccion || '';
      var link = popup.querySelector('.uru-mapa-popup-link');
      if (link) link.href = punto.href;
      popup.hidden = false;
      popup.style.borderLeft = '3px solid ' + (punto.color || 'var(--granate-clara)');
      popup.querySelector('.uru-mapa-popup-cerrar').addEventListener('click', cerrarPopup);
      redibujar();
    }
    function cerrarPopup() { idAbierto = null; popup.hidden = true; }
    function posicionarPopupAbierto(proyectados) {
      if (popup.hidden || idAbierto === null) return;
      var p = proyectados.filter(function (pr) { return pr.punto.id === idAbierto; })[0];
      if (!p) { cerrarPopup(); return; }
      popup.style.left = p.x + 'px';
      popup.style.top = p.y + 'px';
    }

    function posicionarEtiqueta(proyectados) {
      // No mostrar la etiqueta liviana sobre el mismo punto que ya
      // tiene el popup completo abierto — sería redundante.
      if (!puntoResaltado || puntoResaltado.id === idAbierto) { etiqueta.hidden = true; return; }
      var p = proyectados.filter(function (pr) { return pr.punto.id === puntoResaltado.id; })[0];
      if (!p) { etiqueta.hidden = true; return; }
      etiqueta.textContent = puntoResaltado.nombre;
      etiqueta.style.left = p.x + 'px';
      etiqueta.style.top = p.y + 'px';
      etiqueta.hidden = false;
    }

    /* ── Lista accesible en paralelo (teclado / lectores de pantalla) ── */
    function reconstruirListaAccesible() {
      listaAccesible.innerHTML = '';
      puntos.forEach(function (p) {
        var li = document.createElement('li');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'uru-mapa-item-accesible';
        btn.textContent = p.nombre + (p.direccion ? ' — ' + p.direccion : '');
        btn.addEventListener('focus', function () { idResaltado = p.id; puntoResaltado = p; emisor.emitir('hover', p); redibujar(); });
        btn.addEventListener('blur', function () { idResaltado = null; puntoResaltado = null; emisor.emitir('hoverOut'); redibujar(); });
        btn.addEventListener('click', function () { enfocar(p.id); abrirPopup(p); emisor.emitir('click', p); });
        li.appendChild(btn);
        listaAccesible.appendChild(li);
      });
    }

    /* ── API pública de la instancia ── */
    function establecerPuntos(nuevosPuntos) {
      puntos = nuevosPuntos || [];
      reconstruirListaAccesible();
      redibujar();
    }

    function encuadrarTodos(padding) {
      if (!puntos.length) return;
      medir(); // el contenedor puede acabar de pasar de hidden a visible
      var enc = PROY.encuadrar(puntos, viewport.ancho, viewport.alto, padding || 48, ZOOM_MAX);
      if (enc) { viewport.lat = enc.lat; viewport.lng = enc.lng; viewport.zoom = enc.zoom; redibujar(); }
    }

    function enfocar(id) {
      var p = puntos.filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      animarA(p.lat, p.lng, Math.max(viewport.zoom, 15));
    }

    function resaltar(id) {
      idResaltado = id;
      puntoResaltado = puntos.filter(function (p) { return p.id === id; })[0] || null;
      redibujar();
    }
    function quitarResaltado() { idResaltado = null; puntoResaltado = null; redibujar(); }

    var resizeObs = new ResizeObserver(function () { medir(); redibujar(); });
    resizeObs.observe(contenedor);
    medir();

    return {
      on: emisor.on,
      establecerPuntos: establecerPuntos,
      encuadrarTodos: encuadrarTodos,
      enfocar: enfocar,
      resaltar: resaltar,
      quitarResaltado: quitarResaltado,
      destruir: function () { resizeObs.disconnect(); contenedor.innerHTML = ''; }
    };
  }

  global.URU_MOTOR_MAPA_RENDER = { crear: crear };
})(typeof window !== 'undefined' ? window : global);
