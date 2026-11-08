/**
 * Safety caps per restaurant (TQR-006). They also bound every menu read: the staff menu and the
 * public guest menu return at most 20 stations, 50 categories and 500 items, so no list endpoint
 * here needs paging (docs/security.md: list endpoints are bounded).
 */
export const MAX_STATIONS_PER_RESTAURANT = 20;
export const MAX_CATEGORIES_PER_RESTAURANT = 50;
export const MAX_ITEMS_PER_RESTAURANT = 500;

/** True when one more row would go over the cap. */
export const isAtLimit = (current: number, max: number): boolean => current >= max;
