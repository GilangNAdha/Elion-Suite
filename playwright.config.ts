import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  // Server dev otomatis: lokal yang sudah jalan dipakai ulang, CI start sendiri.
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: process.env.ELION_BASE_URL ?? 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  // Runner CI lebih lambat — beri satu percobaan ulang untuk test yang rawan
  // timing (persist IndexedDB dsb). Lokal tetap tanpa retry supaya jujur cepat.
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: process.env.ELION_BASE_URL ?? 'http://localhost:5173',
    viewport: { width: 1440, height: 960 },
    timezoneId: 'Asia/Jakarta',
    locale: 'en-GB',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: [
        '--no-sandbox',
        '--no-zygote',
        '--disable-dev-shm-usage',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream'
      ]
    }
  }
})
