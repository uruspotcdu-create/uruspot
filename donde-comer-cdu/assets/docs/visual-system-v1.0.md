# URU SPOT — Ambient Engine Asset Language & Visual System v1.0

**Fase 3 — Lenguaje de Assets y Sistema Visual**

*Documento de especificación de diseño. No contiene código, SVG ni implementación. Es la base sobre la cual un estudio o un equipo de producto puede construir todos los assets oficiales sin tomar decisiones adicionales.*

---

### Nota de partida

Este documento asume, a partir del propio brief y del contexto del producto (una app de descubrimiento de lugares — "dónde comer/estar" — en Concepción del Uruguay, ciudad ribereña sobre el río Uruguay), que el Ambient Engine no es decoración: es la capa que le da a URU SPOT una **sensación de lugar**. No cualquier fondo animado, sino uno que solo podría pertenecer a una ciudad de río, de mareas de tráfico, de horarios, de clima cambiante y de gente moviéndose por un mapa real.

Si la dirección conceptual real de las Fases 1 y 2 difiere de esta lectura, el sistema que sigue es igualmente válido en su método — solo habría que recalibrar el vocabulario de formas (Capítulo 2), no la arquitectura de decisiones.

---

## Índice

1. Asset Language — el lenguaje visual
2. Familias de Assets
3. Sistema SVG — reglas
4. Profundidad — planos
5. Movimiento — personalidad por familia
6. Interacción
7. Color — principios
8. Escalabilidad
9. Optimización
10. Integración — carpetas, nomenclatura, versionado
11. Manual de estilo
12. Roadmap
13. Auditoría crítica
14. Conclusiones

---

## 1. Asset Language

### 1.1 La pregunta que ordena todo

Un lenguaje visual no es un moodboard. Es una **gramática**: un conjunto pequeño de reglas que, combinadas, generan infinitas frases pero nunca frases agramaticales. Antes de dibujar un solo asset, hay que fijar esa gramática.

URU SPOT vive en la intersección de tres campos semánticos, y el lenguaje visual debe hablar solo con el vocabulario de esos tres campos — nunca con otro:

| Campo | Qué aporta | Qué NO aporta |
|---|---|---|
| **Cartografía** | líneas de referencia, coordenadas, retículas, curvas de nivel | iconografía turística (banderas, pines de Google Maps genéricos) |
| **Hidrografía / río** | corrientes, ondas, deriva, profundidad | ornamento marino literal (anclas, timones, olas caricaturescas) |
| **Orientación / tiempo** | brújulas, ángulos, arcos horarios, posición solar | relojes literales, iconografía de clima tipo app del tiempo |

Todo asset que no pueda justificarse desde alguno de estos tres campos **no pertenece al sistema**, sin importar cuán bonito sea aisladamente.

### 1.2 Formas predominantes

- **Líneas, no rellenos.** El sistema es fundamentalmente lineal (stroke-based), no de superficies sólidas. El relleno se reserva para masas de agua/mapa muy sutiles en el plano más profundo. Un lenguaje de líneas comunica precisión cartográfica; un lenguaje de rellenos comunica ilustración, y URU SPOT no es una app ilustrada, es una app de datos geográficos con alma.
- **Geometría construida, no orgánica libre.** Toda curva debe poder describirse: arcos de circunferencia, arcos elípticos, sinusoides regulares, espirales logarítmicas suaves. Nada de curvas "a mano alzada". Esto es lo que hace que 40 assets distintos se sientan de la misma familia: todos comparten el mismo tipo de matemática detrás.
- **Ángulos con intención.** Cuando aparecen ángulos rectos (retículas, coordenadas), son estrictamente rectos. Cuando aparecen curvas (corrientes, halos), son estrictamente curvas. El sistema nunca mezcla una curva "casi recta" o un ángulo "casi curvo" — la ambigüedad geométrica es ruido.

### 1.3 Espesores

Sistema de 3 pesos de trazo, nunca más:

| Peso | Uso | Regla |
|---|---|---|
| **Hairline** | retículas, coordenadas, líneas de fondo | 1px a escala base, jamás se anima su grosor |
| **Regular** | brújulas, elementos de plano medio | 1.5px a escala base |
| **Feature** | el asset "protagonista" de una escena puntual | 2px a escala base, uso excepcional, nunca más de un asset feature por viewport |

No existen trazos gruesos decorativos. El grosor comunica jerarquía de plano, no énfasis emocional.

### 1.4 Ritmo y repetición

El sistema se apoya en **repetición modular con variación controlada** — el mismo principio que una retícula cartográfica real: líneas equiespaciadas, pero con una jerarquía cada 5 o cada 10 unidades. Esto evita dos fracasos típicos:

- **Ritmo caótico** (cada asset a su propio tamaño y espaciado): se lee como desorden.
- **Ritmo perfectamente uniforme** (todo idéntico): se lee como wallpaper, pierde vida.

La regla: dentro de una familia, el 80% de las instancias siguen una progresión regular (ej. escala en pasos de 1.0 / 1.3 / 1.6), y el 20% restante rompe la progresión deliberadamente para introducir la sensación de organicidad — igual que una corriente de río no es perfectamente periódica, pero tampoco es aleatoria.

### 1.5 Silencio

El principio más importante y el más fácil de perder bajo presión de "se ve vacío": **el espacio negativo es un asset**. Ninguna escena del Ambient Engine debe tener más del 12–15% de superficie ocupada por trazos visibles en un momento dado (sumando todos los planos). Si un diseñador nuevo mira una pantalla y siente que "falta algo", la respuesta correcta casi siempre es *no agregar*, sino esperar a que el movimiento revele el siguiente elemento en el tiempo. El silencio es lo que le da lugar a la respiración (ver Capítulo 5).

---

## 2. Familias de Assets

De la lista abierta del brief, se seleccionan **7 familias**. Cada una pasa el test: ¿por qué existe, qué comunica, qué aporta que otra familia no aporte ya? Las familias descartadas se listan al final con su razón de descarte — descartar también es una decisión que hay que dejar documentada, para que nadie las reincorpore sin revisar por qué se sacaron.

### 2.1 Familias activas

| # | Familia | Por qué existe | Qué comunica | Plano típico |
|---|---|---|---|---|
| 1 | **Retícula cartográfica** | Da estructura de fondo; sin ella todo lo demás flota sin contexto | "esto es un mapa de datos reales", orden, confianza | Fondo |
| 2 | **Corrientes** (líneas de flujo tipo isolíneas de agua) | Es la única familia que representa el río sin literalidad | movimiento, vida, dirección, el cauce de la ciudad | Medio-fondo |
| 3 | **Brújula / rosa de los vientos** | Ancla simbólica única del producto — orientación, "encontrar tu lugar" | orientación, descubrimiento, foco | Medio |
| 4 | **Coordenadas** (marcas + valores tipográficos discretos) | Refuerza la promesa de precisión geográfica real, no genérica | exactitud, "esto es un lugar específico, no un ícono" | Medio-fondo |
| 5 | **Curvas topográficas** | Da profundidad sin necesitar sombra ni ilustración | terreno, capas, la ciudad tiene relieve y barrios | Fondo profundo |
| 6 | **Partículas de deriva** | Único elemento con movimiento verdaderamente libre; introduce vida orgánica | ambiente vivo, tiempo pasando, clima | Frente sutil |
| 7 | **Halos de posición** (foco radial suave alrededor de un punto activo) | Es el único asset reactivo al usuario — necesario para feedback | "estás mirando esto", atención, selección | Frente |

### 2.2 Familias descartadas (y por qué)

| Familia descartada | Razón |
|---|---|
| Constelaciones | Introduce un campo semántico nuevo (astronomía) sin conexión real con el producto; redundante con "partículas de deriva" en función decorativa |
| Elementos náuticos literales (anclas, timones, velas) | Rompen el principio de no-ilustración; convierten el sistema en iconografía temática en vez de lenguaje abstracto |
| Overlays / máscaras de textura tipo grano o ruido | Aportan atmósfera pero ninguna semántica; se resuelven mejor con opacidad y blend modes a nivel de motor, no como "asset" |
| Mapas abstractos (formas de continente/costa estilizadas) | Muy cerca de ser ilustración figurativa; alto riesgo de leerse como logo genérico de agencia de viajes |
| Estrellas | Redundante funcionalmente con partículas; solo se justificaría en un modo "noche" muy específico — se resuelve como *variante de color* de partículas, no como familia nueva (ver 7.3) |
| Gradientes como asset independiente | El gradiente es una propiedad de color/plano, no un asset con forma propia — se especifica en el Capítulo 7, no aquí |

**Principio de fondo para descartar:** si una familia puede resolverse como una *variante* de otra familia (cambiando color, escala o comportamiento) en vez de como una entidad geométrica nueva, no es una familia — es una variante, y variantes no entran en este capítulo.

---

## 3. Sistema SVG — Reglas

Estas son reglas de *forma del sistema*, no implementación.

### 3.1 Grilla base y viewBox

- Todo asset se diseña sobre un **viewBox cuadrado de 100×100**, sin excepción, independientemente del asset final se vea rectangular o alargado (el espacio sobrante queda vacío dentro del viewBox). Esto permite componer cualquier asset con cualquier otro usando la misma unidad de escala mental.
- El **centro óptico** (50,50) es siempre el punto de anclaje semántico del asset (el centro de una brújula, el origen de una retícula, el foco de un halo). Ningún asset se diseña "descentrado por defecto": el descentrado, si existe, lo decide la capa de composición, no el asset.
- Unidad de grosor de trazo expresada siempre en unidades del viewBox (no en px absolutos), para que el escalado sea matemáticamente predecible.

### 3.2 Escalabilidad

- Cada asset debe verse correcto a 3 escalas de referencia obligatorias antes de aprobarse: 0.5×, 1×, 3×. Si a 0.5× el trazo se vuelve ilegible o a 3× se ve vacío/pobre, el asset no está listo.
- Ningún asset depende de un tamaño mínimo en píxeles absolutos para "funcionar" — la familia entera debe sostenerse desde ícono de 24px hasta fondo de pantalla completa.

### 3.3 Reutilización y composición

- Los assets se construyen a partir de un **set de primitivas compartidas**: arco, línea recta, sinusoide, círculo concéntrico, marca de coordenada. Ninguna familia inventa su propia geometría desde cero — todas ensamblan las mismas 5 primitivas en distinta composición. Esto es lo que hace que, mirados juntos, se sientan de la misma "letra".
- Composición por capas dentro del propio SVG: cada asset se estructura en grupos (`<g>`) lógicos correspondientes a sub-elementos con significado propio (ej. en una brújula: aro / marcas / aguja), nunca como un único path monolítico — esto es lo que permite animar partes sin re-dibujar el asset.

### 3.4 Modularidad

- Un asset = un archivo. Nunca se empaquetan múltiples assets no relacionados en un mismo SVG "para ahorrar requests" — la modularidad de archivo es la que permite versionar, cachear y reemplazar piezas de forma independiente.
- Las variantes (ver 7.3, modo claro/oscuro/clima) no son archivos distintos: son el mismo archivo con tokens de color sustituibles (currentColor / variables), nunca duplicados geométricos.

### 3.5 Nomenclatura de archivo (regla, se detalla en Capítulo 10)

`familia—variante-semantica—peso.svg` en minúsculas, sin espacios, con guiones simples como separador de palabra y doble guion como separador de segmento.

---

## 4. Profundidad

### 4.1 Los planos

El sistema define **4 planos**, no más. Más de 4 planos es indistinguible para el ojo humano en una interfaz — se convierte en ruido con excusa de sofisticación.

| Plano | Contenido | Opacidad típica | Velocidad de movimiento relativa | Reacciona al usuario |
|---|---|---|---|---|
| **P0 — Sustrato** | curvas topográficas, retícula cartográfica | 4–8% | casi estática (deriva mínima) | No |
| **P1 — Corriente** | corrientes, coordenadas | 10–18% | lenta | No |
| **P2 — Orientación** | brújula, partículas de deriva | 18–30% | media | Parcial (clima/horario) |
| **P3 — Foco** | halos de posición | hasta 60% localizado | responde 1:1 al puntero/selección | Sí, directo |

### 4.2 Qué nunca debe mezclarse

- **Nunca dos assets de la misma familia en el mismo plano superpuestos sin espaciado deliberado** — genera moiré visual y rompe el principio de silencio (1.5).
- **El halo de posición (P3) nunca convive con más de un asset P2 activo a la vez** en el mismo área visual — el foco debe ser inequívoco; dos focos compitiendo anulan el propósito de "atención" del halo.
- **Los planos P0 y P1 nunca cambian de opacidad por interacción del usuario** — son el sustrato, deben sentirse geológicos, no reactivos. Si el sustrato reacciona, deja de sentirse como sustrato.
- **Ningún asset cruza de plano dinámicamente.** Un asset de corriente no "pasa a ser" un halo al hacer hover; en cambio, un halo puede *aparecer* cerca de una corriente. Cambiar de plano en tiempo real rompe el modelo mental de profundidad.

### 4.3 Profundidad sin ruido

La profundidad se logra con tres variables únicamente — nunca con sombras, blur decorativo ni superposición de más elementos:

1. **Opacidad decreciente con la distancia del plano** (tabla 4.1)
2. **Velocidad decreciente con la distancia del plano** (parallax: lo lejano se mueve menos)
3. **Densidad decreciente con la distancia del plano** (P0 tiene más elementos pequeños y tenues; P3 tiene pocos elementos pero definidos)

Nunca se usa `blur` como atajo de profundidad: el blur cuesta rendimiento y además contradice el lenguaje lineal-nítido del Capítulo 1. La sensación de "estar lejos" la da la opacidad y la velocidad, no el desenfoque.

---

## 5. Movimiento

Regla general: el motor no anima "para que se mueva algo en pantalla" — cada familia tiene **una** firma de movimiento, y solo una, que es su personalidad. Mezclar comportamientos de movimiento entre familias diluye la identidad tanto como mezclar geometrías.

| Familia | Comportamiento asignado | Por qué ese y no otro |
|---|---|---|
| Retícula cartográfica | **Respiración** (variación de opacidad muy sutil, ciclo largo, 8-12s) | Es sustrato: debe sentirse viva pero inmóvil en posición — respirar, no viajar |
| Corrientes | **Deriva direccional continua** (desplazamiento lento en una dirección fija, loop) | Un río no oscila, fluye en una dirección — la deriva es la traducción honesta de esa física |
| Brújula | **Rotación mínima + oscilación de aguja** (el aro casi no rota; la aguja oscila buscando norte) | Es el único asset con semántica de instrumento — debe comportarse como un instrumento real, no decorativo |
| Coordenadas | **Aparición / desaparición discreta** (fade in/out puntual, sin desplazamiento) | Las coordenadas son datos, no paisaje — aparecen cuando hay algo que señalar y se retiran, nunca "flotan" |
| Curvas topográficas | **Ninguno / respiración extrema lenta (>20s)** | Es el plano más profundo; el movimiento aquí compite con la percepción de las capas superiores. Casi estático es la decisión correcta |
| Partículas de deriva | **Flotación libre con parallax** (trayectorias suaves, no lineales, responde a scroll) | Es el único elemento con licencia de organicidad — aporta la sensación de "clima"/tiempo pasando |
| Halos de posición | **Iluminación reactiva** (crecimiento/atenuación ligado 1:1 a la interacción, sin loop propio) | No tiene vida propia: existe solo como respuesta, por eso no tiene ciclo autónomo |

**Regla dura:** ninguna familia usa parallax **y** rotación **y** oscilación a la vez. Cada asset tiene como máximo dos ejes de movimiento simultáneos. Tres o más ejes en un mismo elemento se lee como "efecto especial", no como ambiente.

---

## 6. Interacción

### 6.1 Matriz de reactividad

| Familia | Usuario (hover/click) | Scroll | Clima | Horario | Mapa/ubicación activa |
|---|---|---|---|---|---|
| Retícula cartográfica | No | No | No | No | No |
| Corrientes | No | Ligero (parallax de velocidad) | Sí (velocidad ↑ con lluvia) | No | No |
| Brújula | No | No | No | No | **Sí** (la aguja apunta hacia el spot seleccionado) |
| Coordenadas | No | No | No | No | **Sí** (se activan cerca del punto elegido) |
| Curvas topográficas | No | No | No | No | No |
| Partículas de deriva | No | Sí (parallax) | Sí (densidad ↑ con lluvia, dirección con viento simulado) | Sí (color, ver Cap. 7) | No |
| Halos de posición | **Sí, directo** | No | No | No | **Sí** (aparecen sobre el resultado activo) |

### 6.2 Principio rector

Hay una jerarquía clara de quién tiene permiso de reaccionar a qué, y se resume así: **el sustrato (P0/P1) nunca reacciona al usuario; solo al tiempo y al mundo (clima, horario). El primer plano (P2/P3) nunca reacciona al mundo directamente; solo al usuario y a los datos activos (mapa/selección).**

Esto evita el error más común de este tipo de sistemas: que *todo* reaccione a *todo*, lo cual hace que la interfaz se sienta nerviosa e impredecible. Que algo **no** reaccione es tan intencional como que algo reaccione.

---

## 7. Color

### 7.1 Principios, no paletas

1. **El color nunca es decorativo, es informativo de plano y estado.** La opacidad y la temperatura de color son las que comunican profundidad (Cap. 4) y contexto (clima/horario) — nunca se elige un color "porque queda lindo" en un asset individual.
2. **Monocromía por escena, variación por contexto.** En un momento dado, todos los assets visibles comparten una única familia tonal (derivada del contexto: hora, clima). Nunca conviven dos temperaturas de color distintas en la misma escena — eso es lo que evita que el fondo compita con el contenido real de la app (los spots, las fotos, la UI).
3. **El asset nunca lleva color propio fijo.** Todo asset se define en `currentColor` o variable de token — el color lo decide siempre el sistema (modo + momento), nunca el archivo. Esto es una regla técnica con raíz de diseño: si un asset "sabe" su color, no puede adaptarse, y un sistema que no se adapta al contexto real de uso deja de ser "ambiente".
4. **El contraste con el contenido en primer plano es innegociable.** Ningún ajuste de contexto (clima, horario) puede llevar la opacidad/color del Ambient Engine a un punto donde compita con la legibilidad de la UI real. El engine sirve al contenido, nunca al revés.

### 7.2 Convivencia con modo claro / oscuro

- **Modo claro:** trazos en tono frío-neutro oscuro sobre fondo claro, opacidades en el extremo bajo de cada rango del Capítulo 4 (el riesgo en claro es siempre "se ve sucio", no "se ve pobre").
- **Modo oscuro:** trazos claros sobre fondo oscuro, opacidades en el extremo alto de cada rango (el riesgo en oscuro es lo opuesto: si es muy tenue, desaparece y dejamos de tener Ambient Engine).

### 7.3 Convivencia con clima y momento del día

Estas no son paletas nuevas: son **desplazamientos de temperatura y velocidad** sobre la misma base tonal del modo claro/oscuro activo.

| Contexto | Ajuste de color | Ajuste de movimiento asociado |
|---|---|---|
| Lluvia | Desaturación leve + shift hacia azul-gris | Corrientes y partículas aumentan velocidad (Cap. 6) |
| Noche | Ya cubierto por modo oscuro; partículas pueden ganar un leve shift a tono frío puntual (sustituto conceptual de "estrellas", ver 2.2) | Ritmo general más lento |
| Amanecer | Shift cálido muy sutil (ámbar bajo) solo en P2/P3 | Sin cambio |
| Atardecer | Shift cálido más marcado (ámbar medio) en P2/P3, P0/P1 sin cambio | Sin cambio |

**Regla dura:** el shift de temperatura por clima/horario nunca se aplica al plano P0 (sustrato). El sustrato es lo único que se mantiene perceptualmente constante pase lo que pase — es el "suelo" del sistema, y un suelo que cambia de color constantemente no se siente estable.

---

## 8. Escalabilidad del sistema

### 8.1 Cómo agregar un asset nuevo sin romper la identidad

Checklist obligatoria antes de aprobar cualquier asset nuevo, en orden:

1. ¿A cuál de las 3 categorías semánticas del Capítulo 1 pertenece (cartografía / hidrografía / orientación-tiempo)? Si no pertenece claramente a una, se rechaza.
2. ¿Puede construirse con las 5 primitivas compartidas (3.3)? Si necesita geometría nueva, se rechaza o se agrega la primitiva al set compartido (decisión de sistema, no de asset individual).
3. ¿A qué familia existente pertenece? Un asset nuevo casi nunca debería fundar una familia nueva — casi siempre es una variante de una de las 7. Fundar familia nueva requiere repetir el ejercicio del Capítulo 2 completo (justificación + qué se descarta a cambio).
4. ¿Qué plano y qué firma de movimiento (Cap. 4 y 5) hereda? No se define movimiento "a medida" por asset — hereda el de su familia.
5. ¿Pasa el test de las 3 escalas (3.2)?

### 8.2 Cómo evitar inconsistencia con el tiempo (años, distintos diseñadores)

- Este documento es la única fuente de verdad; ningún asset se aprueba por gusto individual de quien lo diseña ese día.
- Toda excepción a una regla de este documento debe registrarse explícitamente como excepción versionada (Cap. 10), nunca como "silenciosa". Una excepción no documentada, con el tiempo, se convierte en la nueva regla de facto — y esa es la manera en que estos sistemas se degradan.
- Revisión periódica (ver Roadmap, Cap. 12): cada release mayor del engine, se re-audita el sistema completo contra el Capítulo 13 de este documento.

---

## 9. Optimización

### 9.1 Reglas estrictas — qué jamás debe hacerse

- Jamás usar `filter` de SVG (blur, drop-shadow) como recurso de estilo — costoso en render y contradice el lenguaje lineal-nítido.
- Jamás animar propiedades que disparan layout/reflow (`width`, `height`, posición vía `top/left`) — toda animación se resuelve por `transform` y `opacity`.
- Jamás un path único con más de **80 nodos** por asset (ver 9.2).
- Jamás cargar una familia entera si la escena solo necesita 2–3 instancias — el motor solicita assets bajo demanda, no en bloque.
- Jamás duplicar geometría entre variantes de color — una sola geometría, color por token (3.4).

### 9.2 Complejidad máxima

| Métrica | Límite |
|---|---|
| Nodos por asset individual | 80 |
| Grupos (`<g>`) por asset | 6 |
| Peso de archivo SVG (sin optimizar) | 6 KB |
| Peso de archivo SVG (optimizado, entregado) | 2 KB |
| Assets simultáneos visibles en viewport (todos los planos) | 40 |

### 9.3 Reutilización como estrategia de rendimiento

Dado que todas las familias comparten las 5 primitivas (3.3), el motor puede — a nivel de implementación futura, no de este documento — resolver muchas instancias como referencias (`<use>`) a un set reducido de definiciones, en vez de geometría repetida. Esta decisión de diseño (compartir primitivas) es, en sí misma, la optimización más grande del sistema: nace en el Capítulo 1, no en este capítulo.

### 9.4 Cómo mantener rendimiento con el tiempo

- Todo asset nuevo se audita contra la tabla 9.2 antes de sumarse al repositorio, no después.
- El presupuesto de "assets simultáneos visibles" (40) es del sistema completo, no por familia — si se agrega una familia nueva, se resta presupuesto a las existentes, nunca se amplía el total sin una revisión de rendimiento real en dispositivos de gama media.

---

## 10. Integración

### 10.1 Estructura de carpetas

```
/assets
  /ambient
    /reticula/
    /corrientes/
    /brujula/
    /coordenadas/
    /topograficas/
    /particulas/
    /halos/
    /_primitivas/        (arco, linea, sinusoide, circulo-concentrico, marca-coordenada)
    /_tokens/             (definiciones de color por modo/contexto, no assets)
  /docs
    visual-system-v1.0.md   (este documento)
    changelog.md
    excepciones.md
```

### 10.2 Nomenclatura (regla detallada de 3.5)

`familia—variante-semantica—peso.svg`

Ejemplos conceptuales (no se generan aquí, solo se ilustra el patrón):

- `brujula—default—regular.svg`
- `corrientes—diagonal-lenta—hairline.svg`
- `halo—foco-activo—feature.svg`

### 10.3 Versionado

- Versionado semántico a nivel de **sistema completo**, no por asset individual: `v1.0`, `v1.1`, `v2.0`.
- Cambio de **patch** (v1.0 → v1.0.1): corrección de un asset existente sin alterar su semántica ni geometría base.
- Cambio **menor** (v1.0 → v1.1): asset nuevo dentro de una familia existente.
- Cambio **mayor** (v1.0 → v2.0): familia nueva, o cambio de alguna regla de los Capítulos 1, 3, 4 o 7 (las reglas estructurales).

### 10.4 Clasificación y documentación

Cada asset, al incorporarse, requiere una ficha mínima en `changelog.md`:

| Campo | Ejemplo |
|---|---|
| Nombre de archivo | `brujula—default—regular.svg` |
| Familia | Brújula |
| Plano | P2 |
| Movimiento heredado | Rotación mínima + oscilación de aguja |
| Reactividad | Mapa/ubicación activa |
| Fecha / versión de incorporación | v1.0 |
| Justificación (1 línea) | "Ancla simbólica de orientación única del producto" |

---

## 11. Manual de estilo

### 11.1 Permitido

- Construir cualquier asset nuevo a partir de las 5 primitivas compartidas.
- Combinar hasta 2 ejes de movimiento por asset.
- Ajustar opacidad y temperatura de color según modo/clima/horario, respetando los rangos del Capítulo 4 y 7.
- Introducir variantes de una familia existente sin pasar por el proceso de "familia nueva".

### 11.2 Prohibido

- Usar relleno sólido como recurso expresivo fuera del plano P0 (sustrato de mapa muy sutil).
- Introducir iconografía figurativa reconocible (banderas, pines, animales, personas, comida) dentro del Ambient Engine — eso pertenece a la capa de contenido/UI, no al ambiente.
- Animar cualquier propiedad que dispare reflow (9.1).
- Asignar color fijo, no tokenizado, a un asset.
- Superar los límites de nodos, grupos o peso del Capítulo 9 "porque el asset lo necesita" — si un asset necesita más, el asset está mal planteado, no el límite.
- Hacer que un asset de P0/P1 reaccione al usuario, o que uno de P2/P3 reaccione al clima/horario directamente (Cap. 6.2).
- Mezclar dos temperaturas de color en la misma escena (7.1).

### 11.3 Errores que destruirían la identidad

1. **Agregar assets decorativos "porque queda vacío"** sin pasar el checklist del Capítulo 8 — es la puerta de entrada más común a la degradación de un sistema visual.
2. **Dejar que el diseño gráfico de una campaña puntual** (ej. una promo, un evento) inyecte assets ilustrativos directamente en el Ambient Engine en vez de vivir en la capa de contenido — contamina el lenguaje permanentemente si no se revierte.
3. **Usar el Ambient Engine para comunicar jerarquía de producto** (ej. "iluminar más" una zona porque comercialmente interesa) — el engine responde a datos de uso real (ubicación, clima, hora), nunca a intereses de negocio; el día que lo haga, el usuario deja de confiar en la interfaz como reflejo honesto del mundo.

---

## 12. Roadmap

| Orden | Familia / entregable | Prioridad | Impacto | Dificultad | Dependencias |
|---|---|---|---|---|---|
| 1 | Primitivas compartidas (3.3) + tokens de color (7) | Crítica | Alto (todo depende de esto) | Media | Ninguna |
| 2 | Retícula cartográfica (P0) | Alta | Alto (da estructura a todo lo demás) | Baja | Primitivas |
| 3 | Curvas topográficas (P0) | Alta | Medio | Media | Primitivas |
| 4 | Corrientes (P1) | Alta | Alto (identidad diferencial fuerte) | Media | Primitivas, tokens |
| 5 | Coordenadas (P1) | Media | Medio | Baja | Primitivas |
| 6 | Brújula (P2) | Alta | Alto (ancla simbólica del producto) | Alta (requiere reactividad a mapa) | Primitivas, integración con datos de mapa |
| 7 | Partículas de deriva (P2) | Media | Medio | Media | Primitivas, tokens de clima |
| 8 | Halos de posición (P3) | Alta | Alto (feedback directo de interacción) | Media | Integración con estado de selección de UI |
| 9 | Variantes de clima/horario (todas las familias) | Media | Alto (a largo plazo) | Alta | Todo lo anterior |
| 10 | Auditoría v1.1 (Cap. 13 reaplicado) | Baja (pero recurrente) | Alto (mantenimiento de identidad) | Baja | Sistema completo en producción |

**Criterio de orden:** primero lo que es infraestructura pura sin la cual nada más puede construirse (primitivas, tokens); después lo que da estructura perceptual (sustrato); después lo que da identidad diferencial fuerte (corrientes, brújula); al final lo que depende de integración con datos reales de producto (reactividad a mapa/selección/clima).

---

## 13. Auditoría crítica

*Este capítulo intenta activamente romper el sistema diseñado arriba. Cada punto es una objeción real, no retórica.*

### 13.1 ¿Sobran familias?

**Objeción:** ¿Realmente hacen falta 7 familias, o el sistema sería más fuerte con 5?

**Revisión:** Coordenadas es la familia más débil de las 7 — es la única sin movimiento propio real (aparición/desaparición discreta es casi ausencia de movimiento) y su función podría absorberse como *un modo de estado* de la Brújula (mostrar valores numéricos cuando hay un punto seleccionado) en vez de existir como familia independiente con sus propios archivos.

**Decisión:** se mantiene como familia por una razón funcional, no estética: la Brújula está atada semánticamente a *orientación relativa* (dirección hacia algo), mientras que Coordenadas comunica *posición absoluta* (dónde exactamente). Son dos preguntas distintas que un usuario puede hacerle al mapa. Se mantiene, pero se marca como la familia con menor prioridad de expansión futura (ver Roadmap, orden 5).

### 13.2 ¿Hay redundancia entre Corrientes y Partículas de deriva?

**Objeción:** ambas comunican "movimiento de agua/ambiente" — ¿no es una la versión de la otra?

**Revisión:** la diferencia real es de naturaleza del movimiento (direccional-continuo vs. libre-orgánico) y de plano (P1 sustrato vs. P2 reactivo a clima). Si se fusionaran, se perdería la posibilidad de que el clima afecte solo a un plano sin afectar al otro — una herramienta expresiva real del sistema (Cap. 6). Se mantienen separadas, pero se deja registrado que si en la práctica ambas terminan viéndose casi iguales en pantalla, es señal de que la diferenciación de comportamiento no se está respetando en implementación, no de que la distinción conceptual esté mal.

### 13.3 ¿El halo de posición es realmente un "asset" o es un efecto de UI disfrazado?

**Objeción:** a diferencia de las otras 6 familias, el halo no tiene existencia sin interacción directa — podría argumentarse que no es parte del "ambiente" sino de la capa de interfaz.

**Revisión:** esta es la objeción más fuerte del documento. Se decide mantenerlo dentro del sistema porque comparte las mismas primitivas (3.3), el mismo sistema de viewBox (3.1) y las mismas reglas de tokens de color (7) — geométricamente pertenece al mismo lenguaje aunque su disparador sea distinto al resto. Pero se marca explícitamente: **el halo es la única familia con permiso de romper la regla "P0/P1 no reacciona al usuario" en sentido inverso — reacciona *solo* al usuario.** Esa asimetría queda documentada como excepción consciente, no como inconsistencia (ver 8.2 sobre excepciones versionadas).

### 13.4 ¿El límite de 4 planos es arbitrario?

**Objeción:** ¿por qué 4 y no 3 o 5?

**Revisión:** con 3 planos, no hay lugar para separar "sustrato geológico inmóvil" de "corriente lenta" — ambos terminan en el mismo plano y pierden la distinción de velocidad que sostiene el parallax (4.3). Con 5 planos, en pruebas de percepción típicas de interfaces reales, la diferencia entre planos 4 y 5 deja de ser distinguible al ojo a las velocidades y opacidades que exige el Capítulo 1 (silencio, baja densidad). 4 es el número mínimo que permite distinguir sustrato / ambiente / foco de atención / respuesta directa como capas perceptualmente separables. Se mantiene.

### 13.5 Elemento que se elimina tras esta auditoría

Ningún asset nuevo se agrega, pero se **degrada la prioridad de Coordenadas** (13.1) y se **formaliza el halo como excepción de reactividad** (13.3) en vez de tratarlo como una familia más entre iguales. El sistema queda con 7 familias, pero con una jerarquía interna de robustez conceptual que no tenía antes de esta auditoría — y esa jerarquía es la que debe guiar qué se sacrifica primero si en el futuro hay que simplificar por presupuesto de rendimiento (Cap. 9).

---

## 14. Conclusiones

El sistema descrito en este documento no depende de que cada asset individual sea "lindo" — depende de que la gramática del Capítulo 1 se respete sin excepciones silenciosas. Un estudio de diseño externo, siguiendo únicamente este documento, debería poder producir cualquier asset de cualquiera de las 7 familias y que el resultado sea indistinguible en autoría de uno producido internamente.

Las tres decisiones que sostienen todo lo demás, y que si se rompen rompen el sistema entero, son:

1. **Todo asset nace de 5 primitivas compartidas** (Cap. 3) — es la raíz de la coherencia visual y del rendimiento.
2. **4 planos, con reglas estrictas de quién reacciona a qué** (Caps. 4 y 6) — es la raíz de que el sistema se sienta ordenado y no ansioso.
3. **El silencio (espacio negativo) es un asset más** (1.5) — es la raíz de que el sistema se sienta como ambiente y no como wallpaper animado.

Cualquier decisión futura que entre en conflicto con estas tres puede discutirse como excepción versionada (10.3), pero nunca debería aplicarse como cambio silencioso. Ese es, en definitiva, el mecanismo que va a mantener a URU SPOT visualmente reconocible dentro de un año y dentro de cinco.
