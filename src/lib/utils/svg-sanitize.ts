import DOMPurify from 'isomorphic-dompurify';

/**
 * Profil DOMPurify pour SVG client : éléments + filtres SVG autorisés, tout
 * le reste (script, foreignObject, animation interactive, handlers `on*`,
 * URI `javascript:`) est strippé. Renvoie un SVG sûr à servir au browser.
 *
 * Sources de référence :
 *  - https://github.com/cure53/DOMPurify (USE_PROFILES.svg + svgFilters)
 *  - OWASP "SVG Cheat Sheet" : interdire script, animate-trigger, xlink:href
 *
 * Pourquoi `isomorphic-dompurify` ? Parce qu'il marche dans un Node Route
 * Handler de Next.js sans imposer une intégration manuelle de jsdom. Si
 * jsdom transitif diverge de la version compatible Next 16 standalone CJS,
 * pinner via "overrides" dans package.json.
 */
export function sanitizeSvg(input: string): string {
  return DOMPurify.sanitize(input, {
    USE_PROFILES: { svg: true, svgFilters: true },
    // Filets supplémentaires : neutraliser les scripts inline et tous les
    // schémas d'URI exotiques. Whitelisting `https:` et `data:` (dataURI
    // pour les patterns fill par exemple) couvre les usages logos sans
    // ouvrir `javascript:` ou `vbscript:`.
    ALLOWED_URI_REGEXP: /^(?:https:|data:image\/(?:png|jpeg|webp|svg\+xml);base64,)/i,
    FORBID_TAGS: ['script', 'foreignObject'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'href'],
  });
}
