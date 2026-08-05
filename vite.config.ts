import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const buildId = `${Date.now()}`;
    return {
      server: {
        port: 3000,
        host: '127.0.0.1',
        proxy: {
          '/api': {
            target: 'http://localhost:3001',
            changeOrigin: true,
            configure: (proxy, _options) => {
              proxy.on('error', (err, _req, _res) => {
                console.log('proxy error', err);
              });
              proxy.on('proxyReq', (proxyReq, req, _res) => {
                console.log('Sending Request to the Target:', req.method, req.url);
              });
              proxy.on('proxyRes', (proxyRes, req, _res) => {
                console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
              });
            },
          }
        }
      },
      build: {
        outDir: 'dist',
        assetsDir: 'assets',
        rollupOptions: {
          input: {
            main: path.resolve(__dirname, 'index.html')
          }
        }
      },
      plugins: [
        react(),
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['icon.png'],
          manifest: {
            name: 'Padel ELO Manager',
            short_name: 'Padel ELO',
            description: 'Gestione tornei di padel con sistema ELO',
            theme_color: '#0b1326',
            background_color: '#0b1326',
            display: 'standalone',
            orientation: 'portrait',
            scope: '/',
            start_url: '/',
            icons: [
              {
                src: '/icon.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any'
              },
              {
                src: '/icon.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any'
              }
            ]
          },
          workbox: {
            cleanupOutdatedCaches: true,
            clientsClaim: true,
            skipWaiting: true,
            globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
            navigateFallbackDenylist: [/^\/api\//],
            runtimeCaching: [
              {
                // Auth endpoints: NEVER cache
                urlPattern: ({ url }) => url.pathname.startsWith('/api/auth'),
                handler: 'NetworkOnly',
              },
              {
                // Data bootstrap MUST stay fresh (tournaments/matches updates must be immediate)
                urlPattern: ({ request }) => request.method === 'GET' && request.url.includes('/api/data'),
                handler: 'NetworkOnly',
              }
            ]
          },
          devOptions: {
            enabled: false,
            type: 'module'
          }
        })
      ],
      define: {
        '__APP_BUILD_ID__': JSON.stringify(buildId),
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
