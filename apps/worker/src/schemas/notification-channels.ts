import { z } from 'zod';

import {
  barkChannelConfigSchema,
  customWebhookChannelConfigSchema,
  notificationEventTypeSchema,
  resendChannelConfigSchema,
  smtpChannelConfigSchema,
} from '@uptimer/db';
import { validateHttpTarget, validateTcpTarget } from '../monitor/targets';

const workerSecretRefSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'secret ref must be a valid Workers binding name');

const telegramChatIdSchema = z.preprocess(
  (value) => (typeof value === 'number' ? String(value) : value),
  z.string().trim().min(1).max(256),
);

const telegramBotTokenSchema = z.string().trim().min(1).max(4096);

const notificationChannelTimeoutMsSchema = z.number().int().min(1).max(60000).optional();
const notificationMessageTemplateSchema = z.string().min(1).max(10_000).optional();

const telegramChannelBaseInputSchema = z.object({
  preset: z.literal('telegram'),
  chat_id: telegramChatIdSchema,
  bot_token: telegramBotTokenSchema.optional(),
  bot_token_secret_ref: workerSecretRefSchema.optional(),
  message_thread_id: z.number().int().positive().optional(),
  timeout_ms: notificationChannelTimeoutMsSchema,
  message_template: notificationMessageTemplateSchema,
  enabled_events: z.array(notificationEventTypeSchema).min(1).optional(),
  parse_mode: z.enum(['Markdown', 'MarkdownV2', 'HTML']).optional(),
  disable_notification: z.boolean().optional(),
  protect_content: z.boolean().optional(),
});

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export const telegramChannelCreateInputSchema = telegramChannelBaseInputSchema.superRefine(
  (val, ctx) => {
    const hasDirectToken = hasText(val.bot_token);
    const hasSecretRef = hasText(val.bot_token_secret_ref);

    if (hasDirectToken === hasSecretRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bot_token'],
        message: 'provide exactly one of bot_token or bot_token_secret_ref',
      });
    }
  },
);

export const telegramChannelPatchInputSchema = telegramChannelBaseInputSchema.superRefine(
  (val, ctx) => {
    const hasDirectToken = hasText(val.bot_token);
    const hasSecretRef = hasText(val.bot_token_secret_ref);

    if (hasDirectToken && hasSecretRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bot_token'],
        message: 'provide only one of bot_token or bot_token_secret_ref',
      });
    }
  },
);

export type TelegramChannelCreateInput = z.infer<typeof telegramChannelCreateInputSchema>;
export type TelegramChannelPatchInput = z.infer<typeof telegramChannelPatchInputSchema>;

export const createNotificationChannelInputSchema = z
  .object({
    name: z.string().min(1),
    type: z.literal('webhook').default('webhook'),
    config_json: z.union([
      customWebhookChannelConfigSchema,
      telegramChannelCreateInputSchema,
      barkChannelConfigSchema,
      resendChannelConfigSchema,
      smtpChannelConfigSchema,
    ]),
    is_active: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    const config = value.config_json;
    const error =
      config.preset === 'smtp'
        ? validateTcpTarget(`${config.host}:${config.port}`)
        : config.preset === 'bark'
          ? validateHttpTarget(config.server_url)
          : null;
    if (error)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config_json', config.preset === 'bark' ? 'server_url' : 'host'],
        message: error,
      });
  });

export type CreateNotificationChannelInput = z.infer<typeof createNotificationChannelInputSchema>;

export const patchNotificationChannelInputSchema = z
  .object({
    name: z.string().min(1).optional(),
    config_json: z
      .union([
        customWebhookChannelConfigSchema,
        telegramChannelPatchInputSchema,
        barkChannelConfigSchema,
        resendChannelConfigSchema,
        smtpChannelConfigSchema,
      ])
      .optional(),
    is_active: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    const config = value.config_json;
    const error =
      config?.preset === 'smtp'
        ? validateTcpTarget(`${config.host}:${config.port}`)
        : config?.preset === 'bark'
          ? validateHttpTarget(config.server_url)
          : null;
    if (error)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['config_json', config?.preset === 'bark' ? 'server_url' : 'host'],
        message: error,
      });
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: 'At least one field must be provided',
  });

export type PatchNotificationChannelInput = z.infer<typeof patchNotificationChannelInputSchema>;
