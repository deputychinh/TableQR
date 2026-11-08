import { getJson, sendJson } from '@/api/client';
import type { BankAccount, HouseRules, OwnerSettings } from './model';

export const loadSettings = (): Promise<OwnerSettings> =>
  getJson<OwnerSettings>('/restaurant/settings');

/** `currentPassword`: the owner's password, sent only with a bank account change (TQR-023). */
export const saveSettings = (input: {
  rules: HouseRules;
  bank: BankAccount | null;
  currentPassword?: string;
}): Promise<OwnerSettings> => sendJson<OwnerSettings>('PUT', '/restaurant/settings', input);
