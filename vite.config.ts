import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png', 'logo-192.png', 'logo-512.png'],
      manifest: {
        name: 'POWER GYM PRO - Painel do Treinador',
        short_name: 'Power Gym Pro',
        description: 'Treino profissional. Resultados reais.',
        theme_color: '#080808',
        background_color: '#080808',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/logo-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/logo-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
