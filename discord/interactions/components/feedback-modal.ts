/**
 * Feedback Modal Handler
 *
 * Processes the feedback modal submission from /feedback.
 * File: discord/interactions/components/feedback-modal.ts
 */

import { defineComponent } from "../define-component.ts";
import { CONFIG, EmbedColors } from "../../constants.ts";
import { send } from "../../webhook/send.ts";
import { createLogger } from "../../webhook/logger.ts";

const logger = createLogger("FeedbackModal");

export default defineComponent({
  customId: "feedback-modal",
  match: "exact",
  type: "modal",

  async execute({ fields, userId }) {
    const topic = (fields?.feedback_topic ?? "No topic").slice(0, 256);
    const details = (fields?.feedback_details ?? "No details").slice(0, 1024);

    if (CONFIG.feedbackWebhook) {
      const result = await send(
        {
          title: "New Feedback",
          color: EmbedColors.INFO,
          fields: [
            { name: "Topic", value: topic },
            { name: "Details", value: details },
          ],
          footer: { text: `User: ${userId}` },
          timestamp: new Date().toISOString(),
        },
        CONFIG.feedbackWebhook,
      );
      if (!result.success) {
        logger.error(`Failed to send feedback webhook: ${result.error}`);
        return { success: false, error: "Failed to submit feedback. Please try again later." };
      }
    }

    return {
      success: true,
      message: "",
      embed: {
        title: "Feedback Received",
        description: `Thank you <@${userId}>! Your feedback has been recorded.`,
        color: EmbedColors.SUCCESS,
        fields: [
          { name: "Topic", value: topic },
          { name: "Details", value: details },
        ],
      },
    };
  },
});
