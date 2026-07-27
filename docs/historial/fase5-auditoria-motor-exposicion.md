# Fase 5 — Auditoría de `motor-exposicion.js` (previa a cualquier cambio)

> Alcance: `donde-comer-cdu/js/motor-exposicion.js` (582 líneas), su
> contrato con `motor-plano.js`, `motor-config.js` y `app.js`, y la
> suite `js/motor-test.js`. Contexto usado: `REPO_CONTEXT_MASTER.md`,
> `REPO_ARCHITECTURE_MAP.md`, `REPO_FILE_CATALOG.md` + lectura directa
> del código real en `main` (post Fase 0–4, mismo commit ya confirmado
> en GitHub). **Nada se modificó.** Se corrió `node js/motor-test.js`
> desde `donde-comer-cdu/`: **202/202 OK** (mismo baseline que el
> master doc). Esta auditoría es exclusivamente de lectura.

---

## 1. Diagnóstico actual

`motor-exposicion.js` es, hoy, el módulo más maduro de los tres
"motores" del sistema. Ya pasó por un rediseño documentado ("de filtro
+ shuffle a motor de scoring modular") y ese rediseño está bien
ejecutado:

- Es **puro**: ninguna función toca DOM, hace `fetch`, ni depende de
  nada fuera de `motor-plano.js` (vía su API pública) y su propia
  configuración. Verificado por lectura completa, no solo por el
  comentario que lo afirma.
- Respeta el invariante no negociable del Blueprint v2: `resultadosPorAccionExplicita()`
  y `coleccionCurada()` nunca recortan ni puntúan — confirmado en el
  código (no hay ninguna llamada a `calcularScore`/`candidatosBase`
  desde ninguna de las dos).
- El pipeline de selección (`calcularRecorte`: score → diversidad →
  exploración) es legible, con cada responsabilidad en su propia
  función, y con la cascada de relajación (candidatos < cupo → se
  relaja el filtro de rubros evitados → si aún así no alcanza, catálogo
  completo) preservada tal cual describe su propio comentario.
- Cada señal de scoring (`afinidad`, `proximidad`, `frescura`,
  `contexto`) es opcional y se renormaliza si falta — verificado que
  esto es cierto en el código, no solo en el comentario: ningún lugar
  se penaliza por falta de dato.
- Tiene cobertura de tests real y no trivial (ver §7): determinismo,
  catálogo completo (1.468) con medición de tiempo, empates, datos
  incompletos, listas vacías, pureza (no-mutación).

Dicho esto, encontré **inconsistencias puntuales, reales, ya
verificadas contra el código** — no hipótesis. Ninguna es una falla
catastrófica; todas son del tipo "silencioso" que pediste mirar con
lupa. Las detallo en §2–§4.

---

## 2. Bugs reales encontrados

### 2.1 `descansando()` no valida el tipo de `ultimaVez` (inconsistencia defensiva)

```js
function descansando(estado, lugarId, ahoraMs) {
  var reg = estado.exposicion[lugarId];
  if (!reg || !reg.ultimaVez) return false;
  var descansoMs = CFG.exposicion.descansoHoras * 3600 * 1000;
  return (ahoraMs - reg.ultimaVez) < descansoMs;
}
```

Si `reg.ultimaVez` fuera un valor no numérico pero truthy (por ejemplo,
`estado` corrupto a mano en `localStorage`, o una migración futura que
cambie el tipo), `ahoraMs - reg.ultimaVez` da `NaN`, y `NaN < descansoMs`
es `false` — es decir, el lugar **deja de "descansar" en silencio**,
sin excepción y sin log. Comparar con `scoreFrescura()`, unas líneas
más abajo en el mismo archivo, que sí valida explícitamente
`typeof reg.vecesMostrado === 'number'` antes de usarlo. Es la misma
clase de dato (un campo de `estado.exposicion[id]`), con dos niveles
distintos de defensividad dentro del mismo archivo. No crashea (por
suerte, no por diseño), pero es exactamente el tipo de "error
silencioso" que pediste que buscara.

**Severidad:** baja-media. No hay evidencia de que esto ocurra hoy en
producción (el escritor real, `motor-plano.js: aceptar()`, siempre
escribe `Date.now()`), pero es una asimetría de robustez real dentro
del propio archivo, no una hipótesis.

### 2.2 `recortePorIniciativaPropiaExplicado()` mezcla dos nociones de "ahora"

```js
return {
  lugares: seleccion.map(...),
  confianza: PLANO.nivelConfianza(estado),   // ← usa Date.now() interno, siempre
  ...
};
```

`calcularScore`/`ordenarPorScore` sí respetan `contexto.ahoraMs` cuando
se provee (por eso el test de determinismo §57 fija `ahoraMs: 99999999`
y funciona). Pero `PLANO.nivelConfianza(estado)` **no acepta un
parámetro de tiempo** — usa `Date.now()` real adentro, sin excepción
(verificado en `motor-plano.js`, línea ~888). Resultado: si alguien usa
`recortePorIniciativaPropiaExplicado()` con un `contexto.ahoraMs`
simulado (pensado exactamente para tests o para depurar "qué habría
pasado el día X"), el campo `score`/`señales` reflejan ese tiempo
simulado, pero `confianza` refleja el reloj real de la máquina que
ejecuta el código. Es una inconsistencia interna de una única función,
no algo que dependa de datos externos.

**Severidad:** baja. Hoy no tiene consumidor real (es aditiva, "nadie
que hoy consuma `recortePorIniciativaPropia()` se entera de que
existe", dice el propio comentario del archivo) — pero si Fase 5 o una
fase futura conecta esta función a la UI, el campo `confianza` sería
la única pieza no determinística de un contrato que se vende
explícitamente como explicable/determinístico.

### 2.3 Umbral hardcodeado que contradice la convención documentada del propio repo

```js
function razonesDesdeSeñales(señales) {
  var razones = [];
  if (señales.afinidad >= 1) razones.push('te interesaron lugares similares antes');
  if (typeof señales.proximidad === 'number' && señales.proximidad >= 0.6) razones.push('está cerca tuyo');
  ...
```

El `0.6` de proximidad es un umbral de calibración puro (¿a partir de
qué score "está cerca" merece mencionarse como razón?), y
`motor-config.js` es explícito, en su propio encabezado, sobre esta
regla: *"cada valor documenta qué mueve, por qué ese punto de partida...
Si para calibrar algo hay que tocar motor-exposicion.js, es que el
valor no debería haber estado hardcodeado ahí"*. Este `0.6` vive
directamente en `motor-exposicion.js`, no en `motor-config.js`,
violando la convención que el propio repo se autoimpone. (El `>= 1` de
afinidad/frescura no cuenta como calibración real — son sus techos
matemáticos exactos, no números elegidos a criterio.)

**Severidad:** baja (cosmético/mantenimiento), pero es un hallazgo
concreto, no una sospecha — y encaja exactamente con el pedido de
"robustecer sin agrandar artificialmente": mover un número a config no
agranda el archivo, lo alinea con su propia regla.

### 2.4 Comentario desactualizado en `motor-plano.js` sobre el consumidor de `gruposAfines()`

No es un bug de `motor-exposicion.js` en sí, pero es parte de su
contrato con `motor-plano.js` y afecta directamente la confiabilidad de
la documentación que cualquier sesión futura (humana o no) va a leer
antes de tocar este archivo:

```js
// motor-plano.js, función gruposAfines():
// "No tiene consumidor todavía en motor-exposicion.js (fuera de
//  alcance de esta pasada)..."
```

Esto es **falso en el estado actual del código**: `motor-exposicion.js`
sí llama a `PLANO.gruposAfines(estado, ahora)` en dos lugares
(`recortePorIniciativaPropia` y `recortePorIniciativaPropiaExplicado`,
construyendo `afinesSet`). El comentario describe correctamente el
estado *antes* del rediseño que el propio `motor-exposicion.js`
documenta en su cabecera, pero nadie volvió a `motor-plano.js` a
actualizar ese comentario específico cuando se conectó el consumidor.
Mismo patrón exacto que ya encontraron y corrigieron Uds. con
`functions/weather.js` en la auditoría de precisión del 26/07 — esto es
el mismo tipo de deuda, en otro archivo.

**Severidad:** cosmética, cero riesgo funcional. La incluyo porque el
propio equipo ya demostró que le importa esta clase de precisión
documental, y porque Fase 5 va a tocar exactamente esta zona del
código.

---

## 3. Riesgos reales (no bugs hoy, pero superficie sensible)

1. **Duplicados de `id` en el catálogo romperían la deduplicación por
   `id` en la fase de exploración.** `calcularRecorte()` construye
   `restantesPorId` como un mapa `id → item`; si dos lugares distintos
   compartieran `id` (violación de una asunción de datos, no de este
   archivo), el segundo pisaría al primero en el mapa y podría producir
   una entrada duplicada o una faltante en el cupo de exploración. No
   hay test que lo cubra (los tests actuales generan ids únicos
   siempre). Esto depende de una garantía de datos externa a este
   archivo (unicidad de `id` en `lugares-core.json`) — lo marco como
   riesgo, no como bug, porque el propio `REPO_CONTEXT_MASTER.md` no
   verificó unicidad de `id` en el dataset real.
2. **División por cero teórica en `scoreProximidad`** si
   `distanciaReferenciaMetros` fuera `0` en config (`d / 0`). Hoy es una
   constante fija (`3000`) que nunca es `0`, así que es un riesgo de
   configuración futura, no un bug actual — pero `clamp01` no protege
   contra `NaN` cuando `d === 0` y el divisor también es `0`
   simultáneamente (`0/0 = NaN`), y `Math.min(1, NaN)` es `NaN`, no `1`.
3. **`vecesMostrado` negativo o corrupto no está saneado por
   `esEstadoValido()`.** Esa función valida la *forma* de nivel
   superior del estado (`exposicion` es objeto, no array), pero no
   valida el contenido de cada entrada `estado.exposicion[id]`. Un
   valor negativo ahí (imposible por el único escritor real,
   `motor-plano.js: aceptar()`, que siempre suma `+1`, pero posible si
   alguien edita `localStorage` a mano, o si un bug futuro en otra
   parte escribe distinto) no crashea gracias a `clamp01`, pero puede
   producir un score de frescura matemáticamente incoherente (por
   ejemplo, `1` en vez de decaído) sin ningún aviso.

Ninguno de estos tres puntos está *hoy* causando un problema visible —
los marco porque encajan exactamente en "comportamiento ante datos
corruptos o inesperados", que pediste mirar explícitamente, y porque
"robustecer" a menudo significa cerrar estas grietas antes de que un
cambio de datos futuro las abra.

---

## 4. Oportunidades de mejora (no bugs — decisiones de producto/calidad)

Estas NO son errores del archivo; son huecos legítimos que noté al
comparar lo que el motor de scoring podría usar contra lo que
`lugares-core.json` ya expone:

1. **`rating`/`rating_count` no participan del scoring en absoluto.**
   Verificado por `grep` en todo el archivo: cero menciones. El motor
   pondera afinidad, proximidad, frescura y contexto climático — nunca
   calidad/popularidad del lugar en sí. Esto puede ser completamente
   intencional (no hay ninguna nota en el archivo que lo mencione como
   pendiente, a diferencia de `afinidadClimaPorGrupo`, que sí está
   marcado explícitamente como "vacío a propósito"), así que lo listo
   como pregunta abierta de producto, no como omisión.
2. **`estado_verificacion` tampoco participa** — un lugar "pendiente de
   verificación" tiene exactamente las mismas chances de aparecer en
   Guía/Exploración que uno "verificado". De nuevo: puede ser
   intencional (mostrar lugares no verificados igual, para que se
   verifiquen con el uso real), pero no hay ninguna nota en el código
   que documente esa decisión como tal.
3. **`recortePorIniciativaPropiaExplicado()` no tiene consumidor ni test
   de regresión de sus razones** (`razonesDesdeSeñales`) más allá de
   "tiene al menos una razón" (test §62). Si en Fase 5 se conecta a UI,
   valdría la pena un test por cada rama de razón.

---

## 5. Contratos que deben conservarse (línea roja para Fase 5)

Extraído de lectura directa del código y cruzado con
`REPO_ARCHITECTURE_MAP.md` §7:

| Contrato | Por qué es innegociable |
|---|---|
| `recortePorIniciativaPropia(registro, estado, nombreRegion, contexto?)` → `array` plano de lugares (mismos objetos de `registro`, mismo shape) | `app.js:1100` lo consume directo y lo pasa a `ordenarPorCercania()`/`pintarTarjetas()` sin envoltorio — cambiar la forma de salida rompe el render. |
| `resultadosPorAccionExplicita()` y `coleccionCurada()` **nunca** aplican scoring/recorte/presupuesto | Es el invariante no negociable del Blueprint v2 §4b, citado en el propio encabezado del archivo. Tocar esto no es un refactor, es un cambio de producto que requiere autorización explícita. |
| `motor-exposicion.js` nunca hace `fetch`, nunca lee `geolocation`, nunca toca DOM | Es lo que permite testear el módulo con `require()` puro en Node (`motor-test.js`) sin mock de DOM. |
| `motor-exposicion.js` depende de `motor-plano.js` (vía su API pública) y **nunca al revés** | Invariante explícito documentado en `REPO_ARCHITECTURE_MAP.md` §2 — romperlo crea un ciclo de dependencia entre dos módulos que hoy se cargan en orden fijo (`motor-plano.js` antes que `motor-exposicion.js`, `index.html` línea de scripts). |
| `CFG.exposicion.scoring.*` sigue siendo la única fuente de calibración leída por este archivo | Es la premisa completa de `motor-config.js` — cualquier número de calibración nuevo que Fase 5 agregue va ahí, no acá (ver hallazgo §2.3, que ya viola esto). |
| API pública actual (`recortePorIniciativaPropia`, `recortePorIniciativaPropiaExplicado`, `resultadosPorAccionExplicita`, `coleccionCurada`, `calcularScoreLugar`) | Verificada contra consumidores reales + contra `motor-test.js` (tests §65–66, "compatibilidad de API"). No quitar ni cambiar firma de ninguna sin actualizar ambos. |
| Ninguna señal penaliza por dato ausente (afinidad/proximidad/frescura/contexto opcionales, renormalización de pesos) | Es una decisión de producto explícita, repetida tres veces en el archivo (encabezado, JSDoc de `calcularScore`, comentario de cada señal individual). |

---

## 6. Cambios que propongo (para aprobación — nada aplicado todavía)

Ordenados de menor a mayor alcance. Cada uno es aislado: se puede
aprobar cualquier subconjunto sin necesitar los demás.

1. **(2.1) Blindar `descansando()` con el mismo nivel de chequeo de
   tipo que ya usa `scoreFrescura()`** — un `typeof reg.ultimaVez ===
   'number'` antes de restar. 1 línea, cero cambio de comportamiento en
   el camino feliz (hoy `ultimaVez` siempre es un número real), cierra
   la asimetría de §2.1.
2. **(2.3) Mover el `0.6` de proximidad de `razonesDesdeSeñales()` a
   `motor-config.js: exposicion.scoring`** (ej.
   `scoring.explicacion.umbralProximidadRazon: 0.6`), con el mismo
   estilo de comentario ("por qué este número") que ya usa el resto del
   archivo. Alinea el archivo con su propia convención citada, sin
   agrandarlo (es mover una línea, no agregar código).
3. **(2.2) Que `recortePorIniciativaPropiaExplicado()` pase
   `contexto.ahoraMs` a `nivelConfianza()`** — esto requiere primero que
   `motor-plano.js: nivelConfianza(estado, ahoraMs?)` acepte un segundo
   parámetro opcional (con `Date.now()` como default si no se pasa,
   para no romper a nadie que lo llame sin ese argumento hoy). Es un
   cambio que cruza a `motor-plano.js` — lo marco como el de mayor
   alcance de los tres, porque toca un archivo que `REPO_ARCHITECTURE_MAP.md`
   clasifica como CRÍTICO. Si preferís, puedo dejarlo fuera de esta
   fase y tratarlo aparte.
4. **(§3.3) Sanear `vecesMostrado` en el punto de lectura**
   (`scoreFrescura`): tratar valores negativos o `NaN` como `0` en vez
   de dejarlos pasar a la fórmula. Defensivo, no cambia el
   comportamiento con datos sanos.
5. **(Documentación, no código de negocio) Actualizar el comentario de
   `gruposAfines()` en `motor-plano.js`** para reflejar que sí tiene
   consumidor (§2.4). Cero riesgo, cero impacto funcional — es
   higiene documental, mencionada porque Fase 5 va a estar leyendo y
   tocando esta zona igual.

**Deliberadamente NO propongo** tocar el algoritmo de scoring, los
pesos, la cascada de relajación, el mecanismo de exploración/diversidad,
ni agregar `rating`/`estado_verificacion` al score — todo eso es
decisión de producto (§4), no un bug, y está fuera de lo que pediste
("determinar qué necesita mejorarse realmente" — mi lectura es que
estos cuatro puntos son candados de robustez, no features nuevas).

---

## 7. Tests existentes que protegen este módulo

De `js/motor-test.js` (202/202 hoy), específicamente los que ejercitan
`motor-exposicion.js` (bloques ~11 y ~12, tests #50 en adelante,
numeración aproximada por comentario, no por índice exacto de array):

- Señales individuales aisladas: afinidad (§ scoreAfinidad vía
  `calcularScoreLugar`), proximidad (cerca vs. lejos, con y sin
  coordenadas), contexto climático (con y sin clima, afinidad vacía por
  defecto).
- Presupuesto respetado en Guía (autonomía baja) y no artificialmente
  inflado en Exploración (cupo 10).
- Rotación/descanso: un lugar recién aceptado por iniciativa propia no
  reaparece en el siguiente recorte (test #56).
- **Determinismo exacto** con `ahoraMs` fijo (test #57) — la prueba más
  importante para cualquier cambio de Fase 5, porque cualquier
  regresión en scoring/orden la rompe primero.
- Empate total de scores: tamaño de cupo correcto, sin duplicados
  (test #58).
- Datos incompletos: `grupo: undefined` no lanza excepción (test #59).
- Registro vacío (test #60) y listas más chicas que el cupo (test #61).
- **Catálogo completo real (1.468 lugares)**: correctitud de cupo +
  medición de tiempo (test #62, límite duro <500ms para 3 llamadas).
- Acción Directa nunca pierde resultados por score bajo, aunque el
  rubro esté "evitado" (test #63).
- Curaduría nunca pasa por scoring (test #64).
- Compatibilidad de superficie de API, antes y después del rediseño
  (tests #65–66).
- **Pureza**: ni el registro ni el estado de entrada se mutan (test
  #67) — la prueba que protegería contra un cambio que accidentalmente
  empiece a mutar `estado` en vez de copiarlo.

Esta cobertura es sólida para "qué hace el motor hoy". Lo que **no**
cubre, y detallo en §8, es exactamente el terreno de los hallazgos de
§2–§3.

---

## 8. Tests nuevos que deberían crearse (antes o junto con cada cambio de §6)

1. **`descansando()` con `ultimaVez` corrupto** (string, objeto,
   `NaN`) → debe devolver `false` sin lanzar, con o sin el fix de §6.1
   (documenta el comportamiento actual Y protege el fix).
2. **`recortePorIniciativaPropiaExplicado()` con `contexto.ahoraMs`
   fijo en el pasado/futuro** → assert que `confianza` sea estable
   entre dos llamadas idénticas (hoy pasaría por casualidad salvo que
   el test cruce un límite de ventana de decaimiento en el reloj real
   entre ambas llamadas — un test que exponga esto necesita mockear
   `Date.now()` o correr las dos llamadas separadas por un salto de
   tiempo simulado vía `estado.rechazos`/`estado.aceptados` con
   timestamps relativos a un `ahoraMs` fijo, no al reloj real).
3. **Umbral de proximidad de razones (§2.3)**: un lugar con
   `proximidad` exactamente en `0.6` (o el valor que termine en config)
   debe generar la razón "está cerca tuyo"; uno en `0.59` no. Congela
   el comportamiento actual y protege el valor tras moverlo a config.
4. **`vecesMostrado` negativo/`NaN` en `estado.exposicion[id]`** → el
   score de frescura resultante debe quedar en `[0,1]` (ya lo garantiza
   `clamp01`, pero no hay ningún test que lo ejercite hoy con un valor
   fuera de rango de entrada).
5. **IDs duplicados en el registro** (dos objetos distintos con el
   mismo `id`) → al menos documentar con un test qué pasa hoy
   (aunque la respuesta sea "es un supuesto de datos, no se corrige
   acá"), para que quede como comportamiento conocido y no como
   sorpresa futura.
6. **`distanciaReferenciaMetros` en `0`** (config pathológica) → no
   debe producir `NaN` en el score final (hoy podría, ver §3.2).

---

## 9. Impacto esperado en el comportamiento del producto

Si se aprueban los 5 cambios de §6 tal como están redactados:

- **Cero cambio visible para un usuario con datos sanos.** Los cinco
  cambios son defensivos o de reubicación de una constante — ninguno
  altera qué lugares se eligen, en qué orden, ni con qué score, cuando
  el estado persistido y el catálogo están bien formados (el caso de
  el 100% de los usuarios reales hoy, hasta donde el propio `esEstadoValido()`
  puede garantizar).
- El único cambio con una superficie de riesgo real es §6.3
  (`nivelConfianza` con segundo parámetro opcional) porque toca
  `motor-plano.js`, clasificado CRÍTICO — por eso lo dejo explícitamente
  opcional/separable del resto.
- Ninguno de los cinco cambia qué lugares aparecen ni cómo se prioriza
  la exposición con datos normales — que es, textualmente, tu pedido de
  "especial cuidado" para esta fase. Los casos donde SÍ cambiaría algo
  observable son, por construcción, casos hoy corruptos o fuera de
  rango (exactamente los que hoy fallan en silencio de un modo distinto,
  no correcto).

---

## 10. Plan de implementación (pasos pequeños, cada uno verificable solo)

Cada paso: un commit, `node js/motor-test.js` debe seguir en 202/202 **más**
los tests nuevos de ese paso, antes de pasar al siguiente.

1. **Paso 1 — Test-primero para §2.1.** Agregar el test nuevo #1 de §8
   (debe fallar o pasar por casualidad con el código actual — documentar
   cuál de las dos). Aplicar el fix de §6.1. Confirmar que el test pasa
   y que 202/202 originales siguen OK.
2. **Paso 2 — Test-primero para §3.3 (vecesMostrado corrupto).** Agregar
   el test nuevo #4 de §8. Aplicar el fix de §6.4. Confirmar suite
   completa.
3. **Paso 3 — Mover el umbral de §2.3 a `motor-config.js`.** Agregar el
   test nuevo #3 de §8 primero (contra el valor hardcodeado actual, para
   que no dependa de dónde vive el número). Mover el valor. Actualizar
   la única línea de `motor-exposicion.js` que lo lee. Confirmar suite.
4. **Paso 4 — División por cero de §3.2.** Agregar el test nuevo #6 de
   §8. Aplicar guarda mínima en `scoreProximidad` (ej. tratar
   `distanciaReferenciaMetros <= 0` como señal ausente, `null`, en vez
   de calcular). Confirmar suite.
5. **Paso 5 (opcional, separable, mayor alcance) — `nivelConfianza`
   acepta `ahoraMs`.** Agregar el test nuevo #2 de §8 primero (debe
   fallar con el código actual — confirma que expone el bug real).
   Modificar la firma en `motor-plano.js` con el segundo parámetro
   opcional (default `Date.now()`). Actualizar el único call site
   dentro de `recortePorIniciativaPropiaExplicado()`. Correr
   `node js/motor-test.js` completo (este es el paso que más vale la
   pena correr dos veces, por tocar un archivo CRÍTICO).
6. **Paso 6 — Higiene documental de §2.4.** Actualizar el comentario de
   `gruposAfines()` en `motor-plano.js`. Sin test asociado (no hay
   comportamiento que verificar) — commit separado para que el historial
   distinga "cambio de comportamiento" de "cambio de comentario".
7. **Paso 7 — Cierre.** Correr `node js/motor-test.js` una vez más desde
   cero, confirmar el nuevo total (202 + los nuevos de §8, si se
   implementaron todos), y actualizar el número de referencia en
   cualquier documentación que lo cite (este archivo, y si corresponde,
   `REPO_CONTEXT_MASTER.md`).

Quedo a la espera de tu aprobación — indicame si querés los 7 pasos
completos, un subconjunto, o si querés que reformule alguno antes de
tocar código.
