import { vi as messages } from '@/locales/vi';
import { defaultRules } from '@/test/settings-fixtures';
import {
  bankOfDraft,
  checkDraft,
  digitsOnly,
  draftOf,
  messageForPath,
  normalizeAccountName,
} from './model';

const empty = { bin: '', accountNumber: '', accountName: '' };
const filled = { bin: '970436', accountNumber: '0123 456 789', accountName: 'Nguyễn Văn Ánh' };

describe('account name and number (same rule as the API)', () => {
  it.each([
    ['Nguyễn Văn Ánh', 'NGUYEN VAN ANH'],
    ['  đặng   hữu phước ', 'DANG HUU PHUOC'],
  ])('"%s" → "%s"', (input, expected) => {
    expect(normalizeAccountName(input)).toBe(expected);
  });

  it('keeps only the digits of a pasted account number', () => {
    expect(digitsOnly('0123 456.789-0')).toBe('01234567890');
  });

  it('turns the draft into the PUT body, or null for "pay at the counter"', () => {
    expect(bankOfDraft(empty)).toBeNull();
    expect(bankOfDraft(filled)).toEqual({
      bin: '970436',
      accountNumber: '0123456789',
      accountName: 'NGUYEN VAN ANH',
    });
    expect(draftOf(null)).toEqual(empty);
    expect(
      draftOf({ bin: '970436', bankName: 'Vietcombank', accountNumber: '1', accountName: 'A' }),
    ).toEqual({ bin: '970436', accountNumber: '1', accountName: 'A' });
  });
});

describe('checkDraft', () => {
  it('passes the defaults with no bank and with a good bank', () => {
    expect(checkDraft(defaultRules(), empty)).toEqual({});
    expect(checkDraft(defaultRules(), filled)).toEqual({});
  });

  it('asks for a bank when a number or name was typed without one', () => {
    expect(checkDraft(defaultRules(), { ...empty, accountNumber: '123456' })).toEqual({
      'bank.bin': 'settings.errors.bankRequired',
    });
  });

  it.each([
    ['12345', 'bank.accountNumber'],
    ['1'.repeat(20), 'bank.accountNumber'],
    ['01234a678', 'bank.accountNumber'],
  ])('refuses account number %s', (accountNumber, path) => {
    expect(Object.keys(checkDraft(defaultRules(), { ...filled, accountNumber }))).toEqual([path]);
  });

  it.each(['A', 'A'.repeat(51), 'Ánh @ quán', ''])('refuses holder name "%s"', (accountName) => {
    expect(Object.keys(checkDraft(defaultRules(), { ...filled, accountName }))).toEqual([
      'bank.accountName',
    ]);
  });

  it('refuses min above max and a closing time not after opening; ignores closed days', () => {
    const rules = defaultRules();
    rules.anomaly.minMainPerPerson = 3;
    rules.booking.openingHours.tue = { closed: false, open: '18:00', close: '18:00' };
    rules.booking.openingHours.wed = { closed: true, open: '18:00', close: '09:00' };
    expect(checkDraft(rules, empty)).toEqual({
      'rules.anomaly.minMainPerPerson': 'settings.errors.minAboveMax',
      'rules.booking.openingHours.tue.close': 'settings.errors.closeAfterOpen',
    });
  });
});

describe('messageForPath', () => {
  it('maps every API field path to an existing message', () => {
    const errors = messages.settings.errors as Record<string, string>;
    for (const path of [
      'bank.bin',
      'bank.accountNumber',
      'bank.accountName',
      'rules.anomaly.minMainPerPerson',
      'rules.booking.openingHours.fri.close',
      'rules.booking.slotMinutes',
    ]) {
      const key = messageForPath(path).replace('settings.errors.', '');
      expect(errors[key]).toBeTruthy();
    }
    expect(messageForPath('rules.paymentTiming')).toBe('settings.errors.invalid');
  });
});
