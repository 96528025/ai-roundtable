import { expect, test as base, type Locator, type Page } from "@playwright/test";

export { expect };

export type MockCall = {
  method: string;
  body: unknown;
};

export type MockResponse = {
  status: number;
  body: unknown;
  contentType?: string;
  headers?: Record<string, string>;
};

type Responder = (call: MockCall, index: number) => MockResponse | Promise<MockResponse>;

export type RouteMock = {
  /** Every request to the route the page issued, in order. */
  calls: MockCall[];
  /** Replace the responder for subsequent requests. */
  respondWith(responder: Responder): void;
  /** Resolves once the handler for call `index` has finished (delivered or found the request gone). */
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

function unconfiguredResponder(pathname: string): Responder {
  return () => ({
    status: 500,
    body: {
      error: `Browser test did not configure a responder for ${pathname}.`,
      code: "INTERNAL_ERROR",
      retryable: false
    }
  });
}

function isLocalHost(url: URL): boolean {
  return url.hostname === "127.0.0.1" || url.hostname === "localhost";
}

/**
 * Deterministic interception for one API route. Requests never reach the
 * Next.js server; the test decides status, body, and timing.
 */
async function installRouteMock(page: Page, pathname: string): Promise<RouteMock> {
  const calls: MockCall[] = [];
  const settledGates: Array<Deferred<void>> = [];
  let responder = unconfiguredResponder(pathname);

  await page.route(`**${pathname}`, async (route) => {
    const request = route.request();
    const call: MockCall = { method: request.method(), body: request.postDataJSON() };
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
        // The page had already torn the request down; there is nothing left to deliver.
      }
    } finally {
      gate.resolve();
    }
  });

  return {
    calls,
    respondWith(next) {
      responder = next;
    },
    settled(index) {
      const gate = settledGates[index] ?? (settledGates[index] = deferred<void>());
      return gate.promise;
    }
  };
}

/**
 * Shared fixtures:
 * - `brief`, `agenda`, `roundtable`: route mocks for the three API endpoints.
 * - `externalRequests` (automatic): blocks and records any request to a host
 *   other than the local server, then asserts that none happened.
 */
export const test = base.extend<{
  brief: RouteMock;
  agenda: RouteMock;
  roundtable: RouteMock;
  externalRequests: string[];
}>({
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
    await provide(await installRouteMock(page, "/api/brief"));
  },
  agenda: async ({ page }, provide) => {
    await provide(await installRouteMock(page, "/api/agenda"));
  },
  roundtable: async ({ page }, provide) => {
    await provide(await installRouteMock(page, "/api/roundtable"));
  }
});

/**
 * Make the transport ignore cancellation for one API path: `fetch` calls to
 * it are forwarded without their `signal`, so an aborted request still
 * completes and its response still reaches application code. This isolates
 * the request-identity guard from AbortController. Call before `page.goto`.
 */
export async function ignoreAbortFor(page: Page, pathname: string) {
  await page.addInitScript((targetPath: string) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (init && new URL(url, window.location.href).pathname === targetPath) {
        const { signal: _ignored, ...rest } = init;
        return originalFetch(input, rest);
      }
      return originalFetch(input, init);
    };
  }, pathname);
}

/** Collect the failure reasons of requests to `pathname` (e.g. "net::ERR_ABORTED"). */
export function trackFailedRequests(page: Page, pathname: string): string[] {
  return trackRequests(page, pathname).failed;
}

export type RequestLifecycle = {
  /** Failure reasons, e.g. "net::ERR_ABORTED" when the page cancelled the request. */
  failed: string[];
  /** Requests whose response was fully delivered to the page. */
  finished: number;
};

/**
 * Observe how requests to `pathname` end from the browser's point of view.
 * Route mocks cannot tell whether the page still wanted a response, so this
 * is the authoritative signal for "cancelled" versus "delivered".
 */
export function trackRequests(page: Page, pathname: string): RequestLifecycle {
  const lifecycle: RequestLifecycle = { failed: [], finished: 0 };
  page.on("requestfailed", (request) => {
    if (new URL(request.url()).pathname === pathname) {
      lifecycle.failed.push(request.failure()?.errorText ?? "unknown");
    }
  });
  page.on("requestfinished", (request) => {
    if (new URL(request.url()).pathname === pathname) {
      lifecycle.finished += 1;
    }
  });
  return lifecycle;
}

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
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
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

export function agendaPanel(page: Page): Locator {
  return page.getByRole("region", { name: "Review the Full Roundtable agenda" });
}

export function roundtableResults(page: Page): Locator {
  return page.getByRole("region", { name: "Full Roundtable result" });
}

export const IDEA =
  "A browser extension that turns messy shopping tabs into a single decision brief for one purchase.";

export async function openInteractiveForm(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Frame the idea once" })).toBeVisible();
}

/** Expand the collapsed Full Roundtable settings so the panel picker is reachable. */
export async function openAdvancedOptions(page: Page) {
  const summary = page.locator("summary", { hasText: "Optional Full Roundtable settings" });
  await summary.click();
  await expect(page.getByRole("group", { name: "Advisory panel" })).toBeVisible();
}
