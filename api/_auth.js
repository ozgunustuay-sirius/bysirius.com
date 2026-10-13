/**
 * BY Sirius — ortak admin oturum yardımcıları (Edge runtime, WebCrypto)
 *
 * Vercel env vars:
 *   ADMIN_PASSWORD — admin panel şifresi (zorunlu)
 *   SESSION_SECRET — oturum imza anahtarı, uzun rastgele metin (önerilir; yoksa ADMIN_PASSWORD kullanılır)
 *
 * Oturum: HttpOnly + Secure + SameSite=Strict cookie, imzalı (HMAC-SHA256), 7 gün.
 * Şifre tarayıcıda saklanmaz.
 */

const enc = new TextEncoder();
const SESSION_TTL = 7 * 24 * 3600;
export const COOKIE_NAME = 'bs_session';

function toB64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toB64url(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

// Sabit zamanlı karşılaştırma (uzunluk bilgisi sızmasın diye önce özetleri alır)
export async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b)))
  ]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function secret() {
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || '';
}

export function authConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export async function checkPassword(pw) {
  const real = process.env.ADMIN_PASSWORD;
  if (!real || typeof pw !== 'string' || !pw) return false;
  return safeEqual(pw, real);
}

export async function createSession() {
  const payload = `v1.${Math.floor(Date.now() / 1000) + SESSION_TTL}`;
  return `${payload}.${await hmac(secret(), payload)}`;
}

export function getCookie(req, name) {
  const raw = req.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

export async function isAuthed(req) {
  if (!secret()) return false;
  const token = getCookie(req, COOKIE_NAME);
  const m = /^(v1\.(\d+))\.([\w-]+)$/.exec(token);
  if (!m) return false;
  if (Number(m[2]) < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(m[3], await hmac(secret(), m[1]));
}

export function sessionCookie(token, maxAge = SESSION_TTL) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=${maxAge}`;
}

// Değiştirici isteklerde Origin varsa aynı host olmalı (CSRF'e ek savunma)
export function sameOrigin(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === new URL(req.url).host; } catch { return false; }
}

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }
  });
}

/** Yetkisizse hazır Response döner, yetkiliyse null. */
export async function guard(req) {
  if (!sameOrigin(req)) return json({ error: 'Geçersiz istek kaynağı' }, 403);
  if (!(await isAuthed(req))) return json({ error: 'Yetkisiz erişim' }, 401);
  return null;
}
