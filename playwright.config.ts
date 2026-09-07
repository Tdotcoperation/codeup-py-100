import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 90000, expect: { timeout: 15000 },
  workers: 1, fullyParallel: false, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:8787', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run build && npm run preview', url: 'http://127.0.0.1:8787', reuseExistingServer: !process.env.CI, timeout: 120000 },
});
