import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// De service worker (PWA) activeert een nieuwe versie op de achtergrond zodra die beschikbaar
// is (skipWaiting/clientsClaim staan al aan in vite.config.ts), maar dat ververst de al-geladen
// pagina niet vanzelf — zonder dit bleef je de oude JS/CSS zien totdat je toevallig een tweede
// keer herlaadde. Deze listener herlaadt de pagina automatisch, precies één keer, zodra een
// nieuwe service worker het overneemt, zodat een nieuwe deploy altijd binnen één paginabezoek
// zichtbaar wordt i.p.v. pas na een handmatige harde refresh of het wissen van site-data.
if ('serviceWorker' in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);