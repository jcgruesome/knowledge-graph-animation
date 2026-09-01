import { en } from './en';
import { es } from './es';
import type { Dictionary } from './types';

const DICTIONARIES: Record<Dictionary['locale'], Dictionary> = { en, es };

export function getDictionary(locale: Dictionary['locale']): Dictionary {
  return DICTIONARIES[locale];
}

export type { Dictionary } from './types';
