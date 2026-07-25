# URU SPOT — Ambient Engine — Notas de integración (Fase 5)

*Auditoría real ejecutada el 2026-07-25 contra `uruspotcdu-create/uruspot`, rama `main`, carpeta `donde-comer-cdu`. Reemplaza el protocolo hipotético del Cap. 2 del Blueprint de Integración v1.0 con hallazgos concretos.*

## 1. Estado real del Ambient Engine

Al momento de esta auditoría, el Ambient Engine **ya está implementado y en producción**, no es un proyecto por iniciar. Se encontraron:

- 29 archivos `js/ambiente-*.js` + 7 `js/motor-*.js` + `js/proyeccion.js`, todos cargados con `defer` en `donde-comer-cdu/index.html` en un orden explícitamente documentado como dependencia dura.
- 3 hojas de estilo `css/ambiente-*.css` más `assets/ambient/_tokens/` para tokens visuales y de movimiento.
- Historial de commits activo el mismo día de esta auditoría, con mensajes que referencian directamente los capítulos de las especificaciones de Fase 1 a 4 (Design System, Arquitectura Técnica, Lenguaje de Assets, Motion Direction Bible).

Conclusión: las Fases 1 a 4 no son un plan a futuro — son el estado actual del código. El trabajo pendiente real, al momento de esta nota, cae bajo esta Fase 5 (integración/estabilización), no bajo construcción desde cero.

## 2. Arquitectura real encontrada (vs. hipotética del Blueprint)

`js/ambiente-orquestador.js` es el único mount point real, cargado último entre los scripts del motor. Confirma en código el principio de "adición aislada" del Cap. 1 del Blueprint:

- Se aborta en silencio si `AmbienteEstados` no existe (Cap. 1.4 del documento de diseño) — nunca falla a medias.
- Expone una superficie mínima en `window.AmbientEngine` (`iniciar`, `iniciarCarga`, `finalizarCarga`, `entrarFoco`, `salirFoco`, `reintentar`, `setEscena`, getter `estado`) — coincide con el contrato "una forma de indicar la escena activa, una forma de indicar el estado activo, y poco más" (Cap. 11.1 diseño).
- El único contrato hacia el DOM son atributos `data-ambiente-*` en `<html>` — nunca expone las capas mismas.

Los cuatro grupos funcionales reales (más finos que los F0-F3 del Blueprint, pero compatibles con el mismo principio):

| Grupo real en código | Módulos | Equivalente aproximado en Blueprint |
|---|---|---|
| Infraestructura | `ambiente-config`, `ambiente-assets`, `ambiente-diagnostico` | F0 — Cimientos |
| Gobierno | `ambiente-accesibilidad`, `ambiente-rendimiento` | F0 — Cimientos |
| Motion Controller / Estados | `ambiente-movimiento`, `ambiente-estados`, `ambiente-ritmo`, `ambiente-gramatica` | F2 — Reactividad |
| Contenido Visual (7 familias + Capa de Fondo) | `ambiente-planos`, `ambiente-reticula`, `ambiente-topografia`, `ambiente-corrientes`, `ambiente-coordenadas`, `ambiente-brujula`, `ambiente-particulas-deriva`, `ambiente-halos`, `ambiente-capa-fondo`, `ambiente-particulas`, `ambiente-luz` | F1 — Sustrato visual |
| Contextual | `ambiente-clima`, `ambiente-horario-tinte` | F3 — Refinamiento contextual |

## 3. Verificación de los 7 criterios de calidad (Blueprint Cap. 14)

| # | Criterio | Estado verificado | Evidencia |
|---|---|---|---|
| 1 | Cero imports de negocio hacia `/ambient-engine/core` | ✅ Cumple | No existe tal carpeta; todo vive en `js/ambiente-*.js` con namespace `window.Ambiente*`, sin imports desde `app.js`/`motor-*.js` hacia el motor ambiental |
| 2 | El engine nunca captura eventos de puntero | ✅ Cumple (verificado, no asumido) | `ambiente-interaccion.js` usa `addEventListener` en fase de captura para gestos, pero no se encontró `preventDefault`/`stopPropagation` en ningún módulo `ambiente-*.js` |
| 3 | Cada fase individualmente desactivable | ⚠️ No cumplía → **corregido en esta sesión** | Se agregó `js/ambiente-flags.js` + guardas en el orquestador (ver Sección 4) |
| 4 | Ningún asset viola reglas de Fase 3 / Motion Bible | 🔲 No verificado | Requiere checklist visual del Cap. 8.1 de Fase 3, fuera del alcance de esta auditoría de integración |
| 5 | Ninguna métrica de rendimiento se degrada | 🔲 No verificado | Requiere línea base de rendimiento capturada en dispositivos reales; no ejecutable desde este entorno |
| 6 | Ningún Context Provider duplica fuente de datos existente | 🔲 No verificado | Requiere mapear fuentes de datos del resto de la app (`app.js`, `motor-*.js`) contra `ambiente-clima.js`/`ambiente-horario-tinte.js` |
| 7 | Reactividad nueva revisada contra matriz de Fase 3 Cap. 6 | 🔲 No aplica todavía | No se agregó reactividad nueva en esta sesión, solo flags |

## 4. Cambio aplicado en esta sesión: sistema de feature flags

Se agregó `js/ambiente-flags.js` (módulo nuevo, sin dependencias) y se modificó `js/ambiente-orquestador.js` para consultarlo antes de arrancar tres grupos, más un flag maestro:

- `motor` — apaga el Ambient Engine completo.
- `sustratoVisual` — apaga las 7 familias de assets + Capa de Fondo como grupo único (no una por una: `AmbientePlanos` crea los contenedores P0-P3 de los que el resto depende).
- `clima` — aislado por separado porque depende de una API externa que puede fallar (Cap. 15.3 del Blueprint: aislamiento de *blast radius*).
- `horarioTinte` — aislado por separado porque es cómputo local puro, sin motivo técnico para fallar nunca.

**Por defecto todo sigue activo** — este cambio no altera ningún comportamiento visible hasta que alguien apague un flag explícitamente vía:
```
localStorage.setItem('ambienteFlags', JSON.stringify({clima: false}))
```
o puntualmente vía URL: `?ambiente_off=clima,horarioTinte`

El diseño es fail-open: un flag desconocido, `localStorage` bloqueado (modo privado) o `ambiente-flags.js` ausente nunca apagan nada por accidente.

## 5. Pendiente real (no cubierto en esta sesión)

- Criterios 4, 5 y 6 del Cap. 14 (arriba) requieren inspección visual, medición de performance en dispositivos reales, y mapeo de fuentes de datos — ninguno ejecutable solo con acceso al código fuente.
- La Etapa 5 del roadmap (Cap. 13 del Blueprint) — 2 semanas de observación en producción con tráfico real — no es una tarea de código: requiere que el sitio esté desplegado y que pase el tiempo. No se puede "aplicar" en una sesión de trabajo.
- Confirmar los flags nuevos con una prueba manual real (abrir el sitio con `?ambiente_off=clima` y verificar visualmente que solo el clima se apaga) — no se ejecutó porque este entorno no tiene navegador para render visual del sitio en vivo.
