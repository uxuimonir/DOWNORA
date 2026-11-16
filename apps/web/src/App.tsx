import { Toaster, TooltipProvider, useApplyTheme } from '@downora/ui';
import { MotionConfig } from 'framer-motion';
import { useEffect } from 'react';
import { createBrowserRouter, createHashRouter, RouterProvider } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { RouteError } from '@/components/layout/RouteError';
import { AudioDownloaderPage, VideoDownloaderPage } from '@/pages/DownloaderPages';
import { AuthPage } from '@/pages/AuthPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { HelpPage } from '@/pages/HelpPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { LandingPage } from '@/pages/LandingPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { QueuePage } from '@/pages/QueuePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SourcesPage } from '@/pages/SourcesPage';
import { useSettings } from '@/stores/settings';
import '@/lib/engine/manager';

// Static hosts without SPA rewrites (e.g. the hosted preview) build with VITE_ROUTER=hash.
const createRouter = import.meta.env.VITE_ROUTER === 'hash' ? createHashRouter : createBrowserRouter;
const router = createRouter([
  { path: '/', element: <LandingPage />, errorElement: <RouteError /> },
  { path: '/sign-in', element: <AuthPage />, errorElement: <RouteError /> },
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/video', element: <VideoDownloaderPage /> },
      { path: '/audio', element: <AudioDownloaderPage /> },
      { path: '/queue', element: <QueuePage /> },
      { path: '/history', element: <HistoryPage /> },
      { path: '/sources', element: <SourcesPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/profile', element: <ProfilePage /> },
      { path: '/help', element: <HelpPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  const motion = useSettings((s) => s.settings.motion);
  const theme = useSettings((s) => s.settings.theme);
  useApplyTheme(theme);
  useEffect(() => {
    document.documentElement.dataset.motion = motion;
  }, [motion]);

  return (
    <MotionConfig reducedMotion={motion === 'reduce' ? 'always' : motion === 'full' ? 'never' : 'user'}>
      <TooltipProvider delayDuration={300}>
        <RouterProvider router={router} />
        <Toaster theme={theme} />
      </TooltipProvider>
    </MotionConfig>
  );
}
