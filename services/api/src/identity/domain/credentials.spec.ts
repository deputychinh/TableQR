import { DUMMY_PASSWORD_HASH, checkCredentials } from './credentials.js';
import { hashPassword, verifyPassword } from './password.js';

describe('checkCredentials (D2: same cost for every account)', () => {
  const okVerify = () => vi.fn(() => Promise.resolve(true));

  it('runs the password check against the dummy hash for an unknown email', async () => {
    const verify = okVerify();
    await expect(checkCredentials(undefined, 'any-password', verify)).resolves.toBe(false);
    expect(verify).toHaveBeenCalledExactlyOnceWith('any-password', DUMMY_PASSWORD_HASH);
  });

  it('runs the password check against the dummy hash for a disabled account', async () => {
    const verify = okVerify();
    const disabled = { passwordHash: 'scrypt$real', disabledAt: new Date() };
    await expect(checkCredentials(disabled, 'right-password', verify)).resolves.toBe(false);
    expect(verify).toHaveBeenCalledExactlyOnceWith('right-password', DUMMY_PASSWORD_HASH);
  });

  it('checks an enabled account against its own hash', async () => {
    const verify = okVerify();
    const user = { passwordHash: 'scrypt$real', disabledAt: null };
    await expect(checkCredentials(user, 'right-password', verify)).resolves.toBe(true);
    expect(verify).toHaveBeenCalledExactlyOnceWith('right-password', 'scrypt$real');
  });

  it('uses the same scrypt parameters as real hashes and matches no password', async () => {
    const real = await hashPassword('mat-khau-dai-123');
    const params = (hash: string) => hash.split('$').slice(0, 4).join('$');
    expect(params(DUMMY_PASSWORD_HASH)).toBe(params(real));
    await expect(verifyPassword('mat-khau-dai-123', DUMMY_PASSWORD_HASH)).resolves.toBe(false);
  });
});
