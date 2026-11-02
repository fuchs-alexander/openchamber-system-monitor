import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { readDisks } from '../src/service/collectors/disks.ts';
import type { ExecResult } from '../src/service/collectors/exec.ts';
import { unavailable } from '../src/shared/stats.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

type Call = { commands: string[]; args: string[] };

/** Stands in for `run`; records what was asked and answers with a fixed result. */
const fakeExec = (answer: ExecResult) => {
  const calls: Call[] = [];
  const exec = async (commands: string[], args: string[]): Promise<ExecResult> => {
    calls.push({ commands, args });
    return answer;
  };
  return { exec, calls };
};

describe('disks', () => {
  test('a df that exits non-zero still yields its rows', async () => {
    // A dead FUSE mount makes df exit 1 while the table stays complete.
    const { exec } = fakeExec({ ok: false, missing: false, stdout: fixture('linux-df.txt') });

    const disks = await readDisks('linux', false, exec);

    expect(Array.isArray(disks)).toBe(true);
    if (!Array.isArray(disks)) return;
    expect(disks.map((disk) => disk.mount)).toEqual(['/', '/boot']);
  });

  test('a df that exits non-zero without usable rows is unavailable, not empty', async () => {
    const { exec } = fakeExec({ ok: false, missing: false, stdout: '' });

    expect(await readDisks('linux', false, exec)).toEqual(unavailable('failed', 'df'));
  });

  test('a missing df stays tool-missing', async () => {
    const { exec } = fakeExec({ ok: false, missing: true, stdout: '' });

    expect(await readDisks('linux', false, exec)).toEqual(unavailable('tool-missing', 'df'));
  });
});