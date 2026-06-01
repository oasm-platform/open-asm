import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { TanStackDevtools } from '@tanstack/react-devtools';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import App, { queryClient } from './App.tsx';
import { router } from './router';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <TanStackDevtools
      plugins={[
        {
          name: 'TanStack Query',
          render: <ReactQueryDevtoolsPanel client={queryClient} />,
        },
        {
          name: 'TanStack Router',
          render: <TanStackRouterDevtoolsPanel router={router} />,
        },
      ]}
    />
  </StrictMode>,
);
