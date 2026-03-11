import "../../../test/_mocks/env.ts";
import { assertEquals } from "../../../test/assert.ts";
import ping from "./ping.ts";

Deno.test("ping: returns Pong! response", async () => {
  const result = await ping.execute({
    guildId: "123",
    userId: "456",
    options: {},
    config: {},
  });
  assertEquals(result.success, true);
  assertEquals(result.message, "Pong!");
});
