import { z } from 'zod';

/** Longest skip reason a cook may type (same limit as a dish note). */
export const MAX_SKIP_REASON = 140;

const version = z.number().int().min(1);

/** Body of "Bắt đầu nấu" and "Đã ra bàn": the version the screen showed (compare-and-set). */
export const versionSchema = z.object({ version }).strict();

/** Body of "Xong": a blank reason counts as none (AC32 then asks for one when it is a skip). */
export const doneSchema = z
  .object({
    version,
    skipReason: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().max(MAX_SKIP_REASON))
      .transform((value) => (value === '' ? undefined : value))
      .optional(),
  })
  .strict();

export type DoneInput = z.infer<typeof doneSchema>;
