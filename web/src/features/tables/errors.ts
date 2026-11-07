import { ApiError } from '@/api/client';

export interface TableFormErrors {
  name?: string;
  seats?: string;
  form?: string;
}

/** Maps an API failure of add/edit to locale keys under the right field. */
export const describeTableError = (error: unknown): TableFormErrors => {
  if (!(error instanceof ApiError)) return { form: 'errors.unexpected' };
  switch (error.code) {
    case 'TABLE_NAME_TAKEN':
      return { name: 'tables.errors.nameTaken' };
    case 'TABLE_LIMIT_REACHED':
      return { form: 'tables.errors.limit' };
    case 'NOT_FOUND':
      return { form: 'tables.errors.gone' };
    case 'NETWORK':
      return { form: 'errors.network' };
    case 'VALIDATION_FAILED': {
      const paths = new Set(error.fields.map((field) => field.path));
      const described: TableFormErrors = {};
      if (paths.has('name')) described.name = 'tables.errors.name';
      if (paths.has('seats')) described.seats = 'tables.errors.seats';
      return described.name || described.seats ? described : { form: 'errors.unexpected' };
    }
    default:
      return { form: 'errors.unexpected' };
  }
};
