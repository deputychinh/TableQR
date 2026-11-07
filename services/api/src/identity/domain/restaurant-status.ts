import { ErrorCode } from '../../common/enums/error-code.enum.js';
import { DomainError } from '../../common/errors/domain.error.js';
import { restaurantSuspendedError } from '../identity.errors.js';

export type RestaurantStatus = 'active' | 'suspended';

/**
 * AC54: refuses a missing restaurant (404, the same answer as a foreign one) and a suspended one
 * (403 `RESTAURANT_SUSPENDED`, "Nhà hàng tạm ngưng"). Guest pages call this right after they
 * resolve the tenant from the table token.
 */
export const assertRestaurantActive = (
  restaurant: { status: RestaurantStatus } | undefined,
): void => {
  if (restaurant === undefined) throw new DomainError(ErrorCode.NotFound, 404);
  if (restaurant.status === 'suspended') throw restaurantSuspendedError();
};
