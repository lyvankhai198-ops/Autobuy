import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

// Prefix all API calls with the dashboard's base path so they hit /autoorder/api/...
// instead of the root /api/ which maps to a different service on this VPS.
const basePath = import.meta.env.BASE_URL.replace(/\/$/, ''); // e.g. "/autoorder"
if (basePath) setBaseUrl(basePath);

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
