import { Link, NavLink } from 'react-router-dom';

import { useI18n } from '../app/I18nContext';
import { ThemeToggle } from './ui';

export function PublicStatusHeader({ siteTitle = 'Uptimer' }: { siteTitle?: string }) {
  const { t } = useI18n();
  const links = [
    { to: '/', label: t('common.status'), end: true },
    { to: '/history/maintenance', label: t('admin_dashboard.tab.maintenance'), end: false },
    { to: '/history/incidents', label: t('status_page.incident_history'), end: false },
  ];

  return (
    <header className="ui-public-container">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:py-[10.5px]">
        <Link
          to="/"
          className="flex min-w-0 max-w-[200px] items-center gap-2 rounded-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
        >
          <img src="/favicon.svg" alt="" className="h-6 w-6 shrink-0" />
          <span className="truncate text-[16px] font-semibold tracking-tight">{siteTitle}</span>
        </Link>
        <div className="order-2 justify-self-end md:order-3">
          <ThemeToggle />
        </div>
        <nav className="order-3 col-span-2 flex gap-3 overflow-x-auto pt-3 text-[13px] md:order-2 md:col-span-1 md:pt-0">
          {links.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `shrink-0 rounded px-3 py-2 font-medium leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink ${
                  isActive
                    ? 'bg-surface-2 text-ink'
                    : 'text-ink-3 hover:bg-surface-2 hover:text-ink'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
