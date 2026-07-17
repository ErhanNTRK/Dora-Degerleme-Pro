import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages: https://erhanntrk.github.io/Dora-Degerleme-Pro/
const BASE_PATH = '/Dora-Degerleme-Pro/'

export default defineConfig({
  base: BASE_PATH,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-icon-192.png', 'pwa-icon-512.png', 'data/*.json'],
      manifest: {
        name: 'Dora Değerleme Pro — Asgari Ücret Hesaplama',
        short_name: 'Dora Değerleme Pro',
        description: 'Dora Gayrimenkul Değerleme A.Ş. — 2026 Gayrimenkul Değerleme Asgari Ücret Hesaplama Uygulaması',
        theme_color: '#0F2A47',
        background_color: '#FFFFFF',
        display: 'standalone',
        orientation: 'portrait',
        start_url: BASE_PATH,
        scope: BASE_PATH,
        icons: [
          { src: `${BASE_PATH}pwa-icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${BASE_PATH}pwa-icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${BASE_PATH}pwa-icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: `${BASE_PATH}pwa-icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        runtimeCaching: [
          {
            urlPattern: /\/data\/.*\.json$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'dora-tariff-data' }
          }
        ]
      }
    })
  ]
})
