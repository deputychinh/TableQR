/** Only same-app paths are allowed as a return target after sign-in (no open redirect). */
export const safeNextPath = (next: unknown, fallback = '/quan-ly'): string =>
  typeof next === 'string' &&
  next.startsWith('/') &&
  !next.startsWith('//') &&
  !next.startsWith('/\\')
    ? next
    : fallback;
