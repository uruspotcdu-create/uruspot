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

    var openColor = "#40916c", openBg = "rgba(64,145,108,0.15)";
    var closedColor = "#c1121f", closedBg = "rgba(193,18,31,0.12)";
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

  /* ───────────────────────── INIT ───────────────────────── */

  document.addEventListener("DOMContentLoaded", function () {
    aplicarEstado();
    animarScores();
    initShare();
  });
})();
