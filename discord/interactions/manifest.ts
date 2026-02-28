/**
 * discord/interactions/manifest.ts
 *
 * Static fallback manifest used on first deploy before KV is populated.
 * After first deploy, hit ?discover=true to scan the project and store
 * the manifest in KV. Subsequent cold starts read from KV instead.
 *
 * This file is only used when the KV "manifest" key is empty.
 */

// Commands
export { default as about } from "./commands/about.ts";
export { default as coinFlip } from "./commands/coin-flip.ts";
export { default as colorPicker } from "./commands/color-picker.ts";
export { default as commands } from "./commands/commands.ts";
export { default as counter } from "./commands/counter.ts";
export { default as echo } from "./commands/echo.ts";
export { default as facts } from "./commands/facts.ts";
export { default as feedback } from "./commands/feedback.ts";
export { default as giveaway } from "./commands/giveaway.ts";
export { default as help } from "./commands/help.ts";
export { default as pick } from "./commands/pick.ts";
export { default as ping } from "./commands/ping.ts";
export { default as poll } from "./commands/poll.ts";
export { default as r } from "./commands/r.ts";
export { default as reactRoles } from "./commands/react-roles.ts";
export { default as remind } from "./commands/remind.ts";
export { default as schedule } from "./commands/schedule.ts";
export { default as slowEcho } from "./commands/slow-echo.ts";
export { default as tag } from "./commands/tag.ts";
export { default as userInfo } from "./commands/user-info.ts";

// Components
export { default as colorSelect } from "./components/color-select.ts";
export { default as exampleButton } from "./components/example-button.ts";
export { default as factsPage } from "./components/facts-page.ts";
export { default as feedbackModal } from "./components/feedback-modal.ts";
export { default as giveawayEnter } from "./components/giveaway-enter.ts";
export { default as pollVote } from "./components/poll-vote.ts";
export { default as reactRole } from "./components/react-role.ts";
