import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useHref, useNavigate, type NavigateOptions } from 'react-router-dom';
import { RouterProvider } from '@capra/core';
import '@capra/theme/base.css';
import '@capra/core/styles.css';
import '@capra/icons/styles.css';
import App from './App.tsx';
import { initialTheme, installThemeBridge, type HostTheme } from './host-theme.ts';
import './App.css';

declare module '@capra/core' {
  interface RouterConfig {
    routerOptions: NavigateOptions;
  }
}

// Apply the Cribl shell's theme before the first React render; keep listening for toggles.
let currentTheme: HostTheme = initialTheme();
const listeners = new Set<(t: HostTheme) => void>();
installThemeBridge((t) => {
  currentTheme = t;
  listeners.forEach((l) => l(t));
});

function useHostTheme(): HostTheme {
  const [theme, setTheme] = useState<HostTheme>(currentTheme);
  useEffect(() => {
    listeners.add(setTheme);
    setTheme(currentTheme);
    return () => {
      listeners.delete(setTheme);
    };
  }, []);
  return theme;
}

function Root() {
  const navigate = useNavigate();
  const theme = useHostTheme();
  return (
    <RouterProvider navigate={navigate} useHref={useHref}>
      <App theme={theme} />
    </RouterProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={window.CRIBL_BASE_PATH ?? '/'}>
      <Root />
    </BrowserRouter>
  </StrictMode>,
);
