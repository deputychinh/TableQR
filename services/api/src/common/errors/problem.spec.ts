import { ErrorCode } from '../enums/error-code.enum.js';
import type { Response } from 'express';
import { sendProblem, toProblem } from './problem.js';

describe('toProblem', () => {
  it('derives code, title and type from the status', () => {
    expect(toProblem(404)).toEqual({
      type: 'https://tableqr.local/problems/not-found',
      title: 'Not Found',
      status: 404,
      code: ErrorCode.NotFound,
    });
  });

  it('keeps an explicit code, a string detail, extensions and the request instance', () => {
    expect(
      toProblem(409, {
        code: 'EMAIL_TAKEN',
        detail: 'Email đã được dùng',
        extensions: { field: 'email' },
        requestId: 'r1',
      }),
    ).toEqual({
      type: 'https://tableqr.local/problems/email-taken',
      title: 'Conflict',
      status: 409,
      code: 'EMAIL_TAKEN',
      detail: 'Email đã được dùng',
      field: 'email',
      instance: 'urn:tableqr:request:r1',
    });
  });

  it('never lets an extension overwrite a standard member', () => {
    const problem = toProblem(400, { extensions: { status: 200, code: 'X', type: 'evil' } });
    expect(problem).toMatchObject({ status: 400, code: ErrorCode.BadRequest });
    expect(problem.type).toBe('https://tableqr.local/problems/bad-request');
  });

  it('drops extensions named detail or instance when no such option is given', () => {
    const problem = toProblem(400, { extensions: { detail: 'x', instance: 'y', field: 'f' } });
    expect(problem).not.toHaveProperty('detail');
    expect(problem).not.toHaveProperty('instance');
    expect(problem.field).toBe('f');
  });

  it.each([
    [405, ErrorCode.MethodNotAllowed],
    [415, ErrorCode.UnsupportedMediaType],
    [422, ErrorCode.ValidationFailed],
    [418, ErrorCode.BadRequest],
    [500, ErrorCode.Internal],
    [502, ErrorCode.Internal],
  ])('maps status %i to %s', (status, code) => {
    expect(toProblem(status).code).toBe(code);
  });

  it('uses a generic title for unknown statuses', () => {
    expect(toProblem(599).title).toBe('Error');
  });
});

describe('sendProblem', () => {
  const fakeResponse = (headersSent: boolean) => {
    const calls: string[] = [];
    const response = {
      headersSent,
      end: () => calls.push('end'),
      status: (s: number) => {
        calls.push(`status:${s}`);
        return response;
      },
      type: (t: string) => {
        calls.push(`type:${t}`);
        return response;
      },
      send: (b: string) => calls.push(`send:${b.length > 0}`),
    };
    return { response, calls };
  };

  it('writes status, problem content type and body', () => {
    const { response, calls } = fakeResponse(false);
    sendProblem(response as unknown as Response, toProblem(404));
    expect(calls).toEqual(['status:404', 'type:application/problem+json', 'send:true']);
  });

  it('only ends the response when headers were already sent (e.g. an open stream)', () => {
    const { response, calls } = fakeResponse(true);
    sendProblem(response as unknown as Response, toProblem(500));
    expect(calls).toEqual(['end']);
  });
});
