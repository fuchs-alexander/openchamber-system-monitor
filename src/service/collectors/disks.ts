import { unavailable, type Disk, type Platform, type Unavailable } from '../../shared/stats.ts';
import { run, type ExecResult } from './exec.ts';
import { darwinDisks, linuxDisks, parseDf, parseWindowsDisks } from './parse-disks.ts';
import { runPowerShell } from './windows.ts';

const WINDOWS_DISKS =
  'Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID, VolumeName, Size, FreeSpace | ConvertTo-Json -Compress';
// PowerShell needs about a second to start; give the disk query more room than a tool call.
const WINDOWS_TIMEOUT_MS = 10_000;

const DF = ['/bin/df', '/usr/bin/df', 'df'];

type Exec = typeof run;

// A dead mount (a stale FUSE mount, say) makes `df` exit non-zero while it still
// prints every row it could read; usable rows are worth more than the exit code.
const usable = (result: ExecResult): boolean => result.ok || parseDf(result.stdout).length > 0;

const readDf = async (exec: Exec = run): Promise<{ ok: true; stdout: string } | Unavailable> => {
  // `-l` (local only) is missing from BusyBox; fall back to every filesystem.
  const local = await exec(DF, ['-kPl']);
  if (usable(local)) return { ok: true, stdout: local.stdout };
  const all = await exec(DF, ['-kP']);
  if (usable(all)) return { ok: true, stdout: all.stdout };
  if (!all.ok && all.missing) return unavailable('tool-missing', 'df');
  return unavailable('failed', 'df');
};

export const readDisks = async (platform: Platform, container: boolean, exec: Exec = run): Promise<Disk[] | Unavailable> => {
  if (platform === 'win32') {
    const result = await runPowerShell(WINDOWS_DISKS, WINDOWS_TIMEOUT_MS);
    if (!result.ok) return unavailable(result.missing ? 'tool-missing' : 'failed', 'powershell');
    return parseWindowsDisks(result.stdout) ?? unavailable('failed');
  }
  if (platform === 'darwin' || platform === 'linux') {
    const df = await readDf(exec);
    if (!('ok' in df)) return df;
    const rows = parseDf(df.stdout);
    if (rows.length === 0) return unavailable('failed');
    return platform === 'darwin' ? darwinDisks(rows) : linuxDisks(rows, container);
  }
  return unavailable('unsupported');
};
