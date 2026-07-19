/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Fase 4: ensamblado final
   Conecta las tres fases anteriores (registro, manifiesto/rubros/FAQ,
   motor de recorrido) con los datos reales del padrón: 1.468 lugares.

   Fuentes de datos (mismo contrato que ya documenta split_dataset.py):
     - lugares-core.json      → bloqueante. id, nombre, categoria, grupo,
                                 lat, lng, rating?, rating_count?
     - lugares-detalles.json  → perezoso (requestIdleCallback). direccion,
                                 telefono, place_id, descripcion?
     - lugares-mapa.json      → perezoso, solo se usa para leer
                                 estado_verificacion (no está en core ni
                                 en detalles todavía). El resto de sus
                                 campos se ignora a propósito: mapa.json
                                 quedó desincronizado en "grupo" respecto
                                 de core.json (66 lugares con "comercios"
                                 vs "compras"), así que core.json manda.

   "Posición" en el padrón = índice + 1 dentro de lugares-core.json.
   No se inventa un orden nuevo: se respeta el que ya trae el archivo.

   No importa ni modifica core-engine.js, app-interactions.js,
   content.js, enhancements-aditivas.js, filter-engine.js,
   map-engine.js, data-store.js ni data-worker.js — motor nuevo,
   aislado, sin pisar el viejo.
   ═══════════════════════════════════════════════════════════════════ */

(function(){
  'use strict';

  var RUBROS_META = {
    alojamiento:        ['Alojamiento', 'hospedaje verificado puerta a puerta'],
    belleza:            ['Belleza', 'peluquerías, barberías y centros de estética'],
    compras:            ['Compras', 'comercios, desde kioscos hasta grandes superficies'],
    deporte:            ['Deporte', 'clubes, gimnasios y espacios para moverse'],
    educacion:          ['Educación', 'escuelas, institutos y academias'],
    finanzas:           ['Finanzas', 'bancos, financieras y casas de cambio'],
    gastronomia:        ['Gastronomía', 'restaurantes, bares y rotiserías'],
    mascotas:           ['Mascotas', 'veterinarias y pet shops'],
    naturaleza:         ['Naturaleza', 'plazas, costaneras y espacios verdes'],
    oficios_tecnicos:   ['Oficios técnicos', 'electricistas, plomeros, gasistas y afines'],
    patrimonio:         ['Patrimonio', 'sitios históricos y culturales'],
    salud:              ['Salud', 'consultorios, farmacias y centros médicos'],
    servicios_publicos: ['Servicios públicos', 'trámites, correo y organismos'],
    transporte:         ['Transporte', 'remises, terminales y estaciones']
  };

  var PREGUNTAS = [
    ['¿Por qué el orden no es por relevancia?',
     'Porque "relevancia" es una opinión disfrazada de dato. El único orden que no miente es el orden en que se caminó cada dirección — por eso cada lugar tiene una posición en el padrón, no un puntaje.'],
    ['¿Qué significa que un lugar esté "pendiente de confirmación"?',
     'Que esa ficha entró al padrón pero la última auditoría no pudo cerrarla del todo (dirección sin confirmar, coincidencia dudosa, o directamente no se encontró). No la ocultamos ni la completamos a ojo: se muestra marcada, igual que el resto de la información real.'],
    ['¿Cómo se verifica cada lugar?',
     'Alguien del equipo confirma que el lugar existe y que los datos son correctos — auditoría en fuentes oficiales, Google Places o en el lugar mismo — y recién ahí se carga la ficha al padrón.'],
    ['¿Con qué frecuencia se revisa lo ya verificado?',
     'Un lugar queda activo hasta que una nueva auditoría confirme un cambio (mudanza, cierre, cambio de horario). No hay una fecha de vencimiento automática.'],
    ['¿Puedo sugerir una corrección o un lugar nuevo?',
     'Sí — escribiendo a padron@uruspot.com.ar. La sugerencia entra a una cola de verificación antes de publicarse, igual que el resto del padrón.'],
    ['¿Cuándo va a estar completo el padrón?',
     'Con 1.468 lugares ya caminados, esta es la versión más completa hasta ahora. Sigue creciendo solo cuando aparece una dirección nueva confirmada — nunca por apuro de publicar algo sin confirmar primero.'],
    ['¿Puedo buscar o filtrar por rubro?',
     'Sí. El buscador de acá abajo filtra por nombre, rubro o dirección, los chips filtran por rubro, y el mapa esquemático se mueve en conjunto con la lista — los tres recortan la misma secuencia, ninguno la reordena.']
  ];

  var DOM = {};
  ['fraccionNum', 'fraccionTotal', 'aperturaNum', 'chipsRubros', 'inputBuscar', 'chipFav',
   'chipLimpiar', 'estadoResultados', 'panelLista', 'mapaLienzo', 'listaRubros',
   'listaPreguntas', 'sinResultados'].forEach(function(id){
    DOM[id] = document.getElementById(id);
  });

  var REGISTRO = [];          // arreglo completo, en orden de padrón
  var porId = Object.create(null);
  var favoritos = {};
  try { favoritos = JSON.parse(localStorage.getItem('uruspot_favoritos') || '{}'); }
  catch(e){ favoritos = {}; }
  function guardarFavoritos(){
    try { localStorage.setItem('uruspot_favoritos', JSON.stringify(favoritos)); } catch(e){}
  }

  var estadoUI = { texto: '', rubros: new Set(), soloFav: false };
  var filasPorId = Object.create(null);
  var puntosPorId = Object.create(null);
  var detallesListos = false;

  /* ─── 1. carga bloqueante: lugares-core.json ─── */
  fetch('lugares-core.json')
    .then(function(r){ return r.json(); })
    .then(function(core){
      REGISTRO = core.map(function(l, i){
        var reg = {
          pos: i + 1,
          id: l.id,
          nombre: l.nombre,
          categoria: l.categoria,
          grupo: l.grupo,
          lat: l.lat,
          lng: l.lng,
          rating: l.rating || null,
          rating_count: l.rating_count || null,
          direccion: null,
          telefono: null,
          estado: 'verificado' // por defecto, hasta que carguen los detalles
        };
        porId[l.id] = reg;
        return reg;
      });
      arrancar();
      cargarDetallesEnSegundoPlano();
    })
    .catch(function(err){
      console.error('No se pudo cargar lugares-core.json', err);
      if (DOM.secuencia){
        DOM.secuencia.innerHTML = '<p style="padding:40px 0;color:var(--tinta-60)">No se pudo cargar el padrón. Probá recargar la página.</p>';
      }
    });

  /* ─── 2. cargas perezosas: direcciones + estado de verificación ─── */
  function cargarDetallesEnSegundoPlano(){
    var lanzar = function(){
      fetch('lugares-detalles.json')
        .then(function(r){ return r.json(); })
        .then(function(det){
          det.forEach(function(d){
            var reg = porId[d.id];
            if (!reg) return;
            reg.direccion = d.direccion || null;
            reg.telefono = d.telefono || null;
            reg.descripcion = d.descripcion || null;
          });
          detallesListos = true;
          refrescarFilasVisibles();
        })
        .catch(function(err){ console.warn('lugares-detalles.json no disponible', err); });

      fetch('lugares-mapa.json')
        .then(function(r){ return r.json(); })
        .then(function(mapa){
          var PATRONES_PENDIENTE = ['pendiente', 'no encontrado', 'requiere confirmacion', 'requiere_confirmacion'];
          mapa.forEach(function(m){
            var reg = porId[m.id];
            if (!reg || !m.estado_verificacion) return;
            var low = m.estado_verificacion.toLowerCase();
            var pendiente = PATRONES_PENDIENTE.some(function(p){ return low.indexOf(p) !== -1; });
            reg.estado = pendiente ? 'pendiente' : 'verificado';
          });
          refrescarFilasVisibles();
        })
        .catch(function(err){ console.warn('lugares-mapa.json no disponible', err); });
    };
    if ('requestIdleCallback' in window) requestIdleCallback(lanzar, {timeout: 2000});
    else setTimeout(lanzar, 200);
  }

  function refrescarFilasVisibles(){
    // solo actualiza el contenido de filas que ya están en pantalla —
    // Regla 4: el contenido se acumula, no se vuelve a construir todo.
    Object.keys(filasPorId).forEach(function(id){
      var reg = porId[id];
      var fila = filasPorId[id];
      if (!reg || !fila) return;
      var dirEl = fila.querySelector('.direccion');
      if (dirEl && reg.direccion) dirEl.textContent = reg.direccion;
      var constEl = fila.querySelector('.constancia');
      if (constEl) pintarConstancia(constEl, reg.estado);
    });
  }

  function pintarConstancia(el, estado){
    if (estado === 'pendiente'){
      el.textContent = 'pendiente de confirmación en terreno';
      el.classList.add('constancia--pendiente');
    } else {
      el.textContent = 'verificado en el padrón';
      el.classList.remove('constancia--pendiente');
    }
  }

  /* ─── 3. arranque: una vez que hay datos, construir todo lo estático
     (fracción, rubros, FAQ, chips) y la secuencia completa. ─── */
  function arrancar(){
    var total = REGISTRO.length;
    if (DOM.fraccionNum) DOM.fraccionNum.textContent = '0000';
    if (DOM.fraccionTotal) DOM.fraccionTotal.textContent = total;
    if (DOM.aperturaNum) DOM.aperturaNum.textContent = total.toLocaleString('es-AR');

    construirRubros();
    construirFAQ();
    construirChips();
    construirSecuenciaYArea();
    cablearHerramientas();
    cablearFraccionPersistente();
    render();
  }

  /* ─── índice de rubros — alfabético, con las cifras reales ─── */
  function construirRubros(){
    if (!DOM.listaRubros) return;
    var conteo = Object.create(null);
    REGISTRO.forEach(function(r){ conteo[r.grupo] = (conteo[r.grupo] || 0) + 1; });
    var claves = Object.keys(RUBROS_META).filter(function(k){ return conteo[k]; });
    claves.sort(function(a, b){ return RUBROS_META[a][0].localeCompare(RUBROS_META[b][0], 'es'); });
    claves.forEach(function(k){
      var fila = document.createElement('div');
      fila.className = 'fila-rubro';
      fila.innerHTML =
        '<div class="col-izq"><span class="nombre">' + RUBROS_META[k][0] + '</span>' +
        '<span class="desc">' + RUBROS_META[k][1] + '</span></div>' +
        '<span class="cifra">' + conteo[k] + ' fichas</span>';
      DOM.listaRubros.appendChild(fila);
    });
  }

  /* ─── FAQ — acordeón de una sola pregunta abierta a la vez ─── */
  function construirFAQ(){
    if (!DOM.listaPreguntas) return;
    PREGUNTAS.forEach(function(p, i){
      var num = String(i + 1).padStart(2, '0');
      var item = document.createElement('div');
      item.className = 'pregunta';
      item.innerHTML =
        '<button class="pregunta-cabecera" aria-expanded="false">' +
          '<span class="num">P.' + num + '</span>' +
          '<span class="texto">' + p[0] + '</span>' +
          '<span class="icono">+</span>' +
        '</button>' +
        '<div class="pregunta-cuerpo"><div class="pregunta-cuerpo-inner"><p>' + p[1] + '</p></div></div>';
      DOM.listaPreguntas.appendChild(item);
    });
    DOM.listaPreguntas.addEventListener('click', function(e){
      var btn = e.target.closest('.pregunta-cabecera');
      if (!btn) return;
      var item = btn.closest('.pregunta');
      var yaAbierta = item.classList.contains('abierta');
      DOM.listaPreguntas.querySelectorAll('.pregunta.abierta').forEach(function(p){
        p.classList.remove('abierta');
        p.querySelector('.pregunta-cabecera').setAttribute('aria-expanded', 'false');
      });
      if (!yaAbierta){
        item.classList.add('abierta');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  }

  /* ─── chips de rubro + favoritos + limpiar ─── */
  function construirChips(){
    if (!DOM.chipsRubros) return;
    var conteo = Object.create(null);
    REGISTRO.forEach(function(r){ conteo[r.grupo] = (conteo[r.grupo] || 0) + 1; });
    var claves = Object.keys(RUBROS_META).filter(function(k){ return conteo[k]; });
    claves.sort(function(a, b){ return RUBROS_META[a][0].localeCompare(RUBROS_META[b][0], 'es'); });
    claves.forEach(function(k){
      var chip = document.createElement('button');
      chip.className = 'chip';
      chip.type = 'button';
      chip.textContent = RUBROS_META[k][0];
      chip.dataset.grupo = k;
      chip.addEventListener('click', function(){
        if (estadoUI.rubros.has(k)) estadoUI.rubros.delete(k); else estadoUI.rubros.add(k);
        chip.classList.toggle('activo');
        render();
      });
      DOM.chipsRubros.appendChild(chip);
    });
  }

  /* ─── secuencia (fase 1) + área lista/mapa (fase 3), en un único DOM
     construido una sola vez. Los filtros solo togglean visibilidad. ─── */
  function construirSecuenciaYArea(){
    // límites reales de lat/lng para el mapa esquemático
    var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    REGISTRO.forEach(function(r){
      if (typeof r.lat !== 'number' || typeof r.lng !== 'number') return;
      if (r.lat < minLat) minLat = r.lat;
      if (r.lat > maxLat) maxLat = r.lat;
      if (r.lng < minLng) minLng = r.lng;
      if (r.lng > maxLng) maxLng = r.lng;
    });
    var padLat = (maxLat - minLat) * 0.06 || 0.001;
    var padLng = (maxLng - minLng) * 0.06 || 0.001;
    minLat -= padLat; maxLat += padLat; minLng -= padLng; maxLng += padLng;

    var frag = document.createDocumentFragment();
    REGISTRO.forEach(function(r){
      var fila = document.createElement('div');
      fila.className = 'paso';
      fila.dataset.id = r.id;
      fila.innerHTML =
        '<div class="paso-inner">' +
          '<div class="pos">' + String(r.pos).padStart(4, '0') + '</div>' +
          '<div class="cuerpo-paso">' +
            '<div class="rubro">' + (RUBROS_META[r.grupo] ? RUBROS_META[r.grupo][0] : r.categoria) + '</div>' +
            '<div class="nombre">' + escapeHTML(r.nombre) + '</div>' +
            '<div class="direccion">' + (r.direccion ? escapeHTML(r.direccion) : 'cargando dirección…') + '</div>' +
            '<div class="constancia"></div>' +
          '</div>' +
          '<button class="btn-fav" type="button" aria-label="marcar favorito">' + (favoritos[r.id] ? '★' : '☆') + '</button>' +
        '</div>';
      pintarConstancia(fila.querySelector('.constancia'), r.estado);
      var btnFav = fila.querySelector('.btn-fav');
      btnFav.classList.toggle('activo', !!favoritos[r.id]);
      frag.appendChild(fila);
      filasPorId[r.id] = fila;

      if (typeof r.lat === 'number' && typeof r.lng === 'number' && DOM.mapaLienzo){
        var x = ((r.lng - minLng) / (maxLng - minLng)) * 100;
        var y = ((maxLat - r.lat) / (maxLat - minLat)) * 100;
        var punto = document.createElement('div');
        punto.className = 'punto' + (favoritos[r.id] ? ' favorito' : '');
        punto.style.left = x + '%';
        punto.style.top = y + '%';
        punto.title = r.nombre;
        punto.dataset.id = r.id;
        DOM.mapaLienzo.appendChild(punto);
        puntosPorId[r.id] = punto;
      }
    });
    DOM.panelLista.appendChild(frag);

    // delegación de eventos — un solo listener para 1.468 filas
    DOM.panelLista.addEventListener('click', function(e){
      var btn = e.target.closest('.btn-fav');
      if (btn){
        var fila = btn.closest('.paso');
        var id = fila.dataset.id;
        favoritos[id] = !favoritos[id];
        guardarFavoritos();
        btn.textContent = favoritos[id] ? '★' : '☆';
        btn.classList.toggle('activo', favoritos[id]);
        if (puntosPorId[id]) puntosPorId[id].classList.toggle('favorito', favoritos[id]);
        if (estadoUI.soloFav) render();
        return;
      }
      var fila2 = e.target.closest('.paso');
      if (fila2) resaltar(fila2.dataset.id, false);
    });
    DOM.panelLista.addEventListener('mouseover', function(e){
      var fila = e.target.closest('.paso');
      if (fila) resaltar(fila.dataset.id, false);
    });

    if (DOM.mapaLienzo){
      DOM.mapaLienzo.addEventListener('click', function(e){
        var punto = e.target.closest('.punto');
        if (!punto) return;
        var fila = filasPorId[punto.dataset.id];
        if (fila) fila.scrollIntoView({block: 'center', behavior: 'smooth'});
        resaltar(punto.dataset.id, true);
      });
    }
  }

  function resaltar(id, fijar){
    Object.keys(filasPorId).forEach(function(k){
      filasPorId[k].classList.toggle('activa', k === id);
    });
    Object.keys(puntosPorId).forEach(function(k){
      puntosPorId[k].classList.toggle('activo', k === id);
    });
  }

  /* ─── buscador, chip favoritos, chip limpiar ─── */
  function cablearHerramientas(){
    if (DOM.inputBuscar){
      DOM.inputBuscar.addEventListener('input', function(e){
        estadoUI.texto = e.target.value.trim().toLowerCase();
        render();
      });
    }
    if (DOM.chipFav){
      DOM.chipFav.addEventListener('click', function(){
        estadoUI.soloFav = !estadoUI.soloFav;
        DOM.chipFav.classList.toggle('activo', estadoUI.soloFav);
        render();
      });
    }
    if (DOM.chipLimpiar){
      DOM.chipLimpiar.addEventListener('click', function(){
        estadoUI.texto = ''; estadoUI.rubros.clear(); estadoUI.soloFav = false;
        if (DOM.inputBuscar) DOM.inputBuscar.value = '';
        if (DOM.chipFav) DOM.chipFav.classList.remove('activo');
        DOM.chipsRubros.querySelectorAll('.chip.activo').forEach(function(c){ c.classList.remove('activo'); });
        render();
      });
    }
  }

  function coincide(r){
    if (estadoUI.soloFav && !favoritos[r.id]) return false;
    if (estadoUI.rubros.size > 0 && !estadoUI.rubros.has(r.grupo)) return false;
    if (estadoUI.texto){
      var hay = (r.nombre + ' ' + r.categoria + ' ' + (r.direccion || '')).toLowerCase();
      if (hay.indexOf(estadoUI.texto) === -1) return false;
    }
    return true;
  }

  function render(){
    var visibles = 0;
    REGISTRO.forEach(function(r){
      var ok = coincide(r);
      var fila = filasPorId[r.id];
      if (fila) fila.classList.toggle('oculto', !ok);
      var punto = puntosPorId[r.id];
      if (punto) punto.style.display = ok ? '' : 'none';
      if (ok) visibles++;
    });

    var hayFiltro = estadoUI.texto || estadoUI.rubros.size > 0 || estadoUI.soloFav;
    if (DOM.estadoResultados){
      DOM.estadoResultados.innerHTML = hayFiltro
        ? '<b>' + visibles + '</b> resultado' + (visibles === 1 ? '' : 's') + ' de 1.468 · dentro del padrón completo'
        : 'mostrando el padrón completo · <b>' + REGISTRO.length.toLocaleString('es-AR') + '</b> lugares';
    }

    if (DOM.sinResultados) DOM.sinResultados.hidden = visibles !== 0;
  }

  /* ─── fracción persistente en la cabecera — coordenada, no progreso ─── */
  function cablearFraccionPersistente(){
    var pasos = DOM.panelLista ? DOM.panelLista.querySelectorAll('.paso') : [];
    if (!('IntersectionObserver' in window) || !pasos.length) return;
    var obsVisibilidad = new IntersectionObserver(function(entries){
      entries.forEach(function(en){ if (en.isIntersecting) en.target.classList.add('visible'); });
    }, {threshold: .1});
    pasos.forEach(function(p){ obsVisibilidad.observe(p); });

    var obsPosicion = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if (en.isIntersecting){
          var pos = en.target.querySelector('.pos').textContent;
          if (DOM.fraccionNum) DOM.fraccionNum.textContent = pos;
          pasos.forEach(function(p){ p.classList.remove('paso--activa'); });
          en.target.classList.add('paso--activa');
        }
      });
    }, {threshold: .5, rootMargin: '-40% 0px -40% 0px'});
    pasos.forEach(function(p){ obsPosicion.observe(p); });
  }

  function escapeHTML(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

})();
