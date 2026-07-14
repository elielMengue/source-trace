/** Tiny i18n for the client UI. The backend already localizes coaching tips by locale;
 * this localizes the extension's own chrome (labels, buttons, flags, disclaimer, consent,
 * deep-trace bubble) and the on-device local tips, so the language selector visibly works.
 * Supported: en / fr / es, English fallback. */

export type Lang = "en" | "fr" | "es";

export function langOf(locale: string): Lang {
  const l = (locale || "en").replace("_", "-").split("-", 1)[0]!.toLowerCase();
  return l === "fr" ? "fr" : l === "es" ? "es" : "en";
}

export interface Strings {
  status_supported: string;
  status_weak: string;
  status_unsupported: string;
  flag_no_visible_sources: string;
  flag_single_source: string;
  flag_dead_link: string;
  flag_low_citation_density: string;
  analyzing: string;
  scoreTitle: string;
  expand: string;
  collapse: string;
  noClaims: string;
  disclosure: string;
  pauseText: string;
  dismiss: string;
  consentTitle: string;
  consentBody: string;
  consentEnable: string;
  consentStay: string;
  privacyPolicy: string;
  traceThis: string;
  secondSource: string;
  deepTrace: string;
  tracing: string;
  deepTitle: string;
  tracingLabel: string;
  searching: string;
  deepUnavailable: string;
  closeDeep: string;
  dragMove: string;
  seeNote: string;
  hideNote: string;
  copy: string;
  copied: string;
  modeFull: string;
  modeOnDevice: string;
  modeGroup: string;
  tipOpenSource: string;
  tipFindPrimary: string;
}

const EN: Strings = {
  status_supported: "Has a visible source",
  status_weak: "Weak / unverified source",
  status_unsupported: "No visible source",
  flag_no_visible_sources: "No sources cited",
  flag_single_source: "Relies on a single source",
  flag_dead_link: "A cited link is dead",
  flag_low_citation_density: "Few claims are sourced",
  analyzing: "analyzing…",
  scoreTitle: "Share of claims with a visible source (not truth)",
  expand: "Expand panel",
  collapse: "Collapse panel",
  noClaims: "No checkable claims detected.",
  disclosure: "Analysis is AI-assisted and describes visible sourcing, not truth.",
  pauseText:
    "Some claims here have no visible source. Consider tracing them before sharing.",
  dismiss: "Dismiss",
  consentTitle: "Choose your analysis mode.",
  consentBody:
    "Right now everything runs on your device. Full mode sends the answer text to our zero-retention analysis service for deeper claim analysis — nothing is stored.",
  consentEnable: "Enable Full mode",
  consentStay: "Stay on-device",
  privacyPolicy: "Privacy policy",
  traceThis: "Trace this",
  secondSource: "Find a second source",
  deepTrace: "✨ Deep trace",
  tracing: "Tracing…",
  deepTitle: "Deep trace",
  tracingLabel: "Tracing:",
  searching: "Searching independent sources…",
  deepUnavailable:
    "Deep trace isn’t available right now — use the Trace links in the panel instead.",
  closeDeep: "Close deep trace",
  dragMove: "Drag to move",
  seeNote: "See verification note ▾",
  hideNote: "Hide verification note ▴",
  copy: "Copy",
  copied: "Copied ✓",
  modeFull: "Full",
  modeOnDevice: "On-device",
  modeGroup: "Analysis mode",
  tipOpenSource: "Open the cited source and confirm it.",
  tipFindPrimary: "Look for a primary source for this.",
};

const FR: Strings = {
  status_supported: "Source visible",
  status_weak: "Source faible / non vérifiée",
  status_unsupported: "Aucune source visible",
  flag_no_visible_sources: "Aucune source citée",
  flag_single_source: "Repose sur une seule source",
  flag_dead_link: "Un lien cité est mort",
  flag_low_citation_density: "Peu d’affirmations sont sourcées",
  analyzing: "analyse…",
  scoreTitle: "Part des affirmations avec une source visible (pas la vérité)",
  expand: "Déplier le panneau",
  collapse: "Replier le panneau",
  noClaims: "Aucune affirmation vérifiable détectée.",
  disclosure: "Analyse assistée par IA — décrit le sourcing visible, pas la vérité.",
  pauseText:
    "Certaines affirmations ici n’ont aucune source visible. Pensez à les tracer avant de partager.",
  dismiss: "Ignorer",
  consentTitle: "Choisissez votre mode d’analyse.",
  consentBody:
    "Pour l’instant, tout s’exécute sur votre appareil. Le mode complet envoie le texte de la réponse à notre service d’analyse à rétention zéro pour une analyse plus poussée — rien n’est stocké.",
  consentEnable: "Activer le mode complet",
  consentStay: "Rester sur l’appareil",
  privacyPolicy: "Confidentialité",
  traceThis: "Tracer",
  secondSource: "Trouver une 2e source",
  deepTrace: "✨ Trace approfondie",
  tracing: "Traçage…",
  deepTitle: "Trace approfondie",
  tracingLabel: "Traçage :",
  searching: "Recherche de sources indépendantes…",
  deepUnavailable:
    "La trace approfondie n’est pas disponible — utilisez les liens Tracer du panneau.",
  closeDeep: "Fermer la trace approfondie",
  dragMove: "Glisser pour déplacer",
  seeNote: "Voir la note de vérification ▾",
  hideNote: "Masquer la note de vérification ▴",
  copy: "Copier",
  copied: "Copié ✓",
  modeFull: "Complet",
  modeOnDevice: "Sur l’appareil",
  modeGroup: "Mode d’analyse",
  tipOpenSource: "Ouvrez la source citée et vérifiez-la.",
  tipFindPrimary: "Cherchez une source primaire pour ceci.",
};

const ES: Strings = {
  status_supported: "Fuente visible",
  status_weak: "Fuente débil / no verificada",
  status_unsupported: "Sin fuente visible",
  flag_no_visible_sources: "Sin fuentes citadas",
  flag_single_source: "Depende de una sola fuente",
  flag_dead_link: "Un enlace citado está roto",
  flag_low_citation_density: "Pocas afirmaciones tienen fuente",
  analyzing: "analizando…",
  scoreTitle: "Proporción de afirmaciones con fuente visible (no la verdad)",
  expand: "Expandir el panel",
  collapse: "Contraer el panel",
  noClaims: "No se detectaron afirmaciones verificables.",
  disclosure: "Análisis asistido por IA: describe el sourcing visible, no la verdad.",
  pauseText:
    "Algunas afirmaciones aquí no tienen fuente visible. Considera rastrearlas antes de compartir.",
  dismiss: "Descartar",
  consentTitle: "Elige tu modo de análisis.",
  consentBody:
    "Ahora mismo todo se ejecuta en tu dispositivo. El modo completo envía el texto de la respuesta a nuestro servicio de análisis sin retención para un análisis más profundo: no se almacena nada.",
  consentEnable: "Activar modo completo",
  consentStay: "Mantener en el dispositivo",
  privacyPolicy: "Privacidad",
  traceThis: "Rastrear",
  secondSource: "Buscar una 2.ª fuente",
  deepTrace: "✨ Rastreo profundo",
  tracing: "Rastreando…",
  deepTitle: "Rastreo profundo",
  tracingLabel: "Rastreando:",
  searching: "Buscando fuentes independientes…",
  deepUnavailable:
    "El rastreo profundo no está disponible ahora: usa los enlaces Rastrear del panel.",
  closeDeep: "Cerrar rastreo profundo",
  dragMove: "Arrastra para mover",
  seeNote: "Ver nota de verificación ▾",
  hideNote: "Ocultar nota de verificación ▴",
  copy: "Copiar",
  copied: "Copiado ✓",
  modeFull: "Completo",
  modeOnDevice: "En el dispositivo",
  modeGroup: "Modo de análisis",
  tipOpenSource: "Abre la fuente citada y confírmala.",
  tipFindPrimary: "Busca una fuente primaria para esto.",
};

const TABLE: Record<Lang, Strings> = { en: EN, fr: FR, es: ES };

/** Localized strings for a BCP-47 locale (English fallback). */
export function t(locale: string): Strings {
  return TABLE[langOf(locale)];
}
