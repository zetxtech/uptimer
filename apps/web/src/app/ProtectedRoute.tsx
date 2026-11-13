import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ADMIN_LOGIN_PATH } from './adminPaths';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, ensureValidToken } = useAuth();
  const location = useLocation();
  const [checked, setChecked] = useState(false);
  const [valid, setValid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureValidToken()
      .then((ok) => {
        if (cancelled) return;
        setValid(ok);
        setChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        setValid(false);
        setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ensureValidToken]);

  if (!checked) {
    return <div className="min-h-screen bg-surface-2 dark:bg-surface" />;
  }

  if (!isAuthenticated || !valid) {
    return <Navigate to={ADMIN_LOGIN_PATH} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
