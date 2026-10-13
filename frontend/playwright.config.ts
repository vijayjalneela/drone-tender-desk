import { defineConfig, devices } from '@playwright/test'

import { API_PORT, E2E_ADMIN, WEB_PORT } from './e2e/constants.ts'

// The end-to-end run brings up its own backend and frontend on separate ports,
// against its own database (tender_desk_e2e, reset on every run), so it never
// touches dev data or the dev servers on 8000/5173. Only Postgres must be running:
//   docker compose up -d db --wait

const backendEnv = {
  DATABASE_URL: 'postgresql+psycopg://tender:tender@localhost:5432/tender_desk_e2e',
  ALLOWED_ORIGINS: `http://localhost:${WEB_PORT}`,
  ADMIN_USERNAME: E2E_ADMIN.username,
  ADMIN_PASSWORD: E2E_ADMIN.password,
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Reset the e2e database (and create its admin), then serve the API.
      command: `uv run python scripts/reset_e2e_db.py && uv run uvicorn app.main:app --port ${API_PORT}`,
      cwd: '../backend',
      env: backendEnv,
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
    },
    {
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      // Environment variables take precedence over the repo-root .env in Vite.
      env: { VITE_API_BASE_URL: `http://localhost:${API_PORT}` },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
