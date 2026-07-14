import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: '/Inncempro-markettool/',
      server: {
        port: parseInt(process.env.PORT || '5173'),
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        // Service worker: precacht de hele app (JS/CSS/HTML/bedrijvendatabase, die al gebundeld
        // in de JS zit) zodat de app zelf 100% offline start en werkt, en cachet daarnaast
        // kaarttegels/lettertypen/Nominatim/Supabase-antwoorden tijdens gebruik zodat eerder
        // bekeken kaartgebieden en laatst opgehaalde data ook zonder netwerk beschikbaar blijven.
        VitePWA({
          registerType: 'autoUpdate',
          manifest: false, // gebruikt het handgeschreven public/manifest.webmanifest (al in index.html gelinkt)
          includeAssets: ['favicon.ico', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'logo-header.png'],
          workbox: {
            maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // de gebundelde bedrijvendatabase maakt de hoofdbundel groot
            globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
            runtimeCaching: [
              {
                // Google Maps tegels: al bekeken kaartgebieden blijven zo zichtbaar zonder
                // netwerk. Kan nooit "heel Nederland" vooraf cachen (te veel data/tegels), maar
                // wat je al hebt gezien werkt hierna offline.
                urlPattern: /^https:\/\/mt1\.google\.com\/vt\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'google-maps-tiles',
                  expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 30 },
                  cacheableResponse: { statuses: [0, 200] },
                },
              },
              {
                urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'google-fonts',
                  expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
                  cacheableResponse: { statuses: [0, 200] },
                },
              },
              {
                // Supabase-data (favorieten/lijsten/bezoeken/crm): NetworkFirst zodat je altijd
                // de laatste stand krijgt zodra er wél verbinding is, met de laatst opgehaalde
                // data als fallback zodra dat niet lukt (offline blijft dan tenminste het laatst
                // bekende overzicht zichtbaar in plaats van een lege/foutmelding).
                urlPattern: /^https:\/\/wegygdxneeddzfuaixtk\.supabase\.co\/rest\/.*/i,
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'supabase-data',
                  networkTimeoutSeconds: 4,
                  expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
                  cacheableResponse: { statuses: [0, 200] },
                },
              },
              {
                urlPattern: /^https:\/\/nominatim\.openstreetmap\.org\/.*/i,
                handler: 'NetworkFirst',
                options: {
                  cacheName: 'nominatim',
                  networkTimeoutSeconds: 4,
                  expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 30 },
                  cacheableResponse: { statuses: [0, 200] },
                },
              },
            ],
          },
        }),
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GROQ_API_KEY': JSON.stringify(env.GROQ_API_KEY),
        'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL),
        'process.env.SUPABASE_PUBLISHABLE_KEY': JSON.stringify(env.SUPABASE_PUBLISHABLE_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
