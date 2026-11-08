// Vietnamese speech with the macOS voice (`say -v Linh`), cached by text, voice and rate.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const VOICE = process.env.DEMO_VOICE ?? 'Linh';
/** Words per minute of the narrator. */
export const NARRATION_RATE = 175;
/** The kitchen screen's voice ("Vừa"): a little slower than the narrator. */
export const KITCHEN_RATE = 165;

/** Length of an audio file in seconds (ffprobe). */
export const durationOf = async (file) => {
  const { stdout } = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`no audio in ${file}`);
  return seconds;
};

/** Speaks `text` into `<dir>/<hash>.aiff` (reused when it exists); returns the file and its length. */
export const synth = async (text, { dir, rate = NARRATION_RATE }) => {
  mkdirSync(dir, { recursive: true });
  const hash = createHash('sha1')
    .update(`${VOICE}|${String(rate)}|${text}`)
    .digest('hex');
  const file = join(dir, `${hash.slice(0, 16)}.aiff`);
  if (!existsSync(file)) await run('say', ['-v', VOICE, '-r', String(rate), '-o', file, text]);
  return { file, duration: await durationOf(file) };
};
