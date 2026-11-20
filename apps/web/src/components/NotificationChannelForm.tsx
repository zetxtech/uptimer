import { useMemo, useState } from 'react';
import type {
  CreateNotificationChannelInput,
  CustomWebhookChannelConfig,
  NotificationChannel,
  NotificationChannelPreset,
  TelegramChannelConfig,
  TelegramParseMode,
  WebhookChannelConfig,
} from '../api/types';
import { useI18n } from '../app/I18nContext';
import { Select } from './Select';
import { CheckboxRow, FormCollapse, FormPageShell, FormRow } from './formPage';
import {
  Button,
  FIELD_HELP_CLASS,
  FIELD_LABEL_CLASS,
  INPUT_CLASS,
  SELECT_CLASS,
  TEXTAREA_CLASS,
  cn,
} from './ui';

interface NotificationChannelFormProps {
  channel?: NotificationChannel | undefined;
  onSubmit: (data: CreateNotificationChannelInput) => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | undefined;
}

const inputClass = INPUT_CLASS;
const selectClass = SELECT_CLASS;
const textareaClass = TEXTAREA_CLASS;
const labelClass = FIELD_LABEL_CLASS;

type NotificationEventType = NonNullable<WebhookChannelConfig['enabled_events']>[number];
type WebhookMethod = NonNullable<CustomWebhookChannelConfig['method']>;
type WebhookPayloadType = NonNullable<CustomWebhookChannelConfig['payload_type']>;
type TelegramParseModeInput = '' | TelegramParseMode;
type TelegramTokenMode = 'token' | 'secret_ref';

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function isTelegramConfig(
  config: WebhookChannelConfig | undefined,
): config is TelegramChannelConfig {
  return config?.preset === 'telegram';
}

function hasAdvancedTelegramConfig(config: TelegramChannelConfig | undefined): boolean {
  if (!config) return false;

  return Boolean(
    config.bot_token_source === 'secret_ref' ||
    config.bot_token_secret_ref ||
    config.message_thread_id !== undefined ||
    config.timeout_ms !== undefined ||
    config.message_template ||
    (config.enabled_events && config.enabled_events.length > 0) ||
    config.parse_mode ||
    config.disable_notification ||
    config.protect_content,
  );
}

function toMethod(value: string): WebhookMethod {
  switch (value) {
    case 'GET':
    case 'POST':
    case 'PUT':
    case 'PATCH':
    case 'DELETE':
    case 'HEAD':
      return value;
    default:
      return 'POST';
  }
}

function toPayloadType(value: string): WebhookPayloadType {
  switch (value) {
    case 'json':
    case 'param':
    case 'x-www-form-urlencoded':
      return value;
    default:
      return 'json';
  }
}

function toTelegramParseMode(value: string): TelegramParseModeInput {
  switch (value) {
    case 'Markdown':
    case 'MarkdownV2':
    case 'HTML':
      return value;
    default:
      return '';
  }
}

export function NotificationChannelForm({
  channel,
  onSubmit,
  onCancel,
  isLoading,
  error,
}: NotificationChannelFormProps) {
  const { t } = useI18n();
  const initialConfig = channel?.config_json;
  const initialIsTelegram = isTelegramConfig(initialConfig);
  const customConfig =
    initialConfig?.preset === 'custom' || initialConfig?.preset === undefined
      ? (initialConfig as CustomWebhookChannelConfig | undefined)
      : undefined;
  const telegramConfig = initialIsTelegram
    ? (initialConfig as TelegramChannelConfig | undefined)
    : undefined;

  const [name, setName] = useState(channel?.name ?? '');
  const [preset, setPreset] = useState<NotificationChannelPreset>(
    initialConfig?.preset ?? 'custom',
  );
  const initialBark = initialConfig?.preset === 'bark' ? initialConfig : undefined;
  const initialResend = initialConfig?.preset === 'resend' ? initialConfig : undefined;
  const initialSmtp = initialConfig?.preset === 'smtp' ? initialConfig : undefined;
  const initialEmail = initialResend ?? initialSmtp;
  const [barkServer, setBarkServer] = useState(initialBark?.server_url ?? 'https://api.day.app');
  const [barkSecret, setBarkSecret] = useState(
    initialBark?.device_key_secret_ref ?? 'UPTIMER_BARK_DEVICE_KEY',
  );
  const [resendSecret, setResendSecret] = useState(
    initialResend?.api_key_secret_ref ?? 'UPTIMER_RESEND_API_KEY',
  );
  const [smtpSecret, setSmtpSecret] = useState(
    initialSmtp?.password_secret_ref ?? 'UPTIMER_SMTP_PASSWORD',
  );
  const [smtpHost, setSmtpHost] = useState(initialSmtp?.host ?? '');
  const [smtpPort, setSmtpPort] = useState(initialSmtp?.port ?? 465);
  const [smtpUsername, setSmtpUsername] = useState(initialSmtp?.username ?? '');
  const [emailFrom, setEmailFrom] = useState(initialEmail?.from ?? '');
  const [emailTo, setEmailTo] = useState(initialEmail?.to.join(', ') ?? '');
  const [subjectPrefix, setSubjectPrefix] = useState(initialEmail?.subject_prefix ?? '');
  const [url, setUrl] = useState(customConfig?.url ?? '');
  const [method, setMethod] = useState<WebhookMethod>(customConfig?.method ?? 'POST');

  const [timeoutMs, setTimeoutMs] = useState<number>(initialConfig?.timeout_ms ?? 5000);
  const [payloadType, setPayloadType] = useState<WebhookPayloadType>(
    customConfig?.payload_type ?? 'json',
  );

  const [headersJson, setHeadersJson] = useState(safeJsonStringify(customConfig?.headers ?? {}));

  const [messageTemplate, setMessageTemplate] = useState(initialConfig?.message_template ?? '');
  const [payloadTemplateJson, setPayloadTemplateJson] = useState(
    customConfig?.payload_template !== undefined
      ? safeJsonStringify(customConfig.payload_template)
      : '',
  );

  const [enabledEvents, setEnabledEvents] = useState<NotificationEventType[]>(
    initialConfig?.enabled_events ?? [],
  );

  const [signingEnabled, setSigningEnabled] = useState<boolean>(
    customConfig?.signing?.enabled ?? false,
  );
  const [signingSecretRef, setSigningSecretRef] = useState<string>(
    customConfig?.signing?.secret_ref ?? '',
  );
  const [showSigning, setShowSigning] = useState<boolean>(customConfig?.signing?.enabled ?? false);

  const [showAdvancedTelegram, setShowAdvancedTelegram] = useState<boolean>(() =>
    hasAdvancedTelegramConfig(telegramConfig),
  );
  const [telegramTokenMode, setTelegramTokenMode] = useState<TelegramTokenMode>(
    telegramConfig?.bot_token_source === 'secret_ref' || telegramConfig?.bot_token_secret_ref
      ? 'secret_ref'
      : 'token',
  );
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramBotTokenSecretRef, setTelegramBotTokenSecretRef] = useState(
    telegramConfig?.bot_token_secret_ref ?? 'UPTIMER_TELEGRAM_BOT_TOKEN',
  );
  const [telegramChatId, setTelegramChatId] = useState(telegramConfig?.chat_id ?? '');
  const [telegramMessageThreadId, setTelegramMessageThreadId] = useState(
    telegramConfig?.message_thread_id !== undefined ? String(telegramConfig.message_thread_id) : '',
  );
  const [telegramParseMode, setTelegramParseMode] = useState<TelegramParseModeInput>(
    telegramConfig?.parse_mode ?? '',
  );
  const [telegramDisableNotification, setTelegramDisableNotification] = useState<boolean>(
    telegramConfig?.disable_notification ?? false,
  );
  const [telegramProtectContent, setTelegramProtectContent] = useState<boolean>(
    telegramConfig?.protect_content ?? false,
  );

  const headersParse = useMemo(() => {
    if (preset !== 'custom') return { ok: true as const, value: {} as Record<string, string> };

    const trimmed = headersJson.trim();
    if (!trimmed) return { ok: true as const, value: {} as Record<string, string> };

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return { ok: false as const, error: t('notification_form.error_headers_invalid_json') };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false as const,
        error: t('notification_form.error_headers_must_object'),
      };
    }

    for (const [k, vv] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof vv !== 'string') {
        return {
          ok: false as const,
          error: t('notification_form.error_header_value_string', { key: k }),
        };
      }
    }

    return { ok: true as const, value: parsed as Record<string, string> };
  }, [headersJson, preset, t]);

  const payloadTemplateParse = useMemo(() => {
    if (preset !== 'custom') {
      return { ok: true as const, value: undefined as unknown };
    }

    const trimmed = payloadTemplateJson.trim();
    if (!trimmed) return { ok: true as const, value: undefined as unknown };

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return {
        ok: false as const,
        error: t('notification_form.error_payload_template_invalid_json'),
      };
    }

    return { ok: true as const, value: parsed };
  }, [payloadTemplateJson, preset, t]);

  const telegramHasStoredToken = Boolean(
    telegramConfig?.bot_token_configured ||
    telegramConfig?.bot_token_secret_ref ||
    telegramConfig?.bot_token_source,
  );
  const telegramUsesSecretRef = showAdvancedTelegram && telegramTokenMode === 'secret_ref';
  const telegramHasUsableToken = telegramUsesSecretRef
    ? telegramBotTokenSecretRef.trim().length > 0
    : telegramBotToken.trim().length > 0 || Boolean(channel && telegramHasStoredToken);
  const [attempted, setAttempted] = useState(false);

  const issues: string[] = [];
  if (!headersParse.ok) issues.push(headersParse.error);
  if (!payloadTemplateParse.ok) issues.push(payloadTemplateParse.error);
  if (preset === 'telegram' && telegramChatId.trim().length === 0) {
    issues.push(t('notification_form.issue_chat_id'));
  }
  if (preset === 'telegram' && !telegramHasUsableToken) {
    issues.push(t('notification_form.issue_bot_token'));
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (issues.length > 0) return;

    if (preset === 'telegram') {
      const config: TelegramChannelConfig = {
        preset: 'telegram',
        chat_id: telegramChatId.trim(),
      };

      if (telegramUsesSecretRef) {
        config.bot_token_secret_ref = telegramBotTokenSecretRef.trim();
      } else if (telegramBotToken.trim()) {
        config.bot_token = telegramBotToken.trim();
      }
      if (showAdvancedTelegram) {
        if (telegramMessageThreadId.trim()) {
          const parsed = Number(telegramMessageThreadId);
          if (Number.isInteger(parsed) && parsed > 0) {
            config.message_thread_id = parsed;
          }
        }
        if (timeoutMs) {
          config.timeout_ms = timeoutMs;
        }
        if (messageTemplate.trim()) {
          config.message_template = messageTemplate;
        }
        if (enabledEvents.length > 0) {
          config.enabled_events = enabledEvents;
        }
        if (telegramParseMode) {
          config.parse_mode = telegramParseMode;
        }
        if (telegramDisableNotification) {
          config.disable_notification = true;
        }
        if (telegramProtectContent) {
          config.protect_content = true;
        }
      }

      onSubmit({ name, type: 'webhook', config_json: config });
      return;
    }

    if (preset === 'bark' || preset === 'resend' || preset === 'smtp') {
      const options = {
        timeout_ms: timeoutMs,
        ...(messageTemplate.trim() ? { message_template: messageTemplate } : {}),
        ...(enabledEvents.length ? { enabled_events: enabledEvents } : {}),
      };
      const email = {
        from: emailFrom.trim(),
        to: emailTo
          .split(',')
          .map((address) => address.trim())
          .filter(Boolean),
        ...(subjectPrefix.trim() ? { subject_prefix: subjectPrefix.trim() } : {}),
      };
      const config: WebhookChannelConfig =
        preset === 'bark'
          ? {
              preset,
              server_url: barkServer.trim(),
              device_key_secret_ref: barkSecret.trim(),
              ...options,
            }
          : preset === 'resend'
            ? { preset, api_key_secret_ref: resendSecret.trim(), ...email, ...options }
            : {
                preset,
                host: smtpHost.trim(),
                port: smtpPort,
                username: smtpUsername.trim(),
                password_secret_ref: smtpSecret.trim(),
                ...email,
                ...options,
              };
      onSubmit({ name, type: 'webhook', config_json: config });
      return;
    }

    const config: CustomWebhookChannelConfig = {
      preset: 'custom',
      url,
      method,
      timeout_ms: timeoutMs,
      payload_type: payloadType,
    };

    if (headersParse.ok && Object.keys(headersParse.value).length > 0) {
      config.headers = headersParse.value;
    }

    if (messageTemplate.trim()) {
      config.message_template = messageTemplate;
    }

    if (payloadTemplateParse.ok && payloadTemplateParse.value !== undefined) {
      config.payload_template = payloadTemplateParse.value;
    }

    if (enabledEvents.length > 0) {
      config.enabled_events = enabledEvents;
    }

    if (signingEnabled) {
      config.signing = { enabled: true, secret_ref: signingSecretRef };
    }

    onSubmit({ name, type: 'webhook', config_json: config });
  };

  const toggleEnabledEvent = (ev: NotificationEventType) => {
    setEnabledEvents((prev) => (prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]));
  };

  const handlePresetChange = (next: NotificationChannelPreset) => {
    setPreset(next);
    if (!channel && !name.trim()) {
      setName(
        next === 'custom'
          ? 'Webhook'
          : next === 'smtp'
            ? 'SMTP'
            : next[0]!.toUpperCase() + next.slice(1),
      );
    }
  };

  const allEvents: NotificationEventType[] = [
    'monitor.down',
    'monitor.up',
    'monitor.ssl_expiring',
    'monitor.domain_expiring',
    'probe.offline',
    'probe.online',
    'incident.created',
    'incident.updated',
    'incident.resolved',
    'maintenance.started',
    'maintenance.ended',
  ];

  return (
    <form onSubmit={handleSubmit} noValidate aria-labelledby="admin-modal-title">
      <FormPageShell
        backLabel={t('admin_dashboard.tab.notifications')}
        onBack={onCancel}
        backDisabled={isLoading}
        title={channel ? t('admin_dashboard.edit_channel') : t('admin_dashboard.create_channel')}
        error={error}
        errorTitle={channel ? t('form.error_save') : t('form.error_create')}
        issues={attempted ? issues : []}
        primaryAction={
          <Button type="submit" disabled={isLoading} className="min-w-40">
            {isLoading ? t('common.saving') : channel ? t('common.update') : t('common.create')}
          </Button>
        }
      >
        <FormRow
          label={t('notification_form.section_channel')}
          description={t('notification_form.section_channel_hint')}
        >
          <div>
            <label className={labelClass}>{t('notification_form.name')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>{t('notification_form.preset')}</label>
            <div
              role="group"
              aria-label={t('notification_form.preset')}
              className="flex flex-wrap gap-1.5 rounded-lg border border-line bg-surface-2 p-1.5 dark:border-line dark:bg-surface-2"
            >
              {(
                [
                  {
                    value: 'custom',
                    label: t('notification_form.preset_custom_short'),
                    title: t('notification_form.preset_custom'),
                  },
                  {
                    value: 'telegram',
                    label: t('notification_form.preset_telegram'),
                    title: t('notification_form.preset_telegram'),
                  },
                  { value: 'bark', label: 'Bark', title: 'Bark' },
                  { value: 'resend', label: 'Resend', title: 'Resend' },
                  { value: 'smtp', label: 'SMTP', title: 'SMTP' },
                ] as const
              ).map((item) => {
                const active = preset === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    title={item.title}
                    aria-pressed={active}
                    onClick={() => handlePresetChange(item.value)}
                    className={cn(
                      'h-9 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors',
                      active
                        ? 'bg-surface text-ink shadow-sm dark:bg-surface-2 dark:text-ink'
                        : 'text-ink-2 hover:bg-surface hover:text-ink dark:text-ink-3 dark:hover:bg-surface-2 dark:hover:text-ink',
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <div className={FIELD_HELP_CLASS}>
              {preset === 'telegram'
                ? t('notification_form.preset_telegram_help')
                : preset === 'custom'
                  ? t('notification_form.preset_custom_help')
                  : t('notification_form.provider_secret_help')}
            </div>
          </div>

          {preset === 'custom' ? (
            <>
              <div>
                <label className={labelClass}>{t('notification_form.webhook_url')}</label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={t('notification_form.webhook_url_placeholder')}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
                <div>
                  <label className={labelClass}>{t('notification_form.method')}</label>
                  <Select
                    value={method}
                    onChange={(next) => setMethod(toMethod(next))}
                    className={selectClass}
                  >
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                    <option value="GET">GET</option>
                    <option value="HEAD">HEAD</option>
                  </Select>
                </div>

                <div>
                  <label className={labelClass}>{t('notification_form.payload_type')}</label>
                  <Select
                    value={payloadType}
                    onChange={(next) => setPayloadType(toPayloadType(next))}
                    className={selectClass}
                  >
                    <option value="json">{t('notification_form.payload_type_json')}</option>
                    <option value="param">{t('notification_form.payload_type_query')}</option>
                    <option value="x-www-form-urlencoded">
                      {t('notification_form.payload_type_urlencoded')}
                    </option>
                  </Select>
                  <div className={FIELD_HELP_CLASS}>{t('notification_form.payload_type_help')}</div>
                </div>
              </div>

              <div>
                <label className={labelClass}>{t('notification_form.headers_json')}</label>
                <textarea
                  value={headersJson}
                  onChange={(e) => setHeadersJson(e.target.value)}
                  className={textareaClass}
                  rows={3}
                  placeholder={t('notification_form.headers_placeholder')}
                />
                {!headersParse.ok && (
                  <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {headersParse.error}
                  </div>
                )}
                <div className={FIELD_HELP_CLASS}>{t('notification_form.headers_help')}</div>
              </div>
            </>
          ) : preset === 'telegram' ? (
            <>
              {!telegramUsesSecretRef && (
                <div>
                  <label className={labelClass}>{t('notification_form.telegram_bot_token')}</label>
                  <input
                    type="password"
                    value={telegramBotToken}
                    onChange={(e) => setTelegramBotToken(e.target.value)}
                    className={inputClass}
                    placeholder={t('notification_form.telegram_bot_token_placeholder')}
                  />
                  <div className={FIELD_HELP_CLASS}>
                    {channel && telegramHasStoredToken
                      ? t('notification_form.telegram_bot_token_keep_help')
                      : t('notification_form.telegram_bot_token_help')}
                  </div>
                </div>
              )}

              <div>
                <label className={labelClass}>{t('notification_form.telegram_chat_id')}</label>
                <div className="sm:max-w-xs">
                  <input
                    type="text"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    className={inputClass}
                    placeholder={t('notification_form.telegram_chat_id_placeholder')}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-ink dark:text-ink-2">
                <input
                  type="checkbox"
                  checked={showAdvancedTelegram}
                  onChange={(e) => setShowAdvancedTelegram(e.target.checked)}
                />
                <span>{t('notification_form.advanced_options')}</span>
              </label>

              {showAdvancedTelegram && (
                <div className="space-y-4 border-t border-line pt-4">
                  <div>
                    <label className={labelClass}>
                      {t('notification_form.telegram_token_source')}
                    </label>
                    <Select
                      value={telegramTokenMode}
                      onChange={(next) => setTelegramTokenMode(next as TelegramTokenMode)}
                      className={selectClass}
                    >
                      <option value="token">
                        {t('notification_form.telegram_token_source_encrypted')}
                      </option>
                      <option value="secret_ref">
                        {t('notification_form.telegram_token_source_secret_ref')}
                      </option>
                    </Select>
                    <div className={FIELD_HELP_CLASS}>
                      {t('notification_form.telegram_token_source_help')}
                    </div>
                  </div>

                  {telegramUsesSecretRef ? (
                    <div>
                      <label className={labelClass}>
                        {t('notification_form.telegram_bot_token_secret_ref')}
                      </label>
                      <input
                        type="text"
                        value={telegramBotTokenSecretRef}
                        onChange={(e) => setTelegramBotTokenSecretRef(e.target.value)}
                        className={inputClass}
                        placeholder={t(
                          'notification_form.telegram_bot_token_secret_ref_placeholder',
                        )}
                      />
                      <div className={FIELD_HELP_CLASS}>
                        {t('notification_form.telegram_bot_token_secret_ref_help')}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>
                        {t('notification_form.telegram_parse_mode')}
                      </label>
                      <Select
                        value={telegramParseMode}
                        onChange={(next) => setTelegramParseMode(toTelegramParseMode(next))}
                        className={selectClass}
                      >
                        <option value="">{t('notification_form.telegram_parse_mode_none')}</option>
                        <option value="MarkdownV2">MarkdownV2</option>
                        <option value="HTML">HTML</option>
                        <option value="Markdown">Markdown</option>
                      </Select>
                    </div>
                    <div>
                      <label className={labelClass}>
                        {t('notification_form.telegram_message_thread_id_optional')}
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={telegramMessageThreadId}
                        onChange={(e) => setTelegramMessageThreadId(e.target.value)}
                        className={inputClass}
                        placeholder={t('notification_form.telegram_message_thread_id_placeholder')}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>{t('notification_form.timeout_ms')}</label>
                    <div className="w-28">
                      <input
                        type="number"
                        min={1}
                        max={60000}
                        value={timeoutMs}
                        onChange={(e) => setTimeoutMs(Number(e.target.value))}
                        className={cn(inputClass, 'font-mono tabular-nums')}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>
                      {t('notification_form.message_template_optional')}
                    </label>
                    <textarea
                      value={messageTemplate}
                      onChange={(e) => setMessageTemplate(e.target.value)}
                      className={textareaClass}
                      rows={3}
                      placeholder={t('notification_form.message_template_placeholder')}
                    />
                    <div className={FIELD_HELP_CLASS}>
                      {t('notification_form.message_template_help')}
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>
                      {t('notification_form.enabled_events_optional')}
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {allEvents.map((ev) => (
                        <label
                          key={ev}
                          className="flex items-center gap-2 text-sm text-ink dark:text-ink-2"
                        >
                          <input
                            type="checkbox"
                            checked={enabledEvents.includes(ev)}
                            onChange={() => toggleEnabledEvent(ev)}
                          />
                          <span>{ev}</span>
                        </label>
                      ))}
                    </div>
                    <div className={FIELD_HELP_CLASS}>
                      {t('notification_form.enabled_events_help')}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-ink dark:text-ink-2">
                      <input
                        type="checkbox"
                        checked={telegramDisableNotification}
                        onChange={(e) => setTelegramDisableNotification(e.target.checked)}
                      />
                      <span>{t('notification_form.telegram_disable_notification')}</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm text-ink dark:text-ink-2">
                      <input
                        type="checkbox"
                        checked={telegramProtectContent}
                        onChange={(e) => setTelegramProtectContent(e.target.checked)}
                      />
                      <span>{t('notification_form.telegram_protect_content')}</span>
                    </label>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {preset === 'bark' && (
                <div>
                  <label className={labelClass}>{t('notification_form.bark_server')}</label>
                  <input
                    type="url"
                    value={barkServer}
                    onChange={(event) => setBarkServer(event.target.value)}
                    className={inputClass}
                  />
                </div>
              )}
              {preset === 'smtp' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>{t('notification_form.smtp_host')}</label>
                      <input
                        value={smtpHost}
                        onChange={(event) => setSmtpHost(event.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>{t('notification_form.smtp_port')}</label>
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        value={smtpPort}
                        onChange={(event) => setSmtpPort(Number(event.target.value))}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div className={FIELD_HELP_CLASS}>{t('notification_form.smtp_tls_help')}</div>
                  <div>
                    <label className={labelClass}>{t('notification_form.smtp_username')}</label>
                    <input
                      value={smtpUsername}
                      onChange={(event) => setSmtpUsername(event.target.value)}
                      className={inputClass}
                    />
                  </div>
                </>
              )}
              <div>
                <label className={labelClass}>{t('notification_form.provider_secret_ref')}</label>
                <div className="sm:max-w-sm">
                  <input
                    value={
                      preset === 'bark'
                        ? barkSecret
                        : preset === 'resend'
                          ? resendSecret
                          : smtpSecret
                    }
                    onChange={(event) =>
                      preset === 'bark'
                        ? setBarkSecret(event.target.value)
                        : preset === 'resend'
                          ? setResendSecret(event.target.value)
                          : setSmtpSecret(event.target.value)
                    }
                    pattern="[A-Za-z_][A-Za-z0-9_]*"
                    className={cn(inputClass, 'font-mono')}
                  />
                </div>
              </div>
              {preset !== 'bark' && (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>{t('notification_form.email_from')}</label>
                      <input
                        type="email"
                        value={emailFrom}
                        onChange={(event) => setEmailFrom(event.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>{t('notification_form.email_to')}</label>
                      <input
                        type="email"
                        multiple
                        value={emailTo}
                        onChange={(event) => setEmailTo(event.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>
                      {t('notification_form.email_subject_prefix')}
                    </label>
                    <input
                      value={subjectPrefix}
                      onChange={(event) => setSubjectPrefix(event.target.value)}
                      className={inputClass}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </FormRow>

        <FormRow
          label={t('notification_form.section_delivery')}
          description={t('notification_form.section_delivery_hint')}
        >
          {preset !== 'telegram' && (
            <>
              <div>
                <label className={labelClass}>{t('notification_form.timeout_ms')}</label>
                <div className="w-28">
                  <input
                    type="number"
                    min={1}
                    max={60000}
                    value={timeoutMs}
                    onChange={(e) => setTimeoutMs(Number(e.target.value))}
                    className={cn(inputClass, 'font-mono tabular-nums')}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  {t('notification_form.message_template_optional')}
                </label>
                <textarea
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  className={textareaClass}
                  rows={3}
                  placeholder={t('notification_form.message_template_placeholder')}
                />
                <div className={FIELD_HELP_CLASS}>
                  {t('notification_form.message_template_help')}
                </div>
              </div>

              {preset === 'custom' && (
                <div>
                  <label className={labelClass}>
                    {t('notification_form.payload_template_optional')}
                  </label>
                  <textarea
                    value={payloadTemplateJson}
                    onChange={(e) => setPayloadTemplateJson(e.target.value)}
                    className={textareaClass}
                    rows={8}
                    placeholder={
                      payloadType === 'json'
                        ? t('notification_form.payload_template_placeholder_json')
                        : t('notification_form.payload_template_placeholder_flat')
                    }
                  />
                  {!payloadTemplateParse.ok && (
                    <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {payloadTemplateParse.error}
                    </div>
                  )}
                  <div className={FIELD_HELP_CLASS}>
                    {t('notification_form.payload_template_help')}
                  </div>
                </div>
              )}
            </>
          )}
        </FormRow>

        <FormRow
          label={t('notification_form.section_events')}
          description={t('notification_form.section_events_hint')}
        >
          <div>
            <label className={labelClass}>{t('notification_form.enabled_events_optional')}</label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {allEvents.map((ev) => (
                <CheckboxRow
                  key={ev}
                  id={`notification-channel-event-${ev}`}
                  label={ev}
                  checked={enabledEvents.includes(ev)}
                  onChange={() => toggleEnabledEvent(ev)}
                />
              ))}
            </div>
            <div className={FIELD_HELP_CLASS}>{t('notification_form.enabled_events_help')}</div>
          </div>
        </FormRow>

        {preset === 'custom' && (
          <FormCollapse
            id="notification-channel-signing"
            title={t('notification_form.advanced_signing')}
            open={showSigning}
            onToggle={() => setShowSigning((previous) => !previous)}
          >
            <div className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-7">
              <div className="md:pt-1">
                <p className="text-[13px] leading-[1.4rem] text-ink-2 dark:text-ink-3">
                  {t('notification_form.signing_hint')}
                </p>
              </div>
              <div className="min-w-0 space-y-4">
                <CheckboxRow
                  id="notification-channel-signing-enabled"
                  label={t('notification_form.signing_enable')}
                  checked={signingEnabled}
                  onChange={setSigningEnabled}
                />
                {signingEnabled && (
                  <div>
                    <label className={labelClass}>
                      {t('notification_form.signing_secret_ref')}
                    </label>
                    <input
                      type="text"
                      value={signingSecretRef}
                      onChange={(e) => setSigningSecretRef(e.target.value)}
                      className={inputClass}
                      placeholder={t('notification_form.signing_secret_ref_placeholder')}
                    />
                  </div>
                )}
              </div>
            </div>
          </FormCollapse>
        )}
      </FormPageShell>
    </form>
  );
}
