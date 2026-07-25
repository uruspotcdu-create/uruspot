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
