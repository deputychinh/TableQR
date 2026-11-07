/** Picks the results that may become a baseline: they exist, passed their guard and are recent. */
export const MAX_AGE_MS = 60 * 60 * 1000;

export const selectResults = (entries, now) => {
  const accepted = [];
  const rejected = [];
  for (const { name, result, mtimeMs } of entries) {
    if (!result) continue;
    if (result.passed !== true) rejected.push(`${name}: run did not pass its guard`);
    else if (now - mtimeMs > MAX_AGE_MS) rejected.push(`${name}: older than 1 hour — run it again`);
    else accepted.push(result);
  }
  return { accepted, rejected };
};
