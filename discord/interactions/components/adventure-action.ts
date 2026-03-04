/**
 * Adventure Action Component — Handle dungeon combat button presses
 *
 * File: discord/interactions/components/adventure-action.ts
 */

import { defineComponent } from "../define-component.ts";
import { accounts } from "../../economy/accounts.ts";
import { economyConfig } from "../../economy/economy-config.ts";
import { hpBar } from "../../economy/combat.ts";
import { dungeon, resolveDungeonTurn, advanceFloor, getDungeon } from "../../economy/dungeon.ts";
import { getConsumableItem } from "../../economy/inventory.ts";
import { activityLock } from "../../economy/activity-lock.ts";
import { xp } from "../../economy/xp.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";
import { buildCombatComponents, buildItemPickerComponents } from "../commands/adventure.ts";
import type { DungeonAction } from "../../economy/dungeon.ts";
import type { CombatSkillEffect, ConsumableItemId } from "../../economy/types.ts";

export default defineComponent({
  customId: "adv:",
  match: "prefix",
  type: "button",

  async execute({ customId, guildId, userId }) {
    const parts = customId.split(":");
    const action = parts[1];
    const targetUserId = parts[2];
    const extra = parts[3] as string | undefined;

    if (targetUserId !== userId) {
      return { success: false, error: "This isn't your adventure!" };
    }

    const session = await dungeon.getSession(guildId, userId);
    if (!session) {
      return { success: false, error: "No active dungeon session. Start one with `/adventure enter`." };
    }

    const config = await economyConfig.get(guildId);
    const dungeonDef = getDungeon(session.dungeonId)!;

    // ── Item picker view ──
    if (action === "items") {
      if (session.dungeonInventory.length === 0) {
        return { success: false, error: "You have no items to use!" };
      }
      const components = buildItemPickerComponents(userId, session.dungeonInventory);
      const combat = session.combat!;
      const e = embed()
        .title(`${dungeonDef.emoji} ${dungeonDef.name} — Select Item`)
        .color(EmbedColors.INFO)
        .description(
          `:heart: You: ${hpBar(session.playerHp, session.playerMaxHp)} ${session.playerHp}/${session.playerMaxHp} HP\n` +
          `:skull: ${combat.monster.name}: ${hpBar(combat.monsterHp, combat.monsterMaxHp)} ${combat.monsterHp}/${combat.monsterMaxHp} HP`,
        )
        .footer("Select an item to use")
        .build();

      return { success: true, updateMessage: true, embed: e, components };
    }

    // ── Back to combat view ──
    if (action === "back") {
      if (session.status !== "combat") {
        return { success: false, error: "Not in combat." };
      }
      return { success: true, updateMessage: true, ...buildCombatEmbed(session, dungeonDef, userId) };
    }

    // ── Advance to next floor ──
    if (action === "advance") {
      if (session.status !== "floor-cleared") {
        return { success: false, error: "The floor isn't cleared yet!" };
      }

      advanceFloor(session);
      await dungeon.updateSession(session);

      return { success: true, updateMessage: true, ...buildCombatEmbed(session, dungeonDef, userId) };
    }

    // ── Retreat with rewards ──
    if (action === "retreat") {
      if (session.status !== "floor-cleared") {
        return { success: false, error: "You can only retreat after clearing a floor." };
      }

      session.status = "retreated";
      const earnedCoins = session.accumulatedCoins;
      const earnedXp = session.accumulatedXp;

      const account = await accounts.creditBalance(guildId, userId, earnedCoins);
      const xpResult = await xp.grantXp(guildId, userId, earnedXp);
      await dungeon.deleteSession(guildId, userId);
      await activityLock.releaseLock(guildId, userId);

      const levelUpMsg = xpResult.levelsGained > 0 ? `\n:arrow_up: **Level up! Level ${xpResult.newLevel}!**` : "";

      const e = embed()
        .title(`${dungeonDef.emoji} ${dungeonDef.name} — Retreated!`)
        .color(EmbedColors.SUCCESS)
        .description(
          `You retreated safely after clearing **${session.floorsCompleted}** floor(s)!\n\n` +
          `:coin: **+${earnedCoins.toLocaleString()}** ${config.currencyName}\n` +
          `:star: **+${earnedXp}** XP${levelUpMsg}`,
        )
        .footer(`Balance: ${account.balance.toLocaleString()} ${config.currencyName}`)
        .build();

      return { success: true, updateMessage: true, embed: e, components: [] };
    }

    // ── Claim victory rewards ──
    if (action === "claim") {
      if (session.status !== "victory") {
        return { success: false, error: "The dungeon isn't complete yet!" };
      }

      const earnedCoins = session.accumulatedCoins;
      const earnedXp = session.accumulatedXp;

      const account = await accounts.creditBalance(guildId, userId, earnedCoins);
      const xpResult = await xp.grantXp(guildId, userId, earnedXp);
      await dungeon.deleteSession(guildId, userId);
      await activityLock.releaseLock(guildId, userId);

      const levelUpMsg = xpResult.levelsGained > 0 ? `\n:arrow_up: **Level up! Level ${xpResult.newLevel}!**` : "";

      const e = embed()
        .title(`${dungeonDef.emoji} ${dungeonDef.name} — Victory!`)
        .color(EmbedColors.SUCCESS)
        .description(
          `:tada: You conquered **${dungeonDef.name}**!\n\n` +
          `:coin: **+${earnedCoins.toLocaleString()}** ${config.currencyName}\n` +
          `:star: **+${earnedXp}** XP${levelUpMsg}\n\n` +
          `Completion bonus applied (${dungeonDef.completionBonus}x)!`,
        )
        .footer(`Balance: ${account.balance.toLocaleString()} ${config.currencyName}`)
        .build();

      return { success: true, updateMessage: true, embed: e, components: [] };
    }

    // ── Combat actions ──
    if (session.status !== "combat") {
      return { success: false, error: "You're not in combat right now." };
    }

    let dungeonAction: DungeonAction;
    let skillEffect: CombatSkillEffect | undefined;
    let itemId: ConsumableItemId | undefined;

    if (action === "attack") {
      dungeonAction = "attack";
    } else if (action === "defend") {
      dungeonAction = "defend";
    } else if (action === "skill") {
      return { success: false, error: "Select a specific skill from the skill buttons." };
    } else if (action === "useskill") {
      dungeonAction = "skill";
      skillEffect = extra as CombatSkillEffect;
      if (!skillEffect) return { success: false, error: "Invalid skill." };
      const hasSkill = session.playerStats.unlockedSkills.some((s) => s.effect === skillEffect);
      if (!hasSkill) return { success: false, error: "You don't have that skill!" };
    } else if (action === "useitem") {
      dungeonAction = "item";
      itemId = extra as ConsumableItemId;
      if (!itemId) return { success: false, error: "Invalid item." };
    } else {
      return { success: false, error: "Unknown action." };
    }

    session.log = [];
    const result = resolveDungeonTurn(session, dungeonAction, skillEffect, itemId);

    if (result.ended) {
      if (result.session.status === "defeat") {
        await dungeon.deleteSession(guildId, userId);
        await activityLock.releaseLock(guildId, userId);

        const e = embed()
          .title(`${dungeonDef.emoji} ${dungeonDef.name} — Defeat`)
          .color(EmbedColors.ERROR)
          .description(
            `:heart: You: ${hpBar(0, result.session.playerMaxHp)} 0/${result.session.playerMaxHp} HP\n\n` +
            `**Turn ${result.session.turn}:**\n${result.session.log.join("\n")}\n\n` +
            `You were defeated on **Floor ${result.session.currentFloor}**...\nAll accumulated rewards have been lost.`,
          )
          .footer("Better luck next time!")
          .build();

        return { success: true, updateMessage: true, embed: e, components: [] };
      }

      if (result.session.status === "victory") {
        await dungeon.updateSession(result.session);

        const logText = result.session.log.join("\n");
        const e = embed()
          .title(`${dungeonDef.emoji} ${dungeonDef.name} — Dungeon Complete!`)
          .color(EmbedColors.SUCCESS)
          .description(
            `:heart: You: ${hpBar(result.session.playerHp, result.session.playerMaxHp)} ${result.session.playerHp}/${result.session.playerMaxHp} HP\n\n` +
            `**Turn ${result.session.turn}:**\n${logText}\n\n` +
            `:coin: Total: **${result.session.accumulatedCoins.toLocaleString()}** ${config.currencyName}\n` +
            `:star: Total: **${result.session.accumulatedXp}** XP`,
          )
          .footer("Claim your rewards!")
          .build();

        const components = [{
          type: 1,
          components: [
            { type: 2, style: 3, label: "\u{1F389} Claim Rewards", custom_id: `adv:claim:${userId}` },
          ],
        }];

        return { success: true, updateMessage: true, embed: e, components };
      }
    }

    // ── Floor cleared — show advance/retreat ──
    if (result.floorCleared && result.session.status === "floor-cleared") {
      await dungeon.updateSession(result.session);

      const logText = result.session.log.join("\n");
      const e = embed()
        .title(`${dungeonDef.emoji} ${dungeonDef.name} — Floor ${result.session.currentFloor} Cleared!`)
        .color(EmbedColors.SUCCESS)
        .description(
          `:heart: You: ${hpBar(result.session.playerHp, result.session.playerMaxHp)} ${result.session.playerHp}/${result.session.playerMaxHp} HP\n\n` +
          `**Turn ${result.session.turn}:**\n${logText}\n\n` +
          `:coin: Accumulated: **${result.session.accumulatedCoins.toLocaleString()}** ${config.currencyName}\n` +
          `:star: Accumulated: **${result.session.accumulatedXp}** XP`,
        )
        .footer("Advance deeper or retreat with your rewards?")
        .build();

      const nextFloor = result.session.currentFloor + 1;
      const components = [{
        type: 1,
        components: [
          { type: 2, style: 1, label: `\u2B07\uFE0F Descend to Floor ${nextFloor}`, custom_id: `adv:advance:${userId}` },
          { type: 2, style: 2, label: "\u{1F3C3} Retreat with Rewards", custom_id: `adv:retreat:${userId}` },
        ],
      }];

      return { success: true, updateMessage: true, embed: e, components };
    }

    // ── Still fighting — update combat embed ──
    await dungeon.updateSession(result.session);
    return { success: true, updateMessage: true, ...buildCombatEmbed(result.session, dungeonDef, userId) };
  },
});

// ── Helpers ──

function buildCombatEmbed(
  session: import("../../economy/types.ts").DungeonSession,
  dungeonDef: import("../../economy/types.ts").DungeonDefinition,
  userId: string,
): { embed: any; components: any[] } {
  const combat = session.combat!;
  const hasSkills = session.playerStats.unlockedSkills.length > 0;
  const hasItems = session.dungeonInventory.length > 0;
  const bossTag = combat.isBoss ? " **[BOSS]**" : "";

  const buffText = session.activeBuffs.length > 0
    ? "\n" + session.activeBuffs.map((b) => {
        if (b.type === "damage-boost") return `:crossed_swords: ${b.value}x damage (${b.turnsRemaining} turns)`;
        if (b.type === "shield") return `:shield: ${Math.round(b.value * 100)}% reduction (${b.turnsRemaining} turns)`;
        if (b.type === "revive") return `:gem: Revive charm active`;
        return "";
      }).filter(Boolean).join("\n")
    : "";

  const logText = session.log.length > 0
    ? `\n\n**Turn ${session.turn}:**\n${session.log.join("\n")}`
    : "";

  const e = embed()
    .title(`${dungeonDef.emoji} ${dungeonDef.name} — Floor ${session.currentFloor}`)
    .color(EmbedColors.INFO)
    .description(
      `Room ${session.currentRoom}/${session.totalRoomsOnFloor}${bossTag}\n\n` +
      `:heart: You: ${hpBar(session.playerHp, session.playerMaxHp)} ${session.playerHp}/${session.playerMaxHp} HP` +
      buffText + `\n` +
      `:skull: ${combat.monster.name}: ${hpBar(combat.monsterHp, combat.monsterMaxHp)} ${combat.monsterHp}/${combat.monsterMaxHp} HP` +
      logText,
    )
    .footer(`Floor ${session.currentFloor} | Coins: ${session.accumulatedCoins} | XP: ${session.accumulatedXp}`)
    .build();

  const components = buildCombatComponents(userId, hasSkills, hasItems, session.playerStats.unlockedSkills);

  return { embed: e, components };
}
