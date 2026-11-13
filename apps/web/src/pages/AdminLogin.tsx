import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useI18n } from '../app/I18nContext';
import { useApplyServerLocaleSetting } from '../app/useApplyServerLocaleSetting';
import { fetchStatus } from '../api/client';
import { useAuth } from '../app/AuthContext';
import { ADMIN_PATH } from '../app/adminPaths';
import { Button, INPUT_CLASS } from '../components/ui';

export function AdminLogin() {
  const { t } = useI18n();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || ADMIN_PATH;

  const statusQuery = useQuery({
    queryKey: ['status'],
    queryFn: fetchStatus,
    staleTime: 60_000,
  });
  useApplyServerLocaleSetting(statusQuery.data?.site_locale);

  useEffect(() => {
    document.title = t('admin_login.document_title');
  }, [t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmed = token.trim();
    if (!trimmed) {
      setError(t('admin_login.error_enter_token'));
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await login(trimmed);
      navigate(from, { replace: true });
    } catch {
      setError(t('admin_login.error_invalid_token'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ui-auth-page dark relative flex min-h-screen flex-col px-6 text-white">
      <Link to="/" className="ui-auth-back-link absolute left-6 top-6 sm:left-10 sm:top-8">
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m0 0l6 6m-6-6l6-6" />
        </svg>
        {t('admin_login.back_to_status')}
      </Link>

      <main className="relative mx-auto flex w-full flex-1 items-center justify-center py-24">
        <section className="ui-auth-form w-full max-w-[23rem]">
          <div className="mb-4 flex justify-center" aria-hidden>
            <span className="ui-auth-mark">U</span>
          </div>

          <div className="mb-8 text-center">
            <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-white">
              {t('admin_login.title')}
            </h1>
            <p className="mt-2 text-[14px] leading-5 text-[#939db8]">{t('admin_login.subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="token" className="ui-auth-label">
                {t('admin_login.token')}
              </label>
              <input
                type="password"
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className={`${INPUT_CLASS} ui-auth-input`}
                placeholder={t('admin_login.placeholder')}
                autoFocus
              />
            </div>

            {error && <p className="ui-error text-sm">{error}</p>}

            <Button type="submit" className="ui-auth-submit w-full" disabled={isSubmitting}>
              {isSubmitting ? t('admin_login.submitting') : t('admin_login.submit')}
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}
