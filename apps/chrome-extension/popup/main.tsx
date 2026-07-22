import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PopupApp } from './PopupApp';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Popup root element was not found.');
}

createRoot(root).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);
