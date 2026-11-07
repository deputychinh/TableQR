import { DomainError } from '../../common/errors/domain.error.js';
import { assertRestaurantActive } from './restaurant-status.js';

const refusal = (restaurant: Parameters<typeof assertRestaurantActive>[0]) => {
  try {
    assertRestaurantActive(restaurant);
    return undefined;
  } catch (error: unknown) {
    if (!(error instanceof DomainError)) throw error;
    return { code: error.code, status: error.status, detail: error.detail };
  }
};

describe('assertRestaurantActive', () => {
  it('lets an active restaurant through', () => {
    expect(refusal({ status: 'active' })).toBeUndefined();
  });

  it('refuses a suspended restaurant with "Nhà hàng tạm ngưng"', () => {
    expect(refusal({ status: 'suspended' })).toEqual({
      code: 'RESTAURANT_SUSPENDED',
      status: 403,
      detail: 'Nhà hàng tạm ngưng',
    });
  });

  it('answers 404 for a missing restaurant, the same as a foreign one', () => {
    expect(refusal(undefined)).toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
