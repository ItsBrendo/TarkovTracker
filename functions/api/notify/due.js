import { errorResponse, jsonResponse } from '../../_lib/auth.js';
import { sendDiscordMessage } from '../../_lib/discord.js';

const DUE_SECONDS = 24 * 60 * 60;

function timingSafeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

// Called on a schedule (see .github/workflows/discord-reminders.yml) since Pages Functions have no native cron trigger.
export async function onRequestPost(context) {
  const secret = context.env.CRON_SECRET;
  if (typeof secret !== 'string' || secret.length < 16) return errorResponse('Reminder checks are not configured.', 503);
  if (!timingSafeEqual(context.request.headers.get('X-Cron-Secret'), secret)) return errorResponse('Unauthorized.', 401);
  if (!context.env.DB) return errorResponse('Profile database is unavailable.', 503);

  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - DUE_SECONDS;
  try {
    const { results } = await context.env.DB.prepare(`
      SELECT user_id, display_name, uploaded_at, last_reminder_at FROM player_profiles
      WHERE uploaded_at <= ?1 AND (last_reminder_at IS NULL OR last_reminder_at <= ?1)
    `).bind(cutoff).all();

    let notified = 0;
    for (const row of results || []) {
      const hoursSince = Math.round((now - row.uploaded_at) / 3600);
      await sendDiscordMessage(context.env.DISCORD_WEBHOOK_URL, `⏰ **${row.display_name}** is due for a field report upload (${hoursSince}h since last upload).`);
      await context.env.DB.prepare('UPDATE player_profiles SET last_reminder_at = ?1 WHERE user_id = ?2').bind(now, row.user_id).run();
      notified += 1;
    }
    return jsonResponse({ checked: (results || []).length, notified });
  } catch {
    return errorResponse('Could not run the upload reminder check.', 503);
  }
}
