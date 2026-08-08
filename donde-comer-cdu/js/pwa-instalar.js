/*
 * donde-comer-cdu/js/pwa-instalar.js
 * ---------------------------------------------------------------------
 * Banner propio de "instalar como app", independiente de app.js.
 *
 * Por qué existe: el prompt nativo del navegador (beforeinstallprompt)
 * es poco fiable — Chrome decide solo cuándo mostrarlo según sus
 * propias heurísticas de "engagement", y en iOS Safari ese evento no
 * existe. Este script:
 *
 *   1) En Chrome/Edge/Android: intercepta beforeinstallprompt, evita
 *      el mini-banner automático y muestra nuestro propio botón
 *      "Instalar" en un momento que controlamos.
 *   2) En iOS/iPadOS Safari: no hay API de instalación programática.
 *      Se muestra un banner explicando el paso manual (Compartir >
 *      Agregar a inicio).
 *   3) Si ya está instalada (display-mode: standalone, o
 *      navigator.standalone en iOS), no se muestra nunca.
 *   4) Si la persona cierra el banner, no se le vuelve a mostrar
 *      durante 14 días (localStorage), para no ser invasivo.
 *   5) El banner nunca aparece apenas carga la página: espera una
 *      señal real de interés (scroll más allá del hero, o 15s
 *      navegando) antes de mostrarse. Pedir instalar antes de que
 *      alguien vea de qué se trata el sitio es la razón #1 por la
 *      que la gente ignora o cierra estos banners sin mirarlos.
 *
 * Sin dependencias de app.js — puede fallar en silencio (try/catch)
 * sin afectar el resto del sitio.
 */

'use strict';

(function () {
  var LS_KEY = 'uruspot:pwaInstalarCerrado';
  var LS_INSTALADA = 'uruspot:pwaInstalada';
  var DIAS_COOLDOWN = 14;

  function yaEstaInstalada() {
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.navigator.standalone === true) return true; // iOS
      if (localStorage.getItem(LS_INSTALADA) === '1') return true;
    } catch (e) { /* localStorage puede fallar en modo privado; seguimos igual */ }
    return false;
  }

  function fueCerradoRecientemente() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      var cerradoEn = parseInt(raw, 10);
      if (!cerradoEn) return false;
      var diasPasados = (Date.now() - cerradoEn) / (1000 * 60 * 60 * 24);
      return diasPasados < DIAS_COOLDOWN;
    } catch (e) {
      return false;
    }
  }

  function marcarCerrado() {
    try { localStorage.setItem(LS_KEY, String(Date.now())); } catch (e) {}
  }

  function esIOS() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
      // iPadOS 13+ se presenta como Mac con soporte táctil
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  }

  // Espera a que la persona muestre interés real antes de llamar a
  // "listo" — evita el banner-apenas-carga que la gente cierra sin
  // leer. Dispara con lo que pase primero: scroll de más de medio
  // alto de pantalla, o 15s navegando la página.
  function esperarSenalDeInteres(listo) {
    var UMBRAL_SCROLL_PX = Math.round(window.innerHeight * 0.5);
    var yaDisparo = false;

    function disparar() {
      if (yaDisparo) return;
      yaDisparo = true;
      window.removeEventListener('scroll', alScrollear);
      clearTimeout(timer);
      listo();
    }

    function alScrollear() {
      if (window.scrollY > UMBRAL_SCROLL_PX) disparar();
    }

    window.addEventListener('scroll', alScrollear, { passive: true });
    var timer = setTimeout(disparar, 15000);
  }

  function init() {
    if (yaEstaInstalada() || fueCerradoRecientemente()) return;

    var banner = document.getElementById('pwaInstalarBanner');
    if (!banner) return;

    var titulo = document.getElementById('pwaInstalarTitulo');
    var subtitulo = document.getElementById('pwaInstalarSubtitulo');
    var btnInstalar = document.getElementById('pwaInstalarBtn');
    var btnCerrar = document.getElementById('pwaInstalarCerrar');

    var deferredPrompt = null;

    function ocultar() {
      banner.hidden = true;
    }

    if (btnCerrar) {
      btnCerrar.addEventListener('click', function () {
        marcarCerrado();
        ocultar();
      });
    }

    window.addEventListener('appinstalled', function () {
      try { localStorage.setItem(LS_INSTALADA, '1'); } catch (e) {}
      ocultar();
    });

    if (esIOS()) {
      // No hay beforeinstallprompt en iOS: instrucciones manuales.
      esperarSenalDeInteres(function () {
        if (titulo) titulo.textContent = 'Instalá el mapa en tu iPhone';
        if (subtitulo) subtitulo.textContent = 'Tocá compartir (□↑) y elegí "Agregar a inicio".';
        if (btnInstalar) btnInstalar.hidden = true; // no hay acción programática posible
        banner.hidden = false;
      });
      return;
    }

    // Chrome / Edge / Android: guardamos el evento apenas el navegador
    // lo dispara (barato, no molesta a nadie), pero el banner recién
    // se muestra cuando también hay señal de interés real. Si las dos
    // condiciones ya se cumplieron (el evento llegó tarde, después del
    // scroll), se muestra al toque.
    var huboSenalDeInteres = false;
    var listoParaMostrar = false;

    function mostrarSiCorresponde() {
      if (!huboSenalDeInteres || !listoParaMostrar) return;
      if (titulo) titulo.textContent = 'Instalá el mapa en tu celular';
      if (subtitulo) subtitulo.textContent = 'Acceso directo, sin ocupar espacio de tienda.';
      if (btnInstalar) btnInstalar.hidden = false;
      banner.hidden = false;
    }

    esperarSenalDeInteres(function () {
      huboSenalDeInteres = true;
      mostrarSiCorresponde();
    });

    window.addEventListener('beforeinstallprompt', function (evento) {
      evento.preventDefault();
      deferredPrompt = evento;
      listoParaMostrar = true;
      mostrarSiCorresponde();
    });

    if (btnInstalar) {
      btnInstalar.addEventListener('click', function () {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function (resultado) {
          if (resultado && resultado.outcome === 'accepted') {
            try { localStorage.setItem(LS_INSTALADA, '1'); } catch (e) {}
          } else {
            marcarCerrado();
          }
          deferredPrompt = null;
          ocultar();
        }).catch(function () { ocultar(); });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

