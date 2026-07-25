/* ═══════════════════════════════════════════════════════════════════
   URU SPOT — Ambient Engine — css/ambiente-estilos.css
   Fase 2: Estilos visuales para subsistemas del Grupo de Contenido Visual

   Estilos base para:
   - Particle Engine (Capa de Partículas)
   - Weather Engine (Capa de Clima)
   - Lighting Engine (Capa de Luz)
   - Depth Manager (profundidad y atmósfera)

   Notas:
   - Todos los elementos tienen `pointer-events: none` para no interferir
     con la interacción del usuario (Cap. 2.3, 10.2)
   - z-index está organizado por capas visuales (Cap. 7.1)
   - Animaciones respetan bandas de velocidad (Cap. 3.1 Fase 1)
   ═══════════════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────────────────
   CONTENEDORES Y CAPAS (z-index: 1-10)
   ────────────────────────────────────────────────────────────────── */

#ambient-clima-contenedor {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 5;
  pointer-events: none;
}

#ambient-particulas-contenedor {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 7;
  pointer-events: none;
}

#ambient-profundidad-contenedor {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 4;
  pointer-events: none;
}

/* ──────────────────────────────────────────────────────────────────
   LIGHTING ENGINE (z-index: 1-3)
   ────────────────────────────────────────────────────────────────── */

#ambient-resplandor {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
  pointer-events: none;
  mix-blend-mode: screen;
  /* Fase 4 (Motion Direction Bible, Cap. 8 "Cómo respira"):
     --amb-resplandor-base la fija js/ambiente-luz.js (Fase 2, según
     hora/temperatura); --amb-respiracion la fija en cada cuadro
     js/ambiente-respiracion.js, oscilando por igual arriba y abajo de
     cero. Ninguno de los dos módulos conoce al otro — convergen acá
     (Cap. 2.3: "el Grupo de Contenido Visual nunca se comunica
     lateralmente"). Si algún valor todavía no se publicó, los
     fallback (0.3 y 0) reproducen el comportamiento previo a este
     paso. Bajo prefers-reduced-motion, la regla de abajo con
     !important gana de todos modos — la suma nunca llega a evaluarse
     en ese modo. */
  opacity: calc(var(--amb-resplandor-base, 0.3) + var(--amb-respiracion, 0));
}

#ambient-vigneta {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 9;
  pointer-events: none;
  background: radial-gradient(
    ellipse at center,
    transparent 0%,
    rgba(0, 0, 0, 0.3) 100%
  );
}

/* ──────────────────────────────────────────────────────────────────
   PARTICLE ENGINE (Capa de Partículas)
   ────────────────────────────────────────────────────────────────── */

.ambient-particula {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background-color: rgba(100, 180, 255, 0.5);
  pointer-events: none;
  box-shadow: 0 0 6px rgba(100, 180, 255, 0.3);
}

/* Variaciones de partículas (para futuros tipos específicos) */
.ambient-particula.pequeña {
  width: 2px;
  height: 2px;
  background-color: rgba(150, 200, 255, 0.4);
}

.ambient-particula.grande {
  width: 6px;
  height: 6px;
  background-color: rgba(80, 160, 255, 0.6);
}

/* ──────────────────────────────────────────────────────────────────
   WEATHER ENGINE (Capa de Clima)
   ────────────────────────────────────────────────────────────────── */

.ambient-niebla {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: radial-gradient(
    circle at 50% 30%,
    rgba(200, 210, 220, 0.15) 0%,
    rgba(150, 160, 170, 0.08) 50%,
    transparent 100%
  );
  pointer-events: none;
  animation: ambient-niebla-respira 12s ease-in-out infinite;
  z-index: 5;
}

.ambient-lluvia {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgba(150, 150, 180, 0.05) 50%,
    rgba(100, 100, 150, 0.1) 100%
  );
  pointer-events: none;
  animation: ambient-lluvia-cae 4s linear infinite;
  z-index: 6;
}

.ambient-viento {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(180, 180, 200, 0.03) 50%,
    transparent 100%
  );
  pointer-events: none;
  animation: ambient-viento-sopla 3s linear infinite;
  z-index: 5;
}

/* ──────────────────────────────────────────────────────────────────
   ANIMACIONES — Bandas de Velocidad (Cap. 3.1 Fase 1)
   ────────────────────────────────────────────────────────────────── */

/* Niebla: banda ambiental (20s-90s) */
@keyframes ambient-niebla-respira {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 0.95; }
}

/* Lluvia: movimiento constante vertical (rápido) */
@keyframes ambient-lluvia-cae {
  0% { transform: translateY(-100%); }
  100% { transform: translateY(100%); }
}

/* Viento: movimiento horizontal suave */
@keyframes ambient-viento-sopla {
  0%, 100% { transform: translateX(-5%); }
  50% { transform: translateX(5%); }
}

/* ──────────────────────────────────────────────────────────────────
   REDUCCIÓN DE MOVIMIENTO (prefers-reduced-motion)
   Cap. 10.1 — Accessibility Manager
   ────────────────────────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  /* Pausar todas las animaciones */
  .ambient-niebla,
  .ambient-lluvia,
  .ambient-viento,
  .ambient-particula {
    animation: none !important;
  }

  /* Reducir opacidad de efectos visuales */
  #ambient-resplandor {
    opacity: 0.05 !important;
  }

  #ambient-vigneta {
    opacity: 0.1 !important;
  }

  .ambient-niebla {
    opacity: 0.3 !important;
  }
}

/* ──────────────────────────────────────────────────────────────────
   RESPONSIVE Y AJUSTES POR DISPOSITIVO
   ────────────────────────────────────────────────────────────────── */

/* Dispositivos pequeños: menos partículas */
@media (max-width: 480px) {
  .ambient-particula {
    width: 2px;
    height: 2px;
    box-shadow: 0 0 3px rgba(100, 180, 255, 0.2);
  }
}

/* Modo oscuro del sistema */
@media (prefers-color-scheme: dark) {
  .ambient-niebla {
    background: radial-gradient(
      circle at 50% 30%,
      rgba(80, 90, 110, 0.1) 0%,
      rgba(50, 60, 80, 0.05) 50%,
      transparent 100%
    );
  }
}

/* ──────────────────────────────────────────────────────────────────
   DEBUGGING (opcional: descomentar para ver capas)
   ────────────────────────────────────────────────────────────────── */

/*
#ambient-clima-contenedor { border: 1px solid green; }
#ambient-particulas-contenedor { border: 1px solid blue; }
#ambient-profundidad-contenedor { border: 1px solid red; }
#ambient-resplandor { border: 1px solid yellow; }
#ambient-vigneta { border: 1px solid orange; }
*/
