// Evidencia reproducible del bug de "Restaurar scroll a posición previa".
// Aísla la lógica exacta de render() (líneas ~1105-1145 de app.js) sin DOM,
// para poder correrla con `node repro-scroll-rama.js` y observar el defecto.

function simularRenderOriginal(uiState, rama, scrollPosition) {
  uiState.scrollPosition = scrollPosition;
  // Actualizar cache (orden real del código original)
  uiState.ultimaRamaRenderizada = rama;
  // Restaurar scroll a posición previa si es el mismo listado (ORIGINAL)
  return !!(uiState.scrollPosition && rama === uiState.ultimaRamaRenderizada);
}

function simularRenderCorregido(uiState, rama, scrollPosition) {
  uiState.scrollPosition = scrollPosition;
  var ramaAnterior = uiState.ultimaRamaRenderizada; // capturado ANTES de pisar
  uiState.ultimaRamaRenderizada = rama;
  return !!(uiState.scrollPosition && rama === ramaAnterior);
}

console.log('--- Código ORIGINAL (con bug) ---');
var uiState1 = { ultimaRamaRenderizada: 'explorando', scrollPosition: 0 };
console.log('Render 1, misma rama "explorando":', simularRenderOriginal(uiState1, 'explorando', 400));
// -> true (correcto, casualidad: es el mismo valor puesto y comparado)

var uiState2 = { ultimaRamaRenderizada: 'explorando', scrollPosition: 0 };
console.log('Render 2, rama CAMBIA a "buscador":', simularRenderOriginal(uiState2, 'buscador', 400));
// -> true también, aunque la rama cambió de 'explorando' a 'buscador':
//    la condición es tautológica porque ultimaRamaRenderizada ya fue
//    sobreescrita con 'buscador' antes de la comparación.

console.log('\n--- Código CORREGIDO ---');
var uiState3 = { ultimaRamaRenderizada: 'explorando', scrollPosition: 0 };
console.log('Render 1, misma rama "explorando":', simularRenderCorregido(uiState3, 'explorando', 400));
// -> true (correcto)

var uiState4 = { ultimaRamaRenderizada: 'explorando', scrollPosition: 0 };
console.log('Render 2, rama CAMBIA a "buscador":', simularRenderCorregido(uiState4, 'buscador', 400));
// -> false (correcto: no se fuerza scroll cuando la rama cambió)
