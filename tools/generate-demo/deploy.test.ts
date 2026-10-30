import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[][] = [];
let failures: Record<string, { status: number; stderr: string }> = {};

vi.mock('node:child_process', () => ({
  execFileSync: (_cmd: string, args: string[]) => {
    calls.push(args);
    const failure = failures[args[0] as string];
    if (failure) throw Object.assign(new Error('vercel failed'), { stdout: '', ...failure });
    return args[0] === '--yes' ? 'Preview: https://acme-demo-abc.vercel.app\n' : '';
  },
}));

import { deployPreview } from './deploy';

beforeEach(() => {
  calls.length = 0;
  failures = {};
});

describe('deployPreview', () => {
  it('adds and links the named <slug>-demo project before deploying', async () => {
    const url = await deployPreview('acme');
    expect(calls).toEqual([
      ['project', 'add', 'acme-demo', '--scope', 'reshapex'],
      ['link', '--yes', '--project', 'acme-demo', '--scope', 'reshapex'],
      ['--yes', '--scope', 'reshapex'],
    ]);
    expect(url).toBe('https://acme-demo-abc.vercel.app');
  });

  it('tolerates a project that already exists', async () => {
    failures['project'] = { status: 1, stderr: 'Error: project already exists' };
    await deployPreview('acme');
    expect(calls.map((c) => c[0])).toEqual(['project', 'link', '--yes']);
  });

  it('fails fast on any other project add error and never deploys', async () => {
    failures['project'] = { status: 1, stderr: 'Error: not authorized' };
    await expect(deployPreview('acme')).rejects.toThrow(/not authorized/);
    expect(calls.map((c) => c[0])).toEqual(['project']);
  });

  it('never deploys when link fails', async () => {
    failures['link'] = { status: 1, stderr: 'link boom' };
    await expect(deployPreview('acme')).rejects.toThrow();
    expect(calls.map((c) => c[0])).toEqual(['project', 'link']);
  });
});
