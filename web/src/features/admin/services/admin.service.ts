import { ApiError, getJson, sendJson } from '@/api/client';

export interface AdminRestaurant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  ownerEmail: string | null;
  staffCount: number;
  createdAt: string;
}

export interface RestaurantPage {
  items: AdminRestaurant[];
  total: number;
  limit: number;
  offset: number;
}

export const PAGE_SIZE = 50;

export const listRestaurants = (offset = 0, limit = PAGE_SIZE): Promise<RestaurantPage> =>
  getJson<RestaurantPage>(`/admin/restaurants?limit=${String(limit)}&offset=${String(offset)}`);

export const setRestaurantStatus = (
  id: string,
  action: 'suspend' | 'reactivate',
): Promise<AdminRestaurant> =>
  sendJson<AdminRestaurant>('POST', `/admin/restaurants/${encodeURIComponent(id)}/${action}`);

export const describeAdminError = (error: unknown): string => {
  if (error instanceof ApiError && error.code === 'NETWORK') return 'errors.network';
  if (error instanceof ApiError && error.code === 'NOT_FOUND') return 'admin.errors.notFound';
  return 'errors.unexpected';
};
