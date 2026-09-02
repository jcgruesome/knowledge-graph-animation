import { execFileSync } from 'node:child_process';

/** Deploys a PREVIEW (never --prod) so nothing is aliased without an explicit promote step. */
export async function deployPreview(): Promise<string> {
  const output = execFileSync('vercel', ['--yes', '--scope', 'reshapex'], { encoding: 'utf8' });
  const match = output.match(/https:\/\/\S+\.vercel\.app/);
  if (!match) throw new Error(`deployPreview: could not find a preview URL in Vercel CLI output:\n${output}`);
  return match[0];
}
