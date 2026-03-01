/**
 * test/_mocks/fetch.ts
 *
 * Reusable fetch mock for testing. Records all calls and returns
 * configurable responses. Install/uninstall around tests.
 */

export interface MockResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface RecordedCall {
  url: string;
  init?: RequestInit;
}

let responses: MockResponse[] = [];
let defaultResponse: MockResponse = { status: 200, body: {} };
let calls: RecordedCall[] = [];
let originalFetch: typeof globalThis.fetch | null = null;
let shouldThrow: Error | null = null;

export function mockFetch(opts?: {
  responses?: MockResponse[];
  default?: MockResponse;
}) {
  calls = [];
  responses = opts?.responses ? [...opts.responses] : [];
  defaultResponse = opts?.default ?? { status: 200, body: {} };
  shouldThrow = null;
  originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });

    if (shouldThrow) {
      const err = shouldThrow;
      shouldThrow = null;
      throw err;
    }

    const mock = responses.shift() ?? defaultResponse;

    const headers = new Headers(mock.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const body = mock.body !== undefined ? JSON.stringify(mock.body) : null;

    return new Response(body, {
      status: mock.status ?? 200,
      headers,
    });
  }) as typeof globalThis.fetch;
}

export function setNextThrow(error: Error) {
  shouldThrow = error;
}

export function getCalls(): RecordedCall[] {
  return calls;
}

export function restoreFetch() {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }
  calls = [];
  responses = [];
  shouldThrow = null;
}
