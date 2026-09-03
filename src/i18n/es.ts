import type { Dictionary } from './types';

// Ported from origin/feat/item24-es-demo (src/schedule.ts, src/main.ts, index.html), which
// carries reviewed Spanish copy written for a specific prospect (item24). Strings that were
// generic in that branch are used verbatim; strings that were branded to "item" specifically
// (title, search placeholder/aria-label, queryLanded, uncertainToHuman) are adapted here to
// generic Spanish equivalents, matching how en.ts itself already strips ReshapeX-specific
// wording (e.g. "Category A".."H" instead of real catalog names) for the fallback dictionary.
export const es: Dictionary = {
  locale: 'es',
  beats: {
    dormant: 'Campo en reposo',
    customerQuery: 'Consulta del cliente',
    grounding: 'Aterrizaje en el catálogo',
    catalogResolves: 'El catálogo resuelve',
    crossValidation: 'Validación cruzada',
    configSpace: 'Espacio de configuración',
    streamsConverge: 'Los flujos convergen',
    answerValidated: 'Respuesta validada',
    recede: 'Repliegue',
  },
  voice: [
    'La señal se convierte en respuesta.',
    'Miles de configuraciones posibles. Una respuesta validada.',
    'Décadas de conocimiento técnico, disponibles para cada cliente.',
    '¿Hay incertidumbre? Se consulta a un ingeniero. Nunca se adivina.',
  ],
  hud: {
    // item24 branch: 'item · La señal se convierte en respuesta' — brand name dropped.
    title: 'La señal se convierte en respuesta',
    // item24 branch: 'Preguntar a item' — brand name dropped, generic equivalent.
    searchPlaceholder: 'Hacer una pregunta',
    searchAriaLabel: 'Hacer una pregunta',
    sendAriaLabel: 'Enviar consulta',
    caption: 'Presiona enter para enviar la consulta',
    captionSending: 'Enviando…',
    soundHint: 'Clic para activar el sonido',
    soundHintOn: 'M silencia el sonido',
    soundHintMuted: 'M reactiva el sonido',
    // No equivalent in item24 (that branch dropped the shortcut legend); written to match tone.
    controlsHint: 'Arrastra o usa las flechas para orbitar · Shift para desplazar · Rueda para acercar · Clic en un nodo para enviar una consulta · C recupera la cámara · Espacio pausa · E exporta un ciclo',
    verified: '✓ Validado contra la referencia técnica oficial',
    consultaLabel: 'Consulta',
    respuestaLabel: 'Respuesta',
    fallbackAnswer: 'Ruta validada. Sin coincidencia exacta en el set de demostración.',
  },
  events: {
    familyFound: 'Encuentra la familia "{name}": {count} referencias posibles',
    sweepFamilies: 'Revisa las otras {count} familias de producto por si aplican',
    customerAsks: 'El cliente pregunta: "{QUERY}"',
    // item24 branch: 'La pregunta llega al catálogo completo de item' — brand name dropped.
    queryLanded: 'La pregunta llega al catálogo completo',
    crossReference: 'Cruza la respuesta con la matriz de compatibilidad técnica',
    verifyOfficialDocs: 'Verifica los datos contra la documentación técnica oficial',
    searchRelatedParts: 'Busca piezas y configuraciones relacionadas',
    exploreConfigurations: 'Explora miles de configuraciones posibles',
    // item24 branch: '{count} casos con dudas se envían a un ingeniero item para revisarlos' — brand name dropped.
    uncertainToHuman: '{count} casos con dudas se envían a un ingeniero para revisarlos',
    gatherFindings: 'Reúne todo lo que encontró en cada familia de producto',
    combineIntoAnswer: 'Combina toda la información en una sola respuesta',
    deliverAnswer: 'Entrega una respuesta validada al cliente',
  },
  labels: {
    catalogRoot: 'Catálogo de herramientas · {count} referencias',
    docsRoot: 'Matrices de compatibilidad · {count} relaciones',
    configRoot: 'Configuraciones · {count} indexadas',
    hub: '{name} · {count} módulos',
  },
  // Spanish rendering of the built-in ReshapeX default catalog; a BrandKit overrides these.
  catalogNames: [
    'Cambiadores de herramienta',
    'Pinzas',
    'Dispositivos de compliancia',
    'Sensores de fuerza/par',
    'Efectores de vacío',
    'Adaptadores de robot',
    'Sensores de colisión',
    'Acopladores de servicios',
  ],
  docNames: ['Relaciones de adaptadores', 'Especificaciones de interfaz', 'Límites de carga'],
};
