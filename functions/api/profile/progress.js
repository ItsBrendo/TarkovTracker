import { decryptTrackerToken, fetchTrackerApi } from '../../_lib/tracker_api.js';
import { errorResponse, jsonResponse } from '../../_lib/auth.js';

const REFRESH_INTERVAL_SECONDS = 60;

function normalizeProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const list = (entries, fields) => Array.isArray(entries)
    ? entries.filter((entry) => entry && typeof entry.id === 'string').map((entry) => {
      const result = { id: entry.id };
      for (const field of fields) {
        if (typeof entry[field] === 'boolean' || Number.isFinite(entry[field])) result[field] = entry[field];
      }
      return result;
    })
    : [];

  return {
    displayName: typeof value.displayName === 'string' ? value.displayName.slice(0, 80) : '',
    playerLevel: Number.isInteger(value.playerLevel) ? value.playerLevel : null,
    gameEdition: Number.isInteger(value.gameEdition) ? value.gameEdition : null,
    pmcFaction: ['USEC', 'BEAR'].includes(value.pmcFaction) ? value.pmcFaction : null,
    tasksProgress: list(value.tasksProgress, ['complete', 'failed', 'invalid']),
    taskObjectivesProgress: list(value.taskObjectivesProgress, ['complete', 'count', 'invalid']),
    hideoutModulesProgress: list(value.hideoutModulesProgress, ['complete']),
    hideoutPartsProgress: list(value.hideoutPartsProgress, ['complete', 'count'])
  };
}

function responsePayload(connection, profile, fetchedAt, cached) {
  return jsonResponse({
    connected: true,
    gameMode: connection.game_mode,
    fetchedAt,
    cached,
    profile
  });
}

export async function onRequestGet(context) {
  const userId = context.data.user?.id;
  if (!userId) return errorResponse('Authentication required.', 401);
  if (!context.env.DB) return errorResponse('Profile database is unavailable.', 503);

  try {
    const connection = await context.env.DB.prepare(`
      SELECT encrypted_token, game_mode, etag, progress_json, cached_at
      FROM tracker_api_connections WHERE user_id = ?1
    `).bind(userId).first();
    if (!connection) return jsonResponse({ connected: false, profile: null });

    const now = Math.floor(Date.now() / 1000);
    if (connection.progress_json && connection.cached_at && now - connection.cached_at < REFRESH_INTERVAL_SECONDS) {
      return responsePayload(connection, JSON.parse(connection.progress_json), connection.cached_at, true);
    }

    const token = await decryptTrackerToken(connection.encrypted_token, context.env.PROFILE_TOKEN_ENCRYPTION_KEY);
    const response = await fetchTrackerApi('/progress', token, connection.etag || '');
    if (response.status === 304 && connection.progress_json) {
      await context.env.DB.prepare(`
        UPDATE tracker_api_connections SET cached_at = ?1, updated_at = ?1 WHERE user_id = ?2
      `).bind(now, userId).run();
      return responsePayload(connection, JSON.parse(connection.progress_json), now, true);
    }
    if (!response.ok) {
      if (response.status === 401) return errorResponse('TarkovTracker rejected this token. Reconnect it in Settings.', 401);
      if (response.status === 403) return errorResponse('This token no longer has Game Progress read permission.', 403);
      if (response.status === 429) {
        if (connection.progress_json && connection.cached_at) {
          return responsePayload(connection, JSON.parse(connection.progress_json), connection.cached_at, true);
        }
        return errorResponse('TarkovTracker rate limit reached. Cached progress is still available.', 429, {
          'Retry-After': response.headers.get('Retry-After') || '60'
        });
      }
      return errorResponse('Could not fetch TarkovTracker progress.', 502);
    }

    const payload = await response.json().catch(() => null);
    const profile = normalizeProfile(payload?.data);
    if (!payload?.success || !profile) return errorResponse('TarkovTracker returned an unsupported progress response.', 502);
    const serialized = JSON.stringify(profile);
    await context.env.DB.prepare(`
      UPDATE tracker_api_connections
      SET etag = ?1, progress_json = ?2, cached_at = ?3, updated_at = ?3
      WHERE user_id = ?4
    `).bind(response.headers.get('ETag'), serialized, now, userId).run();
    return responsePayload(connection, profile, now, false);
  } catch {
    return errorResponse('Could not load the connected TarkovTracker profile.', 503);
  }
}