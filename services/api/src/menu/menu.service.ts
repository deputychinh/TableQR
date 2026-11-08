import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import { asTenantId, type TenantId } from '../common/tenant.js';
import { DB, type Database } from '../db/database.module.js';
import { restaurants } from '../db/schema.js';
import { RestaurantStatusService } from '../identity/restaurant-status.service.js';
import type {
  CreateCategoryInput,
  CreateItemInput,
  CreateStationInput,
  UpdateCategoryInput,
  UpdateItemInput,
  UpdateStationInput,
} from './dto/menu.dto.js';
import {
  groupMenu,
  toGuestMenu,
  type CategoryRow,
  type CategoryWithItems,
  type GuestCategory,
  type ItemRow,
} from './domain/menu-tree.js';
import {
  nextSortOrder,
  sortBySortOrder,
  swapForMove,
  type MoveDirection,
} from './domain/ordering.js';
import { DEFAULT_LATE_MINUTES, DEFAULT_STATION_NAME } from './domain/station.js';
import { FOREIGN_KEY_VIOLATION, UNIQUE_VIOLATION, pgCode, pgConstraint } from '../db/pg-error.js';
import {
  MAX_CATEGORIES_PER_RESTAURANT,
  MAX_ITEMS_PER_RESTAURANT,
  MAX_STATIONS_PER_RESTAURANT,
  isAtLimit,
} from './domain/limits.js';
import {
  MenuErrorCode,
  categoryNotEmpty,
  itemHasOrders,
  lastStation,
  limitReached,
  nameTaken,
  notFound,
  stationNotEmpty,
} from './menu.errors.js';
import { categories, menuItems, stations } from './menu.schema.js';

export interface Station {
  id: string;
  name: string;
  lateAfterMinutes: number;
}

export type Category = CategoryRow;
export type MenuItem = ItemRow;

export interface StaffMenu {
  stations: Station[];
  categories: CategoryWithItems<MenuItem>[];
}

export interface GuestMenu {
  restaurant: { name: string; slug: string };
  categories: GuestCategory[];
}

const stationColumns = {
  id: stations.id,
  name: stations.name,
  lateAfterMinutes: stations.lateAfterMinutes,
};
const categoryColumns = {
  id: categories.id,
  name: categories.name,
  isMain: categories.isMain,
  sortOrder: categories.sortOrder,
};
const itemColumns = {
  id: menuItems.id,
  categoryId: menuItems.categoryId,
  stationId: menuItems.stationId,
  name: menuItems.name,
  priceVnd: menuItems.priceVnd,
  description: menuItems.description,
  available: menuItems.available,
};

const NAME_CONSTRAINTS = new Set(['stations_tenant_name_key', 'categories_tenant_name_key']);

/** Maps the database's own guards (unique names, composite FKs) to domain errors. */
const translate = (error: unknown, onForeignKey: () => Error): never => {
  const code = pgCode(error);
  const constraint = pgConstraint(error);
  if (code === UNIQUE_VIOLATION && constraint && NAME_CONSTRAINTS.has(constraint)) {
    throw nameTaken();
  }
  if (code === FOREIGN_KEY_VIOLATION) throw onForeignKey();
  throw error;
};

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Serialises creations per restaurant (row lock on the restaurant), so a cap cannot be overshot
 * by parallel requests and two appends never share a sort order.
 */
const lockRestaurant = async (tx: Tx, tenant: TenantId): Promise<void> => {
  await tx
    .select({ id: restaurants.id })
    .from(restaurants)
    .where(eq(restaurants.id, tenant))
    .for('update');
};

const withoutUndefined = <T extends object>(value: T): Partial<T> =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;

/** Stations, categories and items of one restaurant; every query is scoped by the TenantId (ADR 0003). */
@Injectable()
export class MenuService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly restaurantStatus: RestaurantStatusService,
  ) {}

  /** The whole menu for staff; the first open gives a new restaurant its default station. */
  async getMenu(tenant: TenantId): Promise<StaffMenu> {
    await this.ensureDefaultStation(tenant);
    const [stationRows, categoryRows, itemRows] = await Promise.all([
      this.db
        .select(stationColumns)
        .from(stations)
        .where(eq(stations.restaurantId, tenant))
        .orderBy(asc(stations.createdAt), asc(stations.id)),
      this.db.select(categoryColumns).from(categories).where(eq(categories.restaurantId, tenant)),
      this.db
        .select(itemColumns)
        .from(menuItems)
        .where(eq(menuItems.restaurantId, tenant))
        .orderBy(asc(menuItems.createdAt), asc(menuItems.id)),
    ]);
    return { stations: stationRows, categories: groupMenu(categoryRows, itemRows) };
  }

  /** Idempotent under concurrency: the unique (restaurant, lower(name)) index absorbs a race. */
  private async ensureDefaultStation(tenant: TenantId): Promise<void> {
    const [row] = await this.db
      .select({ n: count() })
      .from(stations)
      .where(eq(stations.restaurantId, tenant));
    if ((row?.n ?? 0) > 0) return;
    await this.db
      .insert(stations)
      .values({
        restaurantId: tenant,
        name: DEFAULT_STATION_NAME,
        lateAfterMinutes: DEFAULT_LATE_MINUTES,
      })
      .onConflictDoNothing();
  }

  // --- stations --------------------------------------------------------------

  async createStation(tenant: TenantId, input: CreateStationInput): Promise<Station> {
    try {
      return await this.db.transaction(async (tx) => {
        await lockRestaurant(tx, tenant);
        const [existing] = await tx
          .select({ n: count() })
          .from(stations)
          .where(eq(stations.restaurantId, tenant));
        if (isAtLimit(existing?.n ?? 0, MAX_STATIONS_PER_RESTAURANT)) {
          throw limitReached(MenuErrorCode.StationLimitReached, MAX_STATIONS_PER_RESTAURANT);
        }
        const [row] = await tx
          .insert(stations)
          .values({
            restaurantId: tenant,
            name: input.name,
            lateAfterMinutes: input.lateAfterMinutes ?? DEFAULT_LATE_MINUTES,
          })
          .returning(stationColumns);
        if (!row) throw new Error('insert returned no station');
        return row;
      });
    } catch (error: unknown) {
      return translate(error, notFound);
    }
  }

  async updateStation(tenant: TenantId, id: string, input: UpdateStationInput): Promise<Station> {
    const values = withoutUndefined(input);
    const scope = and(eq(stations.restaurantId, tenant), eq(stations.id, id));
    try {
      const [row] =
        Object.keys(values).length === 0
          ? await this.db.select(stationColumns).from(stations).where(scope)
          : await this.db.update(stations).set(values).where(scope).returning(stationColumns);
      if (!row) throw notFound();
      return row;
    } catch (error: unknown) {
      return translate(error, notFound);
    }
  }

  /** A station with items cannot go (the composite FK restricts); the last one cannot either. */
  async deleteStation(tenant: TenantId, id: string): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        const owned = await tx
          .select({ id: stations.id })
          .from(stations)
          .where(eq(stations.restaurantId, tenant))
          .for('update');
        if (!owned.some((row) => row.id === id)) throw notFound();
        if (owned.length === 1) throw lastStation();
        await tx
          .delete(stations)
          .where(and(eq(stations.restaurantId, tenant), eq(stations.id, id)));
      });
    } catch (error: unknown) {
      translate(error, stationNotEmpty);
    }
  }

  // --- categories ------------------------------------------------------------

  async createCategory(tenant: TenantId, input: CreateCategoryInput): Promise<Category> {
    try {
      return await this.db.transaction(async (tx) => {
        await lockRestaurant(tx, tenant);
        const existing = await tx
          .select({ id: categories.id, sortOrder: categories.sortOrder })
          .from(categories)
          .where(eq(categories.restaurantId, tenant));
        if (isAtLimit(existing.length, MAX_CATEGORIES_PER_RESTAURANT)) {
          throw limitReached(MenuErrorCode.CategoryLimitReached, MAX_CATEGORIES_PER_RESTAURANT);
        }
        const [row] = await tx
          .insert(categories)
          .values({
            restaurantId: tenant,
            name: input.name,
            isMain: input.isMain ?? false,
            sortOrder: nextSortOrder(existing),
          })
          .returning(categoryColumns);
        if (!row) throw new Error('insert returned no category');
        return row;
      });
    } catch (error: unknown) {
      return translate(error, notFound);
    }
  }

  async updateCategory(
    tenant: TenantId,
    id: string,
    input: UpdateCategoryInput,
  ): Promise<Category> {
    const values = withoutUndefined(input);
    const scope = and(eq(categories.restaurantId, tenant), eq(categories.id, id));
    try {
      const [row] =
        Object.keys(values).length === 0
          ? await this.db.select(categoryColumns).from(categories).where(scope)
          : await this.db.update(categories).set(values).where(scope).returning(categoryColumns);
      if (!row) throw notFound();
      return row;
    } catch (error: unknown) {
      return translate(error, notFound);
    }
  }

  /** Swaps the category with its neighbour; at either end nothing changes. Returns the new order. */
  async moveCategory(tenant: TenantId, id: string, direction: MoveDirection): Promise<Category[]> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select(categoryColumns)
        .from(categories)
        .where(eq(categories.restaurantId, tenant))
        .for('update');
      if (!rows.some((row) => row.id === id)) throw notFound();
      const swap = swapForMove(rows, id, direction);
      if (!swap) return sortBySortOrder(rows);
      const { moved, other } = swap;
      const movedOrder = other.sortOrder;
      await tx
        .update(categories)
        .set({ sortOrder: movedOrder })
        .where(and(eq(categories.restaurantId, tenant), eq(categories.id, moved.id)));
      await tx
        .update(categories)
        .set({ sortOrder: moved.sortOrder })
        .where(and(eq(categories.restaurantId, tenant), eq(categories.id, other.id)));
      return sortBySortOrder(
        rows.map((row) => {
          if (row.id === moved.id) return { ...row, sortOrder: movedOrder };
          if (row.id === other.id) return { ...row, sortOrder: moved.sortOrder };
          return row;
        }),
      );
    });
  }

  /** A category with items answers CATEGORY_NOT_EMPTY (the composite FK restricts the delete). */
  async deleteCategory(tenant: TenantId, id: string): Promise<void> {
    try {
      const deleted = await this.db
        .delete(categories)
        .where(and(eq(categories.restaurantId, tenant), eq(categories.id, id)))
        .returning({ id: categories.id });
      if (deleted.length === 0) throw notFound();
    } catch (error: unknown) {
      translate(error, categoryNotEmpty);
    }
  }

  // --- items -----------------------------------------------------------------

  /** AC5: a saved item belongs to one of this restaurant's categories and stations, else 404. */
  async createItem(tenant: TenantId, input: CreateItemInput): Promise<MenuItem> {
    try {
      return await this.db.transaction(async (tx) => {
        await lockRestaurant(tx, tenant);
        const [existing] = await tx
          .select({ n: count() })
          .from(menuItems)
          .where(eq(menuItems.restaurantId, tenant));
        if (isAtLimit(existing?.n ?? 0, MAX_ITEMS_PER_RESTAURANT)) {
          throw limitReached(MenuErrorCode.ItemLimitReached, MAX_ITEMS_PER_RESTAURANT);
        }
        const [row] = await tx
          .insert(menuItems)
          .values({
            restaurantId: tenant,
            categoryId: input.categoryId,
            stationId: input.stationId,
            name: input.name,
            priceVnd: input.priceVnd,
            description: input.description ?? null,
            available: input.available ?? true,
          })
          .returning(itemColumns);
        if (!row) throw new Error('insert returned no item');
        return row;
      });
    } catch (error: unknown) {
      return translate(error, notFound);
    }
  }

  async updateItem(tenant: TenantId, id: string, input: UpdateItemInput): Promise<MenuItem> {
    try {
      const [row] = await this.db
        .update(menuItems)
        .set({ ...withoutUndefined(input), updatedAt: sql`now()` })
        .where(and(eq(menuItems.restaurantId, tenant), eq(menuItems.id, id)))
        .returning(itemColumns);
      if (!row) throw notFound();
      return row;
    } catch (error: unknown) {
      return translate(error, notFound);
    }
  }

  /** AC6: "hết món" is recorded here; ordering (TQR-012) refuses items that are not available. */
  async setAvailability(tenant: TenantId, id: string, available: boolean): Promise<MenuItem> {
    return this.updateItem(tenant, id, { available });
  }

  /** A dish guests have ordered stays for their orders and bills: 409 `ITEM_HAS_ORDERS`. */
  async deleteItem(tenant: TenantId, id: string): Promise<void> {
    try {
      const deleted = await this.db
        .delete(menuItems)
        .where(and(eq(menuItems.restaurantId, tenant), eq(menuItems.id, id)))
        .returning({ id: menuItems.id });
      if (deleted.length === 0) throw notFound();
    } catch (error: unknown) {
      translate(error, itemHasOrders);
    }
  }

  // --- guest -----------------------------------------------------------------

  /**
   * Public menu by restaurant slug: available and "hết món" items, the latter not orderable.
   * A suspended restaurant answers 403 `RESTAURANT_SUSPENDED` (AC54).
   */
  async guestMenu(slug: string): Promise<GuestMenu> {
    const [restaurant] = await this.db
      .select({ id: restaurants.id, name: restaurants.name, slug: restaurants.slug })
      .from(restaurants)
      .where(eq(restaurants.slug, slug))
      .limit(1);
    if (!restaurant) throw notFound();
    const tenant = asTenantId(restaurant.id);
    await this.restaurantStatus.assertActive(tenant);
    const [categoryRows, itemRows] = await Promise.all([
      this.db.select(categoryColumns).from(categories).where(eq(categories.restaurantId, tenant)),
      this.db
        .select(itemColumns)
        .from(menuItems)
        .where(eq(menuItems.restaurantId, tenant))
        .orderBy(asc(menuItems.createdAt), asc(menuItems.id)),
    ]);
    return {
      restaurant: { name: restaurant.name, slug: restaurant.slug },
      categories: toGuestMenu(groupMenu(categoryRows, itemRows)),
    };
  }
}
