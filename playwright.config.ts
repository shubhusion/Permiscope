import { defineConfig, devices } from '@playwright/test';

const port = 4175;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests/a11y',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite preview --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
