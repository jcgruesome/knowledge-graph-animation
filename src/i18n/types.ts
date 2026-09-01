/** Every event-log line is `${fmt(t)}  ${text}`; templates use {n}/{name} placeholders. */
export interface Dictionary {
  locale: 'es' | 'en';
  beats: {
    dormant: string;
    customerQuery: string;
    grounding: string;
    catalogResolves: string;
    crossValidation: string;
    configSpace: string;
    streamsConverge: string;
    answerValidated: string;
    recede: string;
  };
  voice: string[];
  hud: {
    title: string;
    searchPlaceholder: string;
    searchAriaLabel: string;
    sendAriaLabel: string;
    caption: string;
    captionSending: string;
    soundHint: string;
    /** Shown once audio is unlocked and currently unmuted: hints that M mutes it. */
    soundHintOn: string;
    soundHintMuted: string;
    /** Static bottom-right keyboard/mouse controls legend, rendered only in index.html. */
    controlsHint: string;
    verified: string;
    consultaLabel: string;
    respuestaLabel: string;
    fallbackAnswer: string;
  };
  events: {
    /** {name}, {count} */
    familyFound: string;
    /** {count} */
    sweepFamilies: string;
    /** {QUERY} substituted by the caller, not this template */
    customerAsks: string;
    queryLanded: string;
    crossReference: string;
    verifyOfficialDocs: string;
    searchRelatedParts: string;
    exploreConfigurations: string;
    /** {count} */
    uncertainToHuman: string;
    gatherFindings: string;
    combineIntoAnswer: string;
    deliverAnswer: string;
  };
  catalogNames: string[]; // fallback generic category labels when a BrandKit supplies none
}
