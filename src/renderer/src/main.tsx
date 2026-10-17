import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { EyeTrackingOverlay } from './components/EyeTrackingOverlay';
import { DetachedCodeViewer } from './components/CodingModeHUD';
import './styles/app.css';
import { syncAppearance, subscribeAppearance } from './services/appearance';
import { applyTheme, savedTheme } from './services/theme';

syncAppearance();
subscribeAppearance(syncAppearance);

const isOverlay = window.location.hash.includes('overlay');
const isCodeViewer = window.location.hash.includes('code-viewer');
// The main window shows the last chosen theme from its first paint, before any account loads.
if (!isOverlay && !isCodeViewer) applyTheme(savedTheme());

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isOverlay ? <EyeTrackingOverlay /> : isCodeViewer ? <DetachedCodeViewer /> : <App />}
  </React.StrictMode>
);
