import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { EyeTrackingOverlay } from './components/EyeTrackingOverlay';
import './styles/app.css';

const isOverlay = window.location.hash.includes('overlay');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isOverlay ? <EyeTrackingOverlay /> : <App />}
  </React.StrictMode>
);
