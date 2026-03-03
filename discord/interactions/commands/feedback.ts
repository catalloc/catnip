/**
 * Feedback Command - Opens a modal form for user feedback
 *
 * File: discord/interactions/commands/feedback.ts
 */

import { defineCommand } from "../define-command.ts";
import { CONFIG, EmbedColors } from "../../constants.ts";

export default defineCommand({
  name: "feedback",
  description: "Submit feedback via a modal form",

  registration: { type: "guild" },
  deferred: false,

  async execute() {
    if (!CONFIG.feedbackWebhook) {
      return {
        success: true,
        message: "",
        embed: {
          title: "Feedback Not Enabled",
          description: "The feedback system is not configured on this bot.",
          color: EmbedColors.ERROR,
        },
        ephemeral: true,
      };
    }

    return {
      success: true,
      modal: {
        title: "Submit Feedback",
        custom_id: "feedback-modal",
        components: [
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: "feedback_topic",
              label: "Topic",
              style: 1,
              placeholder: "What is this about?",
              required: true,
              max_length: 100,
            }],
          },
          {
            type: 1,
            components: [{
              type: 4,
              custom_id: "feedback_details",
              label: "Details",
              style: 2,
              placeholder: "Tell us more...",
              required: true,
              max_length: 1000,
            }],
          },
        ],
      },
    };
  },
});
