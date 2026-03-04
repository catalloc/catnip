import { assertEquals } from "../../test/assert.ts";
import { isValidPublicUrl } from "./url.ts";

Deno.test("isValidPublicUrl: accepts valid https URL", () => {
  assertEquals(isValidPublicUrl("https://example.com/image.png"), true);
});

Deno.test("isValidPublicUrl: accepts valid http URL", () => {
  assertEquals(isValidPublicUrl("http://example.com/image.png"), true);
});

Deno.test("isValidPublicUrl: rejects non-http scheme", () => {
  assertEquals(isValidPublicUrl("ftp://example.com/file"), false);
  assertEquals(isValidPublicUrl("javascript:alert(1)"), false);
});

Deno.test("isValidPublicUrl: rejects empty string", () => {
  assertEquals(isValidPublicUrl(""), false);
});

Deno.test("isValidPublicUrl: rejects localhost", () => {
  assertEquals(isValidPublicUrl("http://localhost/admin"), false);
  assertEquals(isValidPublicUrl("https://localhost:8080/api"), false);
});

Deno.test("isValidPublicUrl: rejects 127.x.x.x", () => {
  assertEquals(isValidPublicUrl("http://127.0.0.1/"), false);
  assertEquals(isValidPublicUrl("http://127.0.0.2:3000/path"), false);
});

Deno.test("isValidPublicUrl: rejects 10.x.x.x", () => {
  assertEquals(isValidPublicUrl("http://10.0.0.1/"), false);
  assertEquals(isValidPublicUrl("http://10.255.255.255/path"), false);
});

Deno.test("isValidPublicUrl: rejects 172.16-31.x.x", () => {
  assertEquals(isValidPublicUrl("http://172.16.0.1/"), false);
  assertEquals(isValidPublicUrl("http://172.31.255.255/"), false);
});

Deno.test("isValidPublicUrl: allows 172.32.x.x (not private)", () => {
  assertEquals(isValidPublicUrl("http://172.32.0.1/"), true);
});

Deno.test("isValidPublicUrl: rejects 192.168.x.x", () => {
  assertEquals(isValidPublicUrl("http://192.168.0.1/"), false);
  assertEquals(isValidPublicUrl("http://192.168.1.100:8080/"), false);
});

Deno.test("isValidPublicUrl: rejects 0.0.0.0", () => {
  assertEquals(isValidPublicUrl("http://0.0.0.0/"), false);
});

Deno.test("isValidPublicUrl: rejects [::1]", () => {
  assertEquals(isValidPublicUrl("http://[::1]/"), false);
});

Deno.test("isValidPublicUrl: rejects invalid URL", () => {
  assertEquals(isValidPublicUrl("not-a-url"), false);
  assertEquals(isValidPublicUrl("https://"), false);
});

Deno.test("isValidPublicUrl: trims whitespace", () => {
  assertEquals(isValidPublicUrl("  https://example.com/  "), true);
});
