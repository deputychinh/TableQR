import { type HouseRules, type OwnerSettings, WEEKDAYS } from '@/features/settings/model';

/** The API's defaults for a new restaurant (spec S4). */
export const defaultRules = (): HouseRules => ({
  paymentTiming: 'pay_after',
  sessionOpening: 'self_check_in',
  orderApproval: 'anomalies_only',
  anomaly: { maxMainPerPerson: 2, minMainPerPerson: 0.5 },
  booking: {
    enabled: true,
    slotMinutes: 90,
    openingHours: Object.fromEntries(
      WEEKDAYS.map((day) => [day, { closed: false, open: '10:00', close: '22:00' }]),
    ) as HouseRules['booking']['openingHours'],
  },
});

export const ownerSettings = (patch: Partial<OwnerSettings> = {}): OwnerSettings => ({
  rules: defaultRules(),
  rulesUpdatedAt: null,
  bank: null,
  bankChangedAt: null,
  banks: [
    { bin: '970436', shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam' },
    { bin: '970422', shortName: 'MB', name: 'Ngân hàng TMCP Quân đội' },
  ],
  ...patch,
});
