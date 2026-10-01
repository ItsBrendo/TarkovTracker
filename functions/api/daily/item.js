import { errorResponse, jsonResponse, readJson, sameOrigin } from '../../_lib/auth.js';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function onRequestGet(context) {
  if (!context.data.user?.id) return errorResponse('Authentication required.', 401);
  if (!context.env.DB) return errorResponse('Profile database is unavailable.', 503);
  try {
    const row = await context.env.DB.prepare('SELECT item_date, item_id, updated_at FROM daily_selection WHERE id = 1').first();
    return jsonResponse({ date: row?.item_date || null, itemId: row?.item_id || null, updatedAt: row?.updated_at || null });
  } catch {
    return errorResponse('Could not load the shared daily item.', 503);
  }
}

// Writes the crew-wide daily item; every signed-in browser picks this up on its next poll.
export async function onRequestPut(context) {
  if (!context.data.user?.id) return errorResponse('Authentication required.', 401);
  if (!sameOrigin(context.request)) return errorResponse('Request origin could not be verified.', 403);
  if (!context.env.DB) return errorResponse('Profile database is unavailable.', 503);

  const body = await readJson(context.request);
  const itemId = typeof body?.itemId === 'string' ? body.itemId.trim().slice(0, 64) : '';
  if (!itemId) return errorResponse('A valid item id is required.');

  const now = Math.floor(Date.now() / 1000);
  const date = todayKey();
  try {
    await context.env.DB.prepare(`
      INSERT INTO daily_selection (id, item_date, item_id, selected_by, updated_at) VALUES (1, ?1, ?2, ?3, ?4)
      ON CONFLICT(id) DO UPDATE SET item_date = excluded.item_date, item_id = excluded.item_id, selected_by = excluded.selected_by, updated_at = excluded.updated_at
    `).bind(date, itemId, context.data.user.id, now).run();
    return jsonResponse({ date, itemId, updatedAt: now });
  } catch {
    return errorResponse('Could not save the shared daily item.', 503);
  }
}
