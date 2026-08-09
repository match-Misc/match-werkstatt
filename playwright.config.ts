import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.local.env' }); // Load .local.env for E2E tests

export default defineConfig({
  timeout: 30000,
  testDir: './e2e',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }]],
  use: {
    // Base URL der Frontend-App (siehe vite.config.ts port)
    baseURL: 'http://localhost:5007',
    // Nimm bei JEDEM Testdurchlauf Screenshots, Videos und DOM-Traces auf
    trace: 'on',
    video: 'on',
    screenshot: 'on'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Weitere Browser (Firefox, WebKit) können hier hinzugefügt werden
  ],
  // Der WebServer wird automatisch vor den Tests gestartet
  webServer: {
    command: 'npx concurrently -c "blue,green" -n "FRONT,BACK" "npm run dev" "node --env-file=.local.env server.cjs"',
    url: 'http://localhost:5007',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
