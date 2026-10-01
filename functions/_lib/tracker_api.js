const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const TRACKER_API_USER_AGENT = 'GoonsFromGumtree/1.0 (+https://goons-from-gumtree.pages.dev)';

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getEncryptionKey(secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('Profile token encryption is not configured.');
  }
  const keyBytes = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptTrackerToken(token, secret) {
  const key = await getEncryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(token));
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptTrackerToken(encryptedToken, secret) {
  const [ivValue, ciphertextValue] = String(encryptedToken).split('.');
  if (!ivValue || !ciphertextValue) throw new Error('Stored tracker token has an invalid format.');
  const key = await getEncryptionKey(secret);
  const plaintext = await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv: fromBase64Url(ivValue)
  }, key, fromBase64Url(ciphertextValue));
  return decoder.decode(plaintext);
}

export function fetchTrackerApi(path, token, etag = '') {
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'User-Agent': TRACKER_API_USER_AGENT
  };
  if (etag) headers['If-None-Match'] = etag;
  return fetch(`https://api.tarkovtracker.org${path}`, { headers, cache: 'no-store' });
}