import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';

/** Menu-specific error codes (kept in this context so parallel features do not collide). */
export enum MenuErrorCode {
  NameTaken = 'NAME_TAKEN',
  CategoryNotEmpty = 'CATEGORY_NOT_EMPTY',
  StationNotEmpty = 'STATION_NOT_EMPTY',
  LastStation = 'LAST_STATION',
  StationLimitReached = 'STATION_LIMIT_REACHED',
  CategoryLimitReached = 'CATEGORY_LIMIT_REACHED',
  ItemLimitReached = 'ITEM_LIMIT_REACHED',
}

export const notFound = (): DomainError => new DomainError(ErrorCode.NotFound, 404);

export const nameTaken = (): DomainError =>
  new DomainError(MenuErrorCode.NameTaken, 409, {
    detail: 'Tên này đã có. Hãy chọn tên khác.',
    extensions: { fields: [{ path: 'name', code: 'taken' }] },
  });

export const categoryNotEmpty = (): DomainError =>
  new DomainError(MenuErrorCode.CategoryNotEmpty, 409, {
    detail: 'Nhóm món này còn món. Hãy chuyển hoặc xoá các món trước.',
  });

export const stationNotEmpty = (): DomainError =>
  new DomainError(MenuErrorCode.StationNotEmpty, 409, {
    detail: 'Khu bếp này còn món. Hãy chuyển các món sang khu khác trước.',
  });

export const lastStation = (): DomainError =>
  new DomainError(MenuErrorCode.LastStation, 409, {
    detail: 'Cần ít nhất một khu bếp.',
  });

const LIMIT_DETAIL: Readonly<Record<string, string>> = {
  [MenuErrorCode.StationLimitReached]: 'Tối đa {max} khu bếp',
  [MenuErrorCode.CategoryLimitReached]: 'Tối đa {max} nhóm món',
  [MenuErrorCode.ItemLimitReached]: 'Tối đa {max} món',
};

/** A restaurant already has the maximum number of stations, categories or items (409). */
export const limitReached = (
  code:
    | MenuErrorCode.StationLimitReached
    | MenuErrorCode.CategoryLimitReached
    | MenuErrorCode.ItemLimitReached,
  max: number,
): DomainError =>
  new DomainError(code, 409, {
    detail: (LIMIT_DETAIL[code] ?? '').replace('{max}', String(max)),
    extensions: { max },
  });
