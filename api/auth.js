/**
 * BY Sirius — admin giriş / çıkış / oturum kontrolü
 *   GET    /api/auth   → { authed: true|false }
 *   POST   /api/auth   → { password } doğruysa oturum cookie'si verir
 *   DELETE /api/auth   → çıkış
 */
import { authConfigured, checkPassword, createSession, isAuthed, sessionCookie, sameOrigin, json } from './_auth.js';

export const config = { runtime: 'edge' };

// Basit IP bazlı deneme sınırı (instance başına, en iyi çaba)
const fails = new Map();
const MAX_FAILS = 5;
const BLOCK_MS = 15 * 60 * 1000;

function clientIp(req) {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}

export default async function handler(req) {
  if (!sameOrigin(req)) return json({ error: 'Geçersiz istek kaynağı' }, 403);

  if (req.method === 'GET') return json({ authed: await isAuthed(req), configured: authConfigured() });

  if (req.method === 'DELETE') return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });

  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  if (!authConfigured()) return json({ error: 'ADMIN_PASSWORD ortam değişkeni tanımlı değil.' }, 503);

  const ip = clientIp(req);
  const rec = fails.get(ip);
  if (rec && rec.until > Date.now()) {
    return json({ error: 'Çok fazla hatalı deneme. Lütfen 15 dakika sonra tekrar deneyin.' }, 429);
  }

  let body = {};
  try { body = await req.json(); } catch { /* boş gövde */ }

  if (await checkPassword(body.password)) {
    fails.delete(ip);
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(await createSession()) });
  }

  const blockExpired = rec && rec.until > 0 && rec.until <= Date.now();
  const n = (blockExpired ? 0 : rec?.n || 0) + 1;
  fails.set(ip, { n, until: n >= MAX_FAILS ? Date.now() + BLOCK_MS : 0 });
  if (fails.size > 500) fails.clear();
  await new Promise(r => setTimeout(r, 600)); // brute-force'u yavaşlat
  return json({ error: 'Hatalı şifre' }, 401);
}
