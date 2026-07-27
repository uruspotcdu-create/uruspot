// Verificación puntual del bloque nuevo (mini-mapa de Circuitos) en /inicio.
// No reemplaza una suite propia (no existía ninguna para /inicio): es un
// chequeo de contrato ad-hoc, mismo espíritu que contract-tests.js del
// sitio hermano, ejecutable con `node verificar-mapa-circuitos.js`.
'use strict';
const fs = require('fs');
const path = process.argv[2] || 'inicio/index.html';
const html = fs.readFileSync(path, 'utf8');

let fallos = 0;
function check(desc, cond) {
  if (cond) console.log('✓ ' + desc);
  else { console.log('✗ ' + desc); fallos++; }
}

// 1. Contrato DOM: los IDs/roles que el script espera existen exactamente una vez
['circ-map-toggle', 'circ-map-panel', 'circ-map-canvas', 'circ-map-gmaps-link'].forEach(function (id) {
  const n = (html.match(new RegExp('id="' + id + '"', 'g')) || []).length;
  check('id="' + id + '" aparece exactamente 1 vez', n === 1);
});

const tabCount = (html.match(/class="rf-circ-map-tab( is-active)?"/g) || []).length;
check('hay exactamente 3 tabs de circuito', tabCount === 3);

['data-circuit="4h"', 'data-circuit="dia"', 'data-circuit="finde"'].forEach(function (attr) {
  check(attr + ' presente', html.includes(attr));
});

// 2. Accesibilidad básica del toggle y las tabs
check('toggle tiene aria-expanded="false" inicial', html.includes('id="circ-map-toggle" aria-expanded="false" aria-controls="circ-map-panel"'));
check('panel tiene atributo hidden inicial', /id="circ-map-panel" hidden/.test(html));
const nuevoBloque = html.slice(html.indexOf('rf-circ-map-block'), html.indexOf('</section>', html.indexOf('rf-circ-map-block')));
check('las 3 tabs del mini-mapa usan role="tab"', (nuevoBloque.match(/role="tab"/g) || []).length === 3);
check('tablist tiene aria-label', html.includes('role="tablist" aria-label="Elegir circuito'));

// 3. No debe cargarse Leaflet de forma eager (ni <link> ni <script src> estático)
const staticLeaflet = /<link[^>]+leaflet[^>]*>|<script[^>]+src="[^"]*leaflet[^"]*"/i.test(
  html.replace(/loadLeaflet[\s\S]*?leafletLoadPromise = new Promise[\s\S]*?\}\);/, '')
);
check('Leaflet NO está referenciado de forma estática (solo vía loadLeaflet() bajo demanda)', !staticLeaflet);
check('la carga de Leaflet ocurre dentro de una función loadLeaflet() perezosa', html.includes('function loadLeaflet()'));
check('Leaflet solo se pide dentro del click handler del toggle (initMap se llama únicamente ahí)', /toggleBtn\.addEventListener\("click"[\s\S]*?if \(!mapInstance\) initMap\(\);/.test(html));

// 4. Mismo proveedor de tiles que el sitio hermano (CARTO Voyager) — no se agrega uno nuevo
check('usa el mismo tile URL de CARTO Voyager que motor-render.js', html.includes('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'));

// 5. prefers-reduced-motion respetado en JS y en CSS
check('JS lee prefers-reduced-motion y lo aplica a las opciones de Leaflet', /reduced = window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/.test(html));
check('zoomAnimation/fadeAnimation/markerZoomAnimation atados a !reduced', /zoomAnimation: !reduced,\s*fadeAnimation: !reduced,\s*markerZoomAnimation: !reduced/.test(html));

const cssPath = path.replace('index.html', 'css/refactor-utilities.css');
const css = fs.readFileSync(cssPath, 'utf8');
check('CSS: la animación de entrada del panel se desactiva con prefers-reduced-motion', /@media \(prefers-reduced-motion: reduce\) \{\s*\.rf-circ-map-panel \{ animation: none; \}/.test(css));

// 6. coreografias.js no debe existir ni referenciarse en /inicio (no hay superposición posible)
check('coreografias.js no está cargado como <script> en /inicio', !/<script[^>]+src="[^"]*coreografias\.js"/.test(html));

// 7. Datos: exactamente 17 paradas (7+5+5), todas con lat/lng numéricos y en rango válido
const dataMatch = html.match(/var CIRCUITS = (\{[\s\S]*?\n  \};)/);
check('bloque CIRCUITS encontrado en el script', !!dataMatch);
if (dataMatch) {
  const CIRCUITS = eval('(' + dataMatch[1].replace(/;$/, '') + ')');
  const keys = Object.keys(CIRCUITS);
  check('hay exactamente 3 circuitos', keys.length === 3);
  let total = 0;
  let coordsOk = true;
  keys.forEach(function (k) {
    total += CIRCUITS[k].stops.length;
    CIRCUITS[k].stops.forEach(function (s) {
      const latOk = typeof s.lat === 'number' && isFinite(s.lat) && s.lat >= -90 && s.lat <= 90;
      const lngOk = typeof s.lng === 'number' && isFinite(s.lng) && s.lng >= -180 && s.lng <= 180;
      if (!latOk || !lngOk) coordsOk = false;
    });
  });
  check('total de paradas = 17 (7 + 5 + 5, igual que el texto de Circuitos)', total === 17);
  check('todas las coordenadas son números finitos y en rango geográfico válido', coordsOk);
  check('circuito "4h" tiene 7 paradas (igual que .circ-stops del texto)', CIRCUITS['4h'].stops.length === 7);
  check('circuito "dia" tiene 5 paradas', CIRCUITS['dia'].stops.length === 5);
  check('circuito "finde" tiene 5 paradas', CIRCUITS['finde'].stops.length === 5);
}

console.log('\n' + (fallos === 0 ? 'TODO OK' : fallos + ' fallo(s)'));
process.exit(fallos === 0 ? 0 : 1);
