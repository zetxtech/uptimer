import { z } from 'zod';

export const PROBE_KINDS = ['edgeone', 'durable_object', 'worker', 'server'] as const;
export const PROBE_SCOPES = ['domestic', 'overseas'] as const;

const probeIdSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'probe id must be lowercase alphanumeric or dashes');

export const createProbeInputSchema = z.object({
  id: probeIdSchema,
  name: z.string().trim().min(1).max(100),
  kind: z.enum(PROBE_KINDS),
  scope: z.enum(PROBE_SCOPES),
  region: z.string().trim().min(1).max(64),
  is_required: z.boolean().optional(),
});

export type CreateProbeInput = z.infer<typeof createProbeInputSchema>;

export const patchProbeInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    scope: z.enum(PROBE_SCOPES).optional(),
    region: z.string().trim().min(1).max(64).optional(),
    is_enabled: z.boolean().optional(),
    is_required: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type PatchProbeInput = z.infer<typeof patchProbeInputSchema>;

export const probeResultInputSchema = z.object({
  monitor_id: z.number().int().positive(),
  checked_at: z.number().int().positive(),
  status: z.enum(['up', 'down', 'unknown']),
  latency_ms: z.number().int().min(0).max(600_000).nullable().optional(),
  http_status: z.number().int().min(100).max(599).nullable().optional(),
  error: z.string().max(500).nullable().optional(),
  attempts: z.number().int().min(1).max(10).optional(),
});

export type ProbeResultInput = z.infer<typeof probeResultInputSchema>;

export const probeIngestBodySchema = z.object({
  probe_id: probeIdSchema.optional(),
  batch_id: z.string().trim().min(1).max(128),
  sent_at: z.number().int().positive().optional(),
  config_version: z.number().int().positive().optional(),
  results: z.array(probeResultInputSchema).min(1).max(64),
});

export type ProbeIngestBody = z.infer<typeof probeIngestBodySchema>;
