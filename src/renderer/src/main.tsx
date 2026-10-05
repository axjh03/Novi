import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { EyeTrackingOverlay } from './components/EyeTrackingOverlay';
import { DetachedCodeViewer } from './components/CodingModeHUD';
import './styles/app.css';

const isOverlay = window.location.hash.includes('overlay');
const isCodeViewer = window.location.hash.includes('code-viewer');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isOverlay ? <EyeTrackingOverlay /> : isCodeViewer ? <DetachedCodeViewer /> : <App />}
  </React.StrictMode>
);
