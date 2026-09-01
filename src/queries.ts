/**
 * Real item24 support Q&A, cleaned up from a customer-support transcript export.
 * Kept as self-contained pairs (the source export wrapped some answers across
 * several rows and mixed in markdown formatting); wording is otherwise the
 * agent's own.
 */
export interface SupportQuery {
  question: string;
  answer: string;
}

export const QUERIES: SupportQuery[] = [
  {
    question:
      'Cuál es la deflexión total en el perfil 40x40 light natural open, 1 metro con carga al centro, 78 kg de fuerza?',
    answer: 'La deflexión máxima permitida son 2,57 mm.',
  },
  {
    question:
      'Cuál es la fuerza máxima antes de que el perfil 40x40 light natural open, 2 metros, se deforme (límite de fluencia)?',
    answer: '1752 a 1756 N aproximadamente.',
  },
  {
    question: 'Necesito descargar el archivo CAD de la pieza 38808, ¿es posible?',
    answer: 'Sí, mediante el enlace de descarga CAD o el link al producto para descargarlo.',
  },
  {
    question: '0.0.619.69 — ¿qué broca necesito para este número de parte?',
    answer: 'Para la unión 0.0.619.69 se usa la broca 0.0.492.60.',
  },
  {
    question: '¿Puedo utilizar el perfil KH para aplicaciones móviles?',
    answer: 'No: el perfil KH y el WFC no deben usarse en aplicaciones dinámicas.',
  },
  {
    question: '¿Qué familias de perfiles tiene item?',
    answer: 'Por línea: -5, -6, -8, -10, -12, -X, -LPS, -D40/D30.',
  },
  {
    question: '¿Qué serie de perfiles MB es la universal, disponible en 3 variantes?',
    answer: 'La Serie 8 de perfiles MB.',
  },
  {
    question: '¿Cuál es la serie más robusta del sistema de construcción modular MB?',
    answer: 'La Serie 12 de perfiles MB.',
  },
  {
    question: '¿Manejan medidas de perfil de aluminio que no sean de 10 en 10, por ejemplo 16 o 32?',
    answer: 'Sí: familia 8 tiene 40x16 y 40x32; familia 5 tiene 40x10 y 20x10.',
  },
  {
    question: '¿Cuánto miden las aperturas de ranura de todas las familias de perfil?',
    answer: 'Serie 5: 5,0 mm · Serie 6: 6,2 mm · Serie 8: 8,0 mm · Serie 10: 10,0 mm · Serie 12: 12,0 mm.',
  },
];
