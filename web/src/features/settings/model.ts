// House rules and bank account as the API sends them (services/api/src/settings). The API is the
// authority on validity; these bounds only drive the steppers and the early checks in the form.

export const PAYMENT_TIMINGS = ['pay_after', 'pay_before'] as const;
export const SESSION_OPENINGS = ['self_check_in', 'staff_opens'] as const;
export const ORDER_APPROVALS = ['anomalies_only', 'every_order', 'none'] as const;
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export type PaymentTiming = (typeof PAYMENT_TIMINGS)[number];
export type SessionOpening = (typeof SESSION_OPENINGS)[number];
export type OrderApproval = (typeof ORDER_APPROVALS)[number];
export type Weekday = (typeof WEEKDAYS)[number];

export const RULE_LIMITS = {
  maxMainPerPerson: { min: 1, max: 10, step: 0.5 },
  minMainPerPerson: { min: 0, max: 5, step: 0.5 },
  slotMinutes: { min: 30, max: 240, step: 15 },
} as const;

export const ACCOUNT_NAME_MAX = 50;
export const ACCOUNT_NUMBER_PATTERN = /^\d{6,19}$/;
const ACCOUNT_NAME_PATTERN = /^[A-Z0-9]+(?: [A-Z0-9]+)*$/;

export interface DayHours {
  closed: boolean;
  open: string;
  close: string;
}

export interface HouseRules {
  paymentTiming: PaymentTiming;
  sessionOpening: SessionOpening;
  orderApproval: OrderApproval;
  anomaly: { maxMainPerPerson: number; minMainPerPerson: number };
  booking: { enabled: boolean; slotMinutes: number; openingHours: Record<Weekday, DayHours> };
}

export interface Bank {
  bin: string;
  shortName: string;
  name: string;
}

export interface BankAccount {
  bin: string;
  accountNumber: string;
  accountName: string;
}

export interface OwnerSettings {
  rules: HouseRules;
  rulesUpdatedAt: string | null;
  bank: (BankAccount & { bankName: string }) | null;
  bankChangedAt: string | null;
  banks: Bank[];
}

/** The bank section as typed; an empty `bin` means "no account, pay at the counter". */
export interface BankDraft {
  bin: string;
  accountNumber: string;
  accountName: string;
}

/** Same rule as the API: "Nguyễn Văn Ánh" → "NGUYEN VAN ANH" (live preview of the bank name). */
export const normalizeAccountName = (input: string): string =>
  input
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[đĐ]/g, 'D')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Account numbers are often copied with spaces or dots ("0123 456 789"); keep the digits. */
export const digitsOnly = (input: string): string => input.replace(/[\s.-]/g, '');

export const draftOf = (bank: OwnerSettings['bank']): BankDraft =>
  bank === null
    ? { bin: '', accountNumber: '', accountName: '' }
    : { bin: bank.bin, accountNumber: bank.accountNumber, accountName: bank.accountName };

/** The PUT body's `bank`: null when no bank is chosen. */
export const bankOfDraft = (draft: BankDraft): BankAccount | null =>
  draft.bin === ''
    ? null
    : {
        bin: draft.bin,
        accountNumber: digitsOnly(draft.accountNumber),
        accountName: normalizeAccountName(draft.accountName),
      };

export type FieldErrors = Record<string, string>;

/**
 * Early checks so the owner sees mistakes before a round trip; keys are API field paths, values
 * locale keys. The API repeats every check.
 */
export const checkDraft = (rules: HouseRules, draft: BankDraft): FieldErrors => {
  const errors: FieldErrors = {};
  if (rules.anomaly.minMainPerPerson > rules.anomaly.maxMainPerPerson) {
    errors['rules.anomaly.minMainPerPerson'] = 'settings.errors.minAboveMax';
  }
  for (const day of WEEKDAYS) {
    const hours = rules.booking.openingHours[day];
    if (!hours.closed && !(hours.close > hours.open)) {
      errors[`rules.booking.openingHours.${day}.close`] = 'settings.errors.closeAfterOpen';
    }
  }
  const typedSomething = draft.accountNumber !== '' || draft.accountName !== '';
  if (draft.bin === '') {
    if (typedSomething) errors['bank.bin'] = 'settings.errors.bankRequired';
    return errors;
  }
  if (!ACCOUNT_NUMBER_PATTERN.test(digitsOnly(draft.accountNumber))) {
    errors['bank.accountNumber'] = 'settings.errors.accountNumber';
  }
  const name = normalizeAccountName(draft.accountName);
  if (name.length < 2 || name.length > ACCOUNT_NAME_MAX || !ACCOUNT_NAME_PATTERN.test(name)) {
    errors['bank.accountName'] = 'settings.errors.accountName';
  }
  return errors;
};

/** Locale key for an API field path that failed validation. */
export const messageForPath = (path: string): string => {
  if (path.startsWith('rules.booking.openingHours.')) return 'settings.errors.closeAfterOpen';
  const known: Record<string, string> = {
    'bank.bin': 'settings.errors.bankRequired',
    'bank.accountNumber': 'settings.errors.accountNumber',
    'bank.accountName': 'settings.errors.accountName',
    'rules.anomaly.minMainPerPerson': 'settings.errors.minAboveMax',
  };
  return known[path] ?? 'settings.errors.invalid';
};
