/* ═══════════════════════════════════════════════════════════════════
   ui/faq.js — acordeón de FAQ, una sola pregunta abierta a la vez.
   Mismo comportamiento que la función construirFAQ() de
   fase4-motor.js. Contenido puramente editorial: no depende del
   filter-store ni del padrón.
   ═══════════════════════════════════════════════════════════════════ */

export function construirFAQ(opts){
  var dom = opts.dom;
  var preguntas = opts.preguntas;

  if (!dom.listaPreguntas) return;
  preguntas.forEach(function(p, i){
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
    dom.listaPreguntas.appendChild(item);
  });
  dom.listaPreguntas.addEventListener('click', function(e){
    var btn = e.target.closest('.pregunta-cabecera');
    if (!btn) return;
    var item = btn.closest('.pregunta');
    var yaAbierta = item.classList.contains('abierta');
    dom.listaPreguntas.querySelectorAll('.pregunta.abierta').forEach(function(p){
      p.classList.remove('abierta');
      p.querySelector('.pregunta-cabecera').setAttribute('aria-expanded', 'false');
    });
    if (!yaAbierta){
      item.classList.add('abierta');
      btn.setAttribute('aria-expanded', 'true');
    }
  });
}
