// Source of truth for every display string (Vietnamese UI). Each feature adds its own file in
// ./vi/ and one spread line here.
import { core } from './vi/core';
import { rolesLocale } from '@/features/roles/locale';
import { staffLocale } from '@/features/staff/locale';
import { adminLocale } from '@/features/admin/locale';

export const vi = {
  ...core,
  ...rolesLocale,
  ...staffLocale,
  ...adminLocale,
} as const;

export type Messages = typeof vi;
