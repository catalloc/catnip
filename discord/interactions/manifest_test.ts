import "../../test/_mocks/env.ts";
import "../../test/_mocks/sqlite.ts";
import { assert, assertEquals } from "../../test/assert.ts";
import * as manifest from "./manifest.ts";

const entries = Object.entries(manifest);
const commands = entries.filter(
  ([_, v]) => v && typeof v === "object" && "registration" in v,
);
const components = entries.filter(
  ([_, v]) => v && typeof v === "object" && "execute" in v && !("registration" in v),
);

Deno.test("manifest: exports at least 20 commands", () => {
  assert(
    commands.length >= 20,
    `Expected at least 20 commands, got ${commands.length}`,
  );
});

Deno.test("manifest: exports at least 10 components", () => {
  assert(
    components.length >= 10,
    `Expected at least 10 components, got ${components.length}`,
  );
});

Deno.test("manifest: all command exports have execute function", () => {
  for (const [name, cmd] of commands) {
    assert(
      typeof (cmd as any).execute === "function",
      `Command "${name}" is missing execute function`,
    );
  }
});

Deno.test("manifest: all component exports have execute function", () => {
  for (const [name, comp] of components) {
    assert(
      typeof (comp as any).execute === "function",
      `Component "${name}" is missing execute function`,
    );
  }
});

Deno.test("manifest: no duplicate export names", () => {
  const keys = Object.keys(manifest);
  const unique = new Set(keys);
  assertEquals(
    unique.size,
    keys.length,
    `Found duplicate export names in manifest`,
  );
});
