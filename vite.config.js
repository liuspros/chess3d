import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const fake = process.env.FAKE_FB
  ? {
      'firebase/app': new URL('./test/fake/app.js', import.meta.url).pathname,
      'firebase/auth': new URL('./test/fake/auth.js', import.meta.url).pathname,
      'firebase/firestore': new URL('./test/fake/firestore.js', import.meta.url).pathname,
    }
  : {}

export default defineConfig({
  resolve: { alias: fake },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'engine/*'],
      manifest: {
        name: 'Chess 3D',
        short_name: 'Chess 3D',
        description: 'Realistic marble and wood 3D chess. Play the computer or a friend.',
        theme_color: '#0d0a08',
        background_color: '#0d0a08',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // cache the app shell AND the Stockfish wasm so the bot works offline
        globPatterns: ['**/*.{js,css,html,png,svg,wasm}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        importScripts: ['push-sw.js'],
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 1600 },
})
