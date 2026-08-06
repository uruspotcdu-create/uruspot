/* css/chip-indicador.css
   Indicador deslizante bajo los chips de rubro. Ver js/chip-indicador.js
   para la lógica de posicionamiento. Requiere tokens.css cargado antes
   (usa --dur-media, --easing-estandar, --radio-full, --color-granate-clara).

   Agregar en index.html:
     <div class="rubros-wrap">
       <div id="listaRubros" role="list">...</div>
       <span class="chip-indicador" aria-hidden="true"></span>
     </div>
*/

.rubros-wrap{
  position: relative;
}

.chip-indicador{
  position: absolute;
  bottom: -2px;
  left: 0;
  height: 2px;
  border-radius: var(--radio-full);
  background: var(--chip-color, var(--color-granate-clara));
  opacity: 0;
  transform: translateX(0);
  width: 0;
  pointer-events: none;
  will-change: transform;
  transition:
    transform var(--dur-media) var(--easing-estandar),
    width var(--dur-media) var(--easing-estandar),
    background var(--dur-rapido) var(--easing-estandar),
    opacity var(--dur-rapido) var(--easing-estandar);
}

.chip-indicador--sin-animar{
  transition: none;
}

@media (prefers-reduced-motion: reduce){
  .chip-indicador{
    transition: none;
  }
}
