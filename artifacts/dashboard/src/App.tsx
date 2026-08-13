import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Dashboard from '@/pages/dashboard';
import Orders from '@/pages/orders/index';
import OrderDetails from '@/pages/orders/[id]';
import Config from '@/pages/config';
import Mappings from '@/pages/mappings';
import SourceApi from '@/pages/source-api';
import Market from '@/pages/market';
import { AppLayout } from '@/components/layout/app-layout';

import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import { setBaseUrl } from '@workspace/api-client-react';

// Prefix all generated-hook API calls with the app's base path so they work
// both at root (Replit dev: BASE_URL = '/') and under a sub-path
// (VPS nginx: BASE_URL = '/autoorder/').
const appBase = import.meta.env.BASE_URL.replace(/\/$/, ''); // '' or '/autoorder'
setBaseUrl(appBase || null); // null keeps the default /api/... paths for dev

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60, // 1 minute
    },
  },
});

function Router() {
  return (
    <AppLayout>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/orders" component={Orders} />
          <Route path="/orders/:id" component={OrderDetails} />
          <Route path="/config" component={Config} />
          <Route path="/mappings" component={Mappings} />
          <Route path="/source-api" component={SourceApi} />
          <Route path="/market" component={Market} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </AppLayout>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
