import { getJson, sendJson } from '@/api/client';
import type {
  Category,
  CategoryInput,
  GuestMenu,
  ItemInput,
  MenuItem,
  StaffMenu,
  Station,
  StationInput,
} from './types';

/** The menu service: one function per API call (services/api/src/menu/menu.controller.ts). */
export const menuApi = {
  load: () => getJson<StaffMenu>('/menu'),
  guestMenu: (slug: string) => getJson<GuestMenu>(`/g/r/${encodeURIComponent(slug)}/menu`),

  createStation: (input: StationInput) => sendJson<Station>('POST', '/menu/stations', input),
  updateStation: (id: string, input: StationInput) =>
    sendJson<Station>('PATCH', `/menu/stations/${id}`, input),
  deleteStation: (id: string) => sendJson<void>('DELETE', `/menu/stations/${id}`),

  createCategory: (input: CategoryInput) => sendJson<Category>('POST', '/menu/categories', input),
  updateCategory: (id: string, input: CategoryInput) =>
    sendJson<Category>('PATCH', `/menu/categories/${id}`, input),
  moveCategory: (id: string, direction: 'up' | 'down') =>
    sendJson<{ categories: Category[] }>('POST', `/menu/categories/${id}/move`, { direction }),
  deleteCategory: (id: string) => sendJson<void>('DELETE', `/menu/categories/${id}`),

  createItem: (input: ItemInput) => sendJson<MenuItem>('POST', '/menu/items', input),
  updateItem: (id: string, input: ItemInput) =>
    sendJson<MenuItem>('PATCH', `/menu/items/${id}`, input),
  setAvailability: (id: string, available: boolean) =>
    sendJson<MenuItem>('PUT', `/menu/items/${id}/availability`, { available }),
  deleteItem: (id: string) => sendJson<void>('DELETE', `/menu/items/${id}`),
};
