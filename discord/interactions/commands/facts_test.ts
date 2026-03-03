import "../../../test/_mocks/env.ts";
import { assert, assertEquals } from "@std/assert";
import { buildFactPage, FACTS } from "./facts.ts";
import { EmbedColors } from "../../constants.ts";

Deno.test("buildFactPage: page 0 shows first fact", () => {
  const { embed } = buildFactPage(0);
  assertEquals(embed.title, `Fact 1 of ${FACTS.length}`);
  assertEquals(embed.description, FACTS[0]);
  assertEquals(embed.color, EmbedColors.INFO);
});

Deno.test("buildFactPage: last page", () => {
  const last = FACTS.length - 1;
  const { embed } = buildFactPage(last);
  assertEquals(embed.title, `Fact ${last + 1} of ${FACTS.length}`);
  assertEquals(embed.description, FACTS[last]);
});

Deno.test("buildFactPage: negative index wraps around", () => {
  const { embed } = buildFactPage(-1);
  assertEquals(embed.description, FACTS[FACTS.length - 1]);
});

Deno.test("buildFactPage: buttons have correct custom_ids", () => {
  const { components } = buildFactPage(3);
  const buttons = components[0].components;
  assertEquals(buttons[0].custom_id, "facts-page:2");
  assertEquals(buttons[1].custom_id, "facts-page:4");
});
