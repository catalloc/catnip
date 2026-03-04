/**
 * Train Command — Train combat stats and weapon mastery
 *
 * File: discord/interactions/commands/train.ts
 */

import { defineCommand, OptionTypes } from "../define-command.ts";
import { economyConfig } from "../../economy/economy-config.ts";
import { training, computeDerivedStats, getSkillLabel, COMBAT_SKILLS, TRAINING_XP } from "../../economy/training.ts";
import { activityLock } from "../../economy/activity-lock.ts";
import { xp, makeXpBar } from "../../economy/xp.ts";
import { embed } from "../../helpers/embed-builder.ts";
import { EmbedColors } from "../../constants.ts";
import type { TrainableSkill } from "../../economy/types.ts";

function formatDuration(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
}

const VALID_SKILLS: TrainableSkill[] = ["strength", "defense", "speed", "vitality", "sword", "bow", "magic"];

export default defineCommand({
  name: "train",
  description: "Train your combat stats and weapon mastery",

  options: [
    {
      name: "start",
      description: "Start a training session",
      type: OptionTypes.SUB_COMMAND,
      required: false,
      options: [
        {
          name: "skill",
          description: "Skill to train",
          type: OptionTypes.STRING,
          required: true,
          choices: [
            { name: "Strength", value: "strength" },
            { name: "Defense", value: "defense" },
            { name: "Speed", value: "speed" },
            { name: "Vitality", value: "vitality" },
            { name: "Sword Mastery", value: "sword" },
            { name: "Bow Mastery", value: "bow" },
            { name: "Magic Mastery", value: "magic" },
          ],
        },
      ],
    },
    {
      name: "collect",
      description: "Collect your training results",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "status",
      description: "Check on your training progress",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
    {
      name: "info",
      description: "View your combat stats and available skills",
      type: OptionTypes.SUB_COMMAND,
      required: false,
    },
  ],

  registration: { type: "guild" },
  deferred: false,
  ephemeral: true,

  async execute({ guildId, userId, options }) {
    const sub = options?.subcommand as string | undefined;
    const config = await economyConfig.get(guildId);

    if (!config.trainEnabled) {
      return { success: false, error: "Training is disabled in this server." };
    }

    if (sub === "start") {
      const skill = options?.skill as TrainableSkill;
      if (!VALID_SKILLS.includes(skill)) {
        return { success: false, error: "Unknown skill." };
      }

      // Acquire activity lock
      const lockResult = await activityLock.acquireLock(guildId, userId, "train", getSkillLabel(skill));
      if (!lockResult.success) return { success: false, error: lockResult.error };

      const result = await training.startTraining(guildId, userId, skill);
      if (!result.success) {
        await activityLock.releaseLock(guildId, userId);
        return { success: false, error: result.error };
      }

      const e = embed()
        .title(`:crossed_swords: Training — ${getSkillLabel(skill)}`)
        .color(EmbedColors.INFO)
        .description(`You started training **${getSkillLabel(skill)}**! Come back in **${formatDuration(result.durationMs!)}** to collect.`)
        .footer("Use /train collect when done")
        .build();

      return { success: true, embed: e };
    }

    if (sub === "collect") {
      const result = await training.collectTraining(guildId, userId);
      if (!result.success) return { success: false, error: result.error };

      // Release activity lock
      await activityLock.releaseLock(guildId, userId);

      // Grant XP
      const xpResult = await xp.grantXp(guildId, userId, TRAINING_XP);
      const levelUpMsg = xpResult.levelsGained > 0 ? `\n:arrow_up: **Level up! You're now Level ${xpResult.newLevel}!**` : "";

      const e = embed()
        .title(`:crossed_swords: Training Complete!`)
        .color(EmbedColors.SUCCESS)
        .description(
          `Your **${getSkillLabel(result.skill!)}** increased to **Level ${result.newLevel}**!\n+${TRAINING_XP} XP${levelUpMsg}`,
        )
        .footer(`${makeXpBar(xpResult.state.xp)}`)
        .build();

      return { success: true, embed: e };
    }

    if (sub === "status") {
      const session = await training.getSession(guildId, userId);
      if (!session || session.collected) {
        return { success: true, message: "No active training session. Use `/train start` to begin!" };
      }

      const now = Date.now();
      const ready = now >= session.readyAt;
      const remaining = ready ? 0 : session.readyAt - now;

      const e = embed()
        .title(`:crossed_swords: Training Status`)
        .color(ready ? EmbedColors.SUCCESS : EmbedColors.INFO)
        .field("Skill", getSkillLabel(session.skill), true)
        .field("Status", ready ? ":white_check_mark: Ready to collect!" : `:hourglass: ${formatDuration(remaining)} remaining`, true)
        .footer(ready ? "Use /train collect" : "Come back when it's ready!")
        .build();

      return { success: true, embed: e };
    }

    if (sub === "info") {
      const stats = await training.getStats(guildId, userId);
      const playerLevel = await xp.getLevel(guildId, userId);
      const derived = computeDerivedStats(stats, playerLevel);

      const statLines = [
        `**Strength:** ${stats.strength} | **Defense:** ${stats.defense}`,
        `**Speed:** ${stats.speed} | **Vitality:** ${stats.vitality}`,
        `**Sword:** ${stats.swordMastery} | **Bow:** ${stats.bowMastery} | **Magic:** ${stats.magicMastery}`,
        "",
        `**HP:** ${derived.maxHp} | **ATK:** ${derived.attack} | **DEF:** ${derived.defense} | **SPD:** ${derived.speed}`,
      ];

      if (derived.unlockedSkills.length > 0) {
        statLines.push("", "**Unlocked Skills:**");
        for (const s of derived.unlockedSkills) {
          statLines.push(`- **${s.name}** — ${s.description}`);
        }
      }

      const lockedSkills = COMBAT_SKILLS.filter((s) => !derived.unlockedSkills.some((u) => u.id === s.id));
      if (lockedSkills.length > 0) {
        statLines.push("", "**Locked Skills:**");
        for (const s of lockedSkills) {
          statLines.push(`- :lock: **${s.name}** — ${s.requiredAttribute} Lv.${s.requiredLevel}`);
        }
      }

      const e = embed()
        .title(`:crossed_swords: Combat Stats`)
        .description(statLines.join("\n"))
        .color(EmbedColors.INFO)
        .footer(`Level ${playerLevel}`)
        .build();

      return { success: true, embed: e };
    }

    return { success: false, error: "Please use a subcommand: start, collect, status, or info." };
  },
});
