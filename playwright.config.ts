import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  // Playwright owns `*.spec.ts` under tests/browser/ only; Vitest never looks here.
  testDir: "tests/browser",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build, so the page under test matches what users receive and
    // no dev-only overlay elements take part in accessibility scans.
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: baseURL,
    // Always start a fresh server so the environment below is guaranteed; a
    // reused server could carry a real key or the sample-only build.
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      // Browser tests exercise the interactive Quick Brief page, never the
      // sample-only branch. An explicit value also wins over any .env.local.
      NEXT_PUBLIC_DEMO_MODE: "",
      // Defense in depth: page-originated API calls are fulfilled by route mocks,
      // and even the server-guard request cannot reach a provider without a key.
      ANTHROPIC_API_KEY: ""
    }
  }
});
