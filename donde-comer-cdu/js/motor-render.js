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
  var TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  var SUBDOMINIOS = ['a', 'b', 'c', 'd'];
  var TAM_TILE = PROY.TAM_TILE;
  var RADIO_MARCADOR = 9;
  var RADIO_CLUSTER_PX = 34;
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

    var viewport = { lat: opciones.lat || -32.4833, lng: opciones.lng || -58.2333, zoom: opciones.zoom || 14, ancho: 0, alto: 0 };
    var puntos = [];
    var idResaltado = null;
    var idAbierto = null;
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
      posicionarPopupAbierto(proyectados);
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
        dibujarMarcador(c.x, c.y, esResaltado || esAbierto);
      });
    }

    function dibujarMarcador(x, y, activo) {
      var r = activo ? RADIO_MARCADOR + 3 : RADIO_MARCADOR;
      if (activo) {
        ctx.beginPath();
        ctx.arc(x, y, r + 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(201,122,131,.18)';
        ctx.fill();
      }
      var grad = ctx.createLinearGradient(x, y - r, x, y + r);
      grad.addColorStop(0, '#C97A83');
      grad.addColorStop(1, '#9C3A46');
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ECEDEF';
      ctx.stroke();
    }

    function dibujarCluster(c) {
      var r = 15;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16,20,28,.92)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#C97A83';
      ctx.stroke();
      ctx.fillStyle = '#ECEDEF';
      ctx.font = '600 12px "IBM Plex Sans", sans-serif';
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
          if (cerca.punto.id !== idResaltado) { idResaltado = cerca.punto.id; lienzo.style.cursor = 'pointer'; emisor.emitir('hover', cerca.punto); redibujar(); }
        } else if (idResaltado !== null) {
          idResaltado = null; lienzo.style.cursor = 'grab'; emisor.emitir('hoverOut'); redibujar();
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
        var enc = PROY.encuadrar(c.miembros, viewport.ancho, viewport.alto, 50, ZOOM_MAX);
        animarA(enc.lat, enc.lng, Math.min(viewport.zoom + 2, enc.zoom));
        return;
      }
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
        '<a class="uru-mapa-popup-link">Ver ficha completa →</a>';
      popup.querySelector('.uru-mapa-popup-nombre').textContent = punto.nombre;
      popup.querySelector('.uru-mapa-popup-direccion').textContent = punto.direccion || '';
      var link = popup.querySelector('.uru-mapa-popup-link');
      link.href = punto.href || '#';
      popup.hidden = false;
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

    /* ── Lista accesible en paralelo (teclado / lectores de pantalla) ── */
    function reconstruirListaAccesible() {
      listaAccesible.innerHTML = '';
      puntos.forEach(function (p) {
        var li = document.createElement('li');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'uru-mapa-item-accesible';
        btn.textContent = p.nombre + (p.direccion ? ' — ' + p.direccion : '');
        btn.addEventListener('focus', function () { idResaltado = p.id; emisor.emitir('hover', p); redibujar(); });
        btn.addEventListener('blur', function () { idResaltado = null; emisor.emitir('hoverOut'); redibujar(); });
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

    function resaltar(id) { idResaltado = id; redibujar(); }
    function quitarResaltado() { idResaltado = null; redibujar(); }

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
