import { describe, expect, test } from 'bun:test';

import { run } from '../src/service/collectors/exec.ts';

describe('exec', () => {
  test('a command that exits non-zero still returns what it printed', async () => {
    // `df` exits 1 when one mount cannot be stat'ed, but prints every other row.
    const result = await run([process.execPath], ['-e', 'process.stdout.write("a\\nb\\n"); process.exit(1)']);

    expect(result).toEqual({ ok: false, missing: false, stdout: 'a\nb\n' });
  });

  test('a missing binary is reported as missing, with empty output', async () => {
    const result = await run(['/nonexistent/definitely-not-a-tool'], []);

    expect(result).toEqual({ ok: false, missing: true, stdout: '' });
  });
});