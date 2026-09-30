import {
  ADMIN_USERNAME, DEFAULT_USER_PASSWORD, hashPassword, jsonResponse,
  errorResponse, readJson, sameOrigin, validPassword, validUsername
} from '../../../_lib/auth.js';

function requireAdmin(context) {
  return context.data.user?.role === 'admin';
}

export async function onRequestGet(context) {
  if (!requireAdmin(context)) return errorResponse('Administrator access required.', 403);
  try {
    const { results } = await context.env.DB.prepare(`
      SELECT id, username, role, created_at, updated_at FROM users ORDER BY username COLLATE NOCASE
    `).all();
    return jsonResponse({ users: results || [] });
  } catch {
    return errorResponse('Could not load the user list.', 503);
  }
}

export async function onRequestPost(context) {
  if (!requireAdmin(context)) return errorResponse('Administrator access required.', 403);
  if (!sameOrigin(context.request)) return errorResponse('Request origin could not be verified.', 403);
  const body = await readJson(context.request);
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const role = body?.role;
  const isBootstrapAdmin = username.toLowerCase() === ADMIN_USERNAME.toLowerCase();
  if (!validUsername(username) || !['admin', 'user'].includes(role) || (isBootstrapAdmin && role !== 'admin')) {
    return errorResponse('Choose a valid username and role.');
  }

  const password = body.password || (role === 'user' ? DEFAULT_USER_PASSWORD : '');
  if (!validPassword(password)) {
    return errorResponse(role === 'admin'
      ? 'Administrator passwords must be at least 12 characters.'
      : 'Passwords must be at least 12 characters.');
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    await context.env.DB.prepare(`
      INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?5)
    `).bind(id, username, passwordHash, role, now).run();
    return jsonResponse({ user: { id, username, role, created_at: now, updated_at: now } }, 201);
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) {
      return errorResponse('That username is already in use.', 409);
    }
    return errorResponse('Could not create the user.', 503);
  }
}