/**
 * Feedback Modal Handler
 *
 * Processes the feedback modal submission from /feedback.
 * File: discord/interactions/components/feedback-modal.ts
 */

import { defineComponent } from "../define-component.ts";
import { EmbedColors } from "../../constants.ts";

export default defineComponent({
  customId: "feedback-modal",
  match: "exact",
  type: "modal",

  async execute({ fields, userId }) {
    const topic = fields?.feedback_topic ?? "No topic";
    const details = fields?.feedback_details ?? "No details";

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
