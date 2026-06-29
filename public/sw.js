// sw.js — service worker minimo, richiesto da Chrome/Android per permettere
// l'installazione dell'app sulla schermata home. Non fa caching speciale:
// lascia che tutte le richieste vadano normalmente in rete.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
