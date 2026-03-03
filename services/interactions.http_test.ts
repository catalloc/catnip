import "../test/_mocks/env.ts";
import "../test/_mocks/sqlite.ts";
import { assertEquals, assert } from "@std/assert";
import { mockFetch, getCalls, restoreFetch } from "../test/_mocks/fetch.ts";
import handler from "./interactions.http.ts";

// --- GET routes ---

Deno.test("http: GET /terms returns HTML page", async () => {
  const req = new Request("https://example.com/terms");
  const res = await handler(req);
  assertEquals(res.status, 200);
  const text = await res.text();
  assert(text.includes("Terms") || text.includes("html"));
});

Deno.test("http: GET /privacy returns HTML page", async () => {
  const req = new Request("https://example.com/privacy");
  const res = await handler(req);
  assertEquals(res.status, 200);
  const text = await res.text();
  assert(text.includes("Privacy") || text.includes("html"));
});

Deno.test("http: GET /invite without auth returns 401", async () => {
  const req = new Request("https://example.com/invite");
  const res = await handler(req);
  assertEquals(res.status, 401);
});

Deno.test("http: GET /invite with wrong token returns 401", async () => {
  const req = new Request("https://example.com/invite", {
    headers: { Authorization: "Bearer wrong_password" },
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
});

// --- Admin endpoints ---

Deno.test("http: GET ?register=true without auth returns 401", async () => {
  const req = new Request("https://example.com/?register=true");
  const res = await handler(req);
  assertEquals(res.status, 401);
});

Deno.test("http: GET ?discover=true without auth returns 401", async () => {
  const req = new Request("https://example.com/?discover=true");
  const res = await handler(req);
  assertEquals(res.status, 401);
});

Deno.test("http: GET ?register-metadata=true without auth returns 401", async () => {
  const req = new Request("https://example.com/?register-metadata=true");
  const res = await handler(req);
  assertEquals(res.status, 401);
});

// --- Health check ---

Deno.test("http: GET root returns health check JSON", async () => {
  const req = new Request("https://example.com/");
  const res = await handler(req);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "ok");
  assertEquals(typeof body.commands, "number");
});

// --- Trailing slash normalization ---

Deno.test("http: GET /terms/ (trailing slash) still works", async () => {
  const req = new Request("https://example.com/terms/");
  const res = await handler(req);
  assertEquals(res.status, 200);
});

Deno.test("http: GET /privacy/ (trailing slash) still works", async () => {
  const req = new Request("https://example.com/privacy/");
  const res = await handler(req);
  assertEquals(res.status, 200);
});

// --- POST routing ---

Deno.test("http: POST without signature returns 401", async () => {
  const req = new Request("https://example.com/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: 1 }),
  });
  const res = await handler(req);
  // Should fail signature verification
  assertEquals(res.status, 401);
});

Deno.test("http: POST /patreon/webhook routes to patreon handler (not 404)", async () => {
  // The patreon webhook handler uses MD5-HMAC which may not be supported
  // in all Deno versions. This test verifies routing works (not 404).
  const req = new Request("https://example.com/patreon/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Patreon-Event": "members:create",
    },
    body: JSON.stringify({ data: {} }),
  });
  const res = await handler(req);
  // Without signature header, should return 401 or 503 (missing config), not 404
  assert(res.status === 401 || res.status === 503 || res.status === 429);
});
