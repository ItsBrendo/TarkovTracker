export const ADMIN_USERNAME = 'KillaFromKmart';
export const DEFAULT_USER_PASSWORD = 'PasswordFromPrapor';
export const SESSION_COOKIE = 'gg_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 210000;
const DUMMY_HASH = `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${'00'.repeat(16)}$${'00'.repeat(32)}`;
const encoder = new TextEncoder();

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value) {
  if (!/^(?:[a-f0-9]{2})+$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return toHex(new Uint8Array(digest));
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({
    name: 'PBKDF2', salt, iterations: PASSWORD_ITERATIONS, hash: 'SHA-256'
  }, key, 256);
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${toHex(salt)}$${toHex(new Uint8Array(derived))}`;
}

export async function verifyPassword(password, storedHash) {
  const [algorithm, iterationsValue, saltValue, hashValue] = String(storedHash || DUMMY_HASH).split('$');
  const iterations = Number(iterationsValue);
  const salt = fromHex(saltValue || '');
  const expected = fromHex(hashValue || '');
  if (algorithm !== 'pbkdf2-sha256' || iterations !== PASSWORD_ITERATIONS || !salt || !expected) return false;

  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = new Uint8Array(await crypto.subtle.deriveBits({
    name: 'PBKDF2', salt, iterations, hash: 'SHA-256'
  }, key, expected.length * 8));
  let difference = derived.length ^ expected.length;
  for (let index = 0; index < expected.length; index += 1) difference |= derived[index] ^ expected[index];
  return difference === 0;
}

function tokenFromRequest(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const prefix = `${SESSION_COOKIE}=`;
  const cookie = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  const token = cookie?.slice(prefix.length) || '';
  return /^[a-f0-9]{64}$/i.test(token) ? token : '';
}

export async function getSession(context) {
  const token = tokenFromRequest(context.request);
  if (!token || !context.env.DB) return null;
  const tokenHash = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  const row = await context.env.DB.prepare(`
    SELECT users.id, users.username, users.role
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?1 AND sessions.expires_at > ?2
  `).bind(tokenHash, now).first();
  return row || null;
}

export async function createSession(context, userId) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_TTL_SECONDS;
  await context.env.DB.batch([
    context.env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?1').bind(now),
    context.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)')
      .bind(tokenHash, userId, expiresAt, now)
  ]);
  const secure = new URL(context.request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export async function deleteSession(context) {
  const token = tokenFromRequest(context.request);
  if (!token || !context.env.DB) return;
  await context.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha256(token)).run();
}

export function clearSessionCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers
    }
  });
}

export async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  return Boolean(origin && origin === new URL(request.url).origin);
}

export function validUsername(username) {
  return typeof username === 'string' && /^[A-Za-z0-9_.-]{2,32}$/.test(username);
}

export function validPassword(password) {
  return typeof password === 'string' && password.length >= 12 && password.length <= 128;
}

export function errorResponse(message, status = 400, headers = {}) {
  return jsonResponse({ error: message }, status, headers);
}