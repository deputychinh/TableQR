import { ErrorCode } from './error-code.enum.js';
import { toProblem } from './problem.js';

describe('toProblem', () => {
  it('derives code, title and type from the status', () => {
    expect(toProblem(404)).toEqual({
      type: 'https://tableqr.local/problems/not-found',
      title: 'Not Found',
      status: 404,
      code: ErrorCode.NotFound,
    });
  });

  it('keeps an explicit code and detail', () => {
    expect(toProblem(409, 'EMAIL_TAKEN', { field: 'email' })).toMatchObject({
      code: 'EMAIL_TAKEN',
      detail: { field: 'email' },
      title: 'Conflict',
    });
  });

  it('falls back to INTERNAL for unmapped statuses', () => {
    expect(toProblem(500).code).toBe(ErrorCode.Internal);
    expect(toProblem(599).title).toBe('Error');
  });
});
