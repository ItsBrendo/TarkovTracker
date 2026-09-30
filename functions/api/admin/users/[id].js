import {
  ADMIN_USERNAME, hashPassword, jsonResponse, errorResponse,
  readJson, sameOrigin, validPassword, validUsername
} from '../../../_lib/auth.js';

function requireAdmin(context) {
  return context.data.user?.role === 'admin';
}

export async function onRequestPut(context) {
  if (!requireAdmin(context)) return errorResponse('Administrator access required.', 403);
  if (!sameOrigin(context.request)) return errorResponse('Request origin could not be verified.', 403);
  const body = await readJson(context.request);
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const role = body?.role;
  if (!validUsername(username) || !['admin', 'user'].includes(role)
    || (username.toLowerCase() === ADMIN_USERNAME.toLowerCase() && role !== 'admin')) {
    return errorResponse('Choose a valid username and role.');
  }
  const changePassword = typeof body.password === 'string' && body.password.length > 0;
  if (changePassword && !validPassword(body.password)) {
    return errorResponse('Passwords must be at least 12 characters.');
  }

  const { id } = context.params;
  try {
    const existing = await context.env.DB.prepare('SELECT id, role FROM users WHERE id = ?1').bind(id).first();
    if (!existing) return errorResponse('User not found.', 404);
    if (existing.role !== 'admin' && role === 'admin' && !changePassword) {
      return errorResponse('Set a new administrator password when promoting this account.');
    }
    if (existing.role === 'admin' && role !== 'admin') {
      const count = await context.env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'").first();
      if (count.total <= 1) return errorResponse('The last administrator cannot be demoted.', 409);
    }

    const now = Math.floor(Date.now() / 1000);
    if (changePassword) {
      const passwordHash = await hashPassword(body.password);
      await context.env.DB.batch([
        context.env.DB.prepare(`
        UPDATE users SET username = ?1, role = ?2, password_hash = ?3, updated_at = ?4 WHERE id = ?5
        `).bind(username, role, passwordHash, now, id),
        context.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(id)
      ]);
    } else {
      await context.env.DB.prepare(`
        UPDATE users SET username = ?1, role = ?2, updated_at = ?3 WHERE id = ?4
      `).bind(username, role, now, id).run();
    }
    return jsonResponse({ user: { id, username, role, updated_at: now } });
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) {
      return errorResponse('That username is already in use.', 409);
    }
    return errorResponse('Could not update the user.', 503);
  }
}

export async function onRequestDelete(context) {
  if (!requireAdmin(context)) return errorResponse('Administrator access required.', 403);
  if (!sameOrigin(context.request)) return errorResponse('Request origin could not be verified.', 403);
  const { id } = context.params;
  if (id === context.data.user.id) return errorResponse('You cannot remove your active admin account.', 409);

  try {
    const user = await context.env.DB.prepare('SELECT id, role FROM users WHERE id = ?1').bind(id).first();
    if (!user) return errorResponse('User not found.', 404);
    if (user.role === 'admin') {
      const count = await context.env.DB.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'").first();
      if (count.total <= 1) return errorResponse('The last administrator cannot be removed.', 409);
    }
    await context.env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(id).run();
    return jsonResponse({ ok: true });
  } catch {
    return errorResponse('Could not remove the user.', 503);
  }
}