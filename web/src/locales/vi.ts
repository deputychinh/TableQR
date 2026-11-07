// Source of truth for every display string (Vietnamese UI). Each feature adds its own file in
// ./vi/ and one spread line here.
import { core } from './vi/core';
import { menu } from '@/features/menu/locale';

export const vi = {
  ...core,
  menu,
} as const;

export type Messages = typeof vi;
