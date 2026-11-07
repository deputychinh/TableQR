import type { Settings } from '../../config/settings.js';
import { AppLogger } from './app-logger.js';

const settings = (level: Settings['TQR_LOG_LEVEL']): Settings =>
  ({ TQR_LOG_LEVEL: level }) as Settings;

describe('AppLogger', () => {
  it('writes redacted JSON entries with time and level', () => {
    const entries: Record<string, unknown>[] = [];
    const logger = new AppLogger({ write: (e) => entries.push(e) }, settings('info'));
    logger.info('login', { email: 'a@b.c', ok: true });
    expect(entries[0]).toMatchObject({
      level: 'info',
      msg: 'login',
      email: '[REDACTED]',
      ok: true,
    });
    expect(entries[0]?.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('drops entries below the configured level', () => {
    const entries: Record<string, unknown>[] = [];
    const logger = new AppLogger({ write: (e) => entries.push(e) }, settings('error'));
    logger.info('a');
    logger.warn('b');
    logger.error('c');
    expect(entries.map((e) => e.msg)).toEqual(['c']);
  });
});
