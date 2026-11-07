import { getJson, sendJson } from '@/api/client';
import type { BankAccount, HouseRules, OwnerSettings } from './model';

export const loadSettings = (): Promise<OwnerSettings> =>
  getJson<OwnerSettings>('/restaurant/settings');

export const saveSettings = (input: {
  rules: HouseRules;
  bank: BankAccount | null;
}): Promise<OwnerSettings> => sendJson<OwnerSettings>('PUT', '/restaurant/settings', input);
