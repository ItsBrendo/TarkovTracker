import { getSession, jsonResponse } from './_lib/auth.js';

const LOGIN_ASSETS = new Set([
  '/login', '/login.html', '/login.css', '/login.js', '/styles.css', '/ambient.js', '/knightbg.png'
]);

export async function onRequest(context) {
  const { pathname } = new URL(context.request.url);
  if (LOGIN_ASSETS.has(pathname) || pathname.startsWith('/api/auth/') || pathname === '/api/notify/due') return context.next();

  let user;
  try {
    user = await getSession(context);
  } catch {
    if (pathname.startsWith('/api/')) return jsonResponse({ error: 'Authentication service unavailable.' }, 503);
    return new Response('Authentication service unavailable.', { status: 503 });
  }

  if (!user) {
    if (pathname.startsWith('/api/')) return jsonResponse({ error: 'Authentication required.' }, 401);
    return Response.redirect(new URL('/login.html', context.request.url), 302);
  }

  context.data.user = user;
  const response = await context.next();
  const securedResponse = new Response(response.body, response);
  securedResponse.headers.set('X-Content-Type-Options', 'nosniff');
  securedResponse.headers.set('Referrer-Policy', 'same-origin');
  if (pathname === '/' || pathname === '/index.html' || pathname === '/items.json') {
    securedResponse.headers.set('Cache-Control', 'private, no-store');
  }
  return securedResponse;
}