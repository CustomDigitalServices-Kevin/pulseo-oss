/**
 * AnimatedBackground — spots radial-gradient blur qui dérivent en boucle.
 *
 * Rendu en layer fixed derrière le contenu (z-index 0, pointer-events:none).
 * Les animations sont définies en CSS pur dans `globals.css` (@keyframes
 * pulseo-drift-1/2/3 + classes .pulseo-bg/.pulseo-spot). Aucune JS runtime,
 * aucun `"use client"` nécessaire — server component safe.
 *
 * Les `@media (prefers-reduced-motion: reduce)` de globals.css figent les
 * spots en positions statiques pour respecter les préférences système.
 */
export function AnimatedBackground() {
  return (
    <div className="pulseo-bg" aria-hidden="true">
      <div className="pulseo-spot pulseo-spot-1" />
      <div className="pulseo-spot pulseo-spot-2" />
      <div className="pulseo-spot pulseo-spot-3" />
    </div>
  );
}
