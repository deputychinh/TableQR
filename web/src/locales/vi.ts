// Source of truth for every display string (Vietnamese UI). Each feature adds its own file in
// ./vi/ and one spread line here.
import { core } from './vi/core';
import { tables } from '@/features/tables/locale';

export const vi = {
  ...core,
  ...tables,
} as const;

export type Messages = typeof vi;
