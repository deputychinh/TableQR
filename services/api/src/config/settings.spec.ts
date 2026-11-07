import { loadSettings } from './settings.js';

const validEnv = {
  TQR_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db',
  TQR_SESSION_SECRET: 'x'.repeat(32),
};

describe('loadSettings', () => {
  it('applies defaults and splits web origins', () => {
    const settings = loadSettings({ ...validEnv, TQR_WEB_ORIGINS: 'http://a, http://b' });
    expect(settings.TQR_WEB_ORIGINS).toEqual(['http://a', 'http://b']);
    expect(settings.PORT).toBe(3000);
    expect(settings.TQR_LOG_LEVEL).toBe('info');
  });

  it('rejects a short session secret and names the field, not the value', () => {
    expect(() => loadSettings({ ...validEnv, TQR_SESSION_SECRET: 'short' })).toThrow(
      'Invalid settings: TQR_SESSION_SECRET',
    );
  });

  it('rejects a missing database url', () => {
    expect(() => loadSettings({ TQR_SESSION_SECRET: 'x'.repeat(32) })).toThrow('TQR_DATABASE_URL');
  });
});
