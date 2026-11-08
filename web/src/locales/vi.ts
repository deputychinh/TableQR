// Source of truth for every display string (Vietnamese UI). Each feature adds its own locale file,
// one import line and one spread line below (one per line, so parallel merges stay additive).
import { core } from './vi/core';
import { menu } from '@/features/menu/locale';
import { settings } from '@/features/settings/locale';
import { tables } from '@/features/tables/locale';
import { rolesLocale } from '@/features/roles/locale';
import { staffLocale } from '@/features/staff/locale';
import { adminLocale } from '@/features/admin/locale';
import { billingLocale } from '@/features/billing/locale';
import { bookingLocale } from '@/features/booking/locale';
import { orderingLocale } from '@/features/ordering/locale';
import { kitchenLocale } from '@/features/kitchen/locale';
import { servingLocale } from '@/features/serving/locale';

export const vi = {
  ...core,
  ...menu,
  ...settings,
  ...tables,
  ...rolesLocale,
  ...staffLocale,
  ...adminLocale,
  ...billingLocale,
  ...bookingLocale,
  ...orderingLocale,
  ...kitchenLocale,
  ...servingLocale,
} as const;

export type Messages = typeof vi;
