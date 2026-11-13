import { z } from 'zod';

import { updateAttachmentsSchema } from './attachments';

export const incidentStatusSchema = z.enum([
  'investigating',
  'identified',
  'monitoring',
  'resolved',
]);
export const incidentImpactSchema = z.enum(['none', 'minor', 'major', 'critical']);

export const createIncidentInputSchema = z.object({
  title: z.string().min(1),
  // v0.x: create unresolved incidents only; use the resolve endpoint to close an incident.
  status: incidentStatusSchema.exclude(['resolved']).optional().default('investigating'),
  impact: incidentImpactSchema.optional().default('minor'),
  message: z.string().min(1).optional(),
  started_at: z.number().int().positive().optional(),
  monitor_ids: z.array(z.number().int().positive()).min(1),
});

export type CreateIncidentInput = z.infer<typeof createIncidentInputSchema>;

export const createIncidentUpdateInputSchema = z.object({
  message: z.string().min(1),
  status: incidentStatusSchema.exclude(['resolved']).optional(),
  attachments: updateAttachmentsSchema.default([]),
});

export type CreateIncidentUpdateInput = z.infer<typeof createIncidentUpdateInputSchema>;

export const resolveIncidentInputSchema = z.object({
  message: z.string().min(1).optional(),
});

export type ResolveIncidentInput = z.infer<typeof resolveIncidentInputSchema>;
