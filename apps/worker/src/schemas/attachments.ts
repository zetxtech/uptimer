import { z } from 'zod';

// Attachments travel inline with the update payload as base64, so the cap is deliberately small:
// at most three files of 200 KB each (273068 base64 chars) keeps a request well inside Worker limits.
export const updateAttachmentsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(200),
      data: z
        .string()
        .max(273068)
        .regex(/^[A-Za-z0-9+/]*={0,2}$/)
        .refine((value) => {
          if (value.length % 4 !== 0) return false;
          try {
            return atob(value).length <= 200 * 1024;
          } catch {
            return false;
          }
        }),
    }),
  )
  .max(3);

export type UpdateAttachment = z.infer<typeof updateAttachmentsSchema>[number];

/** Download names only; the bytes stay in D1 until the client asks for them. */
export const attachmentNamesSchema = z.array(z.object({ name: z.string() }));
