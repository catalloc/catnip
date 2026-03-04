/**
 * Arena Command — PvE turn-based combat
 *
 * File: discord/interactions/commands/arena.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { economyConfig } from "../../economy/economy-config.ts";
import { training, computeDerivedStats } from "../../economy/training.ts";
import { arena, MONSTERS, getMonster, getAvailableMonsters, getWeapon, hpBar } from "../../economy/combat.ts";
import { activityLock } from "../../economy/activity-lock.ts";
import { xp } from "../../economy/xp.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";

export default defineCommand({
  name: "arena",
  description: "Fight monsters in the arena for coins and XP",

  options: [
    {
      name: "fight",
      description: "Challenge a monster",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "monster",
          description: "Monster to fight (optional, auto-picks if omitted)",
          type: OptionTypes.STRING,
          required: false,
          choices: MONSTERS.map((m) => ({ name: `${m.emoji} ${m.name} (Lv.${m.requiredLevel})`, value: m.id })),
        },
      ],
    },
    {
      name: "monsters",
      description: "View available monsters",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
  ],

  registration: { type: "guild" },
  deferred: false,
  ephemeral: false,

  async execute({ guildId, userId, options }) {
    const sub = options?.subcommand as string | undefined;
    const config = await economyConfig.get(guildId);

    if (!config.arenaEnabled) {
      return { success: false, error: "The arena is disabled in this server." };
    }

    if (sub === "fight") {
      const monsterId = options?.monster as string | undefined;
      const playerLevel = await xp.getLevel(guildId, userId);

      let monster;
      if (monsterId) {
        monster = getMonster(monsterId);
        if (!monster) return { success: false, error: "Unknown monster." };
        if (playerLevel < monster.requiredLevel) {
          return { success: false, error: `You need to be **Level ${monster.requiredLevel}** to fight **${monster.name}**. You're Level ${playerLevel}.` };
        }
      } else {
        // Pick highest-level available monster
        const available = getAvailableMonsters(playerLevel);
        monster = available[available.length - 1];
      }

      // Acquire activity lock
      const lockResult = await activityLock.acquireLock(guildId, userId, "arena", monster.name);
      if (!lockResult.success) return { success: false, error: lockResult.error };

      // Check for existing session
      const existing = await arena.getSession(guildId, userId);
      if (existing && existing.status === "active") {
        await activityLock.releaseLock(guildId, userId);
        return { success: false, error: "You already have an active arena fight! Use the buttons to continue." };
      }

      // Get player stats
      const stats = await training.getStats(guildId, userId);
      const weapon = stats.equippedWeaponId ? getWeapon(stats.equippedWeaponId) : undefined;
      const derived = computeDerivedStats(stats, playerLevel, weapon);

      const session = await arena.createSession(guildId, userId, monster, derived);

      const hasSkills = derived.unlockedSkills.length > 0;
      const e = embed()
        .title(`:crossed_swords: Arena — vs ${monster.name} ${monster.emoji}`)
        .color(EmbedColors.INFO)
        .description(
          `:heart: You: ${hpBar(session.playerHp, session.playerMaxHp)} ${session.playerHp}/${session.playerMaxHp} HP\n` +
          `:skull: ${monster.name}: ${hpBar(session.monsterHp, session.monsterMaxHp)} ${session.monsterHp}/${session.monsterMaxHp} HP\n\n` +
          `**Turn 0** — Battle begins!`,
        )
        .footer("Choose an action below")
        .build();

      const components = [
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

      // If player has skills, add skill selection buttons
      if (hasSkills) {
        const skillButtons = derived.unlockedSkills.slice(0, 5).map((s) => ({
          type: 2,
          style: 1,
          label: s.name,
          custom_id: `arena:useskill:${userId}:${s.effect}`,
        }));
        components.push({ type: 1, components: skillButtons });
      }

      return { success: true, embed: e, components };
    }

    if (sub === "monsters") {
      const playerLevel = await xp.getLevel(guildId, userId);
      const lines = MONSTERS.map((m) => {
        const locked = playerLevel < m.requiredLevel ? " :lock:" : " :white_check_mark:";
        return `${m.emoji} **${m.name}**${locked} — Lv.${m.requiredLevel} | HP:${m.hp} ATK:${m.attack} DEF:${m.defense} SPD:${m.speed} | ${m.rewardMin}-${m.rewardMax} ${config.currencyName} | ${m.xpReward} XP`;
      });

      const e = embed()
        .title(`:crossed_swords: Arena — Monsters`)
        .description(lines.join("\n"))
        .color(EmbedColors.INFO)
        .footer(`Your level: ${playerLevel}`)
        .build();

      return { success: true, embed: e };
    }

    return { success: false, error: "Please use a subcommand: fight or monsters." };
  },
});
