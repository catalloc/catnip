/**
 * discord/pages.ts
 *
 * Static HTML pages served from the interactions HTTP endpoint.
 */

const PAGE_STYLE = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.7;
      color: #e0e0e0;
      background: #1a1a2e;
      padding: 2rem 1rem;
    }
    .container {
      max-width: 720px;
      margin: 0 auto;
      background: #16213e;
      border-radius: 12px;
      padding: 2.5rem 2rem;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
    }
    h1 {
      font-size: 1.75rem;
      color: #fff;
      margin-bottom: 0.25rem;
    }
    .updated {
      font-size: 0.85rem;
      color: #888;
      margin-bottom: 2rem;
    }
    h2 {
      font-size: 1.15rem;
      color: #7289da;
      margin-top: 1.75rem;
      margin-bottom: 0.5rem;
    }
    p, li { font-size: 0.95rem; }
    p { margin-bottom: 0.75rem; }
    ul { margin-left: 1.25rem; margin-bottom: 0.75rem; }
    li { margin-bottom: 0.35rem; }
    a { color: #7289da; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .footer {
      margin-top: 2.5rem;
      padding-top: 1.25rem;
      border-top: 1px solid #2a2a4a;
      font-size: 0.8rem;
      color: #666;
      text-align: center;
    }`;

export function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${PAGE_STYLE}</style>
</head>
<body>
  <div class="container">
${body}
  </div>
</body>
</html>`;
}

export function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export function termsPage(): Response {
  return htmlResponse(page("Terms of Service", `
    <h1>Terms of Service</h1>
    <p class="updated">Last updated: February 28, 2026</p>

    <h2>1. Acceptance of Terms</h2>
    <p>By using this Discord bot ("the Bot"), you agree to these Terms of Service. If you do not agree, please remove the Bot from your server and discontinue use.</p>

    <h2>2. Description of Service</h2>
    <p>The Bot provides utility and entertainment features within Discord servers, including but not limited to slash commands, interactive components, scheduled tasks, and moderation tools.</p>

    <h2>3. User Responsibilities</h2>
    <ul>
      <li>You must comply with <a href="https://discord.com/terms">Discord's Terms of Service</a> and <a href="https://discord.com/guidelines">Community Guidelines</a>.</li>
      <li>You must not abuse, exploit, or use the Bot for any unlawful purpose.</li>
      <li>Server administrators are responsible for configuring the Bot appropriately for their community.</li>
    </ul>

    <h2>4. Availability</h2>
    <p>The Bot is provided on an "as is" and "as available" basis. We do not guarantee uninterrupted or error-free operation and may modify or discontinue the service at any time without notice.</p>

    <h2>5. Data Usage</h2>
    <p>Please refer to our <a href="/privacy">Privacy Policy</a> for details on what data we collect and how it is used.</p>

    <h2>6. Limitation of Liability</h2>
    <p>To the fullest extent permitted by law, the Bot's developers shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Bot.</p>

    <h2>7. Modifications</h2>
    <p>We reserve the right to update these Terms at any time. Continued use of the Bot after changes constitutes acceptance of the revised Terms.</p>

    <h2>8. Termination</h2>
    <p>We may restrict or terminate access to the Bot for any user or server that violates these Terms, at our sole discretion.</p>

    <h2>9. Contact</h2>
    <p>If you have questions about these Terms, please reach out via the Bot's support server or contact the Bot owner through Discord.</p>

    <div class="footer">
      <a href="/privacy">Privacy Policy</a>
    </div>`));
}

export function privacyPage(): Response {
  return htmlResponse(page("Privacy Policy", `
    <h1>Privacy Policy</h1>
    <p class="updated">Last updated: February 28, 2026</p>

    <h2>1. Information We Collect</h2>
    <p>The Bot processes the following data when you interact with it:</p>
    <ul>
      <li><strong>User IDs</strong> — Your Discord user ID, used to identify you for features like reminders, giveaways, and polls.</li>
      <li><strong>Server IDs</strong> — The Discord server (guild) ID where the Bot is installed.</li>
      <li><strong>Command Input</strong> — The content of commands and interactions you send to the Bot.</li>
      <li><strong>Timestamps</strong> — When interactions occur, for scheduling and cooldown purposes.</li>
    </ul>

    <h2>2. How We Use Your Data</h2>
    <p>Data is used solely to provide and improve the Bot's functionality:</p>
    <ul>
      <li>Executing commands and delivering responses.</li>
      <li>Persisting user-created content (tags, reminders, scheduled messages).</li>
      <li>Enforcing cooldowns and permissions.</li>
      <li>Logging errors for debugging purposes.</li>
    </ul>

    <h2>3. Data Storage</h2>
    <p>Persistent data is stored in a server-side database. We store only the minimum data required for each feature to function. Data is not sold, rented, or shared with third parties.</p>

    <h2>4. Data Retention</h2>
    <p>Data is retained only as long as it is needed for the feature that created it:</p>
    <ul>
      <li><strong>Reminders</strong> — Deleted after delivery.</li>
      <li><strong>Polls &amp; Giveaways</strong> — Retained until ended, then kept for result reference.</li>
      <li><strong>Tags</strong> — Retained until explicitly deleted by a server administrator.</li>
      <li><strong>Cooldowns</strong> — Held in memory only and cleared periodically.</li>
    </ul>

    <h2>5. Data Deletion</h2>
    <p>You may request deletion of your data by contacting the Bot owner through Discord. Server administrators can remove Bot-stored data for their server by removing the Bot from the server.</p>

    <h2>6. Third-Party Services</h2>
    <p>The Bot interacts with the <a href="https://discord.com/privacy">Discord API</a> and is hosted on <a href="https://val.town">Val Town</a>. These services have their own privacy policies that govern their handling of data.</p>

    <h2>7. Children's Privacy</h2>
    <p>The Bot is not directed at children under 13. We do not knowingly collect data from children under 13. Use of Discord itself requires users to meet their minimum age requirement.</p>

    <h2>8. Changes to This Policy</h2>
    <p>We may update this Privacy Policy from time to time. Continued use of the Bot after changes constitutes acceptance of the revised policy.</p>

    <h2>9. Contact</h2>
    <p>If you have questions or concerns about this Privacy Policy or wish to request data deletion, please reach out via the Bot's support server or contact the Bot owner through Discord.</p>

    <div class="footer">
      <a href="/terms">Terms of Service</a>
    </div>`));
}

export function linkedRolesSuccessPage(username: string): Response {
  const safe = username.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return htmlResponse(page("Verification Complete", `
    <h1>Verification Complete</h1>
    <p>You're all set, <strong>${safe}</strong>! Your linked role has been updated.</p>
    <p>You can close this tab and return to Discord.</p>`));
}

export function linkedRolesErrorPage(message: string): Response {
  const safe = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return htmlResponse(page("Verification Failed", `
    <h1>Verification Failed</h1>
    <p>Something went wrong while verifying your account:</p>
    <p><strong>${safe}</strong></p>
    <p>Please try again. If the problem persists, contact a server administrator.</p>`));
}
