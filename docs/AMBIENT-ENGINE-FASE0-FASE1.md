# Ambient Engine — Fase 0 + Fase 1 — guía de integración

Archivos nuevos, para copiar tal cual a `donde-comer-cdu/`:

```
donde-comer-cdu/js/ambiente-senales.js
donde-comer-cdu/js/ambiente-estados.js
donde-comer-cdu/js/ambiente-capa-fondo.js
donde-comer-cdu/js/ambiente-orquestador.js
donde-comer-cdu/css/ambiente-capa-fondo.css
```

No tocan ningún archivo existente del repo. No agregan pedidos de red
nuevos (todo es JS/CSS local), así que la CSP actual del sitio no
necesita cambios.

## 1. `index.html` — CSS

Agregar el link **justo después** de `css/tokens.css` (línea ~112),
antes que cualquier CSS de componentes. La Capa de Fondo es más
fundamental que cualquier tarjeta o chip — aunque técnicamente no
importa el orden (usa `z-index:-1` explícito), esto documenta la
jerarquía real para quien lea el `<head>` después:

```html
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/ambiente-capa-fondo.css">
<link rel="stylesheet" href="css/boton.css">
...
```

## 2. `index.html` — scripts

Agregar los cuatro `<script defer>` **en este orden exacto**, en
cualquier punto junto a los `motor-*.js` existentes (el orden entre
ellos es lo único que importa, no dónde quedan respecto a
`motor-config.js` etc.). El orquestador va **último**:

```html
<script src="js/ambiente-senales.js" defer></script>
<script src="js/ambiente-estados.js" defer></script>
<script src="js/ambiente-capa-fondo.js" defer></script>
<script src="js/ambiente-orquestador.js" defer></script>
```

Por qué ese orden: con `defer`, los scripts se ejecutan en orden de
documento. El orquestador es el único que "conoce" a los otros tres
(Cap. 11.3), así que tiene que ejecutarse después de que los tres ya
existan como `window.Ambiente*`.

## 3. Qué queda funcionando después de esto

- Un fondo (`#ambiente-fondo`, detrás de todo, `aria-hidden`) que
  cambia de tono según la hora real del día — noche profunda,
  amanecer, día, atardecer cálido, noche — con transiciones de ~58s,
  imperceptibles en el instante (Cap. 3.1 / 3.3).
- Una máquina de estados completa (Idle, Activo, Transición, Carga,
  Foco, Error) reflejada en `<html data-ambiente-estado="...">`, que
  cualquier CSS o JS futuro puede leer sin tocar el Ambient Engine.
- Respeto automático de `prefers-reduced-motion` (el cambio de color
  se vuelve instantáneo) y de la pestaña en segundo plano (el ciclo
  se pausa).
- Una superficie mínima en `window.AmbientEngine` para que el resto
  de la app la use más adelante, sin acoplarse a ninguna capa:
  `AmbientEngine.iniciarCarga()`, `.finalizarCarga(exito)`,
  `.entrarFoco()`, `.salirFoco()`, `.reintentar()`, `.setEscena(nombre)`,
  y el getter `AmbientEngine.estado`.

## 4. Cómo verificar en el navegador

Abrir la consola y correr:

```js
AmbientEngine.estado                 // "activo"
document.documentElement.dataset     // ver ambienteEstado, ambienteReducido, ambienteRendimiento
```

Para ver el ciclo de color sin esperar horas reales: en DevTools →
Rendering → "Emulate CSS media feature prefers-reduced-motion" para
probar el modo reducido, o simplemente cambiar la hora del sistema
operativo para saltar entre keyframes del fondo.

## 5. Lo que NO incluye esta entrega (a propósito)

Fase 0 + Fase 1 según el roadmap del documento (Cap. 13) son
exactamente esto: orquestador + máquina de estados + Capa de Fondo.
No incluye catálogo de escenas real (Fase 2), Capa de Relieve/Luz
(Fase 3) ni Partículas (Fase 4) — `AmbientEngine.setEscena()` ya
existe como parte de la superficie estable, pero todavía no
reconfigura nada visual más allá de la Transición y el atributo en
el DOM.
