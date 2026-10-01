export async function sendDiscordMessage(webhookUrl, content) {
  if (typeof webhookUrl !== 'string' || !/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(webhookUrl)) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: String(content).slice(0, 2000) })
    });
  } catch {
    // Discord delivery is best-effort and must never block the app response.
  }
}
