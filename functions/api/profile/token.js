import { encryptTrackerToken, fetchTrackerApi } from '../../_lib/tracker_api.js';
import { errorResponse, jsonResponse, readJson, sameOrigin } from '../../_lib/auth.js';

function requireUser(context) {
  return context.data.user?.id ? context.data.user : null;
}

export async function onRequestGet(context) {
  const user = requireUser(context);
  if (!user) return errorResponse('Authentication required.', 401);
  try {
    const connection = await context.env.DB.prepare(`
      SELECT game_mode, connected_at FROM tracker_api_connections WHERE user_id = ?1
    `).bind(user.id).first();
    return jsonResponse({
      connected: Boolean(connection),
      gameMode: connection?.game_mode || null,
      connectedAt: connection?.connected_at || null,
      setupRequired: !context.env.PROFILE_TOKEN_ENCRYPTION_KEY
    });
  } catch {
    return errorResponse('Could not read the TarkovTracker connection.', 503);
  }
}

export async function onRequestPut(context) {
  const user = requireUser(context);
  if (!user) return errorResponse('Authentication required.', 401);
  if (!sameOrigin(context.request)) return errorResponse('Request origin could not be verified.', 403);
  if (!context.env.PROFILE_TOKEN_ENCRYPTION_KEY) {
    return errorResponse('Profile token encryption is not configured.', 503);
  }

  const body = await readJson(context.request);
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  const prefix = token.match(/^(PVP|PVE|SZN)_/i)?.[1]?.toUpperCase();
  if (!prefix || token.length < 16 || token.length > 512) {
    return errorResponse('Enter a valid TarkovTracker API token.');
  }

  let tokenInfo;
  try {
    const response = await fetchTrackerApi('/token', token);
    tokenInfo = await response.json().catch(() => null);
    if (!response.ok || tokenInfo?.success !== true) {
      if (response.status === 401) return errorResponse('That token was rejected. Check it or create a replacement.', 401);
      return errorResponse(tokenInfo?.error || 'Could not validate the token.', response.status || 502);
    }
  } catch {
    return errorResponse('Could not reach the TarkovTracker API.', 502);
  }

  const expectedMode = { PVP: 'pvp', PVE: 'pve', SZN: 'seasonal' }[prefix];
  if (tokenInfo.gameMode !== expectedMode) return errorResponse('The token game mode could not be verified.', 400);
  if (!Array.isArray(tokenInfo.permissions) || !tokenInfo.permissions.includes('GP')) {
    return errorResponse('This token needs Game Progress (GP) read permission.', 403);
  }

  try {
    const encryptedToken = await encryptTrackerToken(token, context.env.PROFILE_TOKEN_ENCRYPTION_KEY);
    const now = Math.floor(Date.now() / 1000);
    await context.env.DB.prepare(`
      INSERT INTO tracker_api_connections (user_id, encrypted_token, game_mode, connected_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?4)
      ON CONFLICT(user_id) DO UPDATE SET
        encrypted_token = excluded.encrypted_token,
        game_mode = excluded.game_mode,
        etag = NULL,
        progress_json = NULL,
        cached_at = NULL,
        connected_at = excluded.connected_at,
        updated_at = excluded.updated_at
    `).bind(user.id, encryptedToken, expectedMode, now).run();
    return jsonResponse({ connected: true, gameMode: expectedMode, connectedAt: now });
  } catch {
    return errorResponse('Could not save the encrypted TarkovTracker connection.', 503);
  }
}

export async function onRequestDelete(context) {
  const user = requireUser(context);
  if (!user) return errorResponse('Authentication required.', 401);
  if (!sameOrigin(context.request)) return errorResponse('Request origin could not be verified.', 403);
  try {
    await context.env.DB.prepare('DELETE FROM tracker_api_connections WHERE user_id = ?1').bind(user.id).run();
    return jsonResponse({ connected: false });
  } catch {
    return errorResponse('Could not disconnect the TarkovTracker account.', 503);
  }
}