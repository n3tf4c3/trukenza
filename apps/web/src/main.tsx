import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { sendAction } from './net';
import { useStore } from './store';
import './styles.css';

// Depuração (modo de desenvolvimento ou ?debug): o estado e o envio de jogadas ficam no console.
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { trukenza: unknown }).trukenza = { store: useStore, sendAction };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
