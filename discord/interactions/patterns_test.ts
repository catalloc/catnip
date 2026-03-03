import { assertEquals } from "@std/assert";
import {
  InteractionResponseType,
  OptionTypes,
  createAutocompleteResponse,
} from "./patterns.ts";

Deno.test("InteractionResponseType: values match Discord API", () => {
  assertEquals(InteractionResponseType.PONG, 1);
  assertEquals(InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, 4);
  assertEquals(InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE, 5);
  assertEquals(InteractionResponseType.MODAL, 9);
});

Deno.test("OptionTypes: values match Discord API", () => {
  assertEquals(OptionTypes.SUB_COMMAND, 1);
  assertEquals(OptionTypes.STRING, 3);
  assertEquals(OptionTypes.USER, 6);
  assertEquals(OptionTypes.ATTACHMENT, 11);
});

Deno.test("createAutocompleteResponse: returns correct body", async () => {
  const res = createAutocompleteResponse([{ name: "foo", value: "bar" }]);
  const body = await res.json();
  assertEquals(body.type, InteractionResponseType.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT);
  assertEquals(body.data.choices, [{ name: "foo", value: "bar" }]);
});

Deno.test("createAutocompleteResponse: slices to 25 choices", async () => {
  const choices = Array.from({ length: 30 }, (_, i) => ({ name: `c${i}`, value: `${i}` }));
  const res = createAutocompleteResponse(choices);
  const body = await res.json();
  assertEquals(body.data.choices.length, 25);
});

Deno.test("createAutocompleteResponse: empty choices", async () => {
  const res = createAutocompleteResponse([]);
  const body = await res.json();
  assertEquals(body.data.choices, []);
});
