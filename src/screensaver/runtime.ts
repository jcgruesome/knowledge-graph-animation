import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/newsreader/400-italic.css';
import type { BrandKit, SupportQuery } from '../brandkit';
import type { Dictionary } from '../i18n/types';
import { syntheticDictionary } from './dictionary';
import { generateSyntheticKit } from './kit';
import { parseSeed } from './seed';

/** Screensaver replacement for src/runtime.ts (aliased to `@kg/runtime`). Synthetic data only. */
export const DEFAULT_QUERIES: SupportQuery[] = [];

export function getDictionary(_locale: Dictionary['locale']): Dictionary {
  return syntheticDictionary;
}

/** Fail fast and visibly: a screensaver has no devtools, so errors go on screen for the host to log. */
function showError(message: string): void {
  document.body.innerHTML = '';
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#ff006e;background:#000;margin:0;padding:24px;height:100vh;box-sizing:border-box;font:14px monospace;white-space:pre-wrap';
  pre.textContent = `screensaver error: ${message}`;
  document.body.append(pre);
}
window.addEventListener('error', (e) => showError(e.message));
window.addEventListener('unhandledrejection', (e) => showError(String(e.reason?.message ?? e.reason)));

/** Random seeds make the per-seed layout cache useless and it would fill localStorage: drop it. */
function clearLayoutCache(): void {
  for (const key of Object.keys(localStorage)) if (key.startsWith('rx-kg-layout:')) localStorage.removeItem(key);
}

async function assertFont(descriptor: string): Promise<void> {
  if ((await document.fonts.load(descriptor)).length === 0) throw new Error(`font not bundled: ${descriptor}`);
}

export async function resolveKit(): Promise<BrandKit> {
  const seed = parseSeed(location.search);
  await assertFont('500 13px "Hanken Grotesk"');
  await assertFont('italic 400 22px "Newsreader"');
  clearLayoutCache();
  return generateSyntheticKit(seed);
}
