import type { Component } from 'vue';
import {
  CalendarDays,
  ChefHat,
  ClipboardCheck,
  HandPlatter,
  LayoutDashboard,
  QrCode,
  Settings,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-vue-next';
import type { StaffRole } from '@/stores/session';

/** One destination in a shell's navigation; `label` is a locale key. */
export interface NavItem {
  to: string;
  label: string;
  icon: Component;
  /** Active only on this exact path (a home whose path prefixes others). */
  exact: boolean;
}

/**
 * Where each role can go, in one place (design-system "Shell per role"). Material 3: at most five
 * bottom-bar items on phones, so `primary` holds up to four and the rest sit behind "Thêm";
 * from 840 px the rail lists every group.
 */
export interface RoleNav {
  primary: readonly NavItem[];
  /** Behind "Thêm" on phones; listed after the primary items on the rail. */
  more: readonly NavItem[];
  /** The floor screens ("Vận hành") the owner also works on. */
  operations: readonly NavItem[];
}

const item = (to: string, label: string, icon: Component, exact = false): NavItem => ({
  to,
  label,
  icon,
  exact,
});

const OVERVIEW = item('/quan-ly', 'nav.overview', LayoutDashboard, true);
const MENU = item('/quan-ly/thuc-don', 'nav.menu', UtensilsCrossed);
const TABLES = item('/quan-ly/ban', 'nav.tables', QrCode);
const BOOKINGS = item('/dat-ban', 'nav.bookings', CalendarDays);
const STAFF = item('/quan-ly/nhan-vien', 'nav.staff', Users);
const SETTINGS = item('/quan-ly/cai-dat', 'nav.settings', Settings);
const CASHIER = item('/thu-ngan', 'nav.cashier', Wallet, true);
const KITCHEN = item('/bep', 'nav.kitchen', ChefHat, true);
const SERVING = item('/phuc-vu', 'nav.serving', HandPlatter, true);
const REVIEW = item('/phuc-vu/duyet', 'nav.review', ClipboardCheck, true);

const NONE: RoleNav = { primary: [], more: [], operations: [] };

export const ROLE_NAV: Readonly<Record<StaffRole, RoleNav>> = {
  owner: {
    primary: [OVERVIEW, MENU, TABLES, BOOKINGS],
    more: [STAFF, SETTINGS],
    operations: [CASHIER, KITCHEN, SERVING, REVIEW],
  },
  waiter: { primary: [SERVING, REVIEW, TABLES, BOOKINGS], more: [], operations: [] },
  cashier: { primary: [CASHIER, TABLES, BOOKINGS], more: [], operations: [] },
  // One screen each: the kitchen queue and the platform console need no navigation.
  kitchen: NONE,
  platform_admin: NONE,
};

/** Whether `path` is the item's page (or, for a section, one of its sub-pages). */
export const isActive = (nav: NavItem, path: string): boolean =>
  nav.exact ? path === nav.to : path === nav.to || path.startsWith(`${nav.to}/`);
