import type { Component } from 'vue';
import { ChefHat, Crown, HandPlatter, ShieldCheck, Wallet } from 'lucide-vue-next';
import type { StaffRole } from '@/stores/session';

/** One icon per role, used with the role name wherever a role is shown. */
export const ROLE_ICONS: Readonly<Record<StaffRole, Component>> = {
  owner: Crown,
  cashier: Wallet,
  waiter: HandPlatter,
  kitchen: ChefHat,
  platform_admin: ShieldCheck,
};
