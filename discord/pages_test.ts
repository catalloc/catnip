import { assert, assertEquals } from "@std/assert";
import {
  page,
  htmlResponse,
  termsPage,
  privacyPage,
  linkedRolesSuccessPage,
  linkedRolesErrorPage,
} from "./pages.ts";

Deno.test("page: returns valid HTML structure", () => {
  const html = page("Test Title", "<p>Hello</p>");
  assert(html.includes("<!DOCTYPE html>"));
  assert(html.includes("<title>Test Title</title>"));
  assert(html.includes("<p>Hello</p>"));
});

Deno.test("htmlResponse: sets content-type header", () => {
  const res = htmlResponse("<p>test</p>");
  assertEquals(res.headers.get("Content-Type"), "text/html; charset=utf-8");
});

Deno.test("termsPage: contains terms content", async () => {
  const res = termsPage();
  const html = await res.text();
  assert(html.includes("Terms of Service"));
  assert(html.includes("Acceptance of Terms"));
});

Deno.test("privacyPage: contains privacy content", async () => {
  const res = privacyPage();
  const html = await res.text();
  assert(html.includes("Privacy Policy"));
  assert(html.includes("Information We Collect"));
});

Deno.test("linkedRolesSuccessPage: escapes XSS in username", async () => {
  const res = linkedRolesSuccessPage('<script>alert("xss")</script>');
  const html = await res.text();
  assert(!html.includes("<script>"));
  assert(html.includes("&lt;script&gt;"));
});

Deno.test("linkedRolesErrorPage: escapes XSS in message", async () => {
  const res = linkedRolesErrorPage('<img onerror="hack">');
  const html = await res.text();
  assert(!html.includes("<img"));
  assert(html.includes("&lt;img"));
});
