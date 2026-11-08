import { loadSettings } from './settings.js';

const validEnv = {
  TQR_DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db',
  TQR_SESSION_SECRET: 'x'.repeat(32),
};

describe('loadSettings', () => {
  it('applies defaults and splits web origins', () => {
    const settings = loadSettings({ ...validEnv, TQR_WEB_ORIGINS: 'http://a, http://b' });
    expect(settings.TQR_WEB_ORIGINS).toEqual(['http://a', 'http://b']);
    expect(settings.PORT).toBe(3310);
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

  it('trusts no proxy and sends no HSTS by default', () => {
    const settings = loadSettings({ ...validEnv, TQR_TRUSTED_PROXIES: '' });
    expect(settings.TQR_TRUSTED_PROXIES).toEqual([]);
    expect(settings.TQR_HSTS).toBe(false);
  });

  it('reads trusted proxies as addresses, CIDR blocks or named ranges', () => {
    const settings = loadSettings({
      ...validEnv,
      TQR_TRUSTED_PROXIES: '127.0.0.1, 10.0.0.0/8 ,::1,fd00::/8,loopback',
      TQR_HSTS: 'true',
    });
    expect(settings.TQR_TRUSTED_PROXIES).toEqual([
      '127.0.0.1',
      '10.0.0.0/8',
      '::1',
      'fd00::/8',
      'loopback',
    ]);
    expect(settings.TQR_HSTS).toBe(true);
  });

  it.each(['true', 'proxy.local', '10.0.0.0/33', '::1/129', '/8'])(
    'rejects the trusted proxy entry %s at boot',
    (entry) => {
      expect(() => loadSettings({ ...validEnv, TQR_TRUSTED_PROXIES: entry })).toThrow(
        'TQR_TRUSTED_PROXIES',
      );
    },
  );

  it('rejects an HSTS value other than true or false', () => {
    expect(() => loadSettings({ ...validEnv, TQR_HSTS: 'yes' })).toThrow('TQR_HSTS');
  });
});
