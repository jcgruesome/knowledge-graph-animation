import { Command } from 'commander';
import { execFileSync } from 'node:child_process';

const program = new Command();
program.argument('<slug>').requiredOption('--project <name>');
program.parse();
const [slug] = program.args;
const { project } = program.opts<{ project: string }>();

/**
 * Runs a vercel subcommand, streaming its stdout/stderr to the console (so the operator sees
 * normal CLI progress) while still capturing the combined output so callers can inspect it for
 * specific, known-safe error conditions (e.g. "project already exists").
 */
function runVercel(args: string[]): { status: number; output: string } {
  try {
    const output = execFileSync('vercel', args, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });
    process.stdout.write(output);
    return { status: 0, output };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    const output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    if (e.stdout) process.stdout.write(e.stdout);
    if (e.stderr) process.stderr.write(e.stderr);
    return { status: e.status ?? 1, output };
  }
}

console.log(`Linking to Vercel project "${project}" under reshapex...`);
const addResult = runVercel(['project', 'add', project, '--scope', 'reshapex']);
if (addResult.status !== 0) {
  // `vercel project add` is idempotent-safe to re-run against an already-existing project, but
  // fails with a non-zero exit if it does. Ignore only that specific, known-safe case; any other
  // failure (auth, network, invalid name, ...) should fail the whole command.
  if (!/already exists/i.test(addResult.output)) {
    console.error(`vercel project add failed unexpectedly (exit ${addResult.status}):\n${addResult.output}`);
    process.exitCode = 1;
    process.exit(process.exitCode);
  }
  console.log(`  Project "${project}" already exists — continuing.`);
}

execFileSync('vercel', ['link', '--yes', '--project', project, '--scope', 'reshapex'], { stdio: 'inherit' });
console.log('Deploying to production (stable alias)...');
execFileSync('vercel', ['--prod', '--yes', '--scope', 'reshapex'], { stdio: 'inherit' });
console.log(`\nPromoted "${slug}" — verify at https://${project}.vercel.app`);
