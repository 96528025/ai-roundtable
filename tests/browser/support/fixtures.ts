import { expect, test as base, type Locator, type Page } from "@playwright/test";

export { expect };

export type BriefCall = {
  method: string;
  body: unknown;
};

export type MockResponse = {
  status: number;
  body: unknown;
  contentType?: string;
  headers?: Record<string, string>;
};

type Responder = (call: BriefCall, index: number) => MockResponse | Promise<MockResponse>;

export type BriefMock = {
  /** Every /api/brief request the page issued, in order. */
  calls: BriefCall[];
  /** Replace the responder for subsequent requests. */
  respondWith(responder: Responder): void;
  /** Resolves once the handler for call `index` has finished (fulfilled or found the request gone). */
  settled(index: number): Promise<void>;
};

export type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const unconfiguredResponder: Responder = () => ({
  status: 500,
  body: {
    error: "Browser test did not configure a /api/brief responder.",
    code: "INTERNAL_ERROR",
    retryable: false
  }
});

function isLocalHost(url: URL): boolean {
  return url.hostname === "127.0.0.1" || url.hostname === "localhost";
}

/**
 * Shared fixtures:
 * - `brief`: deterministic /api/brief interception. Requests never reach the
 *   Next.js server; the test decides status, body, and timing.
 * - `externalRequests` (automatic): blocks and records any request to a host
 *   other than the local server, then asserts that none happened.
 */
export const test = base.extend<{ brief: BriefMock; externalRequests: string[] }>({
  externalRequests: [
    async ({ context }, provide) => {
      const blocked: string[] = [];
      await context.route(
        (url) => !isLocalHost(url),
        async (route) => {
          blocked.push(route.request().url());
          await route.abort();
        }
      );
      await provide(blocked);
      expect(blocked, "browser tests must never contact an external host").toEqual([]);
    },
    { auto: true }
  ],
  brief: async ({ page }, provide) => {
    const calls: BriefCall[] = [];
    const settledGates: Array<Deferred<void>> = [];
    let responder = unconfiguredResponder;

    await page.route("**/api/brief", async (route) => {
      const request = route.request();
      const call: BriefCall = { method: request.method(), body: request.postDataJSON() };
      const index = calls.push(call) - 1;
      const gate = settledGates[index] ?? (settledGates[index] = deferred<void>());
      try {
        const response = await responder(call, index);
        const body =
          typeof response.body === "string" ? response.body : JSON.stringify(response.body);
        try {
          await route.fulfill({
            status: response.status,
            contentType: response.contentType ?? "application/json",
            headers: response.headers,
            body
          });
        } catch {
          // The page aborted this request before the mock answered; nothing to deliver.
        }
      } finally {
        gate.resolve();
      }
    });

    await provide({
      calls,
      respondWith(next) {
        responder = next;
      },
      settled(index) {
        const gate = settledGates[index] ?? (settledGates[index] = deferred<void>());
        return gate.promise;
      }
    });
  }
});

/** Press Tab until `target` owns focus, failing after `maxPresses`. */
export async function tabUntilFocused(page: Page, target: Locator, maxPresses = 15) {
  for (let press = 0; press < maxPresses; press += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

/** Let the page run one macrotask so any already-delivered response has been applied. */
export async function flushPage(page: Page) {
  await page.evaluate(
    () => new Promise<void>((resolve) => setTimeout(resolve, 0))
  );
}

/**
 * The app's error region. Scoped to <main> because the Next.js App Router also
 * renders an (empty) route announcer with role="alert".
 */
export function errorAlert(page: Page): Locator {
  return page.getByRole("main").getByRole("alert");
}

export function quickBriefResults(page: Page): Locator {
  return page.getByRole("region", { name: "Quick Brief result" });
}

export function quickBriefStatus(page: Page): Locator {
  return page.getByRole("status");
}

export const IDEA =
  "A browser extension that turns messy shopping tabs into a single decision brief for one purchase.";

export async function openInteractiveForm(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Frame the idea once" })).toBeVisible();
}
