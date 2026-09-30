import {
  ADMIN_USERNAME, hashPassword, verifyPassword, sha256, createSession,
  jsonResponse, errorResponse, readJson, sameOrigin, validUsername
} from '../../_lib/auth.js';

const LOGIN_WINDOW_SECONDS = 15 * 60;
const MAX_LOGIN_ATTEMPTS = 5;

async function recordFailure(database, keyHash, now) {
  await database.prepare(`
    INSERT INTO login_attempts (key_hash, window_started_at, attempt_count) VALUES (?1, ?2, 1)
    ON CONFLICT(key_hash) DO UPDATE SET
      attempt_count = CASE WHEN window_started_at <= ?3 THEN 1 ELSE attempt_count + 1 END,
      window_started_at = CASE WHEN window_started_at <= ?3 THEN ?2 ELSE window_started_at END
  `).bind(keyHash, now, now - LOGIN_WINDOW_SECONDS).run();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!sameOrigin(request)) return errorResponse('Request origin could not be verified.', 403);
  if (!env.DB) return errorResponse('Authentication database is not configured.', 503);

  const body = await readJson(request);
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = body?.password;
  if (!validUsername(username) || typeof password !== 'string' || password.length < 1 || password.length > 128) {
    return errorResponse('Access denied. Check your credentials.', 401);
  }

  const now = Math.floor(Date.now() / 1000);
  const address = request.headers.get('CF-Connecting-IP') || 'unknown';
  const attemptKey = await sha256(`${address}\u0000${username.toLowerCase()}`);
  const attempts = await env.DB.prepare('SELECT window_started_at, attempt_count FROM login_attempts WHERE key_hash = ?1')
    .bind(attemptKey).first();
  if (attempts && attempts.window_started_at > now - LOGIN_WINDOW_SECONDS && attempts.attempt_count >= MAX_LOGIN_ATTEMPTS) {
    return errorResponse('Too many attempts. Try again in 15 minutes.', 429, { 'Retry-After': '900' });
  }

  let user = await env.DB.prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?1')
    .bind(username).first();
  let passwordMatches = await verifyPassword(password, user?.password_hash);

  if (!user && username.toLowerCase() === ADMIN_USERNAME.toLowerCase()
    && typeof env.ADMIN_PASSWORD === 'string'
    && env.ADMIN_PASSWORD.length >= 12 && env.ADMIN_PASSWORD.length <= 128) {
    const supplied = new TextEncoder().encode(password);
    const configured = new TextEncoder().encode(env.ADMIN_PASSWORD);
    let difference = supplied.length ^ configured.length;
    for (let index = 0; index < Math.max(supplied.length, configured.length); index += 1) {
      difference |= (supplied[index] || 0) ^ (configured[index] || 0);
    }
    if (difference === 0) {
      const id = crypto.randomUUID();
      const passwordHash = await hashPassword(env.ADMIN_PASSWORD);
      await env.DB.prepare(`
        INSERT OR IGNORE INTO users (id, username, password_hash, role, created_at, updated_at)
        VALUES (?1, ?2, ?3, 'admin', ?4, ?4)
      `).bind(id, ADMIN_USERNAME, passwordHash, now).run();
      user = await env.DB.prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?1')
        .bind(ADMIN_USERNAME).first();
      passwordMatches = await verifyPassword(password, user?.password_hash);
    }
  }

  if (!user || !passwordMatches) {
    await recordFailure(env.DB, attemptKey, now);
    return errorResponse('Access denied. Check your credentials.', 401);
  }

  await env.DB.prepare('DELETE FROM login_attempts WHERE key_hash = ?1').bind(attemptKey).run();
  const sessionCookie = await createSession(context, user.id);
  return jsonResponse({ username: user.username, role: user.role }, 200, { 'Set-Cookie': sessionCookie });
}