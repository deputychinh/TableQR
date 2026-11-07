import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';
import type { ItemStatus } from './domain/item-status.js';

/** Kitchen and serving error codes (kept in this context so parallel features do not collide). */
export enum KitchenErrorCode {
  /** The item is not in the status this action starts from (e.g. cooking a cancelled item). */
  InvalidTransition = 'INVALID_TRANSITION',
  /** Someone changed the item since this screen loaded it. */
  StaleVersion = 'STALE_VERSION',
  /** AC32: an older order of the same dish is still waiting; say why this one goes first. */
  SkipReasonRequired = 'SKIP_REASON_REQUIRED',
}

export const notFound = (): DomainError => new DomainError(ErrorCode.NotFound, 404);

export const invalidTransition = (status: ItemStatus, version: number): DomainError =>
  new DomainError(KitchenErrorCode.InvalidTransition, 409, {
    detail: 'Món này đã đổi trạng thái. Màn hình sẽ tự cập nhật.',
    extensions: { status, version },
  });

export const staleVersion = (status: ItemStatus, version: number): DomainError =>
  new DomainError(KitchenErrorCode.StaleVersion, 409, {
    detail: 'Món này vừa được người khác cập nhật. Màn hình sẽ tự cập nhật.',
    extensions: { status, version },
  });

export interface SkippedItem {
  itemId: string;
  tableName: string;
}

export const skipReasonRequired = (older: readonly SkippedItem[]): DomainError =>
  new DomainError(KitchenErrorCode.SkipReasonRequired, 422, {
    detail: 'Có bàn gọi món này trước. Hãy ghi lý do làm bàn này trước.',
    extensions: { older },
  });
