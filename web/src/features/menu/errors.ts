import { ApiError } from '@/api/client';
import { MAX_CATEGORY_NAME, MAX_ITEM_NAME, MAX_STATION_NAME } from './limits';

export interface Message {
  key: string;
  params?: Record<string, string | number>;
}

export interface DescribedError {
  fields: Record<string, Message>;
  form?: Message;
}

export type MenuForm = 'item' | 'category' | 'station';

const NAME_MAX: Record<MenuForm, number> = {
  item: MAX_ITEM_NAME,
  category: MAX_CATEGORY_NAME,
  station: MAX_STATION_NAME,
};

const PRICE_KEYS: Record<string, string> = {
  too_small: 'menu.errors.priceTooSmall',
  too_big: 'menu.errors.priceTooBig',
};

const FORM_CODES: Record<string, string> = {
  CATEGORY_NOT_EMPTY: 'menu.errors.categoryNotEmpty',
  STATION_NOT_EMPTY: 'menu.errors.stationNotEmpty',
  LAST_STATION: 'menu.errors.lastStation',
  NOT_FOUND: 'menu.errors.notFound',
  FORBIDDEN: 'menu.errors.forbidden',
  STATION_LIMIT_REACHED: 'menu.errors.stationLimit',
  CATEGORY_LIMIT_REACHED: 'menu.errors.categoryLimit',
  ITEM_LIMIT_REACHED: 'menu.errors.itemLimit',
  NETWORK: 'errors.network',
};

const fieldMessage = (form: MenuForm, path: string, code: string): Message | undefined => {
  switch (path) {
    case 'name':
      return { key: 'menu.errors.name', params: { max: NAME_MAX[form] } };
    case 'priceVnd':
      return { key: PRICE_KEYS[code] ?? 'menu.errors.priceNotWhole' };
    case 'description':
      return { key: 'menu.errors.description' };
    case 'lateAfterMinutes':
      return { key: 'menu.errors.late' };
    case 'categoryId':
    case 'stationId':
      return { key: 'menu.errors.choose' };
    default:
      return undefined;
  }
};

/** Maps an API error from a menu call to field messages and/or one form message (locale keys). */
export const describeMenuError = (error: unknown, form: MenuForm): DescribedError => {
  if (!(error instanceof ApiError)) return { fields: {}, form: { key: 'errors.unexpected' } };
  if (error.code === 'NAME_TAKEN') {
    return { fields: { name: { key: 'menu.errors.nameTaken' } } };
  }
  const formKey = FORM_CODES[error.code];
  if (formKey) return { fields: {}, form: { key: formKey } };
  if (error.code === 'VALIDATION_FAILED') {
    const fields: Record<string, Message> = {};
    for (const field of error.fields) {
      const message = fieldMessage(form, field.path, field.code);
      if (message) fields[field.path] = message;
    }
    if (Object.keys(fields).length > 0) return { fields };
  }
  return { fields: {}, form: { key: 'errors.unexpected' } };
};
