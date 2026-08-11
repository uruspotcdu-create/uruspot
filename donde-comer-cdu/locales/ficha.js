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
    var prefiereMenosMovimiento =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!prefiereMenosMovimiento && typeof indice === "number") {
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

    fetch("/reviews?id=" + encodeURIComponent(DATA.uruId))
      .then(function (res) {
        if (!res.ok) throw new Error("http_" + res.status);
        return res.json();
      })
      .then(function (data) {
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
        delete status.dataset.loading;
        status.textContent = "No pudimos cargar las reseñas en este momento. Podés escribirnos directo por WhatsApp mientras tanto.";
      });
  }

  function manejarFormularioResena() {
    var form = document.getElementById("reviewForm");
    if (!form) return;
    var btn = document.getElementById("reviewSubmitBtn");
    var statusEl = document.getElementById("reviewFormStatus");

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

      if (!autor) {
        if (statusEl) statusEl.textContent = "Falta tu nombre.";
        form.autor.focus();
        return;
      }
      if (!puntuacionEl) {
        if (statusEl) statusEl.textContent = "Elegí una puntuación de 1 a 5 estrellas.";
        return;
      }

      if (btn) btn.disabled = true;
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
          if (btn) btn.disabled = false;
        })
        .catch(function (err) {
          if (statusEl) {
            statusEl.textContent = err && err.message === "rate_limit"
              ? "Ya enviaste una reseña hace poco. Probá de nuevo en unos minutos."
              : "No pudimos enviar tu reseña. Probá de nuevo o escribinos por WhatsApp.";
          }
          if (btn) btn.disabled = false;
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

    var prefiereMenosMovimiento =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefiereMenosMovimiento || !("IntersectionObserver" in window)) {
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

    var prefiereMenosMovimiento =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefiereMenosMovimiento || !("IntersectionObserver" in window)) {
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

  /* ───────────────────────── INIT ───────────────────────── */

  document.addEventListener("DOMContentLoaded", function () {
    aplicarEstado();
    animarScores();
    initShare();
    aplicarNombreDeTransicion();
    aplicarPictogramaRubro();
    inicializarSupresionVidrio();
    cargarResenas();
    manejarFormularioResena();
    inicializarFotosReveal();
    inicializarRevealGenerico();
  });
})();
