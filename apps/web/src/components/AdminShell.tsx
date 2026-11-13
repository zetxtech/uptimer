import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

import {
  ADMIN_ANALYTICS_PATH,
  ADMIN_EVENTS_PATH,
  ADMIN_HEARTBEATS_PATH,
  ADMIN_PATH,
  ADMIN_PROBES_PATH,
  ADMIN_REPORTING_PATH,
} from '../app/adminPaths';
import { useAuth } from '../app/AuthContext';
import { useI18n } from '../app/I18nContext';
import type { MessageKey } from '../i18n/messages';
import { ThemeToggle, cn } from './ui';

export type AdminNavKey =
  | 'dashboard'
  | 'monitors'
  | 'notifications'
  | 'incidents'
  | 'maintenance'
  | 'settings'
  | 'events'
  | 'probes'
  | 'analytics'
  | 'reporting'
  | 'heartbeats'
  | 'status';

type NavItem = {
  key: AdminNavKey;
  to: string;
  labelKey: MessageKey;
  icon: string;
};

const NAV_ICONS: Record<AdminNavKey, string> = {
  dashboard:
    'M4 5a1 1 0 011-1h5a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm9 0a1 1 0 011-1h5a1 1 0 011 1v3a1 1 0 01-1 1h-5a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h5a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm9-3a1 1 0 011-1h5a1 1 0 011 1v7a1 1 0 01-1 1h-5a1 1 0 01-1-1v-7z',
  monitors: 'M3 12h3l2-6 4 12 2-6h7',
  notifications: 'M15 17H5l1.5-2V10a4.5 4.5 0 019 0v5l1.5 2h-2zm-5 2a2 2 0 004 0',
  incidents: 'M12 3 2.5 20h19L12 3zm0 6v4m0 3h.01',
  maintenance:
    'M14.7 6.3a4 4 0 00-5.4 5.4l-5.6 5.6a2 2 0 002.8 2.8l5.6-5.6a4 4 0 005.4-5.4l-2.4 2.4-2.8-2.8 2.4-2.4z',
  settings:
    'M12 8a4 4 0 100 8 4 4 0 000-8zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4',
  events:
    'M12 9v3.75m0 3h.008M20.618 5.984A15.557 15.557 0 0 1 12 2.25a15.557 15.557 0 0 1-8.618 3.734A15.58 15.58 0 0 0 3 9.75c0 6.116 3.52 11.154 9 12.75 5.48-1.596 9-6.634 9-12.75 0-1.293-.132-2.554-.382-3.766Z',
  probes:
    'M12 3v2m0 14v2M5.6 5.6l1.4 1.4m10 10l1.4 1.4M3 12h2m14 0h2M5.6 18.4L7 17m10-10l1.4-1.4M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  analytics: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  heartbeats: 'M3 12h3.2l1.9-5 3.2 10 2.1-5H21',
  reporting:
    'M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605',
  status: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
};

const NAV_ITEMS: NavItem[] = [
  {
    key: 'monitors',
    to: ADMIN_PATH,
    labelKey: 'admin_dashboard.tab.monitors',
    icon: NAV_ICONS.monitors,
  },
  {
    key: 'heartbeats',
    to: ADMIN_HEARTBEATS_PATH,
    labelKey: 'heartbeats.title',
    icon: NAV_ICONS.heartbeats,
  },
  { key: 'probes', to: ADMIN_PROBES_PATH, labelKey: 'probes.title', icon: NAV_ICONS.probes },
  { key: 'events', to: ADMIN_EVENTS_PATH, labelKey: 'events.title', icon: NAV_ICONS.events },
  {
    key: 'incidents',
    to: `${ADMIN_PATH}?tab=incidents`,
    labelKey: 'admin_dashboard.tab.incidents',
    icon: NAV_ICONS.incidents,
  },
  {
    key: 'maintenance',
    to: `${ADMIN_PATH}?tab=maintenance`,
    labelKey: 'admin_dashboard.tab.maintenance',
    icon: NAV_ICONS.maintenance,
  },
  {
    key: 'analytics',
    to: ADMIN_ANALYTICS_PATH,
    labelKey: 'admin_analytics.analytics_title',
    icon: NAV_ICONS.analytics,
  },
  {
    key: 'reporting',
    to: ADMIN_REPORTING_PATH,
    labelKey: 'reporting.title',
    icon: NAV_ICONS.reporting,
  },
  {
    key: 'notifications',
    to: `${ADMIN_PATH}?tab=notifications`,
    labelKey: 'admin_dashboard.tab.notifications',
    icon: NAV_ICONS.notifications,
  },
  {
    key: 'settings',
    to: `${ADMIN_PATH}?tab=settings`,
    labelKey: 'admin_dashboard.tab.settings',
    icon: NAV_ICONS.settings,
  },
  { key: 'status', to: '/', labelKey: 'common.status', icon: NAV_ICONS.status },
];

const NAV_GROUPS: Array<{ labelKey: MessageKey; keys: AdminNavKey[] }> = [
  { labelKey: 'admin_nav.monitoring', keys: ['monitors', 'heartbeats', 'probes'] },
  { labelKey: 'admin_nav.operations', keys: ['events', 'incidents', 'maintenance'] },
  { labelKey: 'admin_nav.insights', keys: ['analytics', 'reporting'] },
  { labelKey: 'admin_nav.manage', keys: ['notifications', 'settings', 'status'] },
];

function NavIcon({ path, className = 'h-4 w-4' }: { path: string; className?: string }) {
  return (
    <svg
      className={cn('shrink-0', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

function BrandMark() {
  return (
    <span className="ui-brand-mark" aria-hidden>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2.75 12h3.1l2.1-5.6 3.5 11.2 2.3-5.6h7.5" />
      </svg>
    </span>
  );
}

/** Sticky brand bar; `tabs` renders flush with its bottom hairline. */
export function AdminShell({
  active,
  tabs,
  layout = 'topbar',
  children,
  dashboardTab,
}: {
  active: AdminNavKey;
  tabs?: ReactNode;
  layout?: 'topbar' | 'sidebar';
  children?: ReactNode;
  dashboardTab?: 'monitors' | 'notifications' | 'incidents' | 'maintenance' | 'settings';
}) {
  const { t } = useI18n();
  const { logout } = useAuth();
  const { pathname } = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const activeItem =
    active === 'dashboard'
      ? (dashboardTab ?? (pathname.startsWith('/admin/incidents/') ? 'incidents' : 'monitors'))
      : active;

  if (layout === 'sidebar') {
    return (
      <div className="min-h-screen bg-app text-ink">
        <aside className="ui-admin-sidebar fixed inset-y-0 left-0 z-40 hidden w-[17rem] flex-col border-r md:flex">
          {/* Sidebar brand row aligns with the 52 px workspace top bar. */}
          <div className="flex h-[52px] shrink-0 items-center px-5">
            <Link to={ADMIN_PATH} className="flex items-center gap-2">
              <BrandMark />
              <span className="text-[16px] font-semibold tracking-[-0.01em] text-ink">Uptimer</span>
            </Link>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4">
            <nav aria-label={t('common.dashboard')} className="ui-admin-nav">
              {NAV_GROUPS.map((group) => (
                <section key={group.labelKey} aria-label={t(group.labelKey)}>
                  <div className="ui-admin-nav-heading">{t(group.labelKey)}</div>
                  <div className="space-y-1">
                    {NAV_ITEMS.filter((item) => group.keys.includes(item.key)).map((item) => (
                      <Link
                        key={item.key}
                        to={item.to}
                        aria-current={item.key === activeItem ? 'page' : undefined}
                        data-active={item.key === activeItem}
                        className="ui-side-link"
                      >
                        <NavIcon path={item.icon} />
                        <span>{t(item.labelKey)}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center justify-between border-t border-line-soft px-3 py-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={logout}
              aria-label={t('common.logout')}
              title={t('common.logout')}
              className="ui-icon-btn"
            >
              <NavIcon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </button>
          </div>
        </aside>

        <div className="ui-admin-workspace min-h-screen min-w-0 md:ml-[17rem]">
          <div
            className="ui-admin-workspace-topbar sticky top-0 z-30 hidden md:block"
            aria-hidden
          />
          <header className="ui-topbar sticky top-0 z-40 md:hidden">
            <div className="flex h-12 items-center justify-between px-4">
              <Link to={ADMIN_PATH} className="flex items-center gap-2">
                <BrandMark />
                <span className="text-[14px] font-semibold text-ink">Uptimer</span>
              </Link>
              <div className="flex items-center gap-1">
                <ThemeToggle />
                <button
                  type="button"
                  onClick={logout}
                  aria-label={t('common.logout')}
                  title={t('common.logout')}
                  className="ui-icon-btn"
                >
                  <NavIcon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </button>
              </div>
            </div>
            <div className="px-3 pb-2">
              <button
                type="button"
                className="ui-side-link w-full justify-between"
                aria-expanded={mobileNavOpen}
                aria-controls="admin-mobile-navigation"
                onClick={() => setMobileNavOpen((open) => !open)}
              >
                <span>
                  {t(
                    NAV_ITEMS.find((item) => item.key === activeItem)?.labelKey ??
                      'common.dashboard',
                  )}
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {mobileNavOpen ? (
                <nav
                  id="admin-mobile-navigation"
                  aria-label={t('common.dashboard')}
                  className="ui-admin-nav ui-admin-mobile-nav"
                >
                  {NAV_GROUPS.map((group) => (
                    <section key={group.labelKey} aria-label={t(group.labelKey)}>
                      <div className="ui-admin-nav-heading">{t(group.labelKey)}</div>
                      {NAV_ITEMS.filter((item) => group.keys.includes(item.key)).map((item) => (
                        <Link
                          key={item.key}
                          to={item.to}
                          aria-current={item.key === activeItem ? 'page' : undefined}
                          data-active={item.key === activeItem}
                          className="ui-side-link"
                          onClick={() => setMobileNavOpen(false)}
                        >
                          <NavIcon path={item.icon} />
                          <span>{t(item.labelKey)}</span>
                        </Link>
                      ))}
                    </section>
                  ))}
                </nav>
              ) : null}
            </div>
          </header>
          <div key={pathname} className="ui-page-enter">
            {children}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="ui-topbar sticky top-0 z-40">
        {/* Reference workspace top bar: 52 px tall. */}
        <div className="mx-auto flex h-[52px] max-w-[90rem] items-center gap-2 px-5 sm:px-8 lg:px-12">
          <Link to={ADMIN_PATH} className="mr-1 flex shrink-0 items-center gap-2">
            <BrandMark />
            <span className="hidden text-[16px] font-semibold tracking-[-0.01em] text-ink sm:block">
              Uptimer
            </span>
          </Link>

          <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const label = t(item.labelKey);
              const isActive = item.key === activeItem;
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  aria-label={label}
                  title={label}
                  aria-current={isActive ? 'page' : undefined}
                  data-active={isActive}
                  className="ui-nav-item shrink-0"
                >
                  <NavIcon path={item.icon} />
                  <span className="hidden md:inline">{label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <button
              type="button"
              onClick={logout}
              aria-label={t('common.logout')}
              title={t('common.logout')}
              className="ui-icon-btn"
            >
              <NavIcon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </button>
          </div>
        </div>
        {tabs ? <div className="mx-auto max-w-[90rem] px-5 sm:px-8 lg:px-12">{tabs}</div> : null}
      </header>
      <div key={pathname} className="ui-page-enter">
        {children}
      </div>
    </>
  );
}

/** Page-level header: oversized title plus the page's primary actions, in the reference layout. */
export function AdminPageHeader({
  title,
  description,
  className,
  search,
  actions,
}: {
  title: string;
  description?: string;
  className?: string;
  search?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-3 ${className ?? ''}`}
    >
      <div className={`min-w-0 ${search ? 'ui-monitor-page-title' : ''}`}>
        <h1 className="ui-page-title truncate">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-[46rem] text-[14px] leading-5 text-ink-2">{description}</p>
        ) : null}
      </div>
      {search || actions ? (
        <div className={search ? 'ui-monitor-page-actions' : 'flex flex-wrap items-center gap-2'}>
          {search ? <div className="ui-monitor-page-search">{search}</div> : null}
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export type AdminTab<T extends string> = { key: T; label: string; count?: number };

export function AdminTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<AdminTab<T>>;
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-x-6 border-b border-line', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          aria-current={tab.key === value ? 'page' : undefined}
          data-active={tab.key === value}
          className="ui-tab"
        >
          {tab.label}
          {tab.count === undefined ? null : (
            <span className="text-ink-3 tabular-nums">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
