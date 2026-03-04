/**
 * discord/economy/accounts.ts
 *
 * Balance CRUD — get, credit, debit via atomic CAS mutations.
 */

import { kv } from "../persistence/kv.ts";
import type { EconomyAccount } from "./types.ts";

function accountKey(guildId: string, userId: string): string {
  return `economy:${guildId}:${userId}`;
}

function accountPrefix(guildId: string): string {
  return `economy:${guildId}:`;
}

function createDefault(guildId: string, userId: string, startingBalance = 0): EconomyAccount {
  const now = Date.now();
  return {
    userId,
    guildId,
    balance: startingBalance,
    lifetimeEarned: startingBalance > 0 ? startingBalance : 0,
    createdAt: now,
    updatedAt: now,
  };
}

export const accounts = {
  async getAccount(guildId: string, userId: string): Promise<EconomyAccount | null> {
    return await kv.get<EconomyAccount>(accountKey(guildId, userId));
  },

  async getOrCreate(guildId: string, userId: string, startingBalance = 0): Promise<EconomyAccount> {
    const existing = await kv.get<EconomyAccount>(accountKey(guildId, userId));
    if (existing) return existing;
    const account = createDefault(guildId, userId, startingBalance);
    await kv.set(accountKey(guildId, userId), account);
    return account;
  },

  /**
   * Credit (add) coins to a user's balance. Returns the updated account.
   */
  async creditBalance(guildId: string, userId: string, amount: number): Promise<EconomyAccount> {
    if (amount < 0) throw new Error("Credit amount must be non-negative");
    return await kv.update<EconomyAccount>(accountKey(guildId, userId), (current) => {
      const account = current ?? createDefault(guildId, userId);
      account.balance += amount;
      account.lifetimeEarned += amount;
      account.updatedAt = Date.now();
      return account;
    });
  },

  /**
   * Debit (remove) coins from a user's balance.
   * Returns { success, account } — success is false if insufficient funds.
   */
  async debitBalance(
    guildId: string,
    userId: string,
    amount: number,
  ): Promise<{ success: boolean; account: EconomyAccount }> {
    if (amount < 0) throw new Error("Debit amount must be non-negative");
    let insufficient = false;
    const account = await kv.update<EconomyAccount>(accountKey(guildId, userId), (current) => {
      const acc = current ?? createDefault(guildId, userId);
      if (acc.balance < amount) {
        insufficient = true;
        return acc;
      }
      acc.balance -= amount;
      acc.updatedAt = Date.now();
      return acc;
    });
    return { success: !insufficient, account };
  },

  /**
   * Set balance to an exact value (admin use).
   */
  async setBalance(guildId: string, userId: string, amount: number): Promise<EconomyAccount> {
    return await kv.update<EconomyAccount>(accountKey(guildId, userId), (current) => {
      const account = current ?? createDefault(guildId, userId);
      const diff = amount - account.balance;
      account.balance = amount;
      if (diff > 0) account.lifetimeEarned += diff;
      account.updatedAt = Date.now();
      return account;
    });
  },

  /**
   * List all accounts in a guild, sorted by balance descending.
   */
  async listAccounts(guildId: string): Promise<EconomyAccount[]> {
    const entries = await kv.list(accountPrefix(guildId));
    return (entries.map((e) => e.value) as EconomyAccount[])
      .filter((a) => a && a.userId)
      .sort((a, b) => b.balance - a.balance);
  },
};

export const _internals = { accountKey, accountPrefix, createDefault };
