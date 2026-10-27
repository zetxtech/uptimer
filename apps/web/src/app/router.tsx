import { Suspense, lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';

import { StatusPage } from '../pages/StatusPage';
import {
  ADMIN_ANALYTICS_PATH,
  ADMIN_LOGIN_PATH,
  ADMIN_PATH,
  ADMIN_PROBES_PATH,
} from './adminPaths';
import { ProtectedRoute } from './ProtectedRoute';

const AdminDashboard = lazy(async () => {
  const mod = await import('../pages/AdminDashboard');
  return { default: mod.AdminDashboard };
});

const AdminAnalytics = lazy(async () => {
  const mod = await import('../pages/AdminAnalytics');
  return { default: mod.AdminAnalytics };
});

const AdminProbes = lazy(async () => {
  const mod = await import('../pages/AdminProbes');
  return { default: mod.AdminProbes };
});

const IncidentHistoryPage = lazy(async () => {
  const mod = await import('../pages/IncidentHistoryPage');
  return { default: mod.IncidentHistoryPage };
});

const MaintenanceHistoryPage = lazy(async () => {
  const mod = await import('../pages/MaintenanceHistoryPage');
  return { default: mod.MaintenanceHistoryPage };
});

const AdminLogin = lazy(async () => {
  const mod = await import('../pages/AdminLogin');
  return { default: mod.AdminLogin };
});

function PageFallback() {
  return <div className="min-h-screen bg-slate-50 dark:bg-slate-900" />;
}

export const router = createBrowserRouter([
  { path: '/', element: <StatusPage /> },
  {
    path: '/history/incidents',
    element: (
      <Suspense fallback={<PageFallback />}>
        <IncidentHistoryPage />
      </Suspense>
    ),
  },
  {
    path: '/history/maintenance',
    element: (
      <Suspense fallback={<PageFallback />}>
        <MaintenanceHistoryPage />
      </Suspense>
    ),
  },
  {
    path: ADMIN_PATH,
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <AdminDashboard />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: ADMIN_ANALYTICS_PATH,
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <AdminAnalytics />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: ADMIN_LOGIN_PATH,
    element: (
      <Suspense fallback={<PageFallback />}>
        <AdminLogin />
      </Suspense>
    ),
  },
  {
    path: ADMIN_PROBES_PATH,
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <AdminProbes />
        </Suspense>
      </ProtectedRoute>
    ),
  },
]);
