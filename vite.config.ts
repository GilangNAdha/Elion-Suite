/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { companionProxy } from './scripts/minicpm-proxy'
import { legalAssets } from './scripts/legal-assets'

export default defineConfig({
  // Relative asset paths so the built app also loads from file:// inside
  // Electron (absolute /assets/… paths 404 there → blank window).
  base: './',
  plugins: [
    react(),
    companionProxy(),
    legalAssets(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,png,jpg,woff2,wasm,onnx,txt}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024
      },
      includeAssets: [
        'favicon.svg',
        'icon.svg',
        'fonts/*.woff2',
        'wallpapers/*.jpg',
        'pixel/*.png',
        'models/*.onnx'
      ],
      manifest: {
        name: 'Elion Suite',
        short_name: 'Elion',
        description: 'Local-first personal productivity suite: Workspace, Lockdown, tasks, habits, notes.',
        theme_color: '#0A0E16',
        background_color: '#0A0E16',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }
        ]
      }
    })
  ],
  resolve: { dedupe: ['yjs', '@blocksuite/store', 'lit', '@preact/signals-core', 'react', 'react-dom'] },
  optimizeDeps: {
    include: [
      '@blocksuite/presets',
      '@blocksuite/presets/effects',
      '@blocksuite/blocks',
      '@blocksuite/blocks/effects',
      '@blocksuite/store',
      '@blocksuite/block-std',
      '@preact/signals-core',
      'lit',
      'lit/static-html.js',
      'yjs',
      'motion/react'
    ]
  },
  worker: { format: 'es' },
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          // heavy, lazily-needed vendors out of the main chunk (keeps it under
          // Workbox's 2 MiB precache default and trims first-load cost)
          charts: ['recharts']
        }
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['tests/e2e/**', '**/node_modules/**', '**/dist/**', '.arena/**'],
    setupFiles: ['./tests/setup.ts']
  }
})
