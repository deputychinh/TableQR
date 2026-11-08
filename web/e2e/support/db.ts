import { execFileSync } from 'node:child_process';
import process from 'node:process';

/** Runs SQL on the e2e database (Makefile `E2E_DB`) through the compose `db` service. */
export const sql = (statement: string): string => {
  const url = new URL(
    process.env.TQR_DATABASE_URL ?? 'postgresql://tableqr:tableqr@127.0.0.1:55432/tableqr',
  );
  return execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'psql',
      '-U',
      'tableqr',
      '-d',
      url.pathname.slice(1),
      '-v',
      'ON_ERROR_STOP=1',
      '-qtA',
      '-c',
      statement,
    ],
    { cwd: '..', encoding: 'utf8' },
  ).trim();
};
