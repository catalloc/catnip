import "../../../test/_mocks/env.ts";
import "../../../test/_mocks/sqlite.ts";
import { assertEquals, assert, assertStringIncludes } from "../../../test/assert.ts";
import about from "./about.ts";

Deno.test("about: returns embed with About This Bot title", async () => {
  const result = await about.execute({
    guildId: "123",
    userId: "456",
    options: {},
    config: {},
  });
  assertEquals(result.success, true);
  assert(result.embed);
  assertEquals(result.embed!.title, "About This Bot");
});

Deno.test("about: embed description mentions Val Town", async () => {
  const result = await about.execute({
    guildId: "123",
    userId: "456",
    options: {},
    config: {},
  });
  assertStringIncludes(result.embed!.description!, "Val Town");
});

Deno.test("about: embed has Commands field with count", async () => {
  const result = await about.execute({
    guildId: "123",
    userId: "456",
    options: {},
    config: {},
  });
  const fields = result.embed!.fields!;
  const commandsField = fields.find((f: any) => f.name === "Commands");
  assert(commandsField, "Should have a Commands field");
  assertStringIncludes(commandsField!.value, "registered");
});

Deno.test("about: embed has footer with vt-discord-bot", async () => {
  const result = await about.execute({
    guildId: "123",
    userId: "456",
    options: {},
    config: {},
  });
  assertStringIncludes(result.embed!.footer!.text, "vt-discord-bot");
});
