import { assertEquals, assertInstanceOf } from "@std/assert";
import { UserFacingError } from "./errors.ts";

Deno.test("UserFacingError: userMessage only", () => {
  const err = new UserFacingError("Something went wrong");
  assertEquals(err.userMessage, "Something went wrong");
  assertEquals(err.message, "Something went wrong");
});

Deno.test("UserFacingError: userMessage with internal message", () => {
  const err = new UserFacingError("Oops", "Internal detail");
  assertEquals(err.userMessage, "Oops");
  assertEquals(err.message, "Internal detail");
});

Deno.test("UserFacingError: is instance of Error", () => {
  const err = new UserFacingError("test");
  assertInstanceOf(err, Error);
});

Deno.test("UserFacingError: name is set", () => {
  const err = new UserFacingError("test");
  assertEquals(err.name, "UserFacingError");
});
