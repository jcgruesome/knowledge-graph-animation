import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';

const KITS_DIR = 'public/kits';
/**
 * Sibling of `public/`, not `os.tmpdir()`: `renameSync` cannot cross filesystems, and a repo
 * checkout and the system temp dir are not guaranteed to share one. Excluded from the upload
 * via `.vercelignore` (and from the repo via `.gitignore`).
 */
const HELD_DIR = '.kits-held';

/**
 * Every generated kit lives under `public/kits/`, and a Vercel deploy uploads that whole
 * directory — so without this, one prospect's preview ships every other prospect's name,
 * source URL, logo and generated Q&A. `.vercelignore` can exclude a fixed set of paths but
 * cannot express "everything here except <slug>", so the other kits are moved out of the
 * upload root for the duration of the deploy and moved back in a `finally`.
 */
function hideOtherKits(slug: string): string[] {
  if (!existsSync(KITS_DIR)) return [];
  const keep = new Set([`${slug}.json`, slug]);
  const others = readdirSync(KITS_DIR).filter((entry) => !keep.has(entry));
  if (others.length === 0) return [];
  if (existsSync(HELD_DIR) && readdirSync(HELD_DIR).length > 0) {
    throw new Error(
      `deployPreview: ${HELD_DIR}/ still holds kits from an interrupted deploy. Move its contents back into ${KITS_DIR}/ before retrying.`,
    );
  }
  mkdirSync(HELD_DIR, { recursive: true });
  for (const entry of others) renameSync(join(KITS_DIR, entry), join(HELD_DIR, entry));
  console.log(`  Held back ${others.length} other kit entr${others.length === 1 ? 'y' : 'ies'} so this preview ships only "${slug}".`);
  return others;
}

function restoreKits(moved: string[]): void {
  if (moved.length === 0) return;
  for (const entry of moved) {
    const from = join(HELD_DIR, entry);
    if (existsSync(from)) renameSync(from, join(KITS_DIR, entry));
  }
  try {
    rmdirSync(HELD_DIR);
  } catch {
    console.warn(`  ⚠ could not remove ${HELD_DIR}/; check it for leftover kits.`);
  }
}

/**
 * Deploys a PREVIEW (never --prod) so nothing is aliased without an explicit promote step.
 * Only `slug`'s kit is present in the upload; see `hideOtherKits`.
 */
export async function deployPreview(slug: string): Promise<string> {
  const moved = hideOtherKits(slug);
  let output: string;
  try {
    output = execFileSync('vercel', ['--yes', '--scope', 'reshapex'], { encoding: 'utf8' });
  } finally {
    restoreKits(moved);
  }
  const match = output.match(/https:\/\/\S+\.vercel\.app/);
  if (!match) throw new Error(`deployPreview: could not find a preview URL in Vercel CLI output:\n${output}`);
  return match[0];
}
