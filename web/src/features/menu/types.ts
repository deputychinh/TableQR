// Shapes of the menu API (services/api/src/menu); camelCase JSON as on the rest of the API.

export interface Station {
  id: string;
  name: string;
  lateAfterMinutes: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  stationId: string;
  name: string;
  priceVnd: number;
  description: string | null;
  available: boolean;
}

export interface Category {
  id: string;
  name: string;
  isMain: boolean;
  sortOrder: number;
}

export interface CategoryWithItems extends Category {
  items: MenuItem[];
}

export interface StaffMenu {
  stations: Station[];
  categories: CategoryWithItems[];
}

export interface GuestItem {
  id: string;
  name: string;
  priceVnd: number;
  description: string | null;
  orderable: boolean;
}

export interface GuestMenu {
  restaurant: { name: string; slug: string };
  categories: { id: string; name: string; isMain: boolean; items: GuestItem[] }[];
}

export interface ItemInput {
  name: string;
  priceVnd: number;
  categoryId: string;
  stationId: string;
  description: string;
}

export interface CategoryInput {
  name: string;
  isMain: boolean;
}

export interface StationInput {
  name: string;
  lateAfterMinutes: number;
}
