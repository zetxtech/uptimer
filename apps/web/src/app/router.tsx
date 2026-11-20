import { Suspense, lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';

import { StatusPage } from '../pages/StatusPage';
import {
  ADMIN_ANALYTICS_PATH,
  ADMIN_EVENTS_PATH,
  ADMIN_EVENT_DETAIL_ROUTE,
  ADMIN_LOGIN_PATH,
  ADMIN_INCIDENT_DETAIL_ROUTE,
  ADMIN_SIMILAR_INCIDENTS_ROUTE,
  ADMIN_MONITOR_DETAIL_ROUTE,
  ADMIN_PATH,
  ADMIN_HEARTBEATS_PATH,
  ADMIN_PROBES_PATH,
  ADMIN_REPORTING_PATH,
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

const AdminMonitorDetail = lazy(async () => {
  const mod = await import('../pages/AdminMonitorDetail');
  return { default: mod.AdminMonitorDetail };
});

const AdminHeartbeats = lazy(async () => {
  const mod = await import('../pages/AdminHeartbeats');
  return { default: mod.AdminHeartbeats };
});

const AdminEvents = lazy(async () => {
  const mod = await import('../pages/AdminEvents');
  return { default: mod.AdminEvents };
});

const AdminEventDetail = lazy(async () => {
  const mod = await import('../pages/AdminEventDetail');
  return { default: mod.AdminEventDetail };
});

const AdminReporting = lazy(async () => {
  const mod = await import('../pages/AdminReporting');
  return { default: mod.AdminReporting };
});

const AdminIncidentDetail = lazy(async () => {
  const mod = await import('../pages/AdminIncidentDetail');
  return { default: mod.AdminIncidentDetail };
});

const AdminSimilarIncidents = lazy(async () => {
  const mod = await import('../pages/AdminSimilarIncidents');
  return { default: mod.AdminSimilarIncidents };
});

const AdminLogin = lazy(async () => {
  const mod = await import('../pages/AdminLogin');
  return { default: mod.AdminLogin };
});

function PageFallback() {
  return <div className="min-h-screen bg-surface-2 dark:bg-surface" />;
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
    path: ADMIN_MONITOR_DETAIL_ROUTE,
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <AdminMonitorDetail />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: ADMIN_INCIDENT_DETAIL_ROUTE,
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <AdminIncidentDetail />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: ADMIN_SIMILAR_INCIDENTS_ROUTE,
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <AdminSimilarIncidents />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: ADMIN_HEARTBEATS_PATH,
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <AdminHeartbeats />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: ADMIN_EVENTS_PATH,
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <AdminEvents />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: ADMIN_EVENT_DETAIL_ROUTE,
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <AdminEventDetail />
        </Suspense>
      </ProtectedRoute>
    ),
  },
  {
    path: ADMIN_REPORTING_PATH,
    element: (
      <ProtectedRoute>
        <Suspense fallback={<PageFallback />}>
          <AdminReporting />
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
