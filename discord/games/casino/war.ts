/**
 * discord/games/casino/war.ts
 *
 * War — player and dealer each draw a card. Higher card wins.
 * On tie, go to "war": double the bet and draw again.
 */

import { secureRandomIndex } from "../../helpers/crypto.ts";

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUIT_EMOJIS = [":hearts:", ":diamonds:", ":clubs:", ":spades:"];

interface WarCard {
  rank: string;
  suit: string;
  value: number;
}

function drawCard(): WarCard {
  const rankIdx = secureRandomIndex(13);
  const suitIdx = secureRandomIndex(4);
  return { rank: RANKS[rankIdx], suit: SUIT_EMOJIS[suitIdx], value: rankIdx + 2 };
}

export function formatWarCard(card: WarCard): string {
  return `${card.rank}${card.suit}`;
}

export interface WarRound {
  playerCard: WarCard;
  dealerCard: WarCard;
}

export interface WarResult {
  rounds: WarRound[];
  won: boolean;
  tied: boolean;
  payout: number;
  totalBet: number;
}

export function playWar(bet: number): WarResult {
  const rounds: WarRound[] = [];
  let totalBet = bet;

  // Initial draw
  const playerCard = drawCard();
  const dealerCard = drawCard();
  rounds.push({ playerCard, dealerCard });

  if (playerCard.value > dealerCard.value) {
    return { rounds, won: true, tied: false, payout: bet * 2, totalBet };
  }

  if (playerCard.value < dealerCard.value) {
    return { rounds, won: false, tied: false, payout: 0, totalBet };
  }

  // War! Double the bet, draw again (max 3 rounds to prevent infinite wars)
  for (let i = 0; i < 2; i++) {
    totalBet += bet;
    const warPlayer = drawCard();
    const warDealer = drawCard();
    rounds.push({ playerCard: warPlayer, dealerCard: warDealer });

    if (warPlayer.value > warDealer.value) {
      // Win: get back total bet + original bet as winnings
      return { rounds, won: true, tied: false, payout: totalBet + bet, totalBet };
    }
    if (warPlayer.value < warDealer.value) {
      return { rounds, won: false, tied: false, payout: 0, totalBet };
    }
  }

  // After 3 ties, push — return original bet only
  return { rounds, won: false, tied: true, payout: bet, totalBet };
}
