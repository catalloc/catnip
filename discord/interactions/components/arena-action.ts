/**
 * Arena Action Component — Handle attack/skill/defend/flee button presses
 *
 * File: discord/interactions/components/arena-action.ts
 */

import { defineComponent } from "../define-component.ts";
import { accounts } from "../../economy/accounts.ts";
import { economyConfig } from "../../economy/economy-config.ts";
import { arena, resolveTurn, hpBar } from "../../economy/combat.ts";
import { activityLock } from "../../economy/activity-lock.ts";
import { xp, makeXpBar } from "../../economy/xp.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";
import type { ArenaAction } from "../../economy/combat.ts";
import type { CombatSkillEffect } from "../../economy/types.ts";

export default defineComponent({
  customId: "arena:",
  match: "prefix",
  type: "button",

  async execute({ customId, guildId, userId }) {
    const parts = customId.split(":");
    const action = parts[1]; // attack, defend, flee, skill, useskill
    const targetUserId = parts[2];
    const skillEffect = parts[3] as CombatSkillEffect | undefined;

    if (targetUserId !== userId) {
      return { success: false, error: "This isn't your fight!" };
    }

    const session = await arena.getSession(guildId, userId);
    if (!session || session.status !== "active") {
      return { success: false, error: "No active arena fight. Start one with `/arena fight`." };
    }

    const config = await economyConfig.get(guildId);

    // Map action
    let arenaAction: ArenaAction;
    let effectToUse: CombatSkillEffect | undefined;

    if (action === "attack") {
      arenaAction = "attack";
    } else if (action === "defend") {
      arenaAction = "defend";
    } else if (action === "flee") {
      arenaAction = "flee";
    } else if (action === "skill") {
      // "skill" button without specific skill — shouldn't happen but handle
      return { success: false, error: "Select a specific skill from the skill buttons." };
    } else if (action === "useskill") {
      arenaAction = "skill";
      effectToUse = skillEffect;
      if (!effectToUse) return { success: false, error: "Invalid skill." };
      // Verify player has this skill
      const hasSkill = session.playerStats.unlockedSkills.some((s) => s.effect === effectToUse);
      if (!hasSkill) return { success: false, error: "You don't have that skill!" };
    } else {
      return { success: false, error: "Unknown action." };
    }

    // Clear old log for this turn
    session.log = [];

    const result = resolveTurn(session, arenaAction, effectToUse);

    if (result.ended) {
      // Game over — credit rewards, release lock, remove buttons
      await arena.deleteSession(guildId, userId);
      await activityLock.releaseLock(guildId, userId);

      if (result.session.status === "victory" && result.rewardCoins && result.rewardXp) {
        const account = await accounts.creditBalance(guildId, userId, result.rewardCoins);
        const xpResult = await xp.grantXp(guildId, userId, result.rewardXp);
        const levelUpMsg = xpResult.levelsGained > 0 ? `\n:arrow_up: **Level up! Level ${xpResult.newLevel}!**` : "";

        const logText = result.session.log.join("\n");
        const e = embed()
          .title(`:crossed_swords: Arena — Victory! ${result.session.monster.emoji}`)
          .color(EmbedColors.SUCCESS)
          .description(
            `:heart: You: ${hpBar(result.session.playerHp, result.session.playerMaxHp)} ${result.session.playerHp}/${result.session.playerMaxHp} HP\n` +
            `:skull: ${result.session.monster.name}: ${hpBar(0, result.session.monsterMaxHp)} 0/${result.session.monsterMaxHp} HP\n\n` +
            `**Turn ${result.session.turn}:**\n${logText}\n\n` +
            `:tada: You defeated **${result.session.monster.name}** and earned **${result.rewardCoins.toLocaleString()} ${config.currencyName}**!\n+${result.rewardXp} XP${levelUpMsg}`,
          )
          .footer(`Balance: ${account.balance.toLocaleString()} ${config.currencyName}`)
          .build();

        return { success: true, updateMessage: true, embed: e, components: [] };
      }

      if (result.session.status === "defeat") {
        const logText = result.session.log.join("\n");
        const e = embed()
          .title(`:crossed_swords: Arena — Defeat ${result.session.monster.emoji}`)
          .color(EmbedColors.ERROR)
          .description(
            `:heart: You: ${hpBar(0, result.session.playerMaxHp)} 0/${result.session.playerMaxHp} HP\n` +
            `:skull: ${result.session.monster.name}: ${hpBar(result.session.monsterHp, result.session.monsterMaxHp)} ${result.session.monsterHp}/${result.session.monsterMaxHp} HP\n\n` +
            `**Turn ${result.session.turn}:**\n${logText}\n\n` +
            `You were defeated by **${result.session.monster.name}**...`,
          )
          .footer("Better luck next time!")
          .build();

        return { success: true, updateMessage: true, embed: e, components: [] };
      }

      if (result.session.status === "fled") {
        const e = embed()
          .title(`:crossed_swords: Arena — Fled ${result.session.monster.emoji}`)
          .color(EmbedColors.WARNING)
          .description(`You fled from **${result.session.monster.name}**! No rewards earned.`)
          .build();

        return { success: true, updateMessage: true, embed: e, components: [] };
      }
    }

    // Still fighting — update embed
    await arena.updateSession(result.session);

    const logText = result.session.log.join("\n");
    const hasSkills = result.session.playerStats.unlockedSkills.length > 0;

    const e = embed()
      .title(`:crossed_swords: Arena — vs ${result.session.monster.name} ${result.session.monster.emoji}`)
      .color(EmbedColors.INFO)
      .description(
        `:heart: You: ${hpBar(result.session.playerHp, result.session.playerMaxHp)} ${result.session.playerHp}/${result.session.playerMaxHp} HP\n` +
        `:skull: ${result.session.monster.name}: ${hpBar(result.session.monsterHp, result.session.monsterMaxHp)} ${result.session.monsterHp}/${result.session.monsterMaxHp} HP\n\n` +
        `**Turn ${result.session.turn}:**\n${logText}`,
      )
      .footer("Choose an action below")
      .build();

    const components: any[] = [
      {
        type: 1,
        components: [
          { type: 2, style: 1, label: "Attack", custom_id: `arena:attack:${userId}` },
          { type: 2, style: 3, label: "Skill", custom_id: `arena:skill:${userId}`, disabled: !hasSkills },
          { type: 2, style: 2, label: "Defend", custom_id: `arena:defend:${userId}` },
          { type: 2, style: 4, label: "Flee", custom_id: `arena:flee:${userId}` },
        ],
      },
    ];

    if (hasSkills) {
      const skillButtons = result.session.playerStats.unlockedSkills.slice(0, 5).map((s) => ({
        type: 2,
        style: 1,
        label: s.name,
        custom_id: `arena:useskill:${userId}:${s.effect}`,
      }));
      components.push({ type: 1, components: skillButtons });
    }

    return { success: true, updateMessage: true, embed: e, components };
  },
});
