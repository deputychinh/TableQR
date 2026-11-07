// Source of truth for every display string (Vietnamese UI). Each feature adds its own locale file,
// one import line and one spread line below (one per line, so parallel merges stay additive).
import { core } from './vi/core';
import { settings } from '@/features/settings/locale';
import { tables } from '@/features/tables/locale';
import { rolesLocale } from '@/features/roles/locale';
import { staffLocale } from '@/features/staff/locale';
import { adminLocale } from '@/features/admin/locale';

export const vi = {
  ...core,
  ...settings,
  ...tables,
  ...rolesLocale,
  ...staffLocale,
  ...adminLocale,
} as const;

export type Messages = typeof vi;
