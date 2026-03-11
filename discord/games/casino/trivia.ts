/**
 * discord/games/casino/trivia.ts
 *
 * Trivia — bot posts a question with 4 choices. First correct answer wins.
 */

import { secureRandomIndex } from "../../helpers/crypto.ts";
import { kv } from "../../persistence/kv.ts";
import type { TriviaSession } from "../types.ts";

const SESSION_TTL_MS = 30 * 1000; // 30 seconds to answer

function sessionKey(guildId: string, hostId: string): string {
  return `trivia:${guildId}:${hostId}`;
}

export interface TriviaQuestion {
  question: string;
  choices: string[];
  correctIndex: number;
  category: string;
}

// Question bank — diverse categories
const QUESTIONS: TriviaQuestion[] = [
  // Science
  { question: "What planet is known as the Red Planet?", choices: ["Venus", "Mars", "Jupiter", "Saturn"], correctIndex: 1, category: "Science" },
  { question: "What is the chemical symbol for gold?", choices: ["Go", "Gd", "Au", "Ag"], correctIndex: 2, category: "Science" },
  { question: "How many bones are in the adult human body?", choices: ["186", "206", "226", "246"], correctIndex: 1, category: "Science" },
  { question: "What gas do plants absorb from the atmosphere?", choices: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"], correctIndex: 2, category: "Science" },
  { question: "What is the hardest natural substance on Earth?", choices: ["Gold", "Iron", "Diamond", "Platinum"], correctIndex: 2, category: "Science" },
  { question: "What is the closest star to Earth?", choices: ["Proxima Centauri", "The Sun", "Sirius", "Alpha Centauri"], correctIndex: 1, category: "Science" },
  { question: "What element has the atomic number 1?", choices: ["Helium", "Hydrogen", "Oxygen", "Carbon"], correctIndex: 1, category: "Science" },
  { question: "What is the speed of light (approx)?", choices: ["150,000 km/s", "200,000 km/s", "300,000 km/s", "400,000 km/s"], correctIndex: 2, category: "Science" },

  // Geography
  { question: "What is the largest ocean on Earth?", choices: ["Atlantic", "Indian", "Arctic", "Pacific"], correctIndex: 3, category: "Geography" },
  { question: "What country has the most people?", choices: ["USA", "India", "China", "Indonesia"], correctIndex: 1, category: "Geography" },
  { question: "What is the smallest country in the world?", choices: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"], correctIndex: 1, category: "Geography" },
  { question: "What river is the longest in the world?", choices: ["Amazon", "Nile", "Mississippi", "Yangtze"], correctIndex: 1, category: "Geography" },
  { question: "On which continent is the Sahara Desert?", choices: ["Asia", "Africa", "Australia", "South America"], correctIndex: 1, category: "Geography" },
  { question: "What is the capital of Australia?", choices: ["Sydney", "Melbourne", "Canberra", "Brisbane"], correctIndex: 2, category: "Geography" },
  { question: "What is the largest island in the world?", choices: ["Madagascar", "Greenland", "Borneo", "New Guinea"], correctIndex: 1, category: "Geography" },

  // History
  { question: "In what year did World War II end?", choices: ["1943", "1944", "1945", "1946"], correctIndex: 2, category: "History" },
  { question: "Who painted the Mona Lisa?", choices: ["Michelangelo", "Da Vinci", "Raphael", "Donatello"], correctIndex: 1, category: "History" },
  { question: "What ancient wonder was located in Alexandria?", choices: ["Colossus", "Lighthouse", "Hanging Gardens", "Temple of Artemis"], correctIndex: 1, category: "History" },
  { question: "Who was the first person to walk on the Moon?", choices: ["Buzz Aldrin", "Yuri Gagarin", "Neil Armstrong", "John Glenn"], correctIndex: 2, category: "History" },
  { question: "What year did the Titanic sink?", choices: ["1910", "1911", "1912", "1913"], correctIndex: 2, category: "History" },
  { question: "What empire built the Colosseum?", choices: ["Greek", "Roman", "Ottoman", "Byzantine"], correctIndex: 1, category: "History" },

  // Pop Culture
  { question: "What is the name of Batman's butler?", choices: ["Jarvis", "Alfred", "Watson", "Jenkins"], correctIndex: 1, category: "Pop Culture" },
  { question: "How many strings does a standard guitar have?", choices: ["4", "5", "6", "8"], correctIndex: 2, category: "Pop Culture" },
  { question: "What is the highest-grossing film of all time?", choices: ["Titanic", "Avatar", "Endgame", "Star Wars"], correctIndex: 1, category: "Pop Culture" },
  { question: "In Monopoly, what color is Park Place?", choices: ["Green", "Red", "Blue", "Yellow"], correctIndex: 2, category: "Pop Culture" },
  { question: "What video game features a character named Link?", choices: ["Final Fantasy", "Zelda", "Mario", "Metroid"], correctIndex: 1, category: "Pop Culture" },

  // Math
  { question: "What is the value of Pi to two decimal places?", choices: ["3.12", "3.14", "3.16", "3.18"], correctIndex: 1, category: "Math" },
  { question: "What is the square root of 144?", choices: ["10", "11", "12", "14"], correctIndex: 2, category: "Math" },
  { question: "How many sides does a hexagon have?", choices: ["5", "6", "7", "8"], correctIndex: 1, category: "Math" },
  { question: "What is 17 × 6?", choices: ["92", "96", "102", "108"], correctIndex: 2, category: "Math" },

  // Nature
  { question: "What is the largest mammal?", choices: ["Elephant", "Blue Whale", "Giraffe", "Hippo"], correctIndex: 1, category: "Nature" },
  { question: "How many legs does a spider have?", choices: ["6", "8", "10", "12"], correctIndex: 1, category: "Nature" },
  { question: "What is the fastest land animal?", choices: ["Lion", "Cheetah", "Horse", "Gazelle"], correctIndex: 1, category: "Nature" },
  { question: "What is a group of wolves called?", choices: ["Herd", "Flock", "Pack", "Pride"], correctIndex: 2, category: "Nature" },
  { question: "What type of animal is a Komodo dragon?", choices: ["Dinosaur", "Lizard", "Snake", "Crocodile"], correctIndex: 1, category: "Nature" },
];

/** Pick a random question. */
export function pickQuestion(): TriviaQuestion {
  return QUESTIONS[secureRandomIndex(QUESTIONS.length)];
}

export const trivia = {
  async getSession(guildId: string, hostId: string): Promise<TriviaSession | null> {
    const session = await kv.get<TriviaSession>(sessionKey(guildId, hostId));
    if (session && Date.now() - session.createdAt > SESSION_TTL_MS) {
      await kv.delete(sessionKey(guildId, hostId));
      return null;
    }
    return session;
  },

  async createSession(
    guildId: string,
    hostId: string,
    bet: number,
  ): Promise<TriviaSession> {
    const q = pickQuestion();
    const session: TriviaSession = {
      guildId,
      hostId,
      bet,
      question: q.question,
      choices: q.choices,
      correctIndex: q.correctIndex,
      category: q.category,
      answeredBy: null,
      status: "active",
      createdAt: Date.now(),
    };
    await kv.set(sessionKey(guildId, hostId), session);
    return session;
  },

  async updateSession(session: TriviaSession): Promise<void> {
    await kv.set(sessionKey(session.guildId, session.hostId), session);
  },

  async deleteSession(guildId: string, hostId: string): Promise<void> {
    await kv.delete(sessionKey(guildId, hostId));
  },
};

export const _internals = { sessionKey, SESSION_TTL_MS, QUESTIONS };
