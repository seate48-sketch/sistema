// ============================================================
// SEATE - Service Worker
// ============================================================
// Objetivo: permitir que o sistema seja instalado como aplicativo
// (PWA) e continue abrindo mesmo com internet instável, sem nunca
// guardar dados do Supabase em cache (esses sempre vêm da rede,
// para garantir informação sempre atualizada).
//
// Ao subir uma nova versão de style.css / config.js / supabase-client.js
// / common.js, aumente o número abaixo (CACHE_VERSION) — isso faz o
// service worker esquecer o cache antigo e buscar tudo de novo.
// ============================================================

const CACHE_VERSION = 'v12';
const CACHE_NAME = 'seate-cache-' + CACHE_VERSION;

const APP_SHELL = [
    './style.css?v=12',
    './config.js?v=12',
    './supabase-client.js?v=12',
    './common.js?v=12',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/apple-touch-icon.png'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) { return cache.addAll(APP_SHELL); })
            .catch(function(e) { console.warn('SW: falha ao pré-carregar app shell', e); })
            .then(function() { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(nomes) {
            return Promise.all(
                nomes.filter(function(n) { return n !== CACHE_NAME; })
                     .map(function(n) { return caches.delete(n); })
            );
        }).then(function() { return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);

    // Nunca mexer em requisições de fora do site (Supabase, CDNs) —
    // dados do sistema sempre têm que vir da rede, nunca do cache.
    if (url.origin !== self.location.origin) { return; }
    if (event.request.method !== 'GET') { return; }

    // Páginas HTML: sempre tenta a rede primeiro (conteúdo fresco);
    // só usa o cache como reserva se estiver genuinamente offline.
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(function(response) {
                    var copia = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, copia); });
                    return response;
                })
                .catch(function() { return caches.match(event.request); })
        );
        return;
    }

    // CSS / JS / imagens: usa o cache na hora (rápido) e atualiza em
    // segundo plano para a próxima visita.
    event.respondWith(
        caches.match(event.request).then(function(emCache) {
            var buscaRede = fetch(event.request).then(function(response) {
                if (response && response.ok) {
                    var copia = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, copia); });
                }
                return response;
            }).catch(function() { return emCache; });
            return emCache || buscaRede;
        })
    );
});
