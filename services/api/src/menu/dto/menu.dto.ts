import { z } from 'zod';
import {
  MAX_CATEGORY_NAME,
  MAX_ITEM_DESCRIPTION,
  MAX_ITEM_NAME,
  MAX_STATION_NAME,
  normalizeName,
} from '../domain/names.js';
import { MAX_PRICE_VND, MIN_PRICE_VND } from '../domain/price.js';
import { MAX_LATE_MINUTES, MIN_LATE_MINUTES } from '../domain/station.js';

const name = (max: number) => z.string().transform(normalizeName).pipe(z.string().min(1).max(max));

/** Whole đồng in range; a fraction answers `invalid_type`, out of range `too_small` / `too_big` (AC7). */
export const priceVnd = z.number().int().min(MIN_PRICE_VND).max(MAX_PRICE_VND);
const lateAfterMinutes = z.number().int().min(MIN_LATE_MINUTES).max(MAX_LATE_MINUTES);
const description = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().max(MAX_ITEM_DESCRIPTION))
  .transform((value) => (value === '' ? null : value))
  .nullable();

export const createStationSchema = z
  .object({ name: name(MAX_STATION_NAME), lateAfterMinutes: lateAfterMinutes.optional() })
  .strict();
export const updateStationSchema = z
  .object({
    name: name(MAX_STATION_NAME).optional(),
    lateAfterMinutes: lateAfterMinutes.optional(),
  })
  .strict();

export const createCategorySchema = z
  .object({ name: name(MAX_CATEGORY_NAME), isMain: z.boolean().optional() })
  .strict();
export const updateCategorySchema = z
  .object({ name: name(MAX_CATEGORY_NAME).optional(), isMain: z.boolean().optional() })
  .strict();
export const moveCategorySchema = z.object({ direction: z.enum(['up', 'down']) }).strict();

export const createItemSchema = z
  .object({
    name: name(MAX_ITEM_NAME),
    priceVnd,
    categoryId: z.uuid(),
    stationId: z.uuid(),
    description: description.optional(),
    available: z.boolean().optional(),
  })
  .strict();
export const updateItemSchema = createItemSchema.partial().strict();
export const availabilitySchema = z.object({ available: z.boolean() }).strict();

export type CreateStationInput = z.infer<typeof createStationSchema>;
export type UpdateStationInput = z.infer<typeof updateStationSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
