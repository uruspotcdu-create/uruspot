# URU SPOT — Ambient Engine — Changelog del sistema de assets

Ficha por asset al incorporarse, según Cap. 10.4 del documento de
Lenguaje de Assets v1.0. Cada fila = un asset. Orden cronológico.

## v1.0 — Infraestructura (Paso 1)

| Nombre de archivo | Familia | Plano | Movimiento heredado | Reactividad | Fecha / versión | Justificación |
|---|---|---|---|---|---|---|
| `_primitivas/primitivas-compartidas.svg` | — (infraestructura) | — | — | — | v1.0 | Set de 5 primitivas compartidas (Cap. 3.3): arco, línea, sinusoide, círculo concéntrico, marca de coordenada. Ninguna familia dibuja geometría propia — todas ensamblan estas. |
| `_tokens/ambiente-tokens-visual.css` | — (infraestructura) | — | — | — | v1.0 | Tokens de color/opacidad por plano y peso de trazo (Cap. 1.3, 4.1, 7). Ningún asset fija color propio. |
| `_tokens/ambiente-tokens-movimiento.css` | — (infraestructura) | — | — | — | v1.0 | Keyframe compartido de Respiración (Cap. 5), consumido por Retícula y (Paso 3) Curvas topográficas. |

## v1.0 — Retícula cartográfica (Paso 2)

| Nombre de archivo | Familia | Plano | Movimiento heredado | Reactividad | Fecha / versión | Justificación |
|---|---|---|---|---|---|---|
| `reticula/reticula--default--hairline.svg` | Retícula cartográfica | P0 | Respiración (10s) | Ninguna (sustrato, Cap. 4.2) | v1.0 | "Da estructura de fondo; sin ella todo lo demás flota sin contexto" (Cap. 2.1). Construida solo con las primitivas línea y marca-coordenada. |

**Nota de discrepancia (no corregida en este paso, dejar registrada
para la fase de integración):** el catálogo conceptual de
`ambiente-config.js` (Fase 2) tiene `lineas-cartograficas` con
`capa: 'profundidad', carga: 'diferida'`. El documento de Lenguaje de
Assets (Fase 3, Cap. 12, orden 2) trata a la Retícula cartográfica
como P0/estructura base, candidata natural a carga anticipada. No se
tocó `capa`/`carga` en este paso porque cambia comportamiento en
tiempo de ejecución y es una decisión de producto, no de lenguaje
visual — queda para que la fase de integración la revise a propósito.

*(Los assets de las familias restantes se agregan a esta tabla a
medida que se implementan, uno por paso, siguiendo el roadmap del
Cap. 12.)*

## v1.0 — Curvas topográficas (Paso 3)

| Nombre de archivo | Familia | Plano | Movimiento heredado | Reactividad | Fecha / versión | Justificación |
|---|---|---|---|---|---|---|
| `topograficas/topograficas--default--hairline.svg` | Curvas topográficas | P0 (más profundo) | Respiración extrema lenta (24s) | Ninguna (sustrato, Cap. 4.2) | v1.0 | "Da profundidad sin necesitar sombra ni ilustración" (Cap. 2.1). Construida solo con la primitiva arco; 3 clusters, escala 1 : 1.3 en dos de ellos (Cap. 1.4) y una ruptura deliberada en el tercero. |

Sin discrepancias que anotar en este paso: `curvas-topograficas` ya
tenía `carga: 'anticipada'` en el catálogo Fase 2, coherente con su
rol de infraestructura visual base según el documento Fase 3.

## v1.0 — Integración: renderizado real en pantalla (Paso 4)

No se agregan assets nuevos en este paso — es el paso que faltaba
para que los dos assets de Paso 2 y Paso 3 dejaran de ser archivos
sueltos y pasaran a verse en pantalla:

- `js/ambiente-assets.js` gana `obtenerBinario(id)`: la versión
  asincrónica del Asset Registry que el Cap. 8.1 dejaba marcada como
  "fase posterior" — descarga el SVG, lo cachea, y reescribe sus
  `href`/`xlink:href` relativos para que sigan apuntando a
  `_primitivas/primitivas-compartidas.svg` correctamente una vez
  insertados inline dentro de `index.html`.
- `js/ambiente-reticula.js` y `js/ambiente-topografia.js` (nuevos):
  un módulo por familia, cada uno inserta su asset en
  `AmbientePlanos.contenedor('p0')`.

**Discrepancia de Paso 2 resuelta:** `lineas-cartograficas` pasa de
`carga: 'diferida'` a `carga: 'anticipada'` en `ambiente-config.js`.
Como sustrato P0, debe estar presente desde el primer instante de
cualquier escena — "diferida" no aplicaba acá (ver nota de Paso 2
más arriba).

## v1.0 — Corrientes (Paso 5, Roadmap Cap. 12 orden 4)

| Nombre de archivo | Familia | Plano | Movimiento heredado | Reactividad | Fecha / versión | Justificación |
|---|---|---|---|---|---|---|
| `corrientes/corrientes--diagonal-lenta--hairline.svg` | Corrientes | P1 | Deriva direccional continua (40s, loop) | Ninguna implementada en este paso (ver nota abajo) | v1.0 | "Es la única familia que representa el río sin literalidad" (Cap. 2.1). Construida solo con la primitiva sinusoide; 3 franjas, escala 1.0 / 1.3 en progresión (Cap. 1.4) y una tercera fuera de serie a propósito. |

Primer paso del Roadmap (Cap. 12) que sale del plano P0: Corrientes
vive en P1 ("Corriente", Cap. 4.1), con opacidad y color tomados de
los tokens `--amb-p1-*` ya definidos desde el Paso 1 pero sin uso
hasta ahora.

Movimiento nuevo: a diferencia de Respiración (que solo anima una
variable de opacidad), Deriva anima `transform: translateX()` sobre
un grupo que contiene el tile original + una copia desplazada un
ancho de tile completo — técnica de loop sin salto documentada en
el propio SVG. Se agregó el keyframe `amb-deriva` en
`ambiente-tokens-movimiento.css`, junto al `amb-respiracion` ya
existente, respetando `prefers-reduced-motion` con el mismo criterio
que las dos familias anteriores.

**Pendiente registrado a propósito (no es una excepción del Cap. 8.2,
es alcance explícito de este paso):** la matriz de reactividad del
Cap. 6.1 asigna a Corrientes reacción a scroll (parallax de
velocidad) y a clima (velocidad ↑ con lluvia). Ninguna de las dos se
implementa acá — este paso solo resuelve la familia y su firma de
movimiento propia. Queda para el paso de integración de interacción/
clima, mismo criterio que ya dejó pendientes los shifts de
clima/horario de `ambiente-tokens-visual.css` en el Paso 1.

Integración: `js/ambiente-corrientes.js` (nuevo, mismo patrón que
`ambiente-reticula.js`/`ambiente-topografia.js`, mismo `iniciar()`
llamado desde `ambiente-orquestador.js`), inserta el asset en
`AmbientePlanos.contenedor('p1')` en vez de `'p0'`.

*(Los assets de las familias restantes — Coordenadas, Brújula,
Partículas de deriva, Halos de posición — se agregan a esta tabla a
medida que se implementan, uno por paso, siguiendo el Roadmap del
Cap. 12.)*
