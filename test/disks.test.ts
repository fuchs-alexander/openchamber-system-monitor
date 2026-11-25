import { afterEach, expect, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { readDisks } from '../src/service/collectors/disks.ts';
import * as exec from '../src/service/collectors/exec.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const headers = fixture('linux-wsl2-headers-df.txt');
const headerLine = 'Filesystem 1024-blocks Used Available Capacity Mounted on';
const rootRow = '/dev/sda1 1000 400 600 40% /';
const alias = '/data/bind-mount-for-the-same-device-as-the-wsl2-headers-mount';
const aliasRow = `/dev/sdb 99148 99148 0 100% ${alias}`;
const root = { mount: '/', label: null, used: 400 * 1024, total: 1000 * 1024 };
const fullAlias = { mount: alias, label: null, used: 99148 * 1024, total: 99148 * 1024 };

let spy: ReturnType<typeof spyOn<typeof exec, 'run'>> | undefined;

afterEach(() => {
  spy?.mockRestore();
  spy = undefined;
});

test.each([
  ['-kPl', '-akPl'],
  ['-kP', '-akP'],
])('Linux recovers only the missing WSL2 device alias from df %s', async (base, expanded) => {
  spy = spyOn(exec, 'run').mockImplementation(async (_commands, args) => {
    if (args[0] === base) return { ok: true, stdout: headers + rootRow };
    if (args[0] === expanded) {
      return { ok: true, stdout: [headers + rootRow, aliasRow, '/dev/sdc 50 50 0 100% /unrelated'].join('\n') };
    }
    return { ok: false, missing: false };
  });

  expect(await readDisks('linux', false)).toEqual([root, fullAlias]);
});

test('Linux retains ordinary disks if the supplemental df fails', async () => {
  spy = spyOn(exec, 'run')
    .mockResolvedValueOnce({ ok: true, stdout: headers + rootRow })
    .mockResolvedValueOnce({ ok: false, missing: false });

  expect(await readDisks('linux', false)).toEqual([root]);
  expect(spy.mock.calls.map(([, args]) => args)).toEqual([['-kPl'], ['-akPl']]);
});

test('Linux does not request all mounts when the normal device alias is already visible', async () => {
  spy = spyOn(exec, 'run').mockResolvedValue({ ok: true, stdout: [headers + rootRow, aliasRow].join('\n') });

  expect(await readDisks('linux', false)).toEqual([root, fullAlias]);
  expect(spy.mock.calls.map(([, args]) => args)).toEqual([['-kPl']]);
});

test('Linux does not request all mounts for a path with a trailing space', async () => {
  const mount = '/usr/src/linux-headers-6.18.58.1-microsoft-standard-WSL2' + ' ';
  const stdout = [headerLine, rootRow, `/dev/sdb 99148 99148 0 100% ${mount}`].join('\n');
  spy = spyOn(exec, 'run').mockResolvedValue({ ok: true, stdout });

  expect(await readDisks('linux', false)).toEqual([root, { ...fullAlias, mount }]);
  expect(spy.mock.calls.map(([, args]) => args)).toEqual([['-kPl']]);
});

test('macOS keeps its original df query and does not apply Linux WSL2 exclusions', async () => {
  spy = spyOn(exec, 'run').mockResolvedValue({ ok: true, stdout: headers + rootRow });

  expect(await readDisks('darwin', false)).toEqual([
    root,
    { ...fullAlias, mount: '/usr/src/linux-headers-6.18.58.1-microsoft-standard-WSL2' },
  ]);
  expect(spy.mock.calls.map(([, args]) => args)).toEqual([['-kPl']]);
});
