import { clearSessionCookie, deleteSession, jsonResponse, sameOrigin } from '../../_lib/auth.js';

export async function onRequestPost(context) {
  if (!sameOrigin(context.request)) return jsonResponse({ error: 'Request origin could not be verified.' }, 403);
  try {
    await deleteSession(context);
  } catch {
    return jsonResponse({ error: 'Could not end the session.' }, 503);
  }
  return jsonResponse({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(context.request) });
}