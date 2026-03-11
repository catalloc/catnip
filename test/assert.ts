/**
 * Lightweight assert helpers that work in both local Deno and Val Town production.
 *
 * Val Town's runtime doesn't include `@std/assert` in its import map, so test
 * files that use a bare `"@std/assert"` specifier crash at import time. This
 * module provides the subset of assertion functions the test suite uses,
 * removing the external dependency entirely.
 */

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, (b as unknown[])[i]));
  }

  if (Array.isArray(b)) return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const keys = Object.keys(aObj);
  if (keys.length !== Object.keys(bObj).length) return false;
  return keys.every((k) => deepEqual(aObj[k], bObj[k]));
}

function inspect(value: unknown): string {
  try {
    return typeof Deno !== "undefined"
      ? Deno.inspect(value, { depth: 8 })
      : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function assert(value: unknown, msg?: string): asserts value {
  if (!value) {
    throw new Error(msg ?? `Expected truthy value, got ${inspect(value)}`);
  }
}

export function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  if (!deepEqual(actual, expected)) {
    throw new Error(
      msg ??
        `Values are not equal:\n  actual:   ${inspect(actual)}\n  expected: ${inspect(expected)}`,
    );
  }
}

export function assertNotStrictEquals<T>(
  actual: T,
  expected: T,
  msg?: string,
): void {
  if (actual === expected) {
    throw new Error(
      msg ?? `Expected values to NOT be strictly equal: ${inspect(actual)}`,
    );
  }
}

export function assertStringIncludes(
  actual: string,
  expected: string,
  msg?: string,
): void {
  if (!actual.includes(expected)) {
    throw new Error(
      msg ??
        `Expected string to include "${expected}", got: "${actual}"`,
    );
  }
}

// deno-lint-ignore no-explicit-any
export function assertInstanceOf<T extends new (...args: any[]) => any>(
  value: unknown,
  expectedType: T,
  msg?: string,
): asserts value is InstanceType<T> {
  if (!(value instanceof expectedType)) {
    throw new Error(
      msg ??
        `Expected instance of ${expectedType.name}, got ${typeof value}`,
    );
  }
}

export async function assertRejects(
  fn: () => PromiseLike<unknown>,
  // deno-lint-ignore no-explicit-any
  errorClass?: new (...args: any[]) => Error,
  msgIncludes?: string,
  msg?: string,
): Promise<Error> {
  let threw = false;
  let error: unknown;
  try {
    await fn();
  } catch (e) {
    threw = true;
    error = e;
  }
  if (!threw) {
    throw new Error(msg ?? "Expected function to throw");
  }
  if (errorClass && !(error instanceof errorClass)) {
    throw new Error(
      msg ??
        `Expected error to be instance of ${errorClass.name}, got ${error}`,
    );
  }
  if (msgIncludes && error instanceof Error && !error.message.includes(msgIncludes)) {
    throw new Error(
      msg ??
        `Expected error message to include "${msgIncludes}", got "${error.message}"`,
    );
  }
  return error as Error;
}
