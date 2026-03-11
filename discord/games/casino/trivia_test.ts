import "../../../test/_mocks/env.ts";
import { assertEquals, assert } from "../../../test/assert.ts";
import { sqlite } from "../../../test/_mocks/sqlite.ts";
import { trivia, pickQuestion, _internals } from "./trivia.ts";

function resetStore() {
  (sqlite as any)._reset();
}

// ── Pure function tests ──

Deno.test("pickQuestion: returns a valid question", () => {
  const q = pickQuestion();
  assert(q.question.length > 0);
  assertEquals(q.choices.length, 4);
  assert(q.correctIndex >= 0 && q.correctIndex < 4);
  assert(q.category.length > 0);
});

Deno.test("pickQuestion: all questions have valid structure", () => {
  for (const q of _internals.QUESTIONS) {
    assertEquals(q.choices.length, 4, `Question "${q.question}" should have 4 choices`);
    assert(q.correctIndex >= 0 && q.correctIndex < 4, `Question "${q.question}" has invalid correctIndex`);
    assert(q.category.length > 0, `Question "${q.question}" missing category`);
    assert(q.question.endsWith("?"), `Question "${q.question}" should end with ?`);
  }
});

Deno.test("pickQuestion: returns different questions (not always the same)", () => {
  const questions = new Set<string>();
  for (let i = 0; i < 50; i++) {
    questions.add(pickQuestion().question);
  }
  assert(questions.size > 1, "Should pick different questions");
});

// ── Session tests ──

Deno.test("session: create and retrieve", async () => {
  resetStore();
  const session = await trivia.createSession("g1", "u1", 500);
  assertEquals(session.guildId, "g1");
  assertEquals(session.hostId, "u1");
  assertEquals(session.bet, 500);
  assertEquals(session.status, "active");
  assert(session.question.length > 0);
  assertEquals(session.choices.length, 4);
  assertEquals(session.answeredBy, null);

  const retrieved = await trivia.getSession("g1", "u1");
  assert(retrieved !== null);
  assertEquals(retrieved!.question, session.question);
});

Deno.test("session: update persists", async () => {
  resetStore();
  const session = await trivia.createSession("g1", "u1", 100);
  session.answeredBy = "u2";
  session.status = "done";
  await trivia.updateSession(session);

  const retrieved = await trivia.getSession("g1", "u1");
  assertEquals(retrieved!.answeredBy, "u2");
  assertEquals(retrieved!.status, "done");
});

Deno.test("session: delete removes", async () => {
  resetStore();
  await trivia.createSession("g1", "u1", 100);
  await trivia.deleteSession("g1", "u1");
  assertEquals(await trivia.getSession("g1", "u1"), null);
});

Deno.test("session: expired session returns null", async () => {
  resetStore();
  const session = await trivia.createSession("g1", "u1", 100);
  session.createdAt = Date.now() - _internals.SESSION_TTL_MS - 1000;
  await trivia.updateSession(session);

  assertEquals(await trivia.getSession("g1", "u1"), null);
});

Deno.test("question bank: has reasonable diversity", () => {
  const categories = new Set(_internals.QUESTIONS.map((q) => q.category));
  assert(categories.size >= 4, "Should have at least 4 categories");
  assert(_internals.QUESTIONS.length >= 20, "Should have at least 20 questions");
});
