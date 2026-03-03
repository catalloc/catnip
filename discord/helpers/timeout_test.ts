import { assertEquals, assertRejects } from "@std/assert";
import { withTimeout } from "./timeout.ts";

Deno.test("withTimeout: resolving promise returns value", async () => {
  const result = await withTimeout(Promise.resolve(42), 1000);
  assertEquals(result, 42);
});

Deno.test("withTimeout: slow promise rejects with 'Timed out'", async () => {
  const slow = new Promise<never>(() => {}); // never resolves
  await assertRejects(
    () => withTimeout(slow, 10),
    Error,
    "Timed out",
  );
});

Deno.test("withTimeout: returns async value before timeout", async () => {
  const delayed = new Promise<string>((resolve) => setTimeout(() => resolve("ok"), 10));
  const result = await withTimeout(delayed, 5000);
  assertEquals(result, "ok");
});

Deno.test("withTimeout: propagates original error, not timeout", async () => {
  const failing = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("original error")), 5);
  });
  await assertRejects(
    () => withTimeout(failing, 5000),
    Error,
    "original error",
  );
});
