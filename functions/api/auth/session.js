import { getSession, jsonResponse, errorResponse } from '../../_lib/auth.js';

export async function onRequestGet(context) {
  try {
    const user = await getSession(context);
    return user
      ? jsonResponse({ user })
      : errorResponse('Authentication required.', 401);
  } catch {
    return errorResponse('Authentication service unavailable.', 503);
  }
}